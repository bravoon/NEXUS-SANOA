using Nexus.Contracts;
using Nexus.Data.Configuration;
using Nexus.Engine.Processes;
using Nexus.Platform.Abstractions;
using Nexus.Platform.Simulation;

namespace Nexus.Tests;

public class ProcessClassificationTests
{
    private static readonly SystemLocations Loc = new(@"C:\Windows", @"C:\Windows\System32", @"C:\Users\u\AppData\Local\Temp", @"C:\Users\u\Downloads", @"C:\Program Files", @"C:\Program Files (x86)");
    private static readonly ProcessClassifier Classifier = new(new NexusConfiguration().ProtectedProcesses, Loc, currentProcessId: 9999);

    private static ProcessFacts P(int pid, string name, string? path, bool? critical = false, bool? system = false, int session = 1) =>
        new(pid, name, path, session, 1, 1, TimeSpan.Zero, DateTimeOffset.UtcNow, ProcessPriority.Normal, critical, system, 0, 1);

    private static readonly SignatureInfo Ms = new(true, true, "Microsoft Windows");

    [Theory]
    [InlineData(0, "Idle")]
    [InlineData(4, "System")]
    public void Kernel_processes_are_system_and_protected(int pid, string name)
    {
        var p = P(pid, name, null, session: 0);
        Assert.Equal(ProcessClassification.System, Classifier.Classify(p, null).Classification);
        Assert.True(Classifier.EvaluateProtection(p).IsProtected);
    }

    [Fact]
    public void Critical_flag_protects_regardless_of_name()
    {
        var p = P(900, "customcritical.exe", @"C:\Windows\System32\customcritical.exe", critical: true);
        Assert.True(Classifier.EvaluateProtection(p).IsProtected);
        Assert.Equal(ProcessClassification.System, Classifier.Classify(p, Ms).Classification);
    }

    [Theory]
    [InlineData("csrss.exe")]
    [InlineData("lsass.exe")]
    [InlineData("winlogon.exe")]
    [InlineData("services.exe")]
    [InlineData("smss.exe")]
    [InlineData("wininit.exe")]
    public void Genuine_system_binaries_in_System32_are_protected(string name)
    {
        var p = P(700, name, $@"C:\Windows\System32\{name}");
        Assert.True(Classifier.EvaluateProtection(p).IsProtected);
    }

    [Fact]
    public void Explorer_is_protected()
    {
        Assert.True(Classifier.EvaluateProtection(P(4100, "explorer.exe", @"C:\Windows\explorer.exe")).IsProtected);
    }

    [Fact]
    public void System_process_name_in_wrong_location_is_suspicious_and_not_protected()
    {
        var fake = P(6660, "lsass.exe", @"C:\Users\u\AppData\Roaming\lsass.exe");
        var (cls, reasons) = Classifier.Classify(fake, new SignatureInfo(false, false, null));
        Assert.Equal(ProcessClassification.Suspicious, cls);
        Assert.Contains(reasons, r => r.Contains("name of a Windows system process"));
        Assert.False(Classifier.EvaluateProtection(fake).IsProtected);
    }

    [Fact]
    public void Invalid_signature_is_suspicious()
    {
        var (cls, _) = Classifier.Classify(P(5000, "tool.exe", @"C:\Program Files\Tool\tool.exe"), new SignatureInfo(true, false, "Someone"));
        Assert.Equal(ProcessClassification.Suspicious, cls);
    }

    [Fact]
    public void Unsigned_binary_from_downloads_is_suspicious()
    {
        var (cls, _) = Classifier.Classify(P(5001, "setup.exe", @"C:\Users\u\Downloads\setup.exe"), new SignatureInfo(false, false, null));
        Assert.Equal(ProcessClassification.Suspicious, cls);
    }

    [Fact]
    public void Signed_third_party_is_trusted_unsigned_elsewhere_is_user_and_unreadable_is_unknown()
    {
        Assert.Equal(ProcessClassification.Trusted, Classifier.Classify(P(1, "a.exe", @"C:\Program Files\A\a.exe"), new SignatureInfo(true, true, "Valve")).Classification);
        Assert.Equal(ProcessClassification.User, Classifier.Classify(P(2, "b.exe", @"C:\Tools\b.exe"), new SignatureInfo(false, false, null)).Classification);
        Assert.Equal(ProcessClassification.Unknown, Classifier.Classify(P(3, "c.exe", null), null).Classification);
    }

    [Fact]
    public void Nexus_itself_is_protected()
    {
        Assert.True(Classifier.EvaluateProtection(P(9999, "nexus.exe", @"C:\Program Files\Nexus\nexus.exe")).IsProtected);
    }

    [Fact]
    public void Protection_list_is_configurable()
    {
        var cfg = new NexusConfiguration();
        var custom = new ProcessClassifier([.. cfg.ProtectedProcesses, new ProtectedProcessRule("MyAntiCheat.exe", null)], Loc, 1);
        Assert.True(custom.EvaluateProtection(P(10, "MyAntiCheat.exe", @"C:\Program Files\AC\MyAntiCheat.exe")).IsProtected);
    }

    [Fact]
    public async Task Protected_processes_cannot_be_terminated_even_on_request()
    {
        using var host = new TestHost();
        var r = await host.Engine.TerminateProcessAsync(790, userConfirmed: true); // lsass.exe
        Assert.False(r.Success);
        Assert.Contains("protected", r.Message);
        Assert.Empty(host.Platform.Procs.Terminated);
    }

    [Fact]
    public async Task Termination_requires_explicit_confirmation_and_is_recorded()
    {
        using var host = new TestHost();
        Assert.False((await host.Engine.TerminateProcessAsync(7000, userConfirmed: false)).Success);
        var ok = await host.Engine.TerminateProcessAsync(7000, userConfirmed: true);
        Assert.True(ok.Success);
        Assert.Contains(7000, host.Platform.Procs.Terminated);
        Assert.NotNull(host.Store.Transactions.Get(ok.TransactionId!));
    }

    [Fact]
    public async Task Realtime_priority_is_refused_and_priority_changes_are_reversible()
    {
        using var host = new TestHost();
        var rt = await host.Engine.SetProcessPriorityAsync(6100, ProcessPriority.RealTime);
        Assert.False(rt.Success);

        var ok = await host.Engine.SetProcessPriorityAsync(6100, ProcessPriority.BelowNormal);
        Assert.True(ok.Success);
        Assert.Equal(ProcessPriority.BelowNormal, host.Platform.Procs.GetProcess(6100)!.Priority);
        await host.Engine.RollbackOptimizationAsync(new RollbackRequest(ok.TransactionId!));
        Assert.Equal(ProcessPriority.Normal, host.Platform.Procs.GetProcess(6100)!.Priority);
    }

    [Fact]
    public void Process_engine_measures_cpu_between_two_samples()
    {
        var p = SimulatedPlatform.CreateSampleMachine();
        p.Procs.CpuLoad[6100] = 50;
        var engine = new ProcessEngine(p, new NexusConfiguration());
        var list = engine.GetProcesses(TimeSpan.FromMilliseconds(200));
        var chrome = list.Single(x => x.Pid == 6100);
        Assert.InRange(chrome.CpuPercent!.Value, 30, 70);
        Assert.Equal(SensorAvailability.NotSupported, chrome.NetworkBytesPerSec.Availability); // not invented
    }
}

public class StartupDetectionTests
{
    [Fact]
    public void Detects_registry_folder_and_task_entries()
    {
        var p = SimulatedPlatform.CreateSampleMachine();
        using var host = new TestHost(p);
        var entries = host.Engine.Startup.GetEntries();

        Assert.Contains(entries, e => e.Name == "Discord" && e.Source == StartupSource.RegistryRun && e.Scope == StartupScope.CurrentUser && e.Signed == true);
        Assert.Contains(entries, e => e.Name == "SecurityHealth" && e.Scope == StartupScope.AllUsers && e.IsCritical);
        Assert.Contains(entries, e => e.Name == "Spotify" && e.Source == StartupSource.StartupFolder);
        Assert.Contains(entries, e => e.Name == "Adobe Acrobat Update Task" && e.Source == StartupSource.ScheduledTask);
        Assert.DoesNotContain(entries, e => e.Name == "ScheduledDefrag"); // OS maintenance task, not startup
        Assert.All(entries, e => Assert.StartsWith("st-", e.Id));
        Assert.Equal("known application profile", entries.Single(e => e.Name == "Discord").ImpactBasis);
    }

    [Fact]
    public void StartupApproved_disabled_flag_is_honoured()
    {
        var p = SimulatedPlatform.CreateSampleMachine();
        p.Reg.Seed(@"HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run", "Steam", RegValue.Binary([3, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8]));
        using var host = new TestHost(p);
        var e = host.Engine.Startup.GetEntries();
        Assert.False(e.Single(x => x.Name == "Steam").Enabled);
        Assert.True(e.Single(x => x.Name == "OneDrive").Enabled); // 02 = enabled
    }

    [Fact]
    public async Task Toggling_a_scheduled_task_requires_admin_and_critical_entries_are_refused()
    {
        using var host = new TestHost();
        var task = host.Engine.Startup.GetEntries().Single(e => e.Source == StartupSource.ScheduledTask);
        var r = await host.Engine.ExecuteOptimizationAsync(new ExecuteOptimizationRequest([$"startup:{task.Id}:off"]));
        Assert.Equal(TransactionStatus.ElevationRequired, r.Status);

        var critical = host.Engine.Startup.GetEntries().Single(e => e.Name == "SecurityHealth");
        var refused = await host.Engine.ExecuteOptimizationAsync(new ExecuteOptimizationRequest([$"startup:{critical.Id}:off"]));
        Assert.Equal(TransactionStatus.Failed, refused.Status);
        Assert.Contains(refused.Messages, m => m.Contains("critical"));
    }
}
