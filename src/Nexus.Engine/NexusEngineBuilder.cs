using Nexus.Data.Configuration;
using Nexus.Data.Logging;
using Nexus.Data.Repositories;
using Nexus.Data.Storage;
using Nexus.Engine.Analyzer;
using Nexus.Engine.Benchmark;
using Nexus.Engine.Core;
using Nexus.Engine.Diagnostics;
using Nexus.Engine.Gaming;
using Nexus.Engine.Hardware;
using Nexus.Engine.Optimization;
using Nexus.Engine.Optimization.Modules;
using Nexus.Engine.Processes;
using Nexus.Engine.Profiles;
using Nexus.Engine.Rules;
using Nexus.Engine.Startup;
using Nexus.Platform.Abstractions;
using Nexus.Platform.Changes;
using Nexus.Security.Backup;
using Nexus.Security.Permissions;
using Nexus.Security.Rollback;

namespace Nexus.Engine;

/// <summary>Composition root of the engine. Hosts (CLI, IPC service, tests) only decide platform, storage and configuration.</summary>
public sealed class NexusEngineBuilder
{
    private IPlatform? _platform;
    private NexusConfiguration _config = new();
    private NexusDatabase? _database;
    private DataPaths? _paths;
    private LoggingEngine? _log;
    private string? _rulesDirectory;
    private IElevationBroker? _broker;
    private readonly List<IOptimizationRule> _extraRules = [];

    public NexusEngineBuilder UsePlatform(IPlatform platform) { _platform = platform; return this; }
    public NexusEngineBuilder UseConfiguration(NexusConfiguration config) { _config = config; return this; }
    public NexusEngineBuilder UseDatabase(NexusDatabase database) { _database = database; return this; }
    public NexusEngineBuilder UseDataPaths(DataPaths paths) { _paths = paths; return this; }
    public NexusEngineBuilder UseLogger(LoggingEngine log) { _log = log; return this; }
    public NexusEngineBuilder UseRulesDirectory(string? directory) { _rulesDirectory = directory; return this; }
    public NexusEngineBuilder UseElevationBroker(IElevationBroker? broker) { _broker = broker; return this; }
    public NexusEngineBuilder AddRule(IOptimizationRule rule) { _extraRules.Add(rule); return this; }

    public OptimizationEngine Build()
    {
        var platform = _platform ?? throw new InvalidOperationException("A platform must be provided.");
        var paths = _paths ?? DataPaths.Default(platform.IsSimulated);
        var db = _database ?? new NexusDatabase(paths.Database);
        var store = new NexusStore(db);
        var log = _log ?? new LoggingEngine(_config.LogLevel, LogRedactor.ForCurrentUser()).AddSink(new SqliteLogSink(store.Logs));
        var events = new EngineEventBus();

        var handlers = ChangeHandlerRegistry.CreateDefault(platform);
        var reader = new SystemReader(platform, handlers);
        var permissions = new PermissionManager(platform.Privileges, handlers) { ElevationBroker = _broker };
        var backups = new BackupManager(handlers, platform.Registry, store.Backups, paths.Backups, log);
        var restore = new RestoreManager(handlers, log);
        var rollback = new RollbackEngine(handlers, restore, store.Transactions, permissions, log);

        var hardware = new HardwareEngine(platform.Sensors);
        var processes = new ProcessEngine(platform, _config);
        var startup = new StartupEngine(platform, _config);
        var safety = new SafetyPolicy(_config, platform, processes);
        var pipeline = new OptimizationPipeline(handlers, backups, permissions, store.Transactions, safety, platform.RestorePoints, reader, events, log);

        var modules = new List<IOptimizationModule>
        {
            new WindowsOptimizer(), new GamingOptimizer(), new StartupOptimizer(startup), new ProcessOptimizer(), new ServiceOptimizer(),
            new PowerOptimizer(), new NetworkOptimizer(), new StorageOptimizer(), new MemoryOptimizer(), new RegistryOptimizer(),
            new DebloatOptimizer(), new DriverAnalyzer(),
        };
        var rules = new OptimizationRuleEngine(log, store.Rules);
        foreach (var r in modules.SelectMany(m => m.BuiltInRules)) rules.Register(r);
        foreach (var r in DeclarativeRuleLoader.LoadDirectory(_rulesDirectory, handlers, log)) rules.Register(r);
        foreach (var r in _extraRules) rules.Register(r);

        var analyzer = new SystemAnalyzer(platform, hardware, processes, startup, _config, events, log);
        var diagnostics = new DiagnosticEngine(_config, modules);
        var profileSettings = new ProfileSettings(platform.Power);
        var profiles = new ProfileEngine(store.Profiles, store.Settings, profileSettings, pipeline, events);
        profiles.EnsureBuiltIns();
        var gaming = new GamingEngine(platform, store.Profiles, processes, profileSettings, pipeline, rollback, events, log);
        var benchmarks = new BenchmarkEngine(hardware, platform.FrameTimes, store.Benchmarks, store.Settings, events, log, _config.BenchmarkNoiseThresholdPercent);

        store.Logs.PruneOlderThan(DateTimeOffset.UtcNow.AddDays(-_config.LogRetentionDays));
        log.Info("Engine", $"Engine {OptimizationEngine.Version} started on {platform.Name} (simulated={platform.IsSimulated}, elevated={platform.Privileges.IsElevated}, rules={rules.Rules.Count})");

        return new OptimizationEngine(new EngineComponents(platform, _config, store, log, events, analyzer, diagnostics, rules, modules,
            pipeline, rollback, permissions, backups, reader, paths.Quarantine, processes, startup, gaming, benchmarks, profiles, hardware));
    }
}
