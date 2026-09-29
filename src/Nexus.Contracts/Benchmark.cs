namespace Nexus.Contracts;

public sealed record BenchmarkRequest(
    string Name,
    TimeSpan Duration,
    string? ProcessName = null,
    string? GameId = null,
    string? FrameTimeCsvPath = null,
    TimeSpan? SampleInterval = null);

public sealed record MetricValue(double? Value, string Unit, SensorAvailability Availability, string? Note = null)
{
    public static MetricValue Of(double value, string unit) => new(value, unit, SensorAvailability.Available);
    public static MetricValue Missing(string unit, string note) => new(null, unit, SensorAvailability.Unavailable, note);
}

public sealed record FrameMetrics(
    int FrameCount,
    double DurationSeconds,
    MetricValue AverageFps,
    MetricValue OnePercentLowFps,
    MetricValue PointOnePercentLowFps,
    MetricValue AverageFrametimeMs,
    MetricValue P99FrametimeMs,
    MetricValue FrametimeStdDevMs,
    string Methodology);

public sealed record SystemLoadMetrics(
    MetricValue CpuUsageAvg,
    MetricValue GpuUsageAvg,
    MetricValue RamUsedAvg,
    MetricValue VramUsedAvg,
    MetricValue CpuTempMax,
    MetricValue GpuTempMax);

public sealed record BenchmarkResult(
    string BenchmarkId,
    string Name,
    string? GameId,
    string? ProcessName,
    DateTimeOffset StartedAt,
    DateTimeOffset EndedAt,
    string FrameSource,
    FrameMetrics? Frames,
    SystemLoadMetrics Load,
    string? ActiveProfile,
    IReadOnlyList<string> Notes);

public sealed record MetricDelta(string Metric, double? Baseline, double? Candidate, double? DeltaPercent, bool HigherIsBetter);

public sealed record BenchmarkComparison(
    string BaselineId,
    string CandidateId,
    IReadOnlyList<MetricDelta> Deltas,
    ComparisonVerdict Verdict,
    Confidence Confidence,
    string Explanation);
