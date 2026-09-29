using Nexus.Contracts;
using Nexus.Data.Logging;
using Nexus.Data.Repositories;

namespace Nexus.Engine.Rules;

/// <summary>
/// Holds every optimization rule and evaluates them in isolation: a rule that throws is logged and skipped,
/// it never breaks the evaluation of other rules.
/// </summary>
public sealed class OptimizationRuleEngine(INexusLogger log, RuleRepository? repository = null)
{
    private readonly Dictionary<string, IOptimizationRule> _rules = new(StringComparer.Ordinal);

    public void Register(IOptimizationRule rule)
    {
        if (_rules.ContainsKey(rule.Descriptor.Id))
            throw new InvalidOperationException($"Duplicate rule id '{rule.Descriptor.Id}'.");
        _rules[rule.Descriptor.Id] = rule;
        repository?.Upsert(rule.Descriptor);
    }

    public IReadOnlyCollection<IOptimizationRule> Rules => _rules.Values;
    public IOptimizationRule? Get(string ruleId) => _rules.GetValueOrDefault(ruleId);
    public IReadOnlyList<RuleDescriptor> Describe() => _rules.Values.Select(r => r.Descriptor).OrderBy(d => d.Category).ThenBy(d => d.Id).ToList();

    public IReadOnlyList<RuleCandidate> Evaluate(RuleContext context, Func<RuleDescriptor, bool>? filter = null)
    {
        var disabled = repository?.GetDisabled() ?? new HashSet<string>();
        var result = new List<RuleCandidate>();
        foreach (var rule in _rules.Values)
        {
            if (disabled.Contains(rule.Descriptor.Id)) continue;
            if (filter is not null && !filter(rule.Descriptor)) continue;
            try
            {
                result.AddRange(rule.Evaluate(context));
            }
            catch (Exception ex)
            {
                log.Error("RuleEngine", $"Rule {rule.Descriptor.Id} failed during evaluation and was skipped", ex);
            }
        }
        return result;
    }

    public static OptimizationRecommendation ToRecommendation(RuleCandidate c, RuleDescriptor d, bool requiresAdmin) =>
        new(c.OptimizationId, c.RuleId, c.Name, d.Description, d.Category, c.Target, d.Impact, d.Risk, c.ExpectedBenefit,
            d.Reversible, requiresAdmin, c.RequiresReboot || d.RequiresReboot, c.Status, c.Justification);
}
