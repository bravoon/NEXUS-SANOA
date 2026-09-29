using Nexus.Contracts;
using Nexus.Engine.Startup;

namespace Nexus.Engine.Rules.BuiltIn;

/// <summary>
/// Rule: DisableUnnecessaryStartup
/// Conditions: Enabled AND StartupImpact >= HIGH (Medium → optional) AND ApplicationNotCritical AND NotService
/// Risk: LOW — Reversible: TRUE (Task Manager's StartupApproved mechanism; the entry itself is kept).
/// </summary>
public sealed class DisableHighImpactStartupRule(StartupEngine startup) : OptimizationRule
{
    private static readonly Condition<StartupEntryInfo> Enabled = new("Entry is enabled", (e, _) => e.Enabled);
    private static readonly Condition<StartupEntryInfo> HighImpact = new("StartupImpact >= Medium", (e, _) => e.Impact >= ImpactLevel.Medium);
    private static readonly Condition<StartupEntryInfo> NotCritical = new("ApplicationNotCritical == TRUE", (e, _) => !e.IsCritical);
    private static readonly Condition<StartupEntryInfo> NotService = new("Source is not a service", (e, _) => e.Source != StartupSource.Service);
    private static readonly Condition<StartupEntryInfo> All = Enabled.And(HighImpact).And(NotCritical).And(NotService);

    public override RuleDescriptor Descriptor { get; } = Describe(
        "startup.disable-high-impact", "Disable high-impact startup application",
        "Prevents a non-essential application from starting automatically at sign-in. The application keeps working when started manually.",
        OptimizationCategory.Startup, ImpactLevel.Medium, RiskLevel.Low, requiresAdmin: false, All.Leaves());

    public override IEnumerable<RuleCandidate> Evaluate(RuleContext context)
    {
        foreach (var e in context.Snapshot.Startup)
        {
            var r = All.Evaluate(e, context);
            if (!r.Passed) continue;
            var op = startup.ToggleOperation(e, enable: false);
            if (op is null) continue;
            var status = e.Impact == ImpactLevel.High ? RecommendationStatus.Recommended : RecommendationStatus.Optional;
            yield return Candidate(e.Id, $"Disable startup: {e.Name}", e.Name, status, Confidence.Likely,
                r.Trace.Append($"Impact {e.Impact} ({e.ImpactBasis})").Append("Expected effect: faster sign-in and less background activity; in-game FPS is usually unaffected."),
                [op]);
        }
    }
}
