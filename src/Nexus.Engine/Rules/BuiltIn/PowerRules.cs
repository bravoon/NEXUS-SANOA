using Nexus.Contracts;
using Nexus.Platform.Abstractions;
using Nexus.Platform.Changes;

namespace Nexus.Engine.Rules.BuiltIn;

/// <summary>Switch to the High performance plan when on AC power. Recommended only when the CPU was measured as the limit.</summary>
public sealed class HighPerformancePowerPlanRule : OptimizationRule
{
    private static readonly Condition<PowerPlanInfo> NotAlready = new("Active plan is not High/Ultimate performance",
        (p, _) => p.ActiveSchemeId != WellKnownPowerSchemes.HighPerformance && p.ActiveSchemeId != WellKnownPowerSchemes.UltimatePerformance);
    private static readonly Condition<PowerPlanInfo> Exists = new("High performance plan exists", (p, _) => p.Available.Any(s => s.Id == WellKnownPowerSchemes.HighPerformance));
    private static readonly Condition<PowerPlanInfo> OnAc = new("Running on AC power", (p, _) => p.OnAcPower != false);
    private static readonly Condition<PowerPlanInfo> All = NotAlready.And(Exists).And(OnAc);

    public override RuleDescriptor Descriptor { get; } = Describe(
        "power.high-performance-plan", "Use the High performance power plan",
        "Keeps the CPU at higher clock states instead of saving power. Increases power draw and heat; benefit depends on the workload.",
        OptimizationCategory.Power, ImpactLevel.Low, RiskLevel.Low, requiresAdmin: false, All.Leaves());

    public override IEnumerable<RuleCandidate> Evaluate(RuleContext context)
    {
        var p = context.Snapshot.Power;
        var op = new ChangeOperation(ChangeKinds.PowerScheme, "active", StateValue.Of(WellKnownPowerSchemes.HighPerformance.ToString("D")),
            "Activate High performance power plan");
        if (!NotAlready.Evaluate(p, context).Passed)
        {
            yield return Candidate(null, "High performance power plan", p.ActiveSchemeName, RecommendationStatus.AlreadyApplied, Confidence.Confirmed, ["✓ Already active"], []);
            yield break;
        }
        var r = All.Evaluate(p, context);
        if (!r.Passed)
        {
            yield return Candidate(null, "High performance power plan", p.ActiveSchemeName, RecommendationStatus.NotApplicable, Confidence.Unknown, r.Trace, []);
            yield break;
        }
        var b = context.Analysis?.Bottleneck;
        var cpuBound = b is { Primary: Bottleneck.Cpu or Bottleneck.CpuSingleThread, Confidence: >= Confidence.Likely };
        var powerSaver = p.ActiveSchemeId == WellKnownPowerSchemes.PowerSaver;
        var justification = r.Trace.ToList();
        if (cpuBound) justification.Add($"CPU was measured as the limiting component ({b!.Confidence}).");
        if (powerSaver) justification.Add("Power saver is active while on AC power.");
        if (p.HasBattery) justification.Add("This is a battery-powered device: expect shorter battery life when unplugged.");
        if (!cpuBound && !powerSaver) justification.Add("No CPU limit was measured; the effect is likely small. Benchmark before and after.");
        yield return Candidate(null, "High performance power plan", p.ActiveSchemeName,
            cpuBound || powerSaver ? RecommendationStatus.Recommended : RecommendationStatus.Optional,
            cpuBound ? Confidence.Likely : Confidence.Possible, justification, [op]);
    }
}
