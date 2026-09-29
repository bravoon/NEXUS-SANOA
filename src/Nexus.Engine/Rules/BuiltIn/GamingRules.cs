using Nexus.Contracts;
using Nexus.Platform.Abstractions;
using Nexus.Platform.Changes;

namespace Nexus.Engine.Rules.BuiltIn;

internal static class Reg
{
    public static ChangeOperation DWord(string key, string name, uint value, string description) =>
        new(ChangeKinds.RegistryValue, RegistryPaths.Target(key, name), new StateValue(true, value.ToString(System.Globalization.CultureInfo.InvariantCulture), nameof(RegValueKind.DWord)), description);
}

public sealed class EnableGameModeRule : OptimizationRule
{
    public const string Key = @"HKCU\Software\Microsoft\GameBar";
    private static readonly Condition<GamingSettingsInfo> Disabled = new("Game Mode is explicitly disabled", (g, _) => g.GameModeEnabled == false);

    public override RuleDescriptor Descriptor { get; } = Describe(
        "gaming.enable-game-mode", "Enable Windows Game Mode",
        "Game Mode lets Windows prioritise the foreground game and defers Windows Update activity while playing. It is on by default in Windows 10/11.",
        OptimizationCategory.Gaming, ImpactLevel.Low, RiskLevel.Low, requiresAdmin: false, Disabled.Leaves());

    public override IEnumerable<RuleCandidate> Evaluate(RuleContext context)
    {
        var g = context.Snapshot.Gaming;
        var r = Disabled.Evaluate(g, context);
        if (!r.Passed)
        {
            yield return Candidate(null, "Enable Game Mode", "Game Mode", RecommendationStatus.AlreadyApplied, Confidence.Confirmed, ["✓ Game Mode is enabled"], []);
            yield break;
        }
        yield return Candidate(null, "Enable Game Mode", "Game Mode", RecommendationStatus.Recommended, Confidence.Possible,
            r.Trace.Append("Restores the Windows default. Measured FPS gains vary by game and are often within noise."),
            [Reg.DWord(Key, "AutoGameModeEnabled", 1, "Enable Game Mode")]);
    }
}

public sealed class DisableBackgroundCaptureRule : OptimizationRule
{
    private static readonly Condition<GamingSettingsInfo> On = new("Game DVR capture is enabled", (g, _) => g.GameDvrBackgroundRecording == true);

    public override RuleDescriptor Descriptor { get; } = Describe(
        "gaming.disable-background-capture", "Disable Game Bar background capture",
        "Turns off Xbox Game Bar capture/background recording, which uses the GPU video encoder and disk while playing. You lose the 'record what happened' feature.",
        OptimizationCategory.Gaming, ImpactLevel.Low, RiskLevel.Low, requiresAdmin: false, On.Leaves());

    public override IEnumerable<RuleCandidate> Evaluate(RuleContext context)
    {
        var r = On.Evaluate(context.Snapshot.Gaming, context);
        if (!r.Passed)
        {
            yield return Candidate(null, "Disable background capture", "Game DVR", RecommendationStatus.AlreadyApplied, Confidence.Confirmed, ["✓ Capture already disabled or not configured"], []);
            yield break;
        }
        yield return Candidate(null, "Disable background capture", "Game DVR", RecommendationStatus.Optional, Confidence.Possible,
            r.Trace.Append("Only matters if background recording is actually active; otherwise the effect is negligible."),
            [
                Reg.DWord(@"HKCU\Software\Microsoft\Windows\CurrentVersion\GameDVR", "AppCaptureEnabled", 0, "Disable Game Bar app capture"),
                Reg.DWord(@"HKCU\System\GameConfigStore", "GameDVR_Enabled", 0, "Disable Game DVR"),
            ]);
    }
}

public sealed class HardwareGpuSchedulingRule : OptimizationRule
{
    private static readonly Condition<GamingSettingsInfo> Off = new("HAGS supported but disabled", (g, _) => g.HardwareGpuScheduling == false);

    public override RuleDescriptor Descriptor { get; } = Describe(
        "gaming.hardware-gpu-scheduling", "Enable hardware-accelerated GPU scheduling",
        "Lets the GPU manage its own video memory scheduling. Can reduce latency on some systems and cause issues on others; requires a restart.",
        OptimizationCategory.Gaming, ImpactLevel.Low, RiskLevel.Medium, requiresAdmin: true, Off.Leaves(), requiresReboot: true);

    public override IEnumerable<RuleCandidate> Evaluate(RuleContext context)
    {
        var g = context.Snapshot.Gaming;
        if (g.HardwareGpuScheduling is null)
        {
            yield return Candidate(null, "Hardware-accelerated GPU scheduling", "HAGS", RecommendationStatus.NotApplicable, Confidence.Unknown,
                ["✗ The GPU driver does not report HAGS support"], []);
            yield break;
        }
        if (g.HardwareGpuScheduling == true)
        {
            yield return Candidate(null, "Hardware-accelerated GPU scheduling", "HAGS", RecommendationStatus.AlreadyApplied, Confidence.Confirmed, ["✓ Already enabled"], []);
            yield break;
        }
        yield return Candidate(null, "Hardware-accelerated GPU scheduling", "HAGS", RecommendationStatus.Optional, Confidence.Possible,
            Off.Evaluate(g, context).Trace.Append("Results differ between GPUs, drivers and games — benchmark before keeping it."),
            [Reg.DWord(@"HKLM\SYSTEM\CurrentControlSet\Control\GraphicsDrivers", "HwSchMode", 2, "Enable HAGS")]);
    }
}
