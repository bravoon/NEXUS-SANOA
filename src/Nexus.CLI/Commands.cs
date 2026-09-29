using System.Globalization;
using Nexus.Application.Hosting;
using Nexus.Application.Services;
using Nexus.Contracts;
using Nexus.Contracts.Api;
using Nexus.Ipc;

namespace Nexus.CLI;

public sealed class Commands(NexusApplication app, CommandLine cl, CancellationToken ct)
{
    private bool Json => cl.Flag("json");

    public static void Usage()
    {
        Console.WriteLine("""
            NEXUS OPTIMIZER — command line

            Usage: nexus <command> [options]

            Diagnosis
              scan [--seconds N]                 Collect a system snapshot (read-only)
              analyze [--seconds N]              Scan + diagnostics + bottleneck assessment
              status                             Engine / platform status and live telemetry
              processes [--top N]                Processes with classification (SYSTEM/TRUSTED/USER/UNKNOWN/SUSPICIOUS)
              startup [list]                     Startup entries (registry, folders, tasks, services)
              games                              Detected games and launchers
              rules                              All optimization rules and their conditions

            Optimization (Detect → Analyze → Recommend → Preview → Backup → Apply → Validate → Commit)
              recommendations [--all]            Recommended optimizations with justification
              preview <optimizationId>           Show exactly what would change (before → after)
              optimize --id <id> [--id <id>...]  Apply selected optimizations as one transaction
              optimize --recommended             Apply every RECOMMENDED optimization (never optional ones)
                       [--dry-run] [--yes] [--restore-point]
              startup disable|enable <entryId>   Toggle a startup entry (reversible)
              priority <pid> <Priority>          Session-only priority change (Idle..High; never RealTime)
              kill <pid> --confirm               Terminate a process (explicit, never protected processes)

            Safety
              history                            Transactions (TX-yyyyMMdd-NNN)
              rollback <txId> [--item <id>] [--force]   Undo a whole transaction or a single optimization
              quarantine [purge --older-than-days N --confirm]  Show / permanently delete quarantined temp files

            Profiles & gaming
              profile list                       Profiles (Balanced, Gaming, Performance, Battery, custom)
              profile <name> [--dry-run]         Apply a profile through the same pipeline
              profile create <name> key=value... Create a custom profile
              game-profile --game <id> --exe <path> [--priority High] [--gpu highPerformance] [--background name.exe] [--auto]
              game-apply <gameId> [--dry-run]

            Benchmark
              benchmark [--name N] [--duration S] [--process game.exe]   Measure (FPS needs tools\PresentMon.exe)
              benchmark import <file.csv> [--name N]                     Import PresentMon/CapFrameX/OCAT frame times
              benchmark list | benchmark compare <baselineId> <candidateId>

            Host
              serve [--idle-exit S]              Run the engine API for the desktop UI (named pipe)
              logs [--take N]                    Recent engine logs

            Global options: --json  --simulate  --verbose  --data-dir <dir>  --config-dir <dir>
            """);
    }

    public static int Unknown(string c)
    {
        Output.Error($"Unknown command '{c}'. Run 'nexus help'.");
        return 2;
    }

    // ------------------------------------------------------------------ diagnosis

    public async Task<int> Scan()
    {
        var snap = await app.System.ScanAsync(cl.Int("seconds", 5), ct);
        if (Json) { Output.Json(snap); return 0; }
        PrintSnapshot(snap);
        return 0;
    }

    private static void PrintSnapshot(SystemSnapshot s)
    {
        Output.Header($"System snapshot {s.Id}{(s.IsSimulated ? " (SIMULATED)" : "")}");
        Output.Info($"OS        {s.Os.Name} {s.Os.Version} build {s.Os.Build} {s.Os.Architecture}{(s.Os.PendingReboot ? "  [restart pending]" : "")}");
        Output.Info($"CPU       {s.Cpu.Name} — {s.Cpu.PhysicalCores}C/{s.Cpu.LogicalProcessors}T");
        foreach (var g in s.Gpus) Output.Info($"GPU       {g.Name} — VRAM {Output.Bytes(g.DedicatedVramBytes)} — driver {g.DriverVersion ?? "?"} ({g.DriverDate:yyyy-MM-dd})");
        Output.Info($"RAM       {Output.Bytes(s.Memory.TotalBytes)} ({s.Memory.ModuleCount?.ToString(CultureInfo.InvariantCulture) ?? "?"} modules, {s.Memory.SpeedMhz?.ToString(CultureInfo.InvariantCulture) ?? "?"} MHz)");
        foreach (var d in s.Disks) Output.Info($"Disk      {d.Drive} {d.MediaType ?? "?"} {d.FileSystem} — {Output.Bytes(d.FreeBytes)} free of {Output.Bytes(d.TotalBytes)}");
        Output.Info($"Power     {s.Power.ActiveSchemeName} (AC: {s.Power.OnAcPower?.ToString() ?? "unknown"}, battery: {s.Power.HasBattery})");
        Output.Info($"Gaming    Game Mode: {B(s.Gaming.GameModeEnabled)}, capture: {B(s.Gaming.GameDvrBackgroundRecording)}, HAGS: {B(s.Gaming.HardwareGpuScheduling)}");
        Output.Info($"Inventory {s.Processes.Count} processes, {s.Services.Count} services, {s.Startup.Count} startup entries, {s.Drivers.Count} drivers");
        if (s.UsageSamples.Count > 0)
        {
            var last = s.UsageSamples[^1];
            Output.Header($"Usage ({s.UsageSamples.Count} samples, last shown)");
            Output.Info($"CPU  {Output.Reading(last.Cpu.Utilization)}  busiest core {(last.Cpu.MaxCoreUtilization is { } m ? Output.Reading(m) : "n/a")}  {Output.Reading(last.Cpu.Frequency)}  temp {Output.Reading(last.Cpu.Temperature)}");
            foreach (var g in last.Gpus) Output.Info($"GPU  {Output.Reading(g.Utilization)}  VRAM {Output.Reading(g.VramUsed)} / {Output.Reading(g.VramTotal)}  temp {Output.Reading(g.Temperature)}  power {Output.Reading(g.Power)}");
            Output.Info($"RAM  {Output.Reading(last.Memory.Used)} used, {Output.Reading(last.Memory.Available)} available, commit {Output.Reading(last.Memory.CommitPercent)}");
            foreach (var d in last.Storage) Output.Info($"Disk {d.Drive} active {Output.Reading(d.ActiveTime)}, health {d.Health.Note ?? Output.Reading(d.Health)}, temp {Output.Reading(d.Temperature)}");
        }
        foreach (var w in s.CollectionWarnings) Output.Warn(w);
    }

    private static string B(bool? b) => b switch { true => "on", false => "off", null => "unknown" };

    public async Task<int> Analyze()
    {
        await app.System.ScanAsync(cl.Int("seconds", 5), ct);
        var report = await app.System.AnalyzeAsync(ct);
        if (Json) { Output.Json(report); return 0; }
        var b = report.Bottleneck;
        Output.Header("Primary bottleneck");
        Output.Write($"  {b.Primary}", ConsoleColor.White);
        Output.Write("   confidence: ", ConsoleColor.Gray);
        Output.Line(b.Confidence.ToString().ToUpperInvariant(), Output.ColorOf(b.Confidence));
        Output.Info(b.Explanation);
        foreach (var e in b.Evidence) Output.Info($"  · {e.Metric}: {e.Observed}{(e.Threshold is null ? "" : $" (threshold {e.Threshold})")}");

        Output.Header($"Findings ({report.Findings.Count})");
        foreach (var f in report.Findings)
        {
            Output.Write($"  [{f.Severity,-8}] ", Output.ColorOf(f.Severity));
            Output.Write($"{f.Confidence.ToString().ToUpperInvariant(),-9} ", Output.ColorOf(f.Confidence));
            Console.WriteLine(f.Title);
            Output.Info($"             {f.Explanation}");
            foreach (var e in f.Evidence.Take(5)) Output.Info($"             · {e.Metric}: {e.Observed}{(e.Threshold is null ? "" : $" (threshold {e.Threshold})")}");
        }
        Console.WriteLine();
        Output.Info("Confidence: CONFIRMED = measured/fact · LIKELY = strong evidence · POSSIBLE = weak evidence · UNKNOWN = insufficient data");
        return 0;
    }

    public async Task<int> Status()
    {
        var s = await app.System.StatusAsync(ct);
        if (Json) { Output.Json(s); return 0; }
        Output.Header("NEXUS OPTIMIZER — engine status");
        Output.Info($"Engine version   {s.EngineVersion}");
        Output.Info($"Platform         {s.Platform}{(s.IsSimulated ? " (simulated)" : "")}");
        Output.Info($"Elevated         {s.IsElevated}");
        Output.Info($"Last scan        {s.LastScan?.ToLocalTime().ToString("g", CultureInfo.CurrentCulture) ?? "never"}");
        Output.Info($"Active profile   {s.ActiveProfile ?? "none"}");
        Output.Info($"Committed TXs    {s.TransactionsCommitted}");
        if (s.Live is { } l)
            Output.Info($"Live             CPU {Output.Reading(l.Cpu.Utilization)} · GPU {(l.Gpus.Count > 0 ? Output.Reading(l.Gpus[0].Utilization) : "n/a")} · RAM {Output.Reading(l.Memory.Used)}");
        return 0;
    }

    public int Processes()
    {
        var list = app.Processes.List(cl.Int("top", 25), true, ct);
        if (Json) { Output.Json(list); return 0; }
        Output.Header("Processes (sorted by CPU)");
        Output.Table(["PID", "Name", "CPU", "Memory", "Class", "Prot", "Publisher"],
            list.Select(p => (IReadOnlyList<string>)[
                p.Pid.ToString(CultureInfo.InvariantCulture), p.Name, p.CpuPercent is { } c ? $"{c:F1}%" : "n/a",
                Output.Bytes(p.WorkingSetBytes), p.Classification.ToString().ToUpperInvariant(), p.IsProtected ? "yes" : "", p.Publisher ?? (p.Signed == false ? "(unsigned)" : "")]));
        foreach (var p in list.Where(p => p.Classification == ProcessClassification.Suspicious))
            Output.Warn($"{p.Name} ({p.Pid}) at {p.Path}: {string.Join("; ", p.ClassificationReasons)}");
        return 0;
    }

    public async Task<int> Priority()
    {
        var pid = int.Parse(cl.Arg(1) ?? throw new ArgumentException("Usage: nexus priority <pid> <Idle|BelowNormal|Normal|AboveNormal|High>"), CultureInfo.InvariantCulture);
        var prio = Enum.Parse<ProcessPriority>(cl.Arg(2) ?? "Normal", true);
        var r = await app.Processes.SetPriorityAsync(pid, prio, ct);
        return Report(r);
    }

    public async Task<int> Kill()
    {
        var pid = int.Parse(cl.Arg(1) ?? throw new ArgumentException("Usage: nexus kill <pid> --confirm"), CultureInfo.InvariantCulture);
        if (!cl.Flag("confirm")) { Output.Error("Terminating a process is irreversible. Re-run with --confirm."); return 2; }
        return Report(await app.Processes.TerminateAsync(pid, true, ct));
    }

    private int Report(ProcessActionResult r)
    {
        if (Json) Output.Json(r);
        else if (r.Success) Output.Ok($"{r.Message} (transaction {r.TransactionId})");
        else Output.Error(r.Message);
        return r.Success ? 0 : 1;
    }

    public async Task<int> Startup()
    {
        var sub = cl.Arg(1)?.ToLowerInvariant() ?? "list";
        if (sub is "disable" or "enable")
        {
            var id = cl.Arg(2) ?? throw new ArgumentException("Usage: nexus startup disable|enable <entryId>");
            return PrintExecution(await app.Startup.SetEnabledAsync(id, sub == "enable", ct));
        }
        var entries = app.Startup.List();
        if (Json) { Output.Json(entries); return 0; }
        Output.Header("Startup entries");
        Output.Table(["Id", "Name", "Source", "Enabled", "Impact", "Signed", "Publisher"],
            entries.Select(e => (IReadOnlyList<string>)[
                e.Id, e.Name + (e.IsCritical ? " (critical)" : ""), e.Source.ToString(), e.Enabled ? "yes" : "no",
                e.Impact.ToString(), e.Signed switch { true => "yes", false => "NO", _ => "?" }, e.Publisher ?? ""]));
        Output.Info("Impact is an estimate (known application profile or executable size) — see 'nexus startup --json' for the basis.");
        return 0;
    }

    public int Games()
    {
        var games = app.Gaming.Games();
        var launchers = app.Gaming.Launchers();
        if (Json) { Output.Json(new { games, launchers, profiles = app.Gaming.Profiles() }); return 0; }
        Output.Header("Launchers");
        foreach (var l in launchers) Output.Info($"{(l.Installed ? "●" : "○")} {l.Name}{(l.Running ? "  (running)" : "")}");
        Output.Header($"Games ({games.Count})");
        Output.Table(["Game id", "Name", "Launcher", "Executable"], games.Select(g => (IReadOnlyList<string>)[g.GameId, g.Name, g.Launcher, g.Executable ?? "?"]));
        var profiles = app.Gaming.Profiles();
        if (profiles.Count > 0)
        {
            Output.Header("Game profiles");
            foreach (var p in profiles) Output.Info($"{p.GameId}: {p.Executable}, priority {p.Priority}{(p.AutoApply ? ", auto-apply" : "")}");
        }
        return 0;
    }

    public int GameProfile()
    {
        var gameId = cl.Option("game") ?? throw new ArgumentException("--game <gameId> is required.");
        var exe = cl.Option("exe") ?? app.Gaming.Games().FirstOrDefault(g => g.GameId == gameId)?.Executable ?? throw new ArgumentException("--exe <path> is required.");
        var gfx = cl.Option("gpu") is { } gpu ? new Dictionary<string, string> { ["gpuPreference"] = gpu } : null;
        var win = cl.Options("set").Select(s => s.Split('=', 2)).Where(p => p.Length == 2).ToDictionary(p => p[0], p => p[1]);
        var profile = new GameProfile(gameId, exe, Enum.Parse<ProcessPriority>(cl.Option("priority") ?? "Normal", true),
            cl.Option("affinity") is { } a ? Convert.ToInt64(a, a.StartsWith("0x", StringComparison.OrdinalIgnoreCase) ? 16 : 10) : null,
            gfx, win.Count > 0 ? win : null, cl.Options("background").ToList(), cl.Flag("auto"));
        var saved = app.Gaming.SaveProfile(profile);
        if (Json) Output.Json(saved); else Output.Ok($"Game profile saved for {saved.GameId}.");
        return 0;
    }

    public async Task<int> GameApply()
    {
        var id = cl.Arg(1) ?? throw new ArgumentException("Usage: nexus game-apply <gameId> [--dry-run]");
        return PrintExecution(await app.Gaming.ApplyAsync(id, cl.Flag("dry-run"), ct));
    }

    public int Rules()
    {
        var rules = app.Optimization.Rules();
        if (Json) { Output.Json(rules); return 0; }
        Output.Header($"Optimization rules ({rules.Count})");
        foreach (var r in rules)
        {
            Output.Line($"{r.Id}  [{r.Category}]  {r.Name}", ConsoleColor.White);
            Output.Info($"impact {r.Impact} · risk {r.Risk} · admin {r.RequiresAdmin} · reversible {r.Reversible} · backup {r.BackupRequired}{(r.RequiresReboot ? " · restart" : "")} · {r.Source}");
            Output.Info($"conditions: {string.Join(" AND ", r.Conditions)}");
        }
        return 0;
    }

    // ------------------------------------------------------------------ optimization

    public async Task<int> Recommendations()
    {
        var recs = await app.Optimization.RecommendationsAsync(ct);
        if (!cl.Flag("all")) recs = recs.Where(r => r.Status is RecommendationStatus.Recommended or RecommendationStatus.Optional).ToList();
        if (Json) { Output.Json(recs); return 0; }
        Output.Header($"Recommendations ({recs.Count})");
        foreach (var r in recs)
        {
            var color = r.Status switch { RecommendationStatus.Recommended => ConsoleColor.Green, RecommendationStatus.Optional => ConsoleColor.Yellow, _ => ConsoleColor.DarkGray };
            Output.Write($"  {r.Status.ToString().ToUpperInvariant(),-15}", color);
            Console.WriteLine($"{r.Name}");
            Output.Info($"               id: {r.OptimizationId}");
            Output.Info($"               {r.Category} · impact {r.Impact} · risk {r.Risk} · expected benefit {r.ExpectedBenefitConfidence.ToString().ToUpperInvariant()} · {(r.Reversible ? "reversible" : "NOT reversible")}{(r.RequiresAdmin ? " · admin" : "")}{(r.RequiresReboot ? " · restart" : "")}");
            foreach (var j in r.Justification) Output.Info($"               {j}");
        }
        Console.WriteLine();
        Output.Info("Preview any item with: nexus preview <id>");
        return 0;
    }

    public async Task<int> Preview()
    {
        var id = cl.Arg(1) ?? throw new ArgumentException("Usage: nexus preview <optimizationId>");
        var p = await app.Optimization.PreviewAsync(id, ct);
        if (Json) { Output.Json(p); return 0; }
        PrintPreview(p);
        return p.CanProceed ? 0 : 1;
    }

    private static void PrintPreview(OptimizationPreview p)
    {
        Output.Header($"Preview: {p.Name}");
        foreach (var c in p.Changes)
        {
            Output.Info($"{c.Description}{(c.RequiresAdmin ? "  [admin]" : "")}");
            Output.Info($"   {c.Kind} {c.Target}");
            Output.Write("   before: ", ConsoleColor.Gray); Output.Line(c.Before.ToString(), ConsoleColor.DarkYellow);
            Output.Write("   after:  ", ConsoleColor.Gray); Output.Line(c.After.ToString(), ConsoleColor.Green);
        }
        foreach (var w in p.Warnings) Output.Warn(w);
        foreach (var b in p.BlockingReasons) Output.Error(b);
        Output.Info($"Reversible: {p.Reversible} · Requires admin: {p.RequiresAdmin} · Restart: {p.RequiresReboot}");
    }

    public async Task<int> Optimize()
    {
        var ids = cl.Options("id").ToList();
        if (cl.Flag("recommended")) ids.AddRange(await app.Optimization.RecommendedIdsAsync(ct));
        ids = ids.Distinct().ToList();
        if (ids.Count == 0)
        {
            Output.Error("Nothing selected. Use --id <optimizationId> (see 'nexus recommendations') or --recommended.");
            return 2;
        }
        if (!Json)
            foreach (var id in ids) PrintPreview(await app.Optimization.PreviewAsync(id, ct));

        var dryRun = cl.Flag("dry-run");
        if (!dryRun && !cl.Flag("yes"))
        {
            if (Console.IsInputRedirected) { Output.Error("Confirmation required: re-run with --yes (or --dry-run)."); return 2; }
            Console.Write($"\nApply {ids.Count} optimization(s) as one transaction? Backups are created first. [y/N] ");
            if (!string.Equals(Console.ReadLine()?.Trim(), "y", StringComparison.OrdinalIgnoreCase)) { Output.Warn("Aborted. Nothing was changed."); return 1; }
        }
        var result = await app.Optimization.ApplyAsync(new ExecuteOptimizationRequest(ids, dryRun, cl.Flag("restore-point")), ct);
        return PrintExecution(result);
    }

    private int PrintExecution(ExecutionResult r)
    {
        if (Json) { Output.Json(r); return r.Status is TransactionStatus.Committed or TransactionStatus.DryRun ? 0 : r.RequiresElevation ? 3 : 1; }
        switch (r.Status)
        {
            case TransactionStatus.Committed:
                Output.Ok($"Transaction {r.TransactionId} committed.");
                foreach (var i in r.Transaction?.Items ?? [])
                {
                    Output.Info($"{i.Name}: {i.Status}");
                    foreach (var c in i.Changes) Output.Info($"   {(c.Applied ? (c.Verified ? "✓" : "?") : "=")} {c.Description}  [{c.Before} → {c.After}]");
                }
                Output.Info($"Undo at any time with: nexus rollback {r.TransactionId}");
                if (r.RequiresReboot) Output.Warn("Restart Windows for all changes to take effect.");
                break;
            case TransactionStatus.DryRun:
                Output.Ok("Dry run — nothing was changed:");
                break;
            case TransactionStatus.ElevationRequired:
                Output.Warn("Administrator rights are required. Nothing was changed.");
                break;
            default:
                Output.Error($"Transaction {r.TransactionId}: {r.Status}");
                break;
        }
        foreach (var m in r.Messages) Output.Info(m);
        return r.Status is TransactionStatus.Committed or TransactionStatus.DryRun ? 0 : r.RequiresElevation ? 3 : 1;
    }

    public async Task<int> Rollback()
    {
        var tx = cl.Arg(1) ?? throw new ArgumentException("Usage: nexus rollback <transactionId> [--item <itemId|optimizationId>] [--force]");
        var r = await app.Restore.RollbackAsync(new RollbackRequest(tx, cl.Option("item"), cl.Flag("force")), ct);
        if (Json) { Output.Json(r); return r.Status is TransactionStatus.RolledBack or TransactionStatus.PartiallyRolledBack ? 0 : 1; }
        (r.Status is TransactionStatus.RolledBack or TransactionStatus.PartiallyRolledBack ? (Action<string>)Output.Ok : Output.Error)($"Rollback {r.TransactionId}: {r.Status}");
        foreach (var m in r.Messages) Output.Info(m);
        return r.Status is TransactionStatus.RolledBack or TransactionStatus.PartiallyRolledBack ? 0 : r.RequiresElevation ? 3 : 1;
    }

    public int History()
    {
        var h = app.Restore.History(cl.Int("take", 30));
        if (Json) { Output.Json(h); return 0; }
        Output.Header("Transaction history");
        Output.Table(["Transaction", "When", "Status", "Items", "Description"],
            h.Select(t => (IReadOnlyList<string>)[t.TransactionId, t.CreatedAt.ToLocalTime().ToString("yyyy-MM-dd HH:mm", CultureInfo.InvariantCulture),
                t.Status.ToString(), string.Join(", ", t.Items.Select(i => $"{i.OptimizationId}={i.Status}")), t.Description]));
        return 0;
    }

    public int Quarantine()
    {
        if (cl.Arg(1) == "purge")
        {
            if (!cl.Flag("confirm"))
            {
                Output.Error("Purging frees disk space but makes the related cleanup transactions irreversible. Re-run with --confirm.");
                return 2;
            }
            var freed = app.Restore.PurgeQuarantine(TimeSpan.FromDays(cl.Int("older-than-days", 7)));
            if (Json) Output.Json(new { freedBytes = freed }); else Output.Ok($"Freed {Output.Bytes(freed)}.");
            return 0;
        }
        var s = app.Restore.QuarantineStatus();
        if (Json) { Output.Json(s); return 0; }
        Output.Header("Quarantine");
        Output.Info($"{s.Files} file(s), {Output.Bytes(s.Bytes)}{(s.Oldest is { } o ? $", oldest {o.ToLocalTime():yyyy-MM-dd}" : "")}");
        Output.Info("Files stay here (restorable via rollback) until you run: nexus quarantine purge --confirm");
        return 0;
    }

    // ------------------------------------------------------------------ profiles / benchmark

    public async Task<int> Profile()
    {
        var sub = cl.Arg(1);
        if (sub is null or "list")
        {
            var list = app.Profiles.List();
            if (Json) { Output.Json(new { profiles = list, settings = app.Profiles.Settings() }); return 0; }
            Output.Header("Profiles");
            foreach (var p in list)
                Output.Info($"{p.Name,-12} {(p.BuiltIn ? "built-in" : "custom  ")}  {string.Join(", ", p.Settings.Select(kv => $"{kv.Key}={kv.Value}"))}");
            Output.Header("Available settings");
            foreach (var s in app.Profiles.Settings()) Output.Info($"{s.Key,-22} {s.Description} [{string.Join("|", s.AllowedValues)}]");
            return 0;
        }
        if (sub == "create")
        {
            var name = cl.Arg(2) ?? throw new ArgumentException("Usage: nexus profile create <name> key=value ...");
            var settings = cl.Positional.Skip(3).Select(s => s.Split('=', 2)).Where(p => p.Length == 2).ToDictionary(p => p[0], p => p[1]);
            var saved = await app.Profiles.SaveAsync(new ProfileDefinition(name, ProfileKind.Custom, cl.Option("description") ?? "Custom profile", settings), ct);
            if (Json) Output.Json(saved); else Output.Ok($"Profile '{saved.Name}' saved.");
            return 0;
        }
        return PrintExecution(await app.Profiles.ApplyAsync(sub, cl.Flag("dry-run"), ct));
    }

    public async Task<int> Benchmark()
    {
        var sub = cl.Arg(1)?.ToLowerInvariant();
        if (sub == "list")
        {
            var results = app.Benchmark.Results();
            if (Json) { Output.Json(results); return 0; }
            Output.Header("Benchmarks");
            Output.Table(["Id", "Name", "When", "Avg FPS", "1% low", "CPU", "GPU", "Profile"],
                results.Select(b => (IReadOnlyList<string>)[b.BenchmarkId, b.Name, b.StartedAt.ToLocalTime().ToString("yyyy-MM-dd HH:mm", CultureInfo.InvariantCulture),
                    Output.Metric(b.Frames?.AverageFps), Output.Metric(b.Frames?.OnePercentLowFps), Output.Metric(b.Load.CpuUsageAvg, "F0"), Output.Metric(b.Load.GpuUsageAvg, "F0"), b.ActiveProfile ?? ""]));
            return 0;
        }
        if (sub == "compare")
        {
            var c = app.Benchmark.Compare(cl.Arg(2) ?? throw new ArgumentException("baseline id required"), cl.Arg(3) ?? throw new ArgumentException("candidate id required"));
            if (Json) { Output.Json(c); return 0; }
            Output.Header($"Comparison {c.BaselineId} → {c.CandidateId}");
            Output.Table(["Metric", "Baseline", "Candidate", "Δ%"], c.Deltas.Select(d => (IReadOnlyList<string>)[
                d.Metric, d.Baseline?.ToString("F1", CultureInfo.InvariantCulture) ?? "n/a", d.Candidate?.ToString("F1", CultureInfo.InvariantCulture) ?? "n/a",
                d.DeltaPercent?.ToString("+0.0;-0.0", CultureInfo.InvariantCulture) ?? "n/a"]));
            Output.Write($"\n  Verdict: {c.Verdict}  ", ConsoleColor.White);
            Output.Line($"confidence {c.Confidence.ToString().ToUpperInvariant()}", Output.ColorOf(c.Confidence));
            Output.Info(c.Explanation);
            return 0;
        }

        var request = sub == "import"
            ? new BenchmarkRequest(cl.Option("name") ?? Path.GetFileNameWithoutExtension(cl.Arg(2) ?? "import"), TimeSpan.FromSeconds(1),
                FrameTimeCsvPath: cl.Arg(2) ?? throw new ArgumentException("Usage: nexus benchmark import <file.csv>"))
            : new BenchmarkRequest(cl.Option("name") ?? $"Benchmark {DateTime.Now:yyyy-MM-dd HH:mm}", TimeSpan.FromSeconds(cl.Int("duration", 30)),
                cl.Option("process"), cl.Option("game"));
        if (!Json && sub != "import") Output.Info($"Measuring for {request.Duration.TotalSeconds:F0}s{(request.ProcessName is null ? "" : $" (target {request.ProcessName})")} — press Ctrl+C to stop early…");
        var r = await app.Benchmark.RunAsync(request, ct);
        if (Json) { Output.Json(r); return 0; }
        Output.Header($"Benchmark {r.BenchmarkId} — {r.Name}");
        Output.Info($"Frame source   {r.FrameSource}");
        if (r.Frames is { } f)
        {
            Output.Info($"Frames         {f.FrameCount} over {f.DurationSeconds:F1}s");
            Output.Info($"Average FPS    {Output.Metric(f.AverageFps)}");
            Output.Info($"1% low         {Output.Metric(f.OnePercentLowFps)}");
            Output.Info($"0.1% low       {Output.Metric(f.PointOnePercentLowFps)}");
            Output.Info($"Frame time     avg {Output.Metric(f.AverageFrametimeMs, "F2")} · P99 {Output.Metric(f.P99FrametimeMs, "F2")} · σ {Output.Metric(f.FrametimeStdDevMs, "F2")}");
            Output.Info($"Method         {f.Methodology}");
        }
        Output.Info($"CPU avg        {Output.Metric(r.Load.CpuUsageAvg, "F0")}   GPU avg {Output.Metric(r.Load.GpuUsageAvg, "F0")}");
        Output.Info($"RAM avg        {Output.Bytes(r.Load.RamUsedAvg.Value)}   VRAM avg {Output.Bytes(r.Load.VramUsedAvg.Value)}");
        Output.Info($"Temp max       CPU {Output.Metric(r.Load.CpuTempMax, "F0")} · GPU {Output.Metric(r.Load.GpuTempMax, "F0")}");
        foreach (var n in r.Notes) Output.Warn(n);
        return 0;
    }

    public int Logs()
    {
        var logs = app.System.Logs(cl.Int("take", 50), Enum.TryParse<NexusLogLevel>(cl.Option("level"), true, out var l) ? l : NexusLogLevel.Info);
        if (Json) { Output.Json(logs); return 0; }
        foreach (var e in logs.Reverse())
            Console.WriteLine($"{e.Timestamp.ToLocalTime():yyyy-MM-dd HH:mm:ss} [{e.Level.ToString().ToUpperInvariant(),-8}] {e.Category}: {e.Message}");
        return 0;
    }

    // ------------------------------------------------------------------ hosting

    public async Task<int> Serve(bool simulated)
    {
        var pipe = cl.Option("pipe") ?? PipeNames.ForCurrentUser(simulated);
        await using var server = new NexusPipeServer(pipe, new ApiDispatcher(app), msg => Console.Error.WriteLine(msg));
        using var sub = app.Engine.Events.Subscribe(server.Broadcast);
        server.Start();
        app.Engine.Gaming.StartMonitoring(TimeSpan.FromSeconds(3));
        Output.Ok($"Nexus engine API listening on pipe '{pipe}' (current user only). Ctrl+C to stop.");
        // --idle-exit N: stop after N seconds without any connected client (used when the desktop UI starts the host).
        var idleExit = cl.Int("idle-exit", 0);
        try
        {
            var idleSince = DateTime.UtcNow;
            while (!ct.IsCancellationRequested)
            {
                await Task.Delay(TimeSpan.FromSeconds(2), ct);
                if (server.ConnectionCount > 0) idleSince = DateTime.UtcNow;
                else if (idleExit > 0 && DateTime.UtcNow - idleSince > TimeSpan.FromSeconds(idleExit)) break;
            }
        }
        catch (OperationCanceledException) { }
        app.Engine.Gaming.StopMonitoring();
        return 0;
    }

    /// <summary>Elevated worker: executes exactly one transaction then exits.</summary>
    public async Task<int> ElevatedApply()
    {
        var req = ProcessElevationBroker.Decode<ExecuteOptimizationRequest>(cl.Option("request") ?? throw new ArgumentException("--request missing"))
                  ?? throw new ArgumentException("Invalid request.");
        var r = await app.Optimization.ApplyAsync(req with { AllowElevation = false }, ct);
        return r.Status == TransactionStatus.Committed ? 0 : 1;
    }

    public async Task<int> ElevatedRollback()
    {
        var req = ProcessElevationBroker.Decode<RollbackRequest>(cl.Option("request") ?? throw new ArgumentException("--request missing"))
                  ?? throw new ArgumentException("Invalid request.");
        var r = await app.Restore.RollbackAsync(req, ct);
        return r.Status is TransactionStatus.RolledBack or TransactionStatus.PartiallyRolledBack ? 0 : 1;
    }
}
