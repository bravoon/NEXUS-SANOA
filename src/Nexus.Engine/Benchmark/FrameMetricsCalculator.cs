using Nexus.Contracts;

namespace Nexus.Engine.Benchmark;

/// <summary>
/// Frame-time statistics. Definitions (stated in every result):
///   Average FPS = frames / total time (= 1000 / mean frame time);
///   1% / 0.1% low = 1000 / mean of the slowest 1% / 0.1% of frame times;
///   P99 frame time = 99th percentile (nearest-rank).
/// </summary>
public static class FrameMetricsCalculator
{
    public const string Methodology =
        "Avg FPS = frames / total time. 1% and 0.1% low = 1000 / average of the slowest 1% / 0.1% frame times. P99 = nearest-rank 99th percentile frame time.";

    public static FrameMetrics? Calculate(IReadOnlyList<double> frameTimesMs)
    {
        var ft = frameTimesMs.Where(f => f > 0 && double.IsFinite(f)).ToArray();
        if (ft.Length < 2) return null;
        var total = ft.Sum();
        var mean = total / ft.Length;
        var sortedDesc = ft.OrderByDescending(x => x).ToArray();
        var sortedAsc = sortedDesc.Reverse().ToArray();

        double LowFps(double fraction)
        {
            var n = Math.Max(1, (int)Math.Ceiling(ft.Length * fraction));
            return 1000.0 / sortedDesc.Take(n).Average();
        }

        var p99 = Percentile(sortedAsc, 0.99);
        var variance = ft.Sum(x => (x - mean) * (x - mean)) / (ft.Length - 1);
        var pointOne = ft.Length >= 1000
            ? MetricValue.Of(LowFps(0.001), "fps")
            : new MetricValue(LowFps(0.001), "fps", SensorAvailability.Available, "Fewer than 1000 frames: 0.1% low is based on a single frame and is statistically weak.");

        return new FrameMetrics(ft.Length, total / 1000.0,
            MetricValue.Of(ft.Length / (total / 1000.0), "fps"),
            MetricValue.Of(LowFps(0.01), "fps"),
            pointOne,
            MetricValue.Of(mean, "ms"),
            MetricValue.Of(p99, "ms"),
            MetricValue.Of(Math.Sqrt(variance), "ms"),
            Methodology);
    }

    /// <summary>Nearest-rank percentile on an ascending array.</summary>
    public static double Percentile(double[] ascending, double p)
    {
        if (ascending.Length == 0) return double.NaN;
        var rank = (int)Math.Ceiling(p * ascending.Length);
        return ascending[Math.Clamp(rank - 1, 0, ascending.Length - 1)];
    }
}
