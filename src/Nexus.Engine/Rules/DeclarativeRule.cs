using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;
using Nexus.Contracts;
using Nexus.Contracts.Api;
using Nexus.Data.Logging;
using Nexus.Platform.Abstractions;
using Nexus.Platform.Changes;

namespace Nexus.Engine.Rules;

public sealed record DeclarativeCondition(string Fact, string Operator, string? Value = null);

public sealed record DeclarativeChange(string Kind, string Target, string? Value, string? ValueKind = null, bool Delete = false, string? Description = null);

/// <summary>JSON rule definition (config/rules/*.json). Lets new optimizations be added without recompiling the engine.</summary>
public sealed record DeclarativeRuleDefinition
{
    public required string Id { get; init; }
    public required string Name { get; init; }
    public required string Description { get; init; }
    public OptimizationCategory Category { get; init; }
    public ImpactLevel Impact { get; init; } = ImpactLevel.Low;
    public RiskLevel Risk { get; init; } = RiskLevel.Low;
    public bool RequiresReboot { get; init; }
    public Confidence BenefitConfidence { get; init; } = Confidence.Possible;
    public RecommendationStatus Recommendation { get; init; } = RecommendationStatus.Optional;
    public List<DeclarativeCondition> Conditions { get; init; } = [];
    public required List<DeclarativeChange> Changes { get; init; }
    public List<string> Notes { get; init; } = [];
}

/// <summary>
/// Supported facts: "registry:&lt;key&gt;|&lt;value&gt;" and "snapshot:&lt;name&gt;" (power.onAcPower, power.hasBattery,
/// os.build, memory.totalGb, cpu.logicalProcessors, gaming.gameModeEnabled, system.isSimulated).
/// Operators: equals, notEquals, exists, notExists, greaterThan, lessThan, greaterOrEqual, lessOrEqual, contains.
/// Only registry.value, service.startMode and power.activeScheme changes are allowed in declarative rules.
/// </summary>
public sealed class DeclarativeRule : OptimizationRule
{
    private static readonly HashSet<string> AllowedKinds = [ChangeKinds.RegistryValue, ChangeKinds.ServiceStartMode, ChangeKinds.PowerScheme];
    private readonly DeclarativeRuleDefinition _def;
    private readonly List<ChangeOperation> _ops;

    public DeclarativeRule(DeclarativeRuleDefinition def, ChangeHandlerRegistry handlers, string source)
    {
        _def = def;
        foreach (var c in def.Changes)
            if (!AllowedKinds.Contains(c.Kind)) throw new InvalidDataException($"Rule {def.Id}: change kind '{c.Kind}' is not allowed in declarative rules.");
        _ops = def.Changes.Select(c => new ChangeOperation(c.Kind, c.Target,
            c.Delete ? StateValue.Absent : new StateValue(true, c.Value, c.ValueKind ?? (c.Kind == ChangeKinds.RegistryValue ? nameof(RegValueKind.String) : null)),
            c.Description ?? $"{def.Name}: {c.Target}")).ToList();
        var admin = _ops.Any(o => handlers.Get(o.Kind).RequiresAdmin(o.Target));
        Descriptor = new RuleDescriptor(def.Id, def.Name, def.Description, def.Category, def.Impact, def.Risk, admin, true, true,
            def.RequiresReboot, def.Conditions.Select(Describe).ToList(), source);
    }

    public override RuleDescriptor Descriptor { get; }

    private static string Describe(DeclarativeCondition c) => $"{c.Fact} {c.Operator}{(c.Value is null ? "" : " " + c.Value)}";

    public override IEnumerable<RuleCandidate> Evaluate(RuleContext context)
    {
        if (_ops.All(o => context.Reader.IsInState(o.Kind, o.Target, o.Desired)))
        {
            yield return Candidate(null, _def.Name, null, RecommendationStatus.AlreadyApplied, Confidence.Confirmed, ["✓ All settings already have the desired value"], []);
            yield break;
        }
        var trace = new List<string>();
        var passed = true;
        foreach (var c in _def.Conditions)
        {
            var ok = EvaluateCondition(c, context);
            trace.Add($"{(ok ? "✓" : "✗")} {Describe(c)}");
            passed &= ok;
        }
        if (!passed) yield break;
        yield return Candidate(null, _def.Name, null, _def.Recommendation, _def.BenefitConfidence, trace.Concat(_def.Notes), _ops);
    }

    private static string? Fact(string fact, RuleContext ctx)
    {
        if (fact.StartsWith("registry:", StringComparison.OrdinalIgnoreCase))
        {
            var (key, name) = RegistryPaths.ParseTarget(fact["registry:".Length..]);
            return ctx.Reader.ReadRegistry(key, name)?.Text;
        }
        var s = ctx.Snapshot;
        return fact.ToLowerInvariant() switch
        {
            "snapshot:power.onacpower" => s.Power.OnAcPower?.ToString().ToLowerInvariant(),
            "snapshot:power.hasbattery" => s.Power.HasBattery.ToString().ToLowerInvariant(),
            "snapshot:os.build" => s.Os.Build,
            "snapshot:memory.totalgb" => (s.Memory.TotalBytes / 1024d / 1024 / 1024).ToString("F1", CultureInfo.InvariantCulture),
            "snapshot:cpu.logicalprocessors" => s.Cpu.LogicalProcessors.ToString(CultureInfo.InvariantCulture),
            "snapshot:gaming.gamemodeenabled" => s.Gaming.GameModeEnabled?.ToString().ToLowerInvariant(),
            "snapshot:system.issimulated" => s.IsSimulated.ToString().ToLowerInvariant(),
            _ => throw new InvalidDataException($"Unknown fact '{fact}'."),
        };
    }

    internal static bool EvaluateCondition(DeclarativeCondition c, RuleContext ctx)
    {
        var actual = Fact(c.Fact, ctx);
        bool Num(Func<double, double, bool> cmp) =>
            double.TryParse(actual, NumberStyles.Float, CultureInfo.InvariantCulture, out var a) &&
            double.TryParse(c.Value, NumberStyles.Float, CultureInfo.InvariantCulture, out var b) && cmp(a, b);
        return c.Operator.ToLowerInvariant() switch
        {
            "equals" => string.Equals(actual, c.Value, StringComparison.OrdinalIgnoreCase),
            "notequals" => !string.Equals(actual, c.Value, StringComparison.OrdinalIgnoreCase),
            "exists" => actual is not null,
            "notexists" => actual is null,
            "greaterthan" => Num((a, b) => a > b),
            "lessthan" => Num((a, b) => a < b),
            "greaterorequal" => Num((a, b) => a >= b),
            "lessorequal" => Num((a, b) => a <= b),
            "contains" => actual?.Contains(c.Value ?? "", StringComparison.OrdinalIgnoreCase) ?? false,
            _ => throw new InvalidDataException($"Unknown operator '{c.Operator}'."),
        };
    }
}

public static class DeclarativeRuleLoader
{
    private static readonly JsonSerializerOptions Options = new(NexusJson.Options)
    {
        ReadCommentHandling = JsonCommentHandling.Skip,
        AllowTrailingCommas = true,
        UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow,
    };

    public static IReadOnlyList<DeclarativeRule> LoadDirectory(string? directory, ChangeHandlerRegistry handlers, INexusLogger log)
    {
        var rules = new List<DeclarativeRule>();
        if (directory is null || !Directory.Exists(directory)) return rules;
        foreach (var file in Directory.EnumerateFiles(directory, "*.json").OrderBy(f => f, StringComparer.Ordinal))
        {
            try
            {
                var defs = Parse(File.ReadAllText(file));
                rules.AddRange(defs.Select(d => new DeclarativeRule(d, handlers, $"file:{Path.GetFileName(file)}")));
            }
            catch (Exception ex)
            {
                log.Error("RuleLoader", $"Rule file {Path.GetFileName(file)} is invalid and was ignored", ex);
            }
        }
        return rules;
    }

    public static IReadOnlyList<DeclarativeRuleDefinition> Parse(string json)
    {
        json = json.TrimStart();
        return json.StartsWith('[')
            ? JsonSerializer.Deserialize<List<DeclarativeRuleDefinition>>(json, Options) ?? []
            : [JsonSerializer.Deserialize<DeclarativeRuleDefinition>(json, Options)!];
    }
}
