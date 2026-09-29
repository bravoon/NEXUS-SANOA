using Nexus.Contracts;
using Nexus.Engine;
using Nexus.Engine.Analyzer;

namespace Nexus.Application.Services;

/// <summary>Use cases around system inspection.</summary>
public sealed class SystemService(IOptimizationEngine engine)
{
    public Task<SystemSnapshot> ScanAsync(int? sampleSeconds, CancellationToken ct) =>
        engine.ScanSystemAsync(new ScanOptions(Math.Clamp(sampleSeconds ?? 5, 1, 120)), ct);

    public Task<AnalysisReport> AnalyzeAsync(CancellationToken ct) => engine.AnalyzeSystemAsync(ct);
    public Task<SystemStatus> StatusAsync(CancellationToken ct) => engine.GetSystemStatusAsync(ct);
    public HardwareSample Telemetry(CancellationToken ct) => engine.Hardware.Sample(TimeSpan.FromSeconds(1), ct);
    public IReadOnlyList<LogEntry> Logs(int take, NexusLogLevel min) => engine.GetLogs(take, min);
}

public sealed class OptimizationService(IOptimizationEngine engine)
{
    public IReadOnlyList<RuleDescriptor> Rules() => engine.GetRules();
    public Task<IReadOnlyList<OptimizationRecommendation>> RecommendationsAsync(CancellationToken ct) => engine.GetRecommendationsAsync(ct);
    public Task<OptimizationPreview> PreviewAsync(string id, CancellationToken ct) => engine.PreviewOptimizationAsync(id, ct);

    public Task<ExecutionResult> ApplyAsync(ExecuteOptimizationRequest request, CancellationToken ct)
    {
        if (request.OptimizationIds is null || request.OptimizationIds.Count == 0) throw new ArgumentException("At least one optimization id is required.");
        if (request.OptimizationIds.Count > 200) throw new ArgumentException("Too many optimizations in one request.");
        return engine.ExecuteOptimizationAsync(request, ct);
    }

    /// <summary>All currently "Recommended" optimizations (never the optional ones).</summary>
    public async Task<IReadOnlyList<string>> RecommendedIdsAsync(CancellationToken ct) =>
        (await engine.GetRecommendationsAsync(ct)).Where(r => r.Status == RecommendationStatus.Recommended).Select(r => r.OptimizationId).ToList();
}

public sealed class ProcessService(IOptimizationEngine engine)
{
    public IReadOnlyList<ProcessInfo> List(int top, bool includeSystem, CancellationToken ct) =>
        engine.Processes.GetProcesses(TimeSpan.FromSeconds(1), ct)
            .Where(p => includeSystem || p.Classification != ProcessClassification.System)
            .OrderByDescending(p => p.CpuPercent ?? 0).ThenByDescending(p => p.WorkingSetBytes)
            .Take(Math.Clamp(top, 1, 2000)).ToList();

    public Task<ProcessActionResult> SetPriorityAsync(int pid, ProcessPriority priority, CancellationToken ct) =>
        priority == ProcessPriority.RealTime
            ? Task.FromResult(new ProcessActionResult(false, "RealTime priority is not allowed.", null))
            : engine.SetProcessPriorityAsync(pid, priority, ct);

    public Task<ProcessActionResult> TerminateAsync(int pid, bool confirmed, CancellationToken ct) => engine.TerminateProcessAsync(pid, confirmed, ct);
}

public sealed class StartupService(IOptimizationEngine engine)
{
    public IReadOnlyList<StartupEntryInfo> List() => engine.Startup.GetEntries();

    public Task<ExecutionResult> SetEnabledAsync(string entryId, bool enabled, CancellationToken ct) =>
        engine.ExecuteOptimizationAsync(new ExecuteOptimizationRequest([$"startup:{entryId}:{(enabled ? "on" : "off")}"]), ct);
}

public sealed class GamingService(IOptimizationEngine engine)
{
    public IReadOnlyList<GameInfo> Games() => engine.Gaming.DetectGames();
    public IReadOnlyList<LauncherInfo> Launchers() => engine.Gaming.DetectLaunchers();
    public IReadOnlyList<GameProfile> Profiles() => engine.Gaming.GetProfiles();
    public GameProfile SaveProfile(GameProfile p) => engine.Gaming.CreateProfile(p);

    public Task<ExecutionResult> ApplyAsync(string gameId, bool dryRun, CancellationToken ct) =>
        engine.ExecuteOptimizationAsync(new ExecuteOptimizationRequest([$"game:{gameId}"], dryRun, Description: $"Game profile {gameId}"), ct);
}

public sealed class ProfileService(IOptimizationEngine engine)
{
    public IReadOnlyList<ProfileDefinition> List() => engine.Profiles.List();
    public IReadOnlyList<ProfileSettingDescriptor> Settings() => engine.Profiles.DescribeSettings();
    public Task<ProfileDefinition> SaveAsync(ProfileDefinition p, CancellationToken ct) => engine.CreateProfileAsync(p, ct);
    public Task<ExecutionResult> ApplyAsync(string name, bool dryRun, CancellationToken ct) => engine.ApplyProfileAsync(name, dryRun, ct);
}

public sealed class BenchmarkService(IOptimizationEngine engine)
{
    public string Start(BenchmarkRequest request) => engine.Benchmarks.StartBenchmark(request);
    public Task<BenchmarkResult?> StopAsync(string id) => engine.Benchmarks.StopBenchmark(id);
    public Task<BenchmarkResult> RunAsync(BenchmarkRequest request, CancellationToken ct) => engine.RunBenchmarkAsync(request, ct);
    public IReadOnlyList<BenchmarkResult> Results(int take = 50) => engine.Benchmarks.GetResults(take);
    public BenchmarkComparison Compare(string a, string b) => engine.Benchmarks.CompareRuns(a, b);
}

public sealed class RestoreService(IOptimizationEngine engine)
{
    public Nexus.Security.Backup.QuarantineStatus QuarantineStatus() => engine.Quarantine.Status();
    public long PurgeQuarantine(TimeSpan olderThan) => engine.Quarantine.Purge(olderThan);

    public IReadOnlyList<OptimizationTransaction> History(int take = 100) => engine.GetHistory(take);
    public Task<RollbackResult> RollbackAsync(RollbackRequest request, CancellationToken ct) => engine.RollbackOptimizationAsync(request, ct);
}

/// <summary>The application layer as a whole. Clients depend on this, never on engine internals.</summary>
public sealed class NexusApplication(IOptimizationEngine engine, Action? onDispose = null) : IDisposable
{
    public IOptimizationEngine Engine { get; } = engine;
    public SystemService System { get; } = new(engine);
    public OptimizationService Optimization { get; } = new(engine);
    public ProcessService Processes { get; } = new(engine);
    public StartupService Startup { get; } = new(engine);
    public GamingService Gaming { get; } = new(engine);
    public ProfileService Profiles { get; } = new(engine);
    public BenchmarkService Benchmark { get; } = new(engine);
    public RestoreService Restore { get; } = new(engine);

    public void Dispose()
    {
        onDispose?.Invoke();
        Engine.Dispose();
    }
}
