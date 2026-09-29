using Nexus.Contracts;
using Nexus.Platform;
using Nexus.Platform.Abstractions;
using Nexus.Platform.Changes;

namespace Nexus.Engine.Rules.BuiltIn;

/// <summary>DiagTrack → Manual (never Disabled). Mostly a privacy/background-activity change; performance benefit is small.</summary>
public sealed class TelemetryServiceManualRule : OptimizationRule
{
    private static readonly Condition<ServiceInfo> Auto = new("DiagTrack start mode is Automatic",
        (s, _) => s.StartMode is ServiceStartMode.Automatic or ServiceStartMode.AutomaticDelayed);

    public override RuleDescriptor Descriptor { get; } = Describe(
        "service.diagtrack-manual", "Set telemetry service to Manual",
        "Sets 'Connected User Experiences and Telemetry' (DiagTrack) to start on demand instead of at boot. Reduces a small amount of background activity.",
        OptimizationCategory.Service, ImpactLevel.Low, RiskLevel.Low, requiresAdmin: true, Auto.Leaves());

    public override IEnumerable<RuleCandidate> Evaluate(RuleContext context)
    {
        var s = context.Snapshot.Services.FirstOrDefault(x => x.Name.Equals("DiagTrack", StringComparison.OrdinalIgnoreCase));
        if (s is null) yield break;
        var r = Auto.Evaluate(s, context);
        if (!r.Passed)
        {
            yield return Candidate(null, "Telemetry service on demand", s.DisplayName, RecommendationStatus.AlreadyApplied, Confidence.Confirmed, r.Trace, []);
            yield break;
        }
        yield return Candidate(null, "Telemetry service on demand", s.DisplayName, RecommendationStatus.Optional, Confidence.Possible,
            r.Trace.Append("Set to Manual, not Disabled, so Windows can still start it when required."),
            [new ChangeOperation(ChangeKinds.ServiceStartMode, s.Name, StateValue.Of(nameof(ServiceStartMode.Manual)), "Set DiagTrack to Manual")]);
    }
}

/// <summary>
/// Moves temporary files older than N days into the Nexus quarantine (never deletes them).
/// Space is only reclaimed when the quarantine is purged, which is an explicit user action.
/// </summary>
public sealed class QuarantineOldTempFilesRule : OptimizationRule
{
    private const int MaxFiles = 2000;

    public override RuleDescriptor Descriptor { get; } = Describe(
        "storage.quarantine-old-temp-files", "Clean old temporary files",
        "Moves temporary files that were not modified recently into a reversible quarantine. Disk space is released when the quarantine is purged.",
        OptimizationCategory.Storage, ImpactLevel.Low, RiskLevel.Low, requiresAdmin: false,
        ["Temp files older than the configured age", "Total size >= configured minimum"]);

    public override IEnumerable<RuleCandidate> Evaluate(RuleContext context)
    {
        var temp = context.Reader.KnownFolder(KnownFolder.Temp);
        if (temp is null) yield break;
        var cutoff = DateTimeOffset.UtcNow.AddDays(-context.Configuration.TempCleanupMinAgeDays);
        var files = context.Reader.EnumerateFiles(temp, "*", recursive: true)
            .Where(f => f.LastWriteTime < cutoff)
            .OrderBy(f => f.LastWriteTime)
            .Take(MaxFiles)
            .ToList();
        var total = files.Sum(f => f.Length);
        var mb = total / 1024.0 / 1024.0;
        if (mb < context.Configuration.TempCleanupMinTotalMb) yield break;

        var sys = context.Snapshot.Disks.FirstOrDefault(d => d.IsSystemDrive);
        var lowSpace = sys is { TotalBytes: > 0 } && (double)sys.FreeBytes / sys.TotalBytes * 100 < context.Configuration.Diagnostics.LowFreeSpacePercent;
        var batch = DateTimeOffset.UtcNow.ToString("yyyyMMddHHmmss", System.Globalization.CultureInfo.InvariantCulture);
        var ops = files.Select(f =>
        {
            var rel = f.Path.Length > temp.Length ? f.Path[(temp.Length + 1)..] : PathUtil.GetFileName(f.Path);
            var dest = Path.Combine(context.QuarantineDirectory, batch, rel.Replace('\\', Path.DirectorySeparatorChar));
            return new ChangeOperation(ChangeKinds.FileQuarantine, f.Path, new StateValue(false, dest, "quarantined"), $"Quarantine {PathUtil.GetFileName(f.Path)}");
        }).ToList();

        yield return Candidate(null, $"Clean {files.Count} old temporary files ({mb:F0} MB)", temp,
            lowSpace ? RecommendationStatus.Recommended : RecommendationStatus.Optional, Confidence.Confirmed,
            [
                $"✓ {files.Count} files older than {context.Configuration.TempCleanupMinAgeDays} days",
                $"✓ Total size {mb:F0} MB >= {context.Configuration.TempCleanupMinTotalMb} MB",
                lowSpace ? "✓ System drive is low on free space" : "System drive has sufficient free space (optional)",
                "Files in use are skipped. Nothing is deleted until the quarantine is purged.",
            ], ops);
    }

    /// <summary>Files locked by running programs are skipped instead of failing the transaction.</summary>
    public override void Apply(RuleCandidate candidate, IChangeExecutor executor)
    {
        foreach (var op in candidate.Operations)
        {
            try { executor.Apply(op); }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or InvalidOperationException { InnerException: IOException }) { }
        }
    }

    public override bool Validate(RuleCandidate candidate, Core.ISystemReader reader) => true; // each moved file is verified individually
}

public sealed class DisableConsumerSuggestionsRule : OptimizationRule
{
    private const string Key = @"HKCU\Software\Microsoft\Windows\CurrentVersion\ContentDeliveryManager";
    private static readonly string[] Values = ["SilentInstalledAppsEnabled", "SubscribedContent-338388Enabled", "SystemPaneSuggestionsEnabled"];

    public override RuleDescriptor Descriptor { get; } = Describe(
        "debloat.disable-consumer-suggestions", "Stop suggested apps and Start menu ads",
        "Prevents Windows from silently installing promoted apps and showing suggestions in Start. Does not remove anything already installed.",
        OptimizationCategory.Debloat, ImpactLevel.Low, RiskLevel.Low, requiresAdmin: false, ["Any consumer-content setting is enabled or at its default"]);

    public override IEnumerable<RuleCandidate> Evaluate(RuleContext context)
    {
        var enabled = Values.Where(v => context.Reader.ReadRegistry(Key, v)?.AsDWord() != 0).ToList();
        if (enabled.Count == 0)
        {
            yield return Candidate(null, "Disable consumer suggestions", "ContentDeliveryManager", RecommendationStatus.AlreadyApplied, Confidence.Confirmed, ["✓ Already disabled"], []);
            yield break;
        }
        yield return Candidate(null, "Disable consumer suggestions", "ContentDeliveryManager", RecommendationStatus.Optional, Confidence.Possible,
            enabled.Select(v => $"✓ {v} is enabled").Append("Primarily reduces unsolicited installs; performance effect is minimal."),
            enabled.Select(v => Reg.DWord(Key, v, 0, $"Disable {v}")).ToList());
    }
}

/// <summary>Lowers (for the current session only) the priority of a background user process that was measured using a lot of CPU.</summary>
public sealed class DeprioritizeBackgroundProcessRule : OptimizationRule
{
    private const double Threshold = 25;
    private static readonly Condition<ProcessInfo> Busy = new($"Measured CPU >= {Threshold}%", (p, _) => p.CpuPercent >= Threshold);
    private static readonly Condition<ProcessInfo> UserClass = new("Classified USER or TRUSTED", (p, _) => p.Classification is ProcessClassification.User or ProcessClassification.Trusted);
    private static readonly Condition<ProcessInfo> NotProtected = new("Not a protected process", (p, _) => !p.IsProtected);
    private static readonly Condition<ProcessInfo> Normal = new("Priority is Normal", (p, _) => p.Priority == ProcessPriority.Normal);
    private static readonly Condition<ProcessInfo> All = Busy.And(UserClass).And(NotProtected).And(Normal);

    public override RuleDescriptor Descriptor { get; } = Describe(
        "process.deprioritize-background", "Lower priority of a busy background process",
        "Sets a CPU-heavy background application to Below normal priority for this session. It is never terminated; the change disappears when the process exits.",
        OptimizationCategory.Process, ImpactLevel.Low, RiskLevel.Low, requiresAdmin: false, All.Leaves());

    public override IEnumerable<RuleCandidate> Evaluate(RuleContext context)
    {
        foreach (var p in context.Snapshot.Processes)
        {
            var r = All.Evaluate(p, context);
            if (!r.Passed) continue;
            var target = $"{p.Pid}:{(p.StartTime?.UtcTicks ?? 0).ToString(System.Globalization.CultureInfo.InvariantCulture)}";
            yield return Candidate(p.Pid.ToString(System.Globalization.CultureInfo.InvariantCulture), $"Lower priority: {p.Name} ({p.Pid})", p.Name,
                RecommendationStatus.Optional, Confidence.Possible,
                r.Trace.Append("Only helps if this process competes with your game for CPU time. Not persistent."),
                [new ChangeOperation(ChangeKinds.ProcessPriority, target, StateValue.Of(nameof(ProcessPriority.BelowNormal)), $"Set {p.Name} to Below normal")]);
        }
    }
}
