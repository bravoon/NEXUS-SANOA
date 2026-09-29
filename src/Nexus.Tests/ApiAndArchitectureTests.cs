using System.Text.RegularExpressions;
using System.Xml.Linq;
using Nexus.Application.Hosting;
using Nexus.Application.Services;
using Nexus.Contracts;
using Nexus.Contracts.Api;
using Nexus.Data.Logging;
using Nexus.Ipc;

namespace Nexus.Tests;

public class InternalApiTests
{
    [Fact]
    public async Task Ui_style_client_talks_to_the_engine_only_through_the_pipe()
    {
        using var host = new TestHost();
        var app = new NexusApplication(host.Engine);
        var pipe = "nexus-test-" + Guid.NewGuid().ToString("N")[..8];
        await using var server = new NexusPipeServer(pipe, new ApiDispatcher(app));
        using var sub = host.Engine.Events.Subscribe(server.Broadcast);
        server.Start();

        await using var client = new NexusApiClient(pipe);
        await client.ConnectAsync(TimeSpan.FromSeconds(5));
        var events = new List<EngineEvent>();
        client.EventReceived += e => { lock (events) events.Add(e); };
        await client.SubscribeEventsAsync();

        var status = await client.SendAsync<SystemStatus>(ApiRoutes.SystemStatus);
        Assert.True(status!.IsSimulated);

        var recs = await client.SendAsync<List<OptimizationRecommendation>>(ApiRoutes.OptimizationRecommendations);
        Assert.Contains(recs!, r => r.OptimizationId == "gaming.enable-game-mode");

        var preview = await client.SendAsync<OptimizationPreview>(ApiRoutes.OptimizationPreview, new IdRequest("gaming.enable-game-mode"));
        Assert.True(preview!.CanProceed);

        var result = await client.SendAsync<ExecutionResult>(ApiRoutes.OptimizationApply, new ExecuteOptimizationRequest(["gaming.enable-game-mode"]));
        Assert.Equal(TransactionStatus.Committed, result!.Status);

        var history = await client.SendAsync<List<OptimizationTransaction>>(ApiRoutes.RestoreHistory);
        Assert.Single(history!);

        var rb = await client.SendAsync<RollbackResult>(ApiRoutes.RestoreRollback, new RollbackRequest(result.TransactionId));
        Assert.Equal(TransactionStatus.RolledBack, rb!.Status);

        await Task.Delay(300);
        lock (events)
        {
            Assert.Contains(events, e => e.Type == EngineEventType.OptimizationStarted);
            Assert.Contains(events, e => e.Type == EngineEventType.OptimizationCompleted);
            Assert.Contains(events, e => e.Type == EngineEventType.RollbackCompleted);
        }
    }

    [Fact]
    public async Task Unknown_routes_and_bad_payloads_are_rejected_with_structured_errors()
    {
        using var host = new TestHost();
        var pipe = "nexus-test-" + Guid.NewGuid().ToString("N")[..8];
        await using var server = new NexusPipeServer(pipe, new ApiDispatcher(new NexusApplication(host.Engine)));
        server.Start();
        await using var client = new NexusApiClient(pipe);
        await client.ConnectAsync(TimeSpan.FromSeconds(5));

        var unknown = await Assert.ThrowsAsync<NexusApiException>(() => client.SendAsync("/registry/write", new { key = "HKLM" }));
        Assert.Equal(ErrorCodes.UnknownRoute, unknown.Code);

        var invalid = await Assert.ThrowsAsync<NexusApiException>(() => client.SendAsync(ApiRoutes.OptimizationPreview));
        Assert.Equal(ErrorCodes.InvalidRequest, invalid.Code);

        var refused = await client.SendAsync<ProcessActionResult>(ApiRoutes.ProcessTerminate, new TerminateProcessRequest(790, true));
        Assert.False(refused!.Success);
    }

    [Fact]
    public void Every_documented_route_is_handled()
    {
        var expected = new[]
        {
            "/system/scan", "/system/status", "/optimization/recommendations", "/optimization/preview", "/optimization/apply",
            "/optimization/rollback", "/processes", "/startup", "/gaming/profiles", "/gaming/apply", "/benchmark/start",
            "/benchmark/stop", "/benchmark/results", "/restore/history", "/restore/rollback",
        };
        Assert.All(expected, r => Assert.Contains(r, ApiRoutes.All));
    }
}

/// <summary>Fitness functions that keep the architecture honest: UI ≠ ENGINE.</summary>
public class ArchitectureTests
{
    private static string SrcDir()
    {
        for (var d = new DirectoryInfo(AppContext.BaseDirectory); d is not null; d = d.Parent)
            if (Directory.Exists(Path.Combine(d.FullName, "src", "Nexus.Engine"))) return Path.Combine(d.FullName, "src");
        throw new DirectoryNotFoundException("src");
    }

    private static IReadOnlyList<string> ProjectReferences(string project) =>
        XDocument.Load(Path.Combine(SrcDir(), project, project + ".csproj"))
            .Descendants("ProjectReference").Select(e => Path.GetFileNameWithoutExtension(e.Attribute("Include")!.Value.Replace('\\', '/'))).ToList();

    [Fact]
    public void Ui_depends_only_on_contracts_and_the_api_client()
    {
        Assert.Equal(["Nexus.Contracts", "Nexus.Ipc"], ProjectReferences("Nexus.UI").Order().ToList());
    }

    [Fact]
    public void Ui_source_contains_no_system_manipulation()
    {
        var forbidden = new Regex(@"Microsoft\.Win32|System\.Management|ServiceController|Registry\.|PerformanceCounter|DllImport|LibraryImport|powershell|Process\.GetProcesses|\.Kill\(|Nexus\.Engine|Nexus\.Platform|Nexus\.Security|Nexus\.Data",
            RegexOptions.IgnoreCase);
        var files = Directory.EnumerateFiles(Path.Combine(SrcDir(), "Nexus.UI"), "*.*", SearchOption.AllDirectories)
            .Where(f => (f.EndsWith(".cs") || f.EndsWith(".xaml")) && !f.Contains($"{Path.DirectorySeparatorChar}obj{Path.DirectorySeparatorChar}") && !f.Contains($"{Path.DirectorySeparatorChar}bin{Path.DirectorySeparatorChar}"))
            .ToList();
        Assert.NotEmpty(files);
        foreach (var f in files)
        {
            var m = forbidden.Match(File.ReadAllText(f));
            Assert.False(m.Success, $"{Path.GetFileName(f)} contains forbidden API '{m.Value}'");
        }
    }

    [Fact]
    public void Layers_only_reference_downwards()
    {
        Assert.Empty(ProjectReferences("Nexus.Contracts"));
        Assert.Equal(["Nexus.Contracts"], ProjectReferences("Nexus.Platform"));
        Assert.Equal(["Nexus.Contracts"], ProjectReferences("Nexus.Data"));
        Assert.Equal(["Nexus.Contracts"], ProjectReferences("Nexus.Ipc"));
        Assert.DoesNotContain("Nexus.Engine", ProjectReferences("Nexus.Security"));
        Assert.DoesNotContain("Nexus.Application", ProjectReferences("Nexus.Engine"));
        Assert.DoesNotContain("Nexus.Ipc", ProjectReferences("Nexus.Engine"));
        Assert.Equal(["Nexus.Application"], ProjectReferences("Nexus.CLI"));
    }

    [Fact]
    public void Windows_apis_are_confined_to_the_platform_layer()
    {
        var pattern = new Regex(@"using Microsoft\.Win32;|using System\.Management;|DllImport|using System\.ServiceProcess;");
        foreach (var project in new[] { "Nexus.Engine", "Nexus.Security", "Nexus.Data", "Nexus.Application", "Nexus.CLI", "Nexus.Contracts" })
            foreach (var f in Directory.EnumerateFiles(Path.Combine(SrcDir(), project), "*.cs", SearchOption.AllDirectories).Where(f => !f.Contains($"{Path.DirectorySeparatorChar}obj{Path.DirectorySeparatorChar}")))
                Assert.False(pattern.IsMatch(File.ReadAllText(f)), $"{project}/{Path.GetFileName(f)} uses a Windows API directly");
    }
}

public class LoggingTests
{
    [Fact]
    public void Personal_data_is_redacted()
    {
        var r = new LogRedactor("alice", @"C:\Users\alice", "ALICE-PC");
        var s = r.Redact(@"Moved C:\Users\alice\AppData\Local\Temp\x.tmp on ALICE-PC for alice");
        Assert.DoesNotContain("alice", s, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("%USERPROFILE%", s);
        Assert.Contains("<machine>", s);
    }

    [Fact]
    public void Levels_are_filtered_and_sinks_are_isolated()
    {
        var lines = new StringWriter();
        var log = new LoggingEngine(NexusLogLevel.Warning, new LogRedactor(null, null, null))
            .AddSink(new ThrowingSink())
            .AddSink(new TextWriterLogSink(lines, NexusLogLevel.Trace));
        log.Info("t", "hidden");
        log.Error("t", "shown", new InvalidOperationException("why"));
        log.Critical("t", "critical");
        var text = lines.ToString();
        Assert.DoesNotContain("hidden", text);
        Assert.Contains("[ERROR] t: shown | InvalidOperationException: why", text);
        Assert.Contains("[CRITICAL]", text);
    }

    [Fact]
    public async Task Engine_operations_are_logged_to_sqlite()
    {
        using var host = new TestHost();
        await host.Engine.ExecuteOptimizationAsync(new ExecuteOptimizationRequest(["gaming.enable-game-mode"]));
        var logs = host.Engine.GetLogs(100, NexusLogLevel.Info);
        Assert.Contains(logs, l => l.Category == "Pipeline" && l.Message.Contains("Committed"));
    }

    private sealed class ThrowingSink : ILogSink
    {
        public void Write(DateTimeOffset ts, NexusLogLevel level, string category, string message, string? correlationId) => throw new IOException("disk full");
    }
}

public class DatabaseTests
{
    [Fact]
    public void Schema_is_migrated_and_entities_are_separated()
    {
        var path = Path.Combine(Path.GetTempPath(), $"nexus-{Guid.NewGuid():N}.db");
        var db = new Data.Storage.NexusDatabase(path);
        Assert.Equal(1, db.SchemaVersion);
        using var c = db.Open();
        using var cmd = c.CreateCommand();
        cmd.CommandText = "SELECT name FROM sqlite_master WHERE type='table'";
        using var r = cmd.ExecuteReader();
        var tables = new List<string>();
        while (r.Read()) tables.Add(r.GetString(0));
        foreach (var t in new[] { "SystemSnapshots", "OptimizationRules", "OptimizationTransactions", "Profiles", "Benchmarks", "Logs", "Settings", "Backups" })
            Assert.Contains(t, tables);
        _ = new Data.Storage.NexusDatabase(path); // re-opening is idempotent
    }

    [Fact]
    public async Task Security_layer_backup_mirror_is_human_readable_jsonl()
    {
        using var host = new TestHost();
        await host.Engine.ExecuteOptimizationAsync(new ExecuteOptimizationRequest(["gaming.enable-game-mode"]));
        var file = Directory.GetFiles(Path.Combine(host.DataRoot, "backups")).Single();
        var lines = File.ReadAllLines(file);
        Assert.All(lines, l => Assert.StartsWith("{", l));
        Assert.Contains(lines, l => l.Contains("AutoGameModeEnabled"));
    }
}
