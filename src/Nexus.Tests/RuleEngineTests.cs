using Nexus.Contracts;
using Nexus.Data.Logging;
using Nexus.Engine.Rules;
using Nexus.Platform.Changes;
using Nexus.Platform.Simulation;

namespace Nexus.Tests;

public class RuleEngineTests
{
    [Fact]
    public async Task Every_recommendation_carries_its_condition_trace()
    {
        using var host = new TestHost();
        var recs = await host.Engine.GetRecommendationsAsync();
        var discord = recs.Single(r => r.RuleId == "startup.disable-high-impact" && r.Target == "Discord");
        Assert.Equal(RecommendationStatus.Recommended, discord.Status);
        Assert.Contains(discord.Justification, j => j.Contains("ApplicationNotCritical == TRUE") && j.StartsWith("✓"));
        Assert.True(discord.Reversible);
        Assert.Equal(RiskLevel.Low, discord.Risk);
    }

    [Fact]
    public async Task Critical_startup_entries_are_never_recommended()
    {
        using var host = new TestHost();
        var recs = await host.Engine.GetRecommendationsAsync();
        Assert.DoesNotContain(recs, r => r.Target is "SecurityHealth" or "RtkAudUService");
        var entries = host.Engine.Startup.GetEntries();
        Assert.True(entries.Single(e => e.Name == "SecurityHealth").IsCritical);
    }

    [Fact]
    public void Rules_expose_complete_metadata()
    {
        using var host = new TestHost();
        foreach (var r in host.Engine.GetRules())
        {
            Assert.False(string.IsNullOrWhiteSpace(r.Id));
            Assert.False(string.IsNullOrWhiteSpace(r.Name));
            Assert.False(string.IsNullOrWhiteSpace(r.Description));
            Assert.NotEmpty(r.Conditions);
        }
    }

    [Fact]
    public void A_throwing_rule_is_isolated()
    {
        var engine = new OptimizationRuleEngine(LoggingEngine.Null());
        engine.Register(new ThrowingRule());
        engine.Register(new ConstantRule("ok.rule"));
        var ctx = TestContexts.Empty();
        var result = engine.Evaluate(ctx);
        Assert.Single(result);
        Assert.Equal("ok.rule", result[0].RuleId);
    }

    [Fact]
    public void Duplicate_rule_ids_are_rejected()
    {
        var engine = new OptimizationRuleEngine(LoggingEngine.Null());
        engine.Register(new ConstantRule("dup"));
        Assert.Throws<InvalidOperationException>(() => engine.Register(new ConstantRule("dup")));
    }

    [Fact]
    public async Task Disabled_rules_are_skipped()
    {
        using var host = new TestHost();
        host.Store.Rules.SetEnabled("gaming.enable-game-mode", false);
        var recs = await host.Engine.GetRecommendationsAsync();
        Assert.DoesNotContain(recs, r => r.RuleId == "gaming.enable-game-mode");
    }

    [Fact]
    public void Composite_conditions_report_each_leaf()
    {
        var a = new Condition<int>("x > 1", (x, _) => x > 1);
        var b = new Condition<int>("x < 5", (x, _) => x < 5);
        var r = a.And(b).Evaluate(7, TestContexts.Empty());
        Assert.False(r.Passed);
        Assert.Equal(["✓ x > 1", "✗ x < 5"], r.Trace);
        Assert.True(a.Or(b).Evaluate(7, TestContexts.Empty()).Passed);
    }

    [Fact]
    public async Task Declarative_rules_are_loaded_from_json_without_code_changes()
    {
        var dir = Directory.CreateTempSubdirectory("nexus-rules").FullName;
        File.WriteAllText(Path.Combine(dir, "custom.json"), """
            {
              // comments are allowed
              "id": "custom.menu-delay",
              "name": "Faster menus",
              "description": "Reduces menu show delay.",
              "category": "Windows",
              "recommendation": "Optional",
              "conditions": [ { "fact": "snapshot:power.onAcPower", "operator": "equals", "value": "true" } ],
              "changes": [ { "kind": "registry.value", "target": "HKCU\\Control Panel\\Desktop|MenuShowDelay", "value": "100", "valueKind": "String" } ]
            }
            """);
        using var host = new TestHost(rulesDirectory: dir);
        Assert.Contains(host.Engine.GetRules(), r => r.Id == "custom.menu-delay" && r.Source == "file:custom.json" && !r.RequiresAdmin);
        var recs = await host.Engine.GetRecommendationsAsync();
        Assert.Contains(recs, r => r.OptimizationId == "custom.menu-delay" && r.Status == RecommendationStatus.Optional);

        var result = await host.Engine.ExecuteOptimizationAsync(new ExecuteOptimizationRequest(["custom.menu-delay"]));
        Assert.Equal(TransactionStatus.Committed, result.Status);
        Assert.Equal("100", host.Platform.Reg.GetValue(@"HKCU\Control Panel\Desktop", "MenuShowDelay")!.Text);

        var after = await host.Engine.GetRecommendationsAsync();
        Assert.Contains(after, r => r.OptimizationId == "custom.menu-delay" && r.Status == RecommendationStatus.AlreadyApplied);
    }

    [Fact]
    public void Declarative_rules_cannot_use_dangerous_change_kinds()
    {
        var def = DeclarativeRuleLoader.Parse("""
            { "id": "evil", "name": "x", "description": "x", "category": "Process",
              "changes": [ { "kind": "process.terminate", "target": "4:0", "value": null } ] }
            """)[0];
        var handlers = ChangeHandlerRegistry.CreateDefault(SimulatedPlatform.CreateEmpty());
        Assert.Throws<InvalidDataException>(() => new DeclarativeRule(def, handlers, "test"));
    }

    [Fact]
    public void Invalid_rule_files_are_ignored_not_fatal()
    {
        var dir = Directory.CreateTempSubdirectory("nexus-rules").FullName;
        File.WriteAllText(Path.Combine(dir, "broken.json"), "{ not json");
        var rules = DeclarativeRuleLoader.LoadDirectory(dir, ChangeHandlerRegistry.CreateDefault(SimulatedPlatform.CreateEmpty()), LoggingEngine.Null());
        Assert.Empty(rules);
    }

    [Fact]
    public async Task Power_plan_is_recommended_only_when_cpu_is_the_measured_limit()
    {
        var idle = SimulatedPlatform.CreateSampleMachine();
        using (var host = new TestHost(idle))
        {
            var r = (await host.Engine.GetRecommendationsAsync()).Single(x => x.RuleId == "power.high-performance-plan");
            Assert.Equal(RecommendationStatus.Optional, r.Status);
        }

        var busy = SimulatedPlatform.CreateSampleMachine();
        busy.Sens.CpuLoad = 95; busy.Sens.GpuLoad = 40; busy.Sens.Noise = 0;
        using (var host = new TestHost(busy))
        {
            var r = (await host.Engine.GetRecommendationsAsync()).Single(x => x.RuleId == "power.high-performance-plan");
            Assert.Equal(RecommendationStatus.Recommended, r.Status);
            Assert.Equal(Confidence.Likely, r.ExpectedBenefitConfidence);
        }

        var battery = SimulatedPlatform.CreateSampleMachine();
        battery.Pwr.Source = new Platform.Abstractions.PowerSourceStatus(false, true, 50);
        using (var host = new TestHost(battery))
        {
            var r = (await host.Engine.GetRecommendationsAsync()).Single(x => x.RuleId == "power.high-performance-plan");
            Assert.Equal(RecommendationStatus.NotApplicable, r.Status);
        }
    }

    private sealed class ThrowingRule : OptimizationRule
    {
        public override RuleDescriptor Descriptor { get; } = Describe("throws", "t", "t", OptimizationCategory.Windows, ImpactLevel.Low, RiskLevel.Low, false, ["always"]);
        public override IEnumerable<RuleCandidate> Evaluate(RuleContext context) => throw new InvalidOperationException("boom");
    }

    internal sealed class ConstantRule(string id) : OptimizationRule
    {
        public override RuleDescriptor Descriptor { get; } = Describe(id, id, id, OptimizationCategory.Windows, ImpactLevel.Low, RiskLevel.Low, false, ["always"]);
        public override IEnumerable<RuleCandidate> Evaluate(RuleContext context) =>
            [Candidate(null, id, null, RecommendationStatus.Optional, Confidence.Possible, ["✓ always"], [])];
    }
}

internal static class TestContexts
{
    public static RuleContext Empty()
    {
        var p = SimulatedPlatform.CreateEmpty();
        var snap = new SystemSnapshot("S", DateTimeOffset.UtcNow, true, false, new OsInfo("W", "10", "1", "x64", false, null), new CpuInfo("c", "v", 8, 16, 4000), [],
            new MemoryInfo(16, 8, null, null), [], [], [], new PowerPlanInfo(Guid.Empty, "b", [], true, false), new GamingSettingsInfo(null, null, null, null), [], [], [], [], []);
        return new RuleContext(snap, null, new Data.Configuration.NexusConfiguration(), new NullReader(), "/tmp/q");
    }

    private sealed class NullReader : Engine.Core.ISystemReader
    {
        public StateValue Read(string kind, string target) => StateValue.Absent;
        public Platform.Abstractions.RegValue? ReadRegistry(string keyPath, string name) => null;
        public IEnumerable<Platform.Abstractions.FileFacts> EnumerateFiles(string directory, string pattern, bool recursive) => [];
        public string? KnownFolder(Platform.Abstractions.KnownFolder folder) => null;
        public bool FileExists(string path) => false;
        public bool IsInState(string kind, string target, StateValue expected) => false;
    }
}
