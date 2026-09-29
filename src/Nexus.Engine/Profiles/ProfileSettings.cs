using Nexus.Contracts;
using Nexus.Engine.Core;
using Nexus.Engine.Rules.BuiltIn;
using Nexus.Platform.Abstractions;
using Nexus.Platform.Changes;

namespace Nexus.Engine.Profiles;

/// <summary>
/// Translates profile settings into change operations. Every setting reuses the same primitives
/// (and therefore the same backup and rollback) as the optimization rules.
/// </summary>
public sealed class ProfileSettings(IPowerManager power)
{
    private static readonly string[] Bool = ["true", "false"];

    public IReadOnlyList<ProfileSettingDescriptor> Describe() =>
    [
        new("powerPlan", "Windows power plan", ["balanced", "high-performance", "power-saver", "ultimate"]),
        new("gameMode", "Windows Game Mode", Bool),
        new("backgroundRecording", "Xbox Game Bar capture / background recording", Bool),
        new("consumerSuggestions", "Suggested apps and Start menu promotions", Bool),
        new("hardwareGpuScheduling", "Hardware-accelerated GPU scheduling (admin, restart)", Bool),
    ];

    public void Validate(string key, string value)
    {
        var d = Describe().FirstOrDefault(x => x.Key.Equals(key, StringComparison.OrdinalIgnoreCase))
                ?? throw new ArgumentException($"Unknown profile setting '{key}'.");
        if (!d.AllowedValues.Contains(value, StringComparer.OrdinalIgnoreCase))
            throw new ArgumentException($"Invalid value '{value}' for '{key}'. Allowed: {string.Join(", ", d.AllowedValues)}.");
    }

    public IReadOnlyList<ChangeOperation> Operations(string key, string value)
    {
        Validate(key, value);
        var on = value.Equals("true", StringComparison.OrdinalIgnoreCase);
        switch (key.ToLowerInvariant())
        {
            case "powerplan":
            {
                var id = WellKnownPowerSchemes.FromName(value)!.Value;
                if (power.GetSchemes().All(s => s.Id != id))
                    throw new InvalidOperationException($"Power plan '{value}' is not available on this system.");
                return [new ChangeOperation(ChangeKinds.PowerScheme, "active", StateValue.Of(id.ToString("D")), $"Activate power plan '{value}'")];
            }
            case "gamemode":
                return [Reg.DWord(EnableGameModeRule.Key, "AutoGameModeEnabled", on ? 1u : 0u, $"{(on ? "Enable" : "Disable")} Game Mode")];
            case "backgroundrecording":
                return
                [
                    Reg.DWord(@"HKCU\Software\Microsoft\Windows\CurrentVersion\GameDVR", "AppCaptureEnabled", on ? 1u : 0u, $"{(on ? "Enable" : "Disable")} Game Bar capture"),
                    Reg.DWord(@"HKCU\System\GameConfigStore", "GameDVR_Enabled", on ? 1u : 0u, $"{(on ? "Enable" : "Disable")} Game DVR"),
                ];
            case "consumersuggestions":
                const string cdm = @"HKCU\Software\Microsoft\Windows\CurrentVersion\ContentDeliveryManager";
                return new[] { "SilentInstalledAppsEnabled", "SubscribedContent-338388Enabled", "SystemPaneSuggestionsEnabled" }
                    .Select(v => Reg.DWord(cdm, v, on ? 1u : 0u, $"{(on ? "Enable" : "Disable")} {v}")).ToList();
            case "hardwaregpuscheduling":
                return [Reg.DWord(@"HKLM\SYSTEM\CurrentControlSet\Control\GraphicsDrivers", "HwSchMode", on ? 2u : 1u, $"{(on ? "Enable" : "Disable")} HAGS")];
            default:
                throw new ArgumentException($"Unknown profile setting '{key}'.");
        }
    }
}
