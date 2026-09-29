using Nexus.Contracts;
using Nexus.Data.Configuration;
using Nexus.Engine.Diagnostics;

namespace Nexus.Tests;

public class DiagnosticEngineTests
{
    private static readonly DiagnosticEngine Engine = new(new NexusConfiguration(), []);

    private static HardwareSample Sample(double cpu, double? gpu, double maxCore = -1, double memFraction = 0.5, double disk = 5, double? cpuTemp = null, double freq = 4000)
    {
        var now = DateTimeOffset.UtcNow;
        SensorReading R(double v, string u) => SensorReading.Of(v, u, "test");
        var total = 16e9;
        return new HardwareSample(now,
            new CpuTelemetry(R(cpu, "%"), R(maxCore < 0 ? cpu : maxCore, "%"), R(freq, "MHz"),
                cpuTemp is { } t ? R(t, "°C") : SensorReading.Missing("°C", "test"), 8, 16),
            [new GpuTelemetry("gpu", gpu is { } g ? R(g, "%") : SensorReading.Missing("%", "test"), SensorReading.Missing("°C", "test"),
                SensorReading.Missing("MHz", "test"), SensorReading.Missing("B", "test"), SensorReading.Missing("B", "test"), SensorReading.Missing("W", "test"))],
            new MemoryTelemetry(R(total, "B"), R(total * memFraction, "B"), R(total * (1 - memFraction), "B"), R(50, "%")),
            [new StorageTelemetry("C:", R(1e12, "B"), R(5e11, "B"), R(disk, "%"), R(100, "%"), SensorReading.Missing("°C", "test"))],
            []);
    }

    private static List<HardwareSample> Many(int n, Func<int, HardwareSample> f) => Enumerable.Range(0, n).Select(f).ToList();

    [Fact]
    public void Gpu_saturated_with_moderate_cpu_over_enough_samples_is_confirmed()
    {
        var b = Engine.AssessBottleneck(Many(10, _ => Sample(cpu: 42, gpu: 98)));
        Assert.Equal(Bottleneck.Gpu, b.Primary);
        Assert.Equal(Confidence.Confirmed, b.Confidence);
        Assert.True(b.SystemUnderLoad);
        Assert.Contains("GPU utilization", b.Explanation);
    }

    [Fact]
    public void Same_pattern_with_few_samples_is_only_likely()
    {
        var b = Engine.AssessBottleneck(Many(2, _ => Sample(cpu: 42, gpu: 98)));
        Assert.Equal(Bottleneck.Gpu, b.Primary);
        Assert.Equal(Confidence.Likely, b.Confidence);
    }

    [Fact]
    public void Cpu_bound_without_gpu_telemetry_is_never_confirmed()
    {
        var b = Engine.AssessBottleneck(Many(10, _ => Sample(cpu: 95, gpu: null)));
        Assert.Equal(Bottleneck.Cpu, b.Primary);
        Assert.Equal(Confidence.Possible, b.Confidence);
        Assert.Contains("cannot be ruled out", b.Explanation);
    }

    [Fact]
    public void Cpu_bound_with_gpu_headroom_is_confirmed()
    {
        var b = Engine.AssessBottleneck(Many(10, _ => Sample(cpu: 92, gpu: 55)));
        Assert.Equal(Bottleneck.Cpu, b.Primary);
        Assert.Equal(Confidence.Confirmed, b.Confidence);
    }

    [Fact]
    public void Single_thread_limit_is_an_inference_and_at_most_likely()
    {
        var b = Engine.AssessBottleneck(Many(10, _ => Sample(cpu: 30, gpu: 60, maxCore: 99)));
        Assert.Equal(Bottleneck.CpuSingleThread, b.Primary);
        Assert.Equal(Confidence.Likely, b.Confidence);
    }

    [Fact]
    public void Idle_system_reports_no_bottleneck_with_unknown_confidence()
    {
        var b = Engine.AssessBottleneck(Many(10, _ => Sample(cpu: 5, gpu: 3)));
        Assert.Equal(Bottleneck.None, b.Primary);
        Assert.Equal(Confidence.Unknown, b.Confidence);
        Assert.False(b.SystemUnderLoad);
    }

    [Fact]
    public void Both_saturated_is_only_possible()
    {
        var b = Engine.AssessBottleneck(Many(10, _ => Sample(cpu: 96, gpu: 99)));
        Assert.Equal(Confidence.Possible, b.Confidence);
    }

    [Fact]
    public void Memory_pressure_is_likely()
    {
        var b = Engine.AssessBottleneck(Many(10, _ => Sample(cpu: 30, gpu: 20, memFraction: 0.95)));
        Assert.Equal(Bottleneck.Memory, b.Primary);
        Assert.Equal(Confidence.Likely, b.Confidence);
    }

    [Fact]
    public void No_samples_means_unknown()
    {
        var b = Engine.AssessBottleneck([]);
        Assert.Equal(Bottleneck.Unknown, b.Primary);
        Assert.Equal(Confidence.Unknown, b.Confidence);
    }

    [Fact]
    public void Hot_cpu_with_clock_drop_is_likely_throttling_without_drop_only_possible()
    {
        var snapWith = Snapshot(Many(6, i => Sample(cpu: 80, gpu: 50, cpuTemp: 96, freq: i < 3 ? 4500 : 2800)));
        var snapWithout = Snapshot(Many(6, _ => Sample(cpu: 80, gpu: 50, cpuTemp: 96, freq: 4500)));
        Assert.Equal(Confidence.Likely, Engine.Analyze(snapWith).Findings.Single(f => f.Id == "thermal.cpu-hot").Confidence);
        Assert.Equal(Confidence.Possible, Engine.Analyze(snapWithout).Findings.Single(f => f.Id == "thermal.cpu-hot").Confidence);
    }

    private static SystemSnapshot Snapshot(IReadOnlyList<HardwareSample> samples) =>
        new("S", DateTimeOffset.UtcNow, true, false, new OsInfo("W", "10", "1", "x64", false, null), new CpuInfo("c", "v", 8, 16, 4000), [],
            new MemoryInfo(16, 8, null, null), [], [], [], new PowerPlanInfo(Guid.Empty, "b", [], true, false), new GamingSettingsInfo(null, null, null, null),
            [], [], [], samples, []);
}
