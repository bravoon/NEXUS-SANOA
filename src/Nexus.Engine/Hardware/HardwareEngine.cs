using Nexus.Contracts;
using Nexus.Platform.Abstractions;

namespace Nexus.Engine.Hardware;

/// <summary>
/// Collects CPU / GPU / RAM / storage / network telemetry. Each value carries unit, timestamp, source and
/// availability; missing sensors are reported as missing, never guessed.
/// </summary>
public sealed class HardwareEngine(IHardwareSensorProvider sensors)
{
    public HardwareSample Sample(TimeSpan window, CancellationToken ct = default) => sensors.Sample(window, ct);

    public IReadOnlyList<HardwareSample> SampleSeries(TimeSpan duration, TimeSpan interval, Action<HardwareSample, int, int>? onSample = null, CancellationToken ct = default)
    {
        if (interval <= TimeSpan.Zero) interval = TimeSpan.FromSeconds(1);
        var count = Math.Max(1, (int)Math.Round(duration / interval));
        var samples = new List<HardwareSample>(count);
        for (var i = 0; i < count && !ct.IsCancellationRequested; i++)
        {
            var s = sensors.Sample(interval, ct);
            samples.Add(s);
            onSample?.Invoke(s, i + 1, count);
        }
        return samples;
    }

    /// <summary>Highest GPU utilisation among adapters that report one; null when no adapter exposes it.</summary>
    public static double? GpuUtilization(HardwareSample s) =>
        s.Gpus.Where(g => g.Utilization.HasValue).Select(g => g.Utilization.Value!.Value).DefaultIfEmpty(double.NaN).Max() is var v && double.IsNaN(v) ? null : v;

    public static double? MemoryUsedPercent(HardwareSample s) =>
        s.Memory.Used.HasValue && s.Memory.Total.HasValue && s.Memory.Total.Value > 0 ? s.Memory.Used.Value!.Value / s.Memory.Total.Value!.Value * 100 : null;

    public static double? MaxDiskActive(HardwareSample s) =>
        s.Storage.Where(d => d.ActiveTime.HasValue).Select(d => d.ActiveTime.Value!.Value).DefaultIfEmpty(double.NaN).Max() is var v && double.IsNaN(v) ? null : v;
}
