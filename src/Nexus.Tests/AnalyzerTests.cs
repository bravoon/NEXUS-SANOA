using Nexus.Contracts;
using Nexus.Platform.Abstractions;
using Nexus.Platform.Simulation;

namespace Nexus.Tests;

public class SystemAnalyzerTests
{
    [Fact]
    public async Task Scan_collects_every_area_of_the_machine()
    {
        using var host = new TestHost();
        var s = await host.ScanAsync();

        Assert.True(s.IsSimulated);
        Assert.Equal(8, s.Cpu.PhysicalCores);
        Assert.NotEmpty(s.Gpus);
        Assert.NotEmpty(s.Disks);
        Assert.NotEmpty(s.Processes);
        Assert.NotEmpty(s.Services);
        Assert.NotEmpty(s.Startup);
        Assert.NotEmpty(s.Drivers);
        Assert.Equal(5, s.UsageSamples.Count);
        Assert.Equal(WellKnownPowerSchemes.Balanced, s.Power.ActiveSchemeId);
        Assert.False(s.Gaming.GameModeEnabled);
        Assert.True(s.Gaming.GameDvrBackgroundRecording);
        Assert.False(s.Gaming.HardwareGpuScheduling);
        Assert.Empty(s.CollectionWarnings);
    }

    [Fact]
    public async Task Scan_never_modifies_the_system()
    {
        using var host = new TestHost();
        var before = host.Platform.Reg.WriteCount;
        var files = host.Platform.Fs.ExportFiles().Count;
        await host.ScanAsync();
        await host.Engine.AnalyzeSystemAsync();
        await host.Engine.GetRecommendationsAsync();
        await host.Engine.PreviewOptimizationAsync("gaming.enable-game-mode");

        Assert.Equal(before, host.Platform.Reg.WriteCount);
        Assert.Equal(files, host.Platform.Fs.ExportFiles().Count);
        Assert.Equal(WellKnownPowerSchemes.Balanced, host.Platform.Pwr.Active);
        Assert.Empty(host.Store.Transactions.List());
    }

    [Fact]
    public async Task Failing_collector_produces_a_warning_not_a_failed_scan()
    {
        var p = SimulatedPlatform.CreateSampleMachine();
        p.Svc.Items.Clear();
        using var host = new TestHost(new ThrowingDriversPlatform(p));
        var s = await host.ScanAsync();
        Assert.Contains(s.CollectionWarnings, w => w.StartsWith("drivers"));
        Assert.Empty(s.Drivers);
        Assert.NotEmpty(s.Processes);
    }

    [Fact]
    public async Task Pending_reboot_is_detected_from_the_registry()
    {
        var p = SimulatedPlatform.CreateSampleMachine();
        p.Reg.Seed(@"HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\WindowsUpdate\Auto Update\RebootRequired", "x", RegValue.DWord(1));
        using var host = new TestHost(p);
        var s = await host.ScanAsync();
        Assert.True(s.Os.PendingReboot);
        var report = await host.Engine.AnalyzeSystemAsync();
        Assert.Contains(report.Findings, f => f.Id == "windows.pending-reboot" && f.Confidence == Confidence.Confirmed);
    }

    [Fact]
    public async Task Missing_sensors_are_reported_as_unavailable_not_invented()
    {
        var p = SimulatedPlatform.CreateSampleMachine();
        p.Sens.CpuTemp = null;
        p.Sens.GpuTelemetryAvailable = false;
        using var host = new TestHost(p);
        var s = await host.ScanAsync();
        var sample = s.UsageSamples[0];
        Assert.False(sample.Cpu.Temperature.HasValue);
        Assert.Null(sample.Cpu.Temperature.Value);
        Assert.False(sample.Gpus[0].Utilization.HasValue);
        Assert.NotEqual(SensorAvailability.Available, sample.Gpus[0].Utilization.Availability);
        var report = await host.Engine.AnalyzeSystemAsync();
        Assert.Contains(report.Findings, f => f.Id == "sensors.unavailable");
    }

    /// <summary>Decorator whose driver inventory throws, to check collector isolation.</summary>
    private sealed class ThrowingDriversPlatform(SimulatedPlatform inner) : IPlatform
    {
        public string Name => inner.Name;
        public bool IsSimulated => true;
        public IRegistryAccessor Registry => inner.Registry;
        public IServiceManager Services => inner.Services;
        public IProcessManager Processes => inner.Processes;
        public ISignatureVerifier Signatures => inner.Signatures;
        public IPowerManager Power => inner.Power;
        public ITaskSchedulerAccessor Tasks => inner.Tasks;
        public IFileSystem Files => inner.Files;
        public IHardwareSensorProvider Sensors => inner.Sensors;
        public ISystemInfoProvider SystemInfo { get; } = new Info(inner.Info);
        public IPrivilegeProvider Privileges => inner.Privileges;
        public IRestorePointProvider RestorePoints => inner.RestorePoints;
        public IFrameTimeSource FrameTimes => inner.FrameTimes;

        private sealed class Info(SimulatedSystemInfo i) : ISystemInfoProvider
        {
            public OsInfo GetOs() => i.GetOs();
            public CpuInfo GetCpu() => i.GetCpu();
            public IReadOnlyList<GpuInfo> GetGpus() => i.GetGpus();
            public MemoryInfo GetMemory() => i.GetMemory();
            public IReadOnlyList<DiskInfo> GetDisks() => i.GetDisks();
            public IReadOnlyList<NetworkAdapterInfo> GetNetworkAdapters() => i.GetNetworkAdapters();
            public IReadOnlyList<DriverInfo> GetDrivers() => throw new UnauthorizedAccessException("WMI access denied");
        }
    }
}
