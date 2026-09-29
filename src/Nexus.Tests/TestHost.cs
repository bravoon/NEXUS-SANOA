using Nexus.Data.Configuration;
using Nexus.Data.Logging;
using Nexus.Data.Repositories;
using Nexus.Data.Storage;
using Nexus.Engine;
using Nexus.Engine.Analyzer;
using Nexus.Platform.Simulation;
using Nexus.Security.Permissions;

namespace Nexus.Tests;

/// <summary>Builds a complete engine on a simulated machine with an in-memory database.</summary>
public sealed class TestHost : IDisposable
{
    private readonly Platform.Abstractions.IPlatform _platform;
    public SimulatedPlatform Platform => _platform as SimulatedPlatform ?? throw new InvalidOperationException("Not a simulated platform.");
    public OptimizationEngine Engine { get; }
    public NexusStore Store { get; }
    public string DataRoot { get; }

    public static NexusConfiguration FastConfig(NexusConfiguration? c = null) =>
        (c ?? new NexusConfiguration()) with { DefaultSampleSeconds = 5, SampleIntervalSeconds = 1, ProcessMeasurementMs = 0 };

    public TestHost(Platform.Abstractions.IPlatform? platform = null, NexusConfiguration? config = null, string? rulesDirectory = null, IElevationBroker? broker = null)
    {
        _platform = platform ?? SimulatedPlatform.CreateSampleMachine();
        DataRoot = Path.Combine(Path.GetTempPath(), "nexus-tests", Guid.NewGuid().ToString("N"));
        var db = NexusDatabase.InMemory();
        Store = new NexusStore(db);
        Engine = new NexusEngineBuilder()
            .UsePlatform(_platform)
            .UseConfiguration(FastConfig(config))
            .UseDatabase(db)
            .UseDataPaths(new DataPaths(DataRoot))
            .UseLogger(new LoggingEngine(Contracts.NexusLogLevel.Trace, new LogRedactor(null, null, null)).AddSink(new SqliteLogSink(Store.Logs)))
            .UseRulesDirectory(rulesDirectory)
            .UseElevationBroker(broker)
            .Build();
    }

    public Task<Contracts.SystemSnapshot> ScanAsync() => Engine.ScanSystemAsync(new ScanOptions(5));

    public void Dispose()
    {
        Engine.Dispose();
        try { Directory.Delete(DataRoot, true); } catch { }
    }
}
