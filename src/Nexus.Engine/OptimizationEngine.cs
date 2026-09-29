using System.Globalization;
using System.Reflection;
using Nexus.Contracts;
using Nexus.Data.Configuration;
using Nexus.Data.Logging;
using Nexus.Data.Repositories;
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

public sealed class OptimizationEngine : IOptimizationEngine, IRollbackExecutor
{
    private const string Cat = "Engine";
    private readonly IPlatform _platform;
    private readonly NexusConfiguration _config;
    private readonly NexusStore _store;
    private readonly INexusLogger _log;
    private readonly EngineEventBus _events;
    private readonly SystemAnalyzer _analyzer;
    private readonly DiagnosticEngine _diagnostics;
    private readonly OptimizationRuleEngine _rules;
    private readonly IReadOnlyList<IOptimizationModule> _modules;
    private readonly OptimizationPipeline _pipeline;
    private readonly RollbackEngine _rollback;
    private readonly PermissionManager _permissions;
    private readonly BackupManager _backups;
    private readonly ISystemReader _reader;
    private readonly string _quarantine;
    private readonly object _cacheGate = new();
    private SystemSnapshot? _snapshot;
    private AnalysisReport? _analysis;
    private Dictionary<string, RuleCandidate> _candidates = new(StringComparer.Ordinal);
    private DateTimeOffset _lastChange = DateTimeOffset.MinValue;

    private void Invalidate()
    {
        lock (_cacheGate) { _snapshot = null; _analysis = null; _candidates.Clear(); _lastChange = DateTimeOffset.UtcNow; }
    }

    internal OptimizationEngine(EngineComponents c)
    {
        _platform = c.Platform; _config = c.Config; _store = c.Store; _log = c.Log; _events = c.Events;
        _analyzer = c.Analyzer; _diagnostics = c.Diagnostics; _rules = c.Rules; _modules = c.Modules;
        _pipeline = c.Pipeline; _rollback = c.Rollback; _permissions = c.Permissions; _backups = c.Backups;
        _reader = c.Reader; _quarantine = c.QuarantineDirectory;
        Quarantine = new QuarantineManager(c.QuarantineDirectory, c.Log);
        Processes = c.Processes; Startup = c.Startup; Gaming = c.Gaming; Benchmarks = c.Benchmarks; Profiles = c.Profiles; Hardware = c.Hardware;
    }

    public IEngineEvents Events => _events;
    public ProcessEngine Processes { get; }
    public StartupEngine Startup { get; }
    public GamingEngine Gaming { get; }
    public BenchmarkEngine Benchmarks { get; }
    public ProfileEngine Profiles { get; }
    public HardwareEngine Hardware { get; }
    public IReadOnlyList<IOptimizationModule> Modules => _modules;
    public PermissionManager Permissions => _permissions;
    public QuarantineManager Quarantine { get; }
    public static string Version => typeof(OptimizationEngine).Assembly.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion?.Split('+')[0] ?? "1.0.0";

    // ---------------- Detect / Analyze / Recommend ----------------

    public async Task<SystemSnapshot> ScanSystemAsync(ScanOptions? options = null, CancellationToken ct = default)
    {
        var snap = await Task.Run(() => _analyzer.Scan(options ?? new ScanOptions(_config.DefaultSampleSeconds), ct), ct).ConfigureAwait(false);
        _store.Snapshots.Save(snap);
        _store.Snapshots.Prune(_config.SnapshotRetention);
        lock (_cacheGate) { _snapshot = snap; _analysis = null; _candidates.Clear(); }
        return snap;
    }

    private async Task<SystemSnapshot> CurrentSnapshotAsync(CancellationToken ct)
    {
        lock (_cacheGate) if (_snapshot is not null) return _snapshot;
        var stored = _store.Snapshots.GetLatest();
        // A stored snapshot is reused only if nothing was changed after it was taken.
        var lastTx = _store.Transactions.List(1).FirstOrDefault();
        var lastChange = new[] { _lastChange, lastTx?.CompletedAt ?? DateTimeOffset.MinValue, lastTx?.CreatedAt ?? DateTimeOffset.MinValue }.Max();
        if (stored is not null && stored.IsSimulated == _platform.IsSimulated && stored.CapturedAt > lastChange &&
            DateTimeOffset.UtcNow - stored.CapturedAt < TimeSpan.FromMinutes(30))
        {
            lock (_cacheGate) _snapshot = stored;
            return stored;
        }
        return await ScanSystemAsync(new ScanOptions(Math.Min(3, _config.DefaultSampleSeconds)), ct).ConfigureAwait(false);
    }

    public async Task<AnalysisReport> AnalyzeSystemAsync(CancellationToken ct = default)
    {
        var snap = await CurrentSnapshotAsync(ct).ConfigureAwait(false);
        var report = _diagnostics.Analyze(snap);
        lock (_cacheGate) _analysis = report;
        _events.Publish(EngineEventType.AnalysisCompleted, $"Analysis: {report.Findings.Count} finding(s), bottleneck {report.Bottleneck.Primary} ({report.Bottleneck.Confidence})",
            snap.Id, 1, new { report.Bottleneck.Primary, report.Bottleneck.Confidence, findings = report.Findings.Count });
        return report;
    }

    private RuleContext Context(SystemSnapshot snap, AnalysisReport? analysis) => new(snap, analysis, _config, _reader, _quarantine);

    private async Task<IReadOnlyList<RuleCandidate>> EvaluateAsync(CancellationToken ct)
    {
        var snap = await CurrentSnapshotAsync(ct).ConfigureAwait(false);
        AnalysisReport? analysis;
        lock (_cacheGate) analysis = _analysis;
        analysis ??= await AnalyzeSystemAsync(ct).ConfigureAwait(false);
        var ctx = Context(snap, analysis);
        var candidates = _modules.SelectMany(m => m.GetRecommendations(ctx, _rules)).ToList();
        // Rules whose category has no module (e.g. declarative rules) are still evaluated.
        var covered = _modules.Select(m => m.Category).ToHashSet();
        candidates.AddRange(_rules.Evaluate(ctx, d => !covered.Contains(d.Category)));
        lock (_cacheGate) _candidates = candidates.GroupBy(c => c.OptimizationId).ToDictionary(g => g.Key, g => g.First(), StringComparer.Ordinal);
        return candidates;
    }

    public async Task<IReadOnlyList<OptimizationRecommendation>> GetRecommendationsAsync(CancellationToken ct = default)
    {
        var candidates = await EvaluateAsync(ct).ConfigureAwait(false);
        return candidates.Select(c =>
        {
            var d = _rules.Get(c.RuleId)!.Descriptor;
            var admin = c.Operations.Count == 0 ? d.RequiresAdmin : _permissions.Check(c.Operations.Select(o => (o.Kind, o.Target))).RequiresAdmin;
            return OptimizationRuleEngine.ToRecommendation(c, d, admin);
        })
        .OrderBy(r => r.Status).ThenByDescending(r => r.Impact).ThenBy(r => r.Risk).ToList();
    }

    public IReadOnlyList<RuleDescriptor> GetRules() => _rules.Describe();

    // ---------------- Preview / Execute ----------------

    private async Task<PlannedAction> ResolveAsync(string optimizationId, CancellationToken ct)
    {
        var parts = optimizationId.Split(':');
        switch (parts[0])
        {
            case "startup" when parts.Length == 3:
            {
                var entry = Startup.GetEntries().FirstOrDefault(e => e.Id == parts[1]) ?? throw new KeyNotFoundException($"Startup entry {parts[1]} not found.");
                var enable = parts[2] == "on";
                if (!enable && entry.IsCritical) throw new InvalidOperationException($"'{entry.Name}' is critical (security, audio or input driver) and is not disabled by Nexus.");
                var op = Startup.ToggleOperation(entry, enable) ?? throw new InvalidOperationException("This startup entry cannot be toggled.");
                return new PlannedAction(optimizationId, "startup.toggle", op.Description, [op]);
            }
            case "profile" when parts.Length >= 2:
            {
                var name = optimizationId["profile:".Length..];
                var profile = Profiles.Get(name) ?? throw new KeyNotFoundException($"Profile '{name}' not found.");
                var actions = Profiles.Plan(profile);
                return new PlannedAction(optimizationId, "profile.apply", $"Apply profile '{profile.Name}'", actions.SelectMany(a => a.Operations).ToList(),
                    RequiresReboot: actions.Any(a => a.RequiresReboot));
            }
            case "game" when parts.Length >= 2:
            {
                var gameId = optimizationId["game:".Length..];
                var profile = Gaming.GetProfiles().FirstOrDefault(p => p.GameId == gameId) ?? throw new KeyNotFoundException($"No profile for game '{gameId}'.");
                return new PlannedAction(optimizationId, "gaming.profile", $"Game profile: {gameId}", Gaming.BuildOperations(profile, Gaming.FindRunning(profile)));
            }
            case "process" when parts.Length == 4 && parts[2] == "priority":
            {
                var pid = int.Parse(parts[1], CultureInfo.InvariantCulture);
                var p = Processes.Get(pid) ?? throw new KeyNotFoundException($"Process {pid} is not running.");
                var prio = Enum.Parse<ProcessPriority>(parts[3], ignoreCase: true);
                return new PlannedAction(optimizationId, "process.priority", $"Set {p.Name} priority to {prio}", [Processes.PriorityChange(p, prio)]);
            }
        }

        RuleCandidate? candidate;
        lock (_cacheGate) _candidates.TryGetValue(optimizationId, out candidate);
        if (candidate is null)
        {
            await EvaluateAsync(ct).ConfigureAwait(false);
            lock (_cacheGate) _candidates.TryGetValue(optimizationId, out candidate);
        }
        if (candidate is null) throw new KeyNotFoundException($"Optimization '{optimizationId}' is not currently recommended for this system.");
        if (candidate.Status is RecommendationStatus.AlreadyApplied or RecommendationStatus.NotApplicable or RecommendationStatus.Blocked)
            throw new InvalidOperationException($"Optimization '{optimizationId}' is {candidate.Status}.");
        return OptimizationModule.ToAction(candidate, _rules);
    }

    public async Task<OptimizationPreview> PreviewOptimizationAsync(string optimizationId, CancellationToken ct = default)
    {
        try
        {
            var action = await ResolveAsync(optimizationId, ct).ConfigureAwait(false);
            return _pipeline.Preview(action);
        }
        catch (Exception ex) when (ex is KeyNotFoundException or InvalidOperationException or FormatException or ArgumentException)
        {
            return new OptimizationPreview(optimizationId, optimizationId, [], false, false, false, false, [ex.Message], []);
        }
    }

    public async Task<ExecutionResult> ExecuteOptimizationAsync(ExecuteOptimizationRequest request, CancellationToken ct = default)
    {
        if (request.OptimizationIds.Count == 0)
            return new ExecutionResult("", TransactionStatus.Failed, null, ["No optimization selected."], false, false);
        var actions = new List<PlannedAction>();
        foreach (var id in request.OptimizationIds.Distinct(StringComparer.Ordinal))
        {
            try { actions.Add(await ResolveAsync(id, ct).ConfigureAwait(false)); }
            catch (Exception ex) when (ex is KeyNotFoundException or InvalidOperationException or FormatException or ArgumentException)
            {
                return new ExecutionResult("", TransactionStatus.Failed, null, [$"{id}: {ex.Message}"], false, false);
            }
        }

        var options = new ExecutionOptions(request.DryRun, request.CreateRestorePoint, request.TransactionId,
            request.Description ?? (actions.Count == 1 ? actions[0].Name : $"{actions.Count} optimizations"));
        var result = await _pipeline.ExecuteAsync(actions, options, ct).ConfigureAwait(false);

        if (result.Status == TransactionStatus.ElevationRequired && request.AllowElevation && _permissions.CanElevate)
        {
            _events.Publish(EngineEventType.ElevationRequired, "Requesting administrator rights for this transaction", null, null, new { request.OptimizationIds });
            var txId = _store.Transactions.NextId(DateTimeOffset.UtcNow);
            var elevated = await _permissions.ElevationBroker!.ExecuteElevatedAsync(request with { TransactionId = txId, AllowElevation = false }, ct).ConfigureAwait(false);
            if (elevated is not null) result = elevated with { Transaction = _store.Transactions.Get(elevated.TransactionId) ?? elevated.Transaction };
            else result = result with { Messages = [.. result.Messages, "Elevation was cancelled or failed. Nothing was changed."] };
        }

        if (result.Status == TransactionStatus.Committed)
        {
            Invalidate(); // system changed: cached analysis is stale
            foreach (var a in actions.Where(a => a.OptimizationId.StartsWith("profile:", StringComparison.Ordinal)))
            {
                var name = a.OptimizationId["profile:".Length..];
                _store.Settings.Set(ProfileEngine.ActiveProfileKey, Profiles.Get(name)?.Name ?? name);
                _store.Settings.Set(ProfileEngine.ActiveProfileTxKey, result.TransactionId);
            }
        }
        return result;
    }

    // ---------------- Rollback ----------------

    public async Task<RollbackResult> RollbackOptimizationAsync(RollbackRequest request, CancellationToken ct = default)
    {
        _events.Publish(EngineEventType.RollbackStarted, $"Rolling back {request.TransactionId}{(request.ItemId is null ? "" : "/" + request.ItemId)}", request.TransactionId);
        var result = await Task.Run(() => _rollback.Rollback(request), ct).ConfigureAwait(false);
        if (result.Status == TransactionStatus.ElevationRequired && _permissions.CanElevate)
            result = await _permissions.ElevationBroker!.RollbackElevatedAsync(request, ct).ConfigureAwait(false) ?? result;
        Invalidate();
        _events.Publish(result.Status is TransactionStatus.RolledBack or TransactionStatus.PartiallyRolledBack ? EngineEventType.RollbackCompleted : EngineEventType.RollbackFailed,
            $"Rollback {request.TransactionId}: {result.Status}", request.TransactionId, 1, result);
        return result;
    }

    RollbackResult IRollbackExecutor.Rollback(RollbackRequest request) => _rollback.Rollback(request);

    public IReadOnlyList<OptimizationTransaction> GetHistory(int take = 100) => _store.Transactions.List(take);

    // ---------------- Profiles / Benchmark / Status ----------------

    public Task<ProfileDefinition> CreateProfileAsync(ProfileDefinition profile, CancellationToken ct = default) =>
        Task.FromResult(Profiles.CreateProfile(profile, _backups));

    public Task<ExecutionResult> ApplyProfileAsync(string name, bool dryRun = false, CancellationToken ct = default) =>
        ExecuteOptimizationAsync(new ExecuteOptimizationRequest([$"profile:{name}"], dryRun, Description: $"Profile {name}"), ct);

    public Task<BenchmarkResult> RunBenchmarkAsync(BenchmarkRequest request, CancellationToken ct = default) => Benchmarks.RunAsync(request, ct);

    public async Task<SystemStatus> GetSystemStatusAsync(CancellationToken ct = default)
    {
        var live = await Task.Run(() => { try { return Hardware.Sample(TimeSpan.FromMilliseconds(500), ct); } catch { return null; } }, ct).ConfigureAwait(false);
        SystemSnapshot? snap;
        lock (_cacheGate) snap = _snapshot;
        snap ??= _store.Snapshots.GetLatest();
        return new SystemStatus(Version, _platform.Name, _platform.IsSimulated, _platform.Privileges.IsElevated, snap?.CapturedAt,
            Profiles.ActiveProfile, _store.Transactions.CountByStatus(TransactionStatus.Committed), live);
    }

    public IReadOnlyList<LogEntry> GetLogs(int take, NexusLogLevel minLevel) => _store.Logs.Recent(Math.Clamp(take, 1, 5000), minLevel);

    // ---------------- Processes ----------------

    public async Task<ProcessActionResult> SetProcessPriorityAsync(int pid, ProcessPriority priority, CancellationToken ct = default)
    {
        var r = await ExecuteOptimizationAsync(new ExecuteOptimizationRequest([$"process:{pid}:priority:{priority}"]), ct).ConfigureAwait(false);
        return new ProcessActionResult(r.Status == TransactionStatus.Committed, string.Join(" ", r.Messages.DefaultIfEmpty(r.Status.ToString())), r.TransactionId);
    }

    /// <summary>Only on explicit user request, never automatic, never for protected processes.</summary>
    public async Task<ProcessActionResult> TerminateProcessAsync(int pid, bool userConfirmed, CancellationToken ct = default)
    {
        if (!userConfirmed) return new ProcessActionResult(false, "Termination requires explicit user confirmation.", null);
        var p = Processes.Get(pid);
        if (p is null) return new ProcessActionResult(false, $"Process {pid} is not running.", null);
        var action = new PlannedAction($"process:{pid}:terminate", "process.terminate", $"Terminate {p.Name} ({pid})", [Processes.TerminateChange(p)], RiskLevel.Medium);
        var r = await _pipeline.ExecuteAsync([action], new ExecutionOptions(Description: action.Name), ct).ConfigureAwait(false);
        _log.Info(Cat, $"User-requested termination of {p.Name} ({pid}): {r.Status}");
        return new ProcessActionResult(r.Status == TransactionStatus.Committed, string.Join(" ", r.Messages.DefaultIfEmpty(r.Status.ToString())), r.TransactionId);
    }

    public void Dispose()
    {
        Gaming.Dispose();
        (_platform as IDisposable)?.Dispose();
    }
}

internal sealed record EngineComponents(
    IPlatform Platform, NexusConfiguration Config, NexusStore Store, INexusLogger Log, EngineEventBus Events,
    SystemAnalyzer Analyzer, DiagnosticEngine Diagnostics, OptimizationRuleEngine Rules, IReadOnlyList<IOptimizationModule> Modules,
    OptimizationPipeline Pipeline, RollbackEngine Rollback, PermissionManager Permissions, BackupManager Backups, ISystemReader Reader,
    string QuarantineDirectory, ProcessEngine Processes, StartupEngine Startup, GamingEngine Gaming, BenchmarkEngine Benchmarks,
    ProfileEngine Profiles, HardwareEngine Hardware);
