using System.Collections.Concurrent;
using Nexus.Contracts;
using Nexus.Data.Logging;
using Nexus.Data.Repositories;
using Nexus.Engine.Core;
using Nexus.Engine.Hardware;
using Nexus.Platform;
using Nexus.Platform.Abstractions;

namespace Nexus.Engine.Benchmark;

/// <summary>
/// Measures instead of assuming. Captures frame times (PresentMon or an imported CSV) plus system load,
/// computes statistics and compares runs with an explicit noise threshold.
/// </summary>
public sealed class BenchmarkEngine(
    HardwareEngine hardware,
    IFrameTimeSource frameSource,
    BenchmarkRepository repository,
    SettingsRepository settings,
    EngineEventBus events,
    INexusLogger log,
    double noiseThresholdPercent)
{
    private sealed class Running(BenchmarkRequest request, CancellationTokenSource cts)
    {
        public BenchmarkRequest Request { get; } = request;
        public CancellationTokenSource Cts { get; } = cts;
        public Task<BenchmarkResult>? Task { get; set; }
    }

    private readonly ConcurrentDictionary<string, Running> _running = new();

    public string StartBenchmark(BenchmarkRequest request)
    {
        if (request.Duration <= TimeSpan.Zero || request.Duration > TimeSpan.FromHours(2))
            throw new ArgumentException("Benchmark duration must be between 1 second and 2 hours.");
        var id = Ids.New("BM-");
        var run = new Running(request, new CancellationTokenSource());
        _running[id] = run;
        run.Task = Task.Run(() => RunCore(id, run));
        return id;
    }

    public async Task<BenchmarkResult?> StopBenchmark(string id)
    {
        if (!_running.TryGetValue(id, out var run)) return repository.Get(id);
        run.Cts.Cancel();
        return run.Task is null ? null : await run.Task.ConfigureAwait(false);
    }

    public async Task<BenchmarkResult> RunAsync(BenchmarkRequest request, CancellationToken ct = default)
    {
        var id = StartBenchmark(request);
        using var reg = ct.Register(() => _running.GetValueOrDefault(id)?.Cts.Cancel());
        return await _running[id].Task!.ConfigureAwait(false);
    }

    public IReadOnlyList<string> RunningIds => _running.Keys.ToList();

    private async Task<BenchmarkResult> RunCore(string id, Running run)
    {
        var req = run.Request;
        var ct = run.Cts.Token;
        var started = DateTimeOffset.UtcNow;
        var notes = new List<string>();
        events.Publish(EngineEventType.BenchmarkStarted, $"Benchmark '{req.Name}' started", id, 0, new { benchmarkId = id, req.Name, req.ProcessName });
        try
        {
            // Frame source: imported CSV > live capture of a process > none (system-load only).
            Task<IReadOnlyList<double>> frames;
            string source;
            if (req.FrameTimeCsvPath is not null)
            {
                source = $"CSV import ({Path.GetFileName(req.FrameTimeCsvPath)})";
                frames = Task.Run(() =>
                {
                    using var r = new StreamReader(req.FrameTimeCsvPath);
                    return FrameTimeCsvParser.Parse(r);
                }, ct);
            }
            else if (req.ProcessName is not null && frameSource.IsAvailable)
            {
                source = frameSource.Name;
                frames = frameSource.CaptureAsync(req.ProcessName, req.Duration, ct);
            }
            else
            {
                source = "none";
                frames = Task.FromResult<IReadOnlyList<double>>([]);
                notes.Add(req.ProcessName is null
                    ? "No target process: only system load was measured (no FPS)."
                    : $"Frame capture unavailable ({frameSource.Name} not installed): FPS metrics cannot be measured.");
            }

            var samples = new List<HardwareSample>();
            var interval = req.SampleInterval ?? TimeSpan.FromSeconds(1);
            var sampleDuration = req.FrameTimeCsvPath is not null ? TimeSpan.Zero : req.Duration;
            if (sampleDuration > TimeSpan.Zero)
            {
                try
                {
                    hardware.SampleSeries(sampleDuration, interval, (s, i, n) =>
                    {
                        samples.Add(s);
                        events.Publish(EngineEventType.BenchmarkUpdated, $"Sample {i}/{n}", id, (double)i / n, s);
                    }, ct);
                }
                catch (OperationCanceledException) { notes.Add("Stopped early by request."); }
            }

            IReadOnlyList<double> ft;
            try { ft = await frames.ConfigureAwait(false); }
            catch (OperationCanceledException) { ft = []; }
            catch (Exception ex) { ft = []; notes.Add($"Frame capture failed: {ex.Message}"); log.Warning("Benchmark", $"Frame capture failed: {ex.Message}", id); }

            var metrics = CalculateMetrics(ft);
            if (metrics is null && source != "none") notes.Add("Not enough frames were captured to compute FPS metrics.");
            var result = new BenchmarkResult(id, req.Name, req.GameId, req.ProcessName, started, DateTimeOffset.UtcNow, source, metrics,
                LoadMetrics(samples), settings.Get(Profiles.ProfileEngine.ActiveProfileKey), notes);
            SaveResult(result);
            events.Publish(EngineEventType.BenchmarkCompleted, $"Benchmark '{req.Name}' completed", id, 1, result);
            return result;
        }
        finally
        {
            _running.TryRemove(id, out _);
            run.Cts.Dispose();
        }
    }

    public static FrameMetrics? CalculateMetrics(IReadOnlyList<double> frameTimesMs) => FrameMetricsCalculator.Calculate(frameTimesMs);

    public static SystemLoadMetrics LoadMetrics(IReadOnlyList<HardwareSample> samples)
    {
        static MetricValue Avg(IEnumerable<double> v, string unit, string what)
        {
            var l = v.ToList();
            return l.Count == 0 ? MetricValue.Missing(unit, $"{what} not available") : MetricValue.Of(l.Average(), unit);
        }
        static MetricValue Max(IEnumerable<double> v, string unit, string what)
        {
            var l = v.ToList();
            return l.Count == 0 ? MetricValue.Missing(unit, $"{what} not available") : MetricValue.Of(l.Max(), unit);
        }
        return new SystemLoadMetrics(
            Avg(samples.Where(s => s.Cpu.Utilization.HasValue).Select(s => s.Cpu.Utilization.Value!.Value), "%", "CPU usage"),
            Avg(samples.Select(HardwareEngine.GpuUtilization).OfType<double>(), "%", "GPU usage"),
            Avg(samples.Where(s => s.Memory.Used.HasValue).Select(s => s.Memory.Used.Value!.Value), "B", "RAM usage"),
            Avg(samples.SelectMany(s => s.Gpus).Where(g => g.VramUsed.HasValue).Select(g => g.VramUsed.Value!.Value), "B", "VRAM usage"),
            Max(samples.Where(s => s.Cpu.Temperature.HasValue).Select(s => s.Cpu.Temperature.Value!.Value), "°C", "CPU temperature"),
            Max(samples.SelectMany(s => s.Gpus).Where(g => g.Temperature.HasValue).Select(g => g.Temperature.Value!.Value), "°C", "GPU temperature"));
    }

    public void SaveResult(BenchmarkResult result) => repository.Save(result);
    public IReadOnlyList<BenchmarkResult> GetResults(int take = 50) => repository.List(take);
    public BenchmarkResult? Get(string id) => repository.Get(id);

    public BenchmarkComparison CompareRuns(string baselineId, string candidateId)
    {
        var a = repository.Get(baselineId) ?? throw new KeyNotFoundException($"Benchmark {baselineId} not found.");
        var b = repository.Get(candidateId) ?? throw new KeyNotFoundException($"Benchmark {candidateId} not found.");
        return CompareRuns(a, b, noiseThresholdPercent);
    }

    /// <summary>
    /// Single runs cannot estimate run-to-run variance, so the verdict is at most LIKELY and changes smaller
    /// than the noise threshold are reported as "no significant change".
    /// </summary>
    public static BenchmarkComparison CompareRuns(BenchmarkResult a, BenchmarkResult b, double noisePercent)
    {
        static double? V(MetricValue? m) => m?.Availability == SensorAvailability.Available ? m.Value : null;
        static MetricDelta D(string name, double? x, double? y, bool higherIsBetter) =>
            new(name, x, y, x is { } bx && y is { } by && bx != 0 ? (by - bx) / bx * 100 : null, higherIsBetter);

        var deltas = new List<MetricDelta>
        {
            D("Average FPS", V(a.Frames?.AverageFps), V(b.Frames?.AverageFps), true),
            D("1% low FPS", V(a.Frames?.OnePercentLowFps), V(b.Frames?.OnePercentLowFps), true),
            D("0.1% low FPS", V(a.Frames?.PointOnePercentLowFps), V(b.Frames?.PointOnePercentLowFps), true),
            D("P99 frame time", V(a.Frames?.P99FrametimeMs), V(b.Frames?.P99FrametimeMs), false),
            D("CPU usage", V(a.Load.CpuUsageAvg), V(b.Load.CpuUsageAvg), false),
            D("GPU usage", V(a.Load.GpuUsageAvg), V(b.Load.GpuUsageAvg), true),
            D("CPU temperature (max)", V(a.Load.CpuTempMax), V(b.Load.CpuTempMax), false),
        };

        var avg = deltas[0].DeltaPercent;
        var low = deltas[1].DeltaPercent;
        if (avg is null || low is null)
            return new BenchmarkComparison(a.BenchmarkId, b.BenchmarkId, deltas, ComparisonVerdict.Inconclusive, Confidence.Unknown,
                "FPS metrics are missing in at least one run; performance cannot be compared.");

        var notes = new List<string>();
        if (a.ProcessName != b.ProcessName || a.GameId != b.GameId) notes.Add("The runs measured different targets.");
        if (Math.Abs((a.EndedAt - a.StartedAt).TotalSeconds - (b.EndedAt - b.StartedAt).TotalSeconds) > 5) notes.Add("Run durations differ.");

        int Dir(double d) => Math.Abs(d) < noisePercent ? 0 : Math.Sign(d);
        var (da, dl) = (Dir(avg.Value), Dir(low.Value));
        ComparisonVerdict verdict;
        Confidence confidence;
        string why;
        if (da == 0 && dl == 0)
        {
            (verdict, confidence) = (ComparisonVerdict.NoSignificantChange, Confidence.Likely);
            why = $"Average FPS changed {avg:+0.0;-0.0}% and 1% low {low:+0.0;-0.0}%, both within the ±{noisePercent}% noise threshold.";
        }
        else if (da * dl < 0)
        {
            (verdict, confidence) = (ComparisonVerdict.Inconclusive, Confidence.Possible);
            why = "Average FPS and 1% low moved in opposite directions.";
        }
        else
        {
            var dir = da != 0 ? da : dl;
            verdict = dir > 0 ? ComparisonVerdict.Improved : ComparisonVerdict.Regressed;
            var strong = Math.Abs(avg.Value) >= 2 * noisePercent || Math.Abs(low.Value) >= 2 * noisePercent;
            confidence = strong && notes.Count == 0 ? Confidence.Likely : Confidence.Possible;
            why = $"Average FPS {avg:+0.0;-0.0}%, 1% low {low:+0.0;-0.0}% (noise threshold ±{noisePercent}%). Single-run comparison: repeat both runs to confirm.";
        }
        if (notes.Count > 0) why += " " + string.Join(" ", notes);
        return new BenchmarkComparison(a.BenchmarkId, b.BenchmarkId, deltas, verdict, confidence, why);
    }
}
