using Nexus.Contracts;
using Nexus.Data.Configuration;
using Nexus.Engine.Core;
using Nexus.Engine.Diagnostics;
using Nexus.Engine.Rules;

namespace Nexus.Engine.Optimization.Modules;

public sealed record ModuleScanSummary(string ModuleId, OptimizationCategory Category, IReadOnlyDictionary<string, string> Facts);

/// <summary>
/// Common contract of every optimization area. A module groups the rules of its category and contributes
/// area-specific diagnostics. Apply/Rollback always go through the shared pipeline — a module cannot bypass it.
/// </summary>
public interface IOptimizationModule : IDiagnosticContributor
{
    string Id { get; }
    string Name { get; }
    OptimizationCategory Category { get; }
    IReadOnlyList<IOptimizationRule> BuiltInRules { get; }

    ModuleScanSummary Scan(SystemSnapshot snapshot);
    IReadOnlyList<RuleCandidate> GetRecommendations(RuleContext context, OptimizationRuleEngine rules);
    OptimizationPreview Preview(RuleCandidate candidate, OptimizationRuleEngine rules, OptimizationPipeline pipeline);
    Task<ExecutionResult> ApplyAsync(IReadOnlyList<RuleCandidate> candidates, OptimizationRuleEngine rules, OptimizationPipeline pipeline, ExecutionOptions options, CancellationToken ct);
    RollbackResult Rollback(string transactionId, string itemId, IRollbackExecutor rollback);
    bool Validate(RuleCandidate candidate, OptimizationRuleEngine rules, ISystemReader reader);
}

public abstract class OptimizationModule : IOptimizationModule
{
    public abstract string Id { get; }
    public abstract string Name { get; }
    public abstract OptimizationCategory Category { get; }
    public virtual IReadOnlyList<IOptimizationRule> BuiltInRules => [];

    public virtual ModuleScanSummary Scan(SystemSnapshot snapshot) => new(Id, Category, new Dictionary<string, string>());
    public virtual IEnumerable<DiagnosticFinding> Analyze(SystemSnapshot snapshot, NexusConfiguration configuration) => [];

    public IReadOnlyList<RuleCandidate> GetRecommendations(RuleContext context, OptimizationRuleEngine rules) =>
        rules.Evaluate(context, d => d.Category == Category);

    public OptimizationPreview Preview(RuleCandidate candidate, OptimizationRuleEngine rules, OptimizationPipeline pipeline) =>
        pipeline.Preview(ToAction(candidate, rules));

    public Task<ExecutionResult> ApplyAsync(IReadOnlyList<RuleCandidate> candidates, OptimizationRuleEngine rules, OptimizationPipeline pipeline, ExecutionOptions options, CancellationToken ct) =>
        pipeline.ExecuteAsync(candidates.Select(c => ToAction(c, rules)).ToList(), options, ct);

    public RollbackResult Rollback(string transactionId, string itemId, IRollbackExecutor rollback) =>
        rollback.Rollback(new RollbackRequest(transactionId, itemId));

    public bool Validate(RuleCandidate candidate, OptimizationRuleEngine rules, ISystemReader reader) =>
        rules.Get(candidate.RuleId)?.Validate(candidate, reader) ?? false;

    public static PlannedAction ToAction(RuleCandidate c, OptimizationRuleEngine rules)
    {
        var rule = rules.Get(c.RuleId) ?? throw new InvalidOperationException($"Unknown rule {c.RuleId}");
        return new PlannedAction(c.OptimizationId, c.RuleId, c.Name, c.Operations, rule.Descriptor.Risk,
            c.RequiresReboot || rule.Descriptor.RequiresReboot, rule, c);
    }

    protected static DiagnosticFinding Finding(string id, string title, string area, Severity severity, Confidence confidence,
        string explanation, IEnumerable<Evidence>? evidence = null, params string[] related) =>
        new(id, title, area, severity, confidence, explanation, (evidence ?? []).ToList(), related);
}
