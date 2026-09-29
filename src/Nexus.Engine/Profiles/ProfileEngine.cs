using Nexus.Contracts;
using Nexus.Data.Repositories;
using Nexus.Engine.Core;
using Nexus.Engine.Optimization;
using Nexus.Security.Backup;

namespace Nexus.Engine.Profiles;

/// <summary>
/// Profiles are plain collections of settings. Applying one builds a normal transaction, so it is previewed,
/// backed up, verified and can be rolled back exactly like any other optimization.
/// </summary>
public sealed class ProfileEngine(ProfileRepository repository, SettingsRepository settingsRepo, ProfileSettings settings,
    OptimizationPipeline pipeline, EngineEventBus events)
{
    public const string ActiveProfileKey = "profile.active";
    public const string ActiveProfileTxKey = "profile.active.tx";

    public static IReadOnlyList<ProfileDefinition> BuiltIns { get; } =
    [
        new("Balanced", ProfileKind.Balanced, "Windows defaults: balanced power plan, Game Mode on.",
            new Dictionary<string, string> { ["powerPlan"] = "balanced", ["gameMode"] = "true" }, true),
        new("Gaming", ProfileKind.Gaming, "High performance plan, Game Mode on, background capture off.",
            new Dictionary<string, string> { ["powerPlan"] = "high-performance", ["gameMode"] = "true", ["backgroundRecording"] = "false" }, true),
        new("Performance", ProfileKind.Performance, "High performance plan and no promoted content.",
            new Dictionary<string, string> { ["powerPlan"] = "high-performance", ["consumerSuggestions"] = "false" }, true),
        new("Battery", ProfileKind.Battery, "Power saver plan and background capture off to extend battery life.",
            new Dictionary<string, string> { ["powerPlan"] = "power-saver", ["backgroundRecording"] = "false" }, true),
    ];

    public void EnsureBuiltIns()
    {
        foreach (var p in BuiltIns)
            if (repository.Get(p.Name) is null) repository.Save(p);
    }

    public IReadOnlyList<ProfileDefinition> List() => repository.List();
    public ProfileDefinition? Get(string name) => repository.Get(name);
    public string? ActiveProfile => settingsRepo.Get(ActiveProfileKey);
    public IReadOnlyList<ProfileSettingDescriptor> DescribeSettings() => settings.Describe();

    public ProfileDefinition CreateProfile(ProfileDefinition profile, BackupManager? backups = null)
    {
        if (string.IsNullOrWhiteSpace(profile.Name) || profile.Name.Length > 64) throw new ArgumentException("Profile name must be 1–64 characters.");
        if (BuiltIns.Any(b => b.Name.Equals(profile.Name, StringComparison.OrdinalIgnoreCase)))
            throw new ArgumentException($"'{profile.Name}' is a built-in profile and cannot be overwritten.");
        foreach (var (k, v) in profile.Settings) settings.Validate(k, v);
        var existing = repository.Get(profile.Name);
        if (existing is not null) backups?.CaptureProfile($"PROFILE-{profile.Name}", existing);
        var saved = profile with { Kind = ProfileKind.Custom, BuiltIn = false };
        repository.Save(saved);
        return saved;
    }

    public IReadOnlyList<PlannedAction> Plan(ProfileDefinition profile) =>
        profile.Settings.Select(kv => new PlannedAction($"profile:{profile.Name}:{kv.Key}", "profile.setting",
            $"{profile.Name}: {kv.Key} = {kv.Value}", settings.Operations(kv.Key, kv.Value),
            RequiresReboot: kv.Key.Equals("hardwareGpuScheduling", StringComparison.OrdinalIgnoreCase))).ToList();

    public async Task<ExecutionResult> ApplyAsync(string name, bool dryRun, string? transactionId = null, CancellationToken ct = default)
    {
        var profile = repository.Get(name) ?? throw new KeyNotFoundException($"Profile '{name}' not found.");
        var result = await pipeline.ExecuteAsync(Plan(profile), new ExecutionOptions(dryRun, TransactionId: transactionId, Description: $"Profile {profile.Name}"), ct)
            .ConfigureAwait(false);
        if (!dryRun && result.Status == TransactionStatus.Committed)
        {
            settingsRepo.Set(ActiveProfileKey, profile.Name);
            settingsRepo.Set(ActiveProfileTxKey, result.TransactionId);
            events.Publish(EngineEventType.ProfileApplied, $"Profile '{profile.Name}' applied", result.TransactionId, 1, new { profile = profile.Name, result.TransactionId });
        }
        return result;
    }
}
