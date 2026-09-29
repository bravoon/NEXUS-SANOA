namespace Nexus.Contracts;

public sealed record RuleDescriptor(
    string Id,
    string Name,
    string Description,
    OptimizationCategory Category,
    ImpactLevel Impact,
    RiskLevel Risk,
    bool RequiresAdmin,
    bool Reversible,
    bool BackupRequired,
    bool RequiresReboot,
    IReadOnlyList<string> Conditions,
    string Source);

/// <summary>
/// A concrete optimization the engine proposes. Structured data only — the client decides how to present it.
/// </summary>
public sealed record OptimizationRecommendation(
    string OptimizationId,
    string RuleId,
    string Name,
    string Description,
    OptimizationCategory Category,
    string? Target,
    ImpactLevel Impact,
    RiskLevel Risk,
    Confidence ExpectedBenefitConfidence,
    bool Reversible,
    bool RequiresAdmin,
    bool RequiresReboot,
    RecommendationStatus Status,
    IReadOnlyList<string> Justification);

/// <summary>A single system mutation, expressed as data so that it can be previewed, backed up and reverted.</summary>
public sealed record StateValue(bool Exists, string? Value, string? ValueKind = null)
{
    public static readonly StateValue Absent = new(false, null);
    public static StateValue Of(string value, string? kind = null) => new(true, value, kind);
    public override string ToString() => Exists ? $"{Value}{(ValueKind is null ? "" : $" ({ValueKind})")}" : "<absent>";
}

public sealed record PlannedChange(string Kind, string Target, string Description, StateValue Before, StateValue After, bool RequiresAdmin);

public sealed record OptimizationPreview(
    string OptimizationId,
    string Name,
    IReadOnlyList<PlannedChange> Changes,
    bool RequiresAdmin,
    bool RequiresReboot,
    bool Reversible,
    bool CanProceed,
    IReadOnlyList<string> BlockingReasons,
    IReadOnlyList<string> Warnings);

public sealed record ExecuteOptimizationRequest(
    IReadOnlyList<string> OptimizationIds,
    bool DryRun = false,
    bool CreateRestorePoint = false,
    string? TransactionId = null,
    string? Description = null,
    bool AllowElevation = true);

public sealed record ChangeRecord(
    string Kind,
    string Target,
    string Description,
    StateValue Before,
    StateValue After,
    string? BackupId,
    bool Applied,
    bool Verified);

public sealed record TransactionItem(
    string ItemId,
    string OptimizationId,
    string RuleId,
    string Name,
    TransactionItemStatus Status,
    IReadOnlyList<ChangeRecord> Changes,
    string? Error);

public sealed record OptimizationTransaction(
    string TransactionId,
    DateTimeOffset CreatedAt,
    DateTimeOffset? CompletedAt,
    string Description,
    TransactionStatus Status,
    IReadOnlyList<TransactionItem> Items,
    string? RestorePointId,
    IReadOnlyList<string> Messages);

public sealed record ExecutionResult(
    string TransactionId,
    TransactionStatus Status,
    OptimizationTransaction? Transaction,
    IReadOnlyList<string> Messages,
    bool RequiresElevation,
    bool RequiresReboot);

public sealed record RollbackRequest(string TransactionId, string? ItemId = null, bool Force = false);

public sealed record RollbackResult(
    string TransactionId,
    TransactionStatus Status,
    IReadOnlyList<ChangeRecord> Restored,
    IReadOnlyList<string> Messages,
    bool RequiresElevation);
public sealed record ProcessActionResult(bool Success, string Message, string? TransactionId);
