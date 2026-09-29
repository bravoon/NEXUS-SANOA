using Nexus.Application.Services;
using Nexus.Contracts;
using Nexus.Data.Configuration;
using Nexus.Data.Logging;
using Nexus.Data.Repositories;
using Nexus.Data.Storage;
using Nexus.Engine;
using Nexus.Platform.Abstractions;
using Nexus.Platform.Simulation;
using Nexus.Platform.Windows;

namespace Nexus.Application.Hosting;

public sealed record RuntimeOptions
{
    /// <summary>Use the in-memory simulated machine instead of the real system (automatic on non-Windows hosts).</summary>
    public bool Simulate { get; init; }
    public string? DataDirectory { get; init; }
    public string? ConfigDirectory { get; init; }
    public string? ToolsDirectory { get; init; }
    public TextWriter? ConsoleLog { get; init; }
    public NexusLogLevel ConsoleLogLevel { get; init; } = NexusLogLevel.Warning;
    public bool EnableElevationBroker { get; init; } = true;
    public string? ExecutablePath { get; init; }
}

/// <summary>Composition root used by every host (CLI, IPC service, elevated worker).</summary>
public static class NexusRuntime
{
    public static string DefaultConfigDirectory()
    {
        foreach (var dir in new[] { AppContext.BaseDirectory, Directory.GetCurrentDirectory() })
        {
            for (var d = new DirectoryInfo(dir); d is not null; d = d.Parent)
            {
                var candidate = Path.Combine(d.FullName, "config");
                if (File.Exists(Path.Combine(candidate, "nexus.json")) || Directory.Exists(Path.Combine(candidate, "rules"))) return candidate;
            }
        }
        return Path.Combine(AppContext.BaseDirectory, "config");
    }

    public static bool WillSimulate(RuntimeOptions options) => options.Simulate || !OperatingSystem.IsWindows();

    public static NexusApplication Create(RuntimeOptions options)
    {
        var simulate = WillSimulate(options);
        var configDir = options.ConfigDirectory ?? DefaultConfigDirectory();
        var config = ConfigurationLoader.Load(configDir);
        var paths = options.DataDirectory is null ? DataPaths.Default(simulate) : new DataPaths(options.DataDirectory);
        Directory.CreateDirectory(paths.Root);

        var db = new NexusDatabase(paths.Database);
        var store = new NexusStore(db);
        var log = new LoggingEngine(config.LogLevel, LogRedactor.ForCurrentUser())
            .AddSink(new SqliteLogSink(store.Logs))
            .AddSink(new FileLogSink(paths.Logs));
        if (options.ConsoleLog is not null) log.AddSink(new TextWriterLogSink(options.ConsoleLog, options.ConsoleLogLevel));

        var simState = Path.Combine(paths.Root, "simulated-machine.json");
        SimulatedPlatform? sim = simulate ? SimulatedPlatform.LoadOrCreate(simState) : null;
        IPlatform platform = sim ?? CreateWindowsPlatform(options.ToolsDirectory ?? Path.Combine(AppContext.BaseDirectory, "tools"));

        var broker = !simulate && options.EnableElevationBroker && OperatingSystem.IsWindows()
            ? new ProcessElevationBroker(options.ExecutablePath ?? Environment.ProcessPath!, paths.Root, configDir, store)
            : null;

        var engine = new NexusEngineBuilder()
            .UsePlatform(platform)
            .UseConfiguration(config)
            .UseDatabase(db)
            .UseDataPaths(paths)
            .UseLogger(log)
            .UseRulesDirectory(Path.Combine(configDir, config.RulesDirectory))
            .UseElevationBroker(broker)
            .Build();
        return new NexusApplication(engine, sim is null ? null : () => sim.SaveState(simState));
    }

    [System.Runtime.Versioning.SupportedOSPlatform("windows")]
    private static IPlatform CreateWindowsPlatform(string tools) => new WindowsPlatform(tools);
}
