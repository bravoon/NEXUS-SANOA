using Nexus.Contracts;
using Nexus.Platform.Abstractions;
using Nexus.Platform.Simulation;
using Nexus.Security.Permissions;

namespace Nexus.Tests;

public class TransactionAndRollbackTests
{
    private const string GameBar = @"HKCU\Software\Microsoft\GameBar";

    [Fact]
    public async Task Apply_creates_a_committed_transaction_with_backups()
    {
        using var host = new TestHost();
        var r = await host.Engine.ExecuteOptimizationAsync(new ExecuteOptimizationRequest(["gaming.enable-game-mode"]));

        Assert.Equal(TransactionStatus.Committed, r.Status);
        Assert.Matches(@"^TX-\d{8}-001$", r.TransactionId);
        Assert.Equal("1", host.Platform.Reg.GetValue(GameBar, "AutoGameModeEnabled")!.Text);

        var tx = host.Store.Transactions.Get(r.TransactionId)!;
        var change = Assert.Single(Assert.Single(tx.Items).Changes);
        Assert.Equal("0", change.Before.Value);
        Assert.Equal("1", change.After.Value);
        Assert.True(change.Applied && change.Verified);

        var backups = host.Store.Backups.ForTransaction(r.TransactionId);
        Assert.Contains(backups, b => b.Kind == "registry.value" && b.State.Value == "0");
        Assert.Contains(backups, b => b.Kind == "registry.key" && b.Target == GameBar); // whole-key backup
        Assert.True(File.Exists(Path.Combine(host.DataRoot, "backups", $"{r.TransactionId}.jsonl")));
    }

    [Fact]
    public async Task Transaction_ids_are_sequential_per_day()
    {
        using var host = new TestHost();
        var a = await host.Engine.ExecuteOptimizationAsync(new ExecuteOptimizationRequest(["gaming.enable-game-mode"]));
        var b = await host.Engine.ExecuteOptimizationAsync(new ExecuteOptimizationRequest(["gaming.disable-background-capture"]));
        Assert.EndsWith("-001", a.TransactionId);
        Assert.EndsWith("-002", b.TransactionId);
    }

    [Fact]
    public async Task Single_item_can_be_rolled_back_without_touching_the_rest()
    {
        using var host = new TestHost();
        await host.ScanAsync();
        var r = await host.Engine.ExecuteOptimizationAsync(new ExecuteOptimizationRequest(["gaming.enable-game-mode", "gaming.disable-background-capture"]));
        Assert.Equal(TransactionStatus.Committed, r.Status);

        var rb = await host.Engine.RollbackOptimizationAsync(new RollbackRequest(r.TransactionId, "gaming.enable-game-mode"));
        Assert.Equal(TransactionStatus.PartiallyRolledBack, rb.Status);
        Assert.Equal("0", host.Platform.Reg.GetValue(GameBar, "AutoGameModeEnabled")!.Text);          // restored
        Assert.Equal("0", host.Platform.Reg.GetValue(@"HKCU\System\GameConfigStore", "GameDVR_Enabled")!.Text); // untouched

        var all = await host.Engine.RollbackOptimizationAsync(new RollbackRequest(r.TransactionId));
        Assert.Equal(TransactionStatus.RolledBack, all.Status);
        Assert.Equal("1", host.Platform.Reg.GetValue(@"HKCU\System\GameConfigStore", "GameDVR_Enabled")!.Text);
    }

    [Fact]
    public async Task Rollback_restores_absent_values_by_deleting_them()
    {
        using var host = new TestHost();
        await host.ScanAsync();
        var discord = host.Engine.Startup.GetEntries().Single(e => e.Name == "Discord");
        var r = await host.Engine.ExecuteOptimizationAsync(new ExecuteOptimizationRequest([$"startup:{discord.Id}:off"]));
        Assert.Equal(TransactionStatus.Committed, r.Status);
        Assert.False(host.Engine.Startup.GetEntries().Single(e => e.Name == "Discord").Enabled);

        await host.Engine.RollbackOptimizationAsync(new RollbackRequest(r.TransactionId));
        Assert.Null(host.Platform.Reg.GetValue(@"HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run", "Discord"));
        Assert.True(host.Engine.Startup.GetEntries().Single(e => e.Name == "Discord").Enabled);
    }

    [Fact]
    public async Task Rollback_does_not_overwrite_values_changed_by_the_user_unless_forced()
    {
        using var host = new TestHost();
        var r = await host.Engine.ExecuteOptimizationAsync(new ExecuteOptimizationRequest(["gaming.enable-game-mode"]));
        host.Platform.Reg.SetValue(GameBar, "AutoGameModeEnabled", RegValue.DWord(7)); // external change

        var rb = await host.Engine.RollbackOptimizationAsync(new RollbackRequest(r.TransactionId));
        Assert.Contains(rb.Messages, m => m.Contains("changed outside Nexus"));
        Assert.Equal("7", host.Platform.Reg.GetValue(GameBar, "AutoGameModeEnabled")!.Text);

        var forced = await host.Engine.RollbackOptimizationAsync(new RollbackRequest(r.TransactionId, Force: true));
        Assert.Equal(TransactionStatus.RolledBack, forced.Status);
        Assert.Equal("0", host.Platform.Reg.GetValue(GameBar, "AutoGameModeEnabled")!.Text);
    }

    [Fact]
    public async Task Failure_in_the_middle_rolls_back_everything_already_applied()
    {
        var p = SimulatedPlatform.CreateSampleMachine();
        p.Reg.FailingWrites.Add(@"HKCU\System\GameConfigStore|GameDVR_Enabled");
        using var host = new TestHost(p);
        await host.ScanAsync();

        var r = await host.Engine.ExecuteOptimizationAsync(new ExecuteOptimizationRequest(["gaming.enable-game-mode", "gaming.disable-background-capture"]));

        Assert.Equal(TransactionStatus.Failed, r.Status);
        Assert.Equal("0", p.Reg.GetValue(GameBar, "AutoGameModeEnabled")!.Text);                                      // first item reverted
        Assert.Equal("1", p.Reg.GetValue(@"HKCU\Software\Microsoft\Windows\CurrentVersion\GameDVR", "AppCaptureEnabled")!.Text); // partial item reverted
        var tx = host.Store.Transactions.Get(r.TransactionId)!;
        Assert.Equal(TransactionItemStatus.RolledBack, tx.Items[0].Status);
        Assert.Equal(TransactionItemStatus.Failed, tx.Items[1].Status);
        Assert.Contains(r.Messages, m => m.Contains("rolled back"));
    }

    [Fact]
    public async Task Dry_run_changes_nothing()
    {
        using var host = new TestHost();
        var r = await host.Engine.ExecuteOptimizationAsync(new ExecuteOptimizationRequest(["gaming.enable-game-mode"], DryRun: true));
        Assert.Equal(TransactionStatus.DryRun, r.Status);
        Assert.Equal("0", host.Platform.Reg.GetValue(GameBar, "AutoGameModeEnabled")!.Text);
        Assert.Empty(host.Store.Transactions.List());
    }

    [Fact]
    public async Task Machine_wide_changes_require_elevation_and_nothing_is_applied()
    {
        using var host = new TestHost();
        var r = await host.Engine.ExecuteOptimizationAsync(new ExecuteOptimizationRequest(["gaming.hardware-gpu-scheduling"]));
        Assert.Equal(TransactionStatus.ElevationRequired, r.Status);
        Assert.True(r.RequiresElevation);
        Assert.Equal("1", host.Platform.Reg.GetValue(@"HKLM\SYSTEM\CurrentControlSet\Control\GraphicsDrivers", "HwSchMode")!.Text);
    }

    [Fact]
    public async Task Elevation_is_delegated_to_the_broker_only_when_needed()
    {
        var broker = new RecordingBroker();
        var p = SimulatedPlatform.CreateSampleMachine();
        p.Priv.CanRequestElevation = true;
        using var host = new TestHost(p, broker: broker);

        await host.Engine.ExecuteOptimizationAsync(new ExecuteOptimizationRequest(["gaming.enable-game-mode"]));
        Assert.Equal(0, broker.Calls); // HKCU change: no elevation

        await host.Engine.ExecuteOptimizationAsync(new ExecuteOptimizationRequest(["gaming.hardware-gpu-scheduling"]));
        Assert.Equal(1, broker.Calls);
        Assert.False(broker.LastRequest!.AllowElevation); // the worker never re-elevates
        Assert.NotNull(broker.LastRequest.TransactionId);
    }

    [Fact]
    public async Task Elevated_process_applies_machine_wide_changes_and_they_are_reversible()
    {
        var p = SimulatedPlatform.CreateSampleMachine();
        p.Priv.IsElevated = true;
        using var host = new TestHost(p);
        var r = await host.Engine.ExecuteOptimizationAsync(new ExecuteOptimizationRequest(["service.diagtrack-manual"]));
        Assert.Equal(TransactionStatus.Committed, r.Status);
        Assert.Equal(ServiceStartMode.Manual, p.Svc.GetService("DiagTrack")!.StartMode);
        await host.Engine.RollbackOptimizationAsync(new RollbackRequest(r.TransactionId));
        Assert.Equal(ServiceStartMode.Automatic, p.Svc.GetService("DiagTrack")!.StartMode);
    }

    [Fact]
    public async Task Temp_cleanup_quarantines_files_and_rollback_restores_them()
    {
        using var host = new TestHost();
        var before = host.Platform.Fs.ExportFiles().Count(f => f.Path.Contains(@"\Temp\installer_cache_"));
        var r = await host.Engine.ExecuteOptimizationAsync(new ExecuteOptimizationRequest(["storage.quarantine-old-temp-files"]));
        Assert.Equal(TransactionStatus.Committed, r.Status);
        Assert.Equal(0, host.Platform.Fs.ExportFiles().Count(f => f.Path.Contains(@"\Temp\installer_cache_")));
        Assert.True(host.Platform.Fs.FileExists(@"C:\Users\sim\AppData\Local\Temp\recent_0.tmp")); // recent files untouched

        await host.Engine.RollbackOptimizationAsync(new RollbackRequest(r.TransactionId));
        Assert.Equal(before, host.Platform.Fs.ExportFiles().Count(f => f.Path.Contains(@"\Temp\installer_cache_")));
    }

    [Fact]
    public async Task Unknown_or_already_applied_optimizations_are_refused()
    {
        using var host = new TestHost();
        var r = await host.Engine.ExecuteOptimizationAsync(new ExecuteOptimizationRequest(["does.not.exist"]));
        Assert.Equal(TransactionStatus.Failed, r.Status);

        await host.Engine.ExecuteOptimizationAsync(new ExecuteOptimizationRequest(["gaming.enable-game-mode"]));
        var again = await host.Engine.ExecuteOptimizationAsync(new ExecuteOptimizationRequest(["gaming.enable-game-mode"]));
        Assert.Equal(TransactionStatus.Failed, again.Status);
        Assert.Contains(again.Messages, m => m.Contains("AlreadyApplied"));
    }

    private sealed class RecordingBroker : IElevationBroker
    {
        public int Calls;
        public ExecuteOptimizationRequest? LastRequest;
        public Task<ExecutionResult?> ExecuteElevatedAsync(ExecuteOptimizationRequest request, CancellationToken ct)
        {
            Calls++;
            LastRequest = request;
            return Task.FromResult<ExecutionResult?>(null);
        }
        public Task<RollbackResult?> RollbackElevatedAsync(RollbackRequest request, CancellationToken ct) => Task.FromResult<RollbackResult?>(null);
    }
}

public class QuarantineTests
{
    [Fact]
    public void Purge_only_touches_nexus_quarantine_batches_older_than_the_cutoff()
    {
        var dir = Directory.CreateTempSubdirectory("nexus-q").FullName;
        var old = Directory.CreateDirectory(Path.Combine(dir, "20200101000000"));
        File.WriteAllBytes(Path.Combine(old.FullName, "a.tmp"), new byte[1024]);
        old.CreationTimeUtc = DateTime.UtcNow.AddDays(-30);
        var recent = Directory.CreateDirectory(Path.Combine(dir, "recent"));
        File.WriteAllBytes(Path.Combine(recent.FullName, "b.tmp"), new byte[10]);

        var q = new Nexus.Security.Backup.QuarantineManager(dir, Nexus.Data.Logging.LoggingEngine.Null());
        Assert.Equal(2, q.Status().Files);
        Assert.Equal(1024, q.Purge(TimeSpan.FromDays(7)));
        Assert.False(Directory.Exists(old.FullName));
        Assert.True(Directory.Exists(recent.FullName));
    }
}
