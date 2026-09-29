using Nexus.Contracts;
using Nexus.Data.Configuration;
using Nexus.Engine.Core;

namespace Nexus.Engine.Rules;

/// <summary>Everything a rule may look at. Read-only by construction.</summary>
public sealed record RuleContext(
    SystemSnapshot Snapshot,
    AnalysisReport? Analysis,
    NexusConfiguration Configuration,
    ISystemReader Reader,
    string QuarantineDirectory);

/// <summary>The evaluation of a rule against one target (one startup entry, one service, the power plan...).</summary>
public sealed record RuleCandidate(
    string OptimizationId,
    string RuleId,
    string Name,
    string? Target,
    RecommendationStatus Status,
    Confidence ExpectedBenefit,
    IReadOnlyList<string> Justification,
    IReadOnlyList<ChangeOperation> Operations,
    bool RequiresReboot = false);

public sealed record ConditionResult(bool Passed, IReadOnlyList<string> Trace);

/// <summary>
/// A named, composable predicate. Conditions are data the UI can display ("StartupImpact >= High AND ApplicationNotCritical")
/// and their evaluation trace is returned as the justification of each recommendation.
/// </summary>
public sealed class Condition<T>
{
    private readonly Func<T, RuleContext, bool>? _predicate;
    private readonly Condition<T>[] _children = [];
    private readonly string _op = "";

    public string Description { get; }

    public Condition(string description, Func<T, RuleContext, bool> predicate)
    {
        Description = description;
        _predicate = predicate;
    }

    private Condition(string op, Condition<T>[] children, string description)
    {
        _op = op;
        _children = children;
        Description = description;
    }

    public Condition<T> And(Condition<T> other) => new("AND", [this, other], $"{Description} AND {other.Description}");
    public Condition<T> Or(Condition<T> other) => new("OR", [this, other], $"({Description} OR {other.Description})");

    public ConditionResult Evaluate(T subject, RuleContext ctx)
    {
        if (_predicate is not null)
        {
            bool ok;
            try { ok = _predicate(subject, ctx); }
            catch { ok = false; }
            return new ConditionResult(ok, [$"{(ok ? "✓" : "✗")} {Description}"]);
        }
        var results = _children.Select(c => c.Evaluate(subject, ctx)).ToList();
        var passed = _op == "AND" ? results.All(r => r.Passed) : results.Any(r => r.Passed);
        return new ConditionResult(passed, results.SelectMany(r => r.Trace).ToList());
    }

    public IEnumerable<string> Leaves() =>
        _predicate is not null ? [Description] : _children.SelectMany(c => c.Leaves());
}

/// <summary>
/// An isolated optimization rule. New optimizations are added by registering new rules (in code or as JSON
/// in config/rules) — the engine core does not change.
/// </summary>
public interface IOptimizationRule
{
    RuleDescriptor Descriptor { get; }

    /// <summary>Detect + Analyze + Recommend: evaluate conditions for every relevant target. Must not modify anything.</summary>
    IEnumerable<RuleCandidate> Evaluate(RuleContext context);

    /// <summary>Apply is only ever invoked by the pipeline, with a transaction-scoped executor that backs up and records every change.</summary>
    void Apply(RuleCandidate candidate, IChangeExecutor executor);

    /// <summary>Post-apply validation (the pipeline has already verified each individual change).</summary>
    bool Validate(RuleCandidate candidate, ISystemReader reader);

    /// <summary>Reverts the changes this rule made in a transaction item (delegates to the RollbackEngine).</summary>
    RollbackResult Rollback(string transactionId, string itemId, IRollbackExecutor rollback);
}

/// <summary>Transaction-scoped: every call captures a backup, applies, verifies and records the change.</summary>
public interface IChangeExecutor
{
    void Apply(ChangeOperation operation);
}

public interface IRollbackExecutor
{
    RollbackResult Rollback(RollbackRequest request);
}

/// <summary>Base class: rules normally only need to describe conditions and produce operations.</summary>
public abstract class OptimizationRule : IOptimizationRule
{
    public abstract RuleDescriptor Descriptor { get; }
    public abstract IEnumerable<RuleCandidate> Evaluate(RuleContext context);

    public virtual void Apply(RuleCandidate candidate, IChangeExecutor executor)
    {
        foreach (var op in candidate.Operations) executor.Apply(op);
    }

    public virtual bool Validate(RuleCandidate candidate, ISystemReader reader) =>
        candidate.Operations.All(op => reader.IsInState(op.Kind, op.Target, op.Desired));

    public virtual RollbackResult Rollback(string transactionId, string itemId, IRollbackExecutor rollback) =>
        rollback.Rollback(new RollbackRequest(transactionId, itemId));

    protected RuleCandidate Candidate(string? targetKey, string name, string? target, RecommendationStatus status, Confidence benefit,
        IEnumerable<string> justification, IReadOnlyList<ChangeOperation> ops) =>
        new(targetKey is null ? Descriptor.Id : $"{Descriptor.Id}:{targetKey}", Descriptor.Id, name, target, status, benefit,
            justification.ToList(), ops, Descriptor.RequiresReboot);

    protected static RuleDescriptor Describe(string id, string name, string description, OptimizationCategory category,
        ImpactLevel impact, RiskLevel risk, bool requiresAdmin, IEnumerable<string> conditions, bool reversible = true,
        bool backupRequired = true, bool requiresReboot = false) =>
        new(id, name, description, category, impact, risk, requiresAdmin, reversible, backupRequired, requiresReboot, conditions.ToList(), "built-in");
}
