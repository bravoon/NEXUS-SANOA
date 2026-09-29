using Nexus.Contracts;
using Nexus.Engine.Analyzer;
using Nexus.Engine.Benchmark;
using Nexus.Engine.Core;
using Nexus.Engine.Gaming;
using Nexus.Engine.Hardware;
using Nexus.Engine.Processes;
using Nexus.Engine.Profiles;
using Nexus.Engine.Startup;

namespace Nexus.Engine;

/// <summary>
/// The public surface of the Optimization Engine. Every client — desktop UI (through the IPC API), CLI,
/// or a future web/mobile dashboard — uses exactly this contract. All results are structured data.
/// </summary>
/// <remarks>
/// Optimization ids accepted by Preview/Execute:
///   "&lt;ruleId&gt;[:&lt;target&gt;]"        rule candidates returned by GetRecommendations
///   "startup:&lt;entryId&gt;:on|off"      enable/disable a startup entry
///   "profile:&lt;name&gt;"                apply a whole profile
///   "game:&lt;gameId&gt;"                 apply a game profile
///   "process:&lt;pid&gt;:priority:&lt;p&gt;"   session-only priority change
/// </remarks>
public interface IOptimizationEngine : IDisposable
{
    IEngineEvents Events { get; }

    Task<SystemSnapshot> ScanSystemAsync(ScanOptions? options = null, CancellationToken ct = default);
    Task<AnalysisReport> AnalyzeSystemAsync(CancellationToken ct = default);
    Task<IReadOnlyList<OptimizationRecommendation>> GetRecommendationsAsync(CancellationToken ct = default);
    Task<OptimizationPreview> PreviewOptimizationAsync(string optimizationId, CancellationToken ct = default);
    Task<ExecutionResult> ExecuteOptimizationAsync(ExecuteOptimizationRequest request, CancellationToken ct = default);
    Task<RollbackResult> RollbackOptimizationAsync(RollbackRequest request, CancellationToken ct = default);
    Task<ProfileDefinition> CreateProfileAsync(ProfileDefinition profile, CancellationToken ct = default);
    Task<ExecutionResult> ApplyProfileAsync(string name, bool dryRun = false, CancellationToken ct = default);
    Task<BenchmarkResult> RunBenchmarkAsync(BenchmarkRequest request, CancellationToken ct = default);
    Task<SystemStatus> GetSystemStatusAsync(CancellationToken ct = default);

    // Specialised sub-engines (read-mostly; every mutation they offer goes through the pipeline).
    ProcessEngine Processes { get; }
    StartupEngine Startup { get; }
    GamingEngine Gaming { get; }
    BenchmarkEngine Benchmarks { get; }
    ProfileEngine Profiles { get; }
    HardwareEngine Hardware { get; }
    Nexus.Security.Backup.QuarantineManager Quarantine { get; }

    IReadOnlyList<RuleDescriptor> GetRules();
    IReadOnlyList<OptimizationTransaction> GetHistory(int take = 100);
    IReadOnlyList<LogEntry> GetLogs(int take, NexusLogLevel minLevel);
    Task<ProcessActionResult> SetProcessPriorityAsync(int pid, ProcessPriority priority, CancellationToken ct = default);
    Task<ProcessActionResult> TerminateProcessAsync(int pid, bool userConfirmed, CancellationToken ct = default);
}
