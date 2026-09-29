using Nexus.Contracts;
using Nexus.Data.Logging;
using Nexus.Data.Repositories;
using Nexus.Engine.Core;
using Nexus.Engine.Optimization;
using Nexus.Engine.Processes;
using Nexus.Engine.Profiles;
using Nexus.Platform;
using Nexus.Platform.Abstractions;
using Nexus.Platform.Changes;
using Nexus.Security.Rollback;

namespace Nexus.Engine.Gaming;

/// <summary>
/// Independent gaming module: detects games and launchers, stores per-game profiles, applies them for the
/// duration of a game session through the normal pipeline and restores everything when the game exits.
/// It never assumes an optimization improves FPS — use the BenchmarkEngine to measure.
/// </summary>
public sealed class GamingEngine : IDisposable
{
    private readonly IPlatform _platform;
    private readonly GameDetector _detector;
    private readonly ProfileRepository _profiles;
    private readonly ProcessEngine _processes;
    private readonly ProfileSettings _settings;
    private readonly OptimizationPipeline _pipeline;
    private readonly RollbackEngine _rollback;
    private readonly EngineEventBus _events;
    private readonly INexusLogger _log;
    private readonly Dictionary<string, GameSessionState> _sessions = new(StringComparer.OrdinalIgnoreCase);
    private CancellationTokenSource? _monitor;

    public GamingEngine(IPlatform platform, ProfileRepository profiles, ProcessEngine processes, ProfileSettings settings,
        OptimizationPipeline pipeline, RollbackEngine rollback, EngineEventBus events, INexusLogger log)
    {
        _platform = platform;
        _detector = new GameDetector(platform);
        _profiles = profiles;
        _processes = processes;
        _settings = settings;
        _pipeline = pipeline;
        _rollback = rollback;
        _events = events;
        _log = log;
    }

    public IReadOnlyList<GameInfo> DetectGames() => _detector.DetectGames();
    public IReadOnlyList<LauncherInfo> DetectLaunchers() => _detector.DetectLaunchers();
    public IReadOnlyList<GameProfile> GetProfiles() => _profiles.ListGameProfiles();
    public IReadOnlyCollection<GameSessionState> ActiveSessions { get { lock (_sessions) return _sessions.Values.ToList(); } }

    public GameProfile CreateProfile(GameProfile profile)
    {
        Validate(profile);
        _profiles.SaveGameProfile(profile);
        return profile;
    }

    private void Validate(GameProfile p)
    {
        if (string.IsNullOrWhiteSpace(p.GameId) || string.IsNullOrWhiteSpace(p.Executable)) throw new ArgumentException("GameId and Executable are required.");
        if (p.Priority == ProcessPriority.RealTime) throw new ArgumentException("RealTime priority is not allowed.");
        if (p.CpuAffinity is { } mask)
        {
            var cpus = _platform.SystemInfo.GetCpu().LogicalProcessors;
            var all = cpus >= 64 ? -1L : (1L << cpus) - 1;
            if (mask == 0 || (mask & ~all) != 0) throw new ArgumentException("CPU affinity mask is empty or references CPUs that do not exist.");
        }
        foreach (var (k, v) in p.WindowsSettings ?? new Dictionary<string, string>()) _settings.Validate(k, v);
        foreach (var k in (p.GraphicsSettings ?? new Dictionary<string, string>()).Keys)
            if (k != "gpuPreference") throw new ArgumentException($"Unknown graphics setting '{k}'. Supported: gpuPreference (default|powerSaving|highPerformance).");
    }

    /// <summary>Operations of a game profile. Process-level operations are included only when the game is running.</summary>
    public IReadOnlyList<ChangeOperation> BuildOperations(GameProfile profile, ProcessFacts? gameProcess)
    {
        var ops = new List<ChangeOperation>();
        if (profile.GraphicsSettings?.TryGetValue("gpuPreference", out var pref) == true)
        {
            // The DirectX per-app preference is keyed by the full executable path.
            var path = gameProcess?.Path ?? (profile.Executable.Contains('\\') ? profile.Executable : null);
            if (path is not null)
            {
                var value = pref switch
                {
                    "highPerformance" => "GpuPreference=2;",
                    "powerSaving" => "GpuPreference=1;",
                    _ => "GpuPreference=0;",
                };
                ops.Add(new ChangeOperation(ChangeKinds.RegistryValue, RegistryPaths.Target(@"HKCU\Software\Microsoft\DirectX\UserGpuPreferences", path),
                    StateValue.Of(value, nameof(RegValueKind.String)), $"Set per-app GPU preference for {PathUtil.GetFileName(path)}"));
            }
        }
        foreach (var (k, v) in profile.WindowsSettings ?? new Dictionary<string, string>())
            ops.AddRange(_settings.Operations(k, v));

        if (gameProcess is not null)
        {
            if (profile.Priority != ProcessPriority.Normal) ops.Add(_processes.PriorityChange(gameProcess, profile.Priority));
            if (profile.CpuAffinity is { } mask)
                ops.Add(new ChangeOperation(ChangeKinds.ProcessAffinity, ProcessPriorityChangeHandler.TargetFor(gameProcess),
                    StateValue.Of(mask.ToString(System.Globalization.CultureInfo.InvariantCulture)), $"Set CPU affinity of {gameProcess.Name}"));
            foreach (var name in profile.BackgroundProcesses ?? [])
                foreach (var bg in _platform.Processes.GetProcesses().Where(p => p.Name.Equals(name, StringComparison.OrdinalIgnoreCase) && p.Pid != gameProcess.Pid))
                    if (!_processes.EvaluateProtection(bg).IsProtected && bg.Priority is ProcessPriority.Normal or ProcessPriority.AboveNormal)
                        ops.Add(_processes.PriorityChange(bg, ProcessPriority.BelowNormal));
        }
        return ops;
    }

    public ProcessFacts? FindRunning(GameProfile profile)
    {
        var exe = PathUtil.GetFileName(profile.Executable);
        return _platform.Processes.GetProcesses().FirstOrDefault(p =>
            p.Name.Equals(exe, StringComparison.OrdinalIgnoreCase) || PathUtil.EqualsPath(p.Path, profile.Executable));
    }

    public async Task<ExecutionResult> ApplyProfileAsync(string gameId, bool dryRun, CancellationToken ct = default)
    {
        var profile = _profiles.GetGameProfile(gameId) ?? throw new KeyNotFoundException($"No profile for game '{gameId}'.");
        var running = FindRunning(profile);
        var ops = BuildOperations(profile, running);
        var action = new PlannedAction($"game:{gameId}", "gaming.profile", $"Game profile: {gameId}", ops);
        var result = await _pipeline.ExecuteAsync([action], new ExecutionOptions(dryRun, Description: $"Game profile {gameId}"), ct).ConfigureAwait(false);
        if (!dryRun && result.Status == TransactionStatus.Committed && running is not null)
            lock (_sessions) _sessions[gameId] = new GameSessionState(gameId, running.Pid, DateTimeOffset.UtcNow, result.TransactionId);
        return result;
    }

    /// <summary>Watches for profiled games with AutoApply; applies on start, rolls back on exit.</summary>
    public void StartMonitoring(TimeSpan interval)
    {
        if (_monitor is not null) return;
        _monitor = new CancellationTokenSource();
        var ct = _monitor.Token;
        _ = Task.Run(async () =>
        {
            while (!ct.IsCancellationRequested)
            {
                try { await PollOnceAsync(ct).ConfigureAwait(false); }
                catch (Exception ex) when (ex is not OperationCanceledException) { _log.Error("Gaming", "Game monitor iteration failed", ex); }
                try { await Task.Delay(interval, ct).ConfigureAwait(false); } catch (OperationCanceledException) { }
            }
        }, ct);
    }

    public async Task PollOnceAsync(CancellationToken ct = default)
    {
        foreach (var profile in _profiles.ListGameProfiles().Where(p => p.AutoApply))
        {
            var running = FindRunning(profile);
            GameSessionState? session;
            lock (_sessions) _sessions.TryGetValue(profile.GameId, out session);
            if (running is not null && session is null)
            {
                _events.Publish(EngineEventType.GameStarted, $"{profile.GameId} started (PID {running.Pid})", profile.GameId, null, new { profile.GameId, running.Pid });
                var r = await ApplyProfileAsync(profile.GameId, false, ct).ConfigureAwait(false);
                if (r.Status != TransactionStatus.Committed) _log.Warning("Gaming", $"Profile for {profile.GameId} not applied: {r.Status}");
            }
            else if (running is null && session is not null)
            {
                lock (_sessions) _sessions.Remove(profile.GameId);
                if (session.TransactionId is { } tx) _rollback.Rollback(new RollbackRequest(tx));
                _events.Publish(EngineEventType.GameStopped, $"{profile.GameId} exited — session settings restored", profile.GameId, null, session);
            }
        }
    }

    public void StopMonitoring()
    {
        _monitor?.Cancel();
        _monitor?.Dispose();
        _monitor = null;
    }

    public void Dispose() => StopMonitoring();
}
