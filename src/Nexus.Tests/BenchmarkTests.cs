using Nexus.Contracts;
using Nexus.Engine.Benchmark;
using Nexus.Platform;

namespace Nexus.Tests;

public class BenchmarkCalculationTests
{
    [Fact]
    public void Constant_frametime_gives_exact_values()
    {
        var m = FrameMetricsCalculator.Calculate(Enumerable.Repeat(10.0, 1000).ToList())!;
        Assert.Equal(1000, m.FrameCount);
        Assert.Equal(100, m.AverageFps.Value!.Value, 6);
        Assert.Equal(100, m.OnePercentLowFps.Value!.Value, 6);
        Assert.Equal(100, m.PointOnePercentLowFps.Value!.Value, 6);
        Assert.Equal(10, m.P99FrametimeMs.Value!.Value, 6);
        Assert.Equal(0, m.FrametimeStdDevMs.Value!.Value, 6);
        Assert.Equal(10, m.DurationSeconds, 6);
    }

    [Fact]
    public void Lows_average_the_slowest_frames()
    {
        // 990 frames at 10 ms + 10 frames at 50 ms → worst 1% (10 frames) average 50 ms → 20 fps.
        var frames = Enumerable.Repeat(10.0, 990).Concat(Enumerable.Repeat(50.0, 10)).ToList();
        var m = FrameMetricsCalculator.Calculate(frames)!;
        Assert.Equal(20, m.OnePercentLowFps.Value!.Value, 6);
        Assert.Equal(20, m.PointOnePercentLowFps.Value!.Value, 6); // worst 0.1% = 1 frame of 50 ms
        Assert.Equal(1000 / (frames.Sum() / frames.Count), m.AverageFps.Value!.Value, 6);
        Assert.Equal(10, m.P99FrametimeMs.Value!.Value, 6); // nearest-rank P99 = 990th value
    }

    [Fact]
    public void Small_captures_flag_the_statistically_weak_point_one_percent_low()
    {
        var m = FrameMetricsCalculator.Calculate(Enumerable.Repeat(16.0, 200).ToList())!;
        Assert.NotNull(m.PointOnePercentLowFps.Note);
    }

    [Fact]
    public void Too_few_frames_yield_no_metrics()
    {
        Assert.Null(FrameMetricsCalculator.Calculate([]));
        Assert.Null(FrameMetricsCalculator.Calculate([16.6]));
    }

    [Theory]
    [InlineData(new double[] { 1, 2, 3, 4, 5, 6, 7, 8, 9, 10 }, 0.5, 5)]
    [InlineData(new double[] { 1, 2, 3, 4, 5, 6, 7, 8, 9, 10 }, 0.99, 10)]
    [InlineData(new double[] { 7 }, 0.99, 7)]
    public void Percentile_uses_nearest_rank(double[] data, double p, double expected) =>
        Assert.Equal(expected, FrameMetricsCalculator.Percentile(data, p));

    [Fact]
    public void Csv_parser_reads_presentmon_and_capframex_formats()
    {
        var presentMon = "Application,ProcessID,SwapChainAddress,Runtime,SyncInterval,PresentFlags,Dropped,TimeInSeconds,MsBetweenPresents\n" +
                         "game.exe,1,0x0,DXGI,0,0,0,0.1,16.5\ngame.exe,1,0x0,DXGI,0,0,0,0.2,17.1\n";
        Assert.Equal([16.5, 17.1], FrameTimeCsvParser.Parse(new StringReader(presentMon)));

        var v2 = "Application,ProcessID,FrameTime,CPUBusy\ngame.exe,1,8.3,2.1\ngame.exe,1,8.4,2.0\ngame.exe,1,bad,2.0\n";
        Assert.Equal([8.3, 8.4], FrameTimeCsvParser.Parse(new StringReader(v2)));

        Assert.Throws<FormatException>(() => FrameTimeCsvParser.Parse(new StringReader("a,b\n1,2\n")));
    }

    private static BenchmarkResult Run(string id, double fps, double low) =>
        new(id, id, "g", "game.exe", DateTimeOffset.UtcNow, DateTimeOffset.UtcNow.AddSeconds(60), "test",
            new FrameMetrics(1000, 60, MetricValue.Of(fps, "fps"), MetricValue.Of(low, "fps"), MetricValue.Of(low * 0.8, "fps"),
                MetricValue.Of(1000 / fps, "ms"), MetricValue.Of(1000 / low, "ms"), MetricValue.Of(1, "ms"), "m"),
            new SystemLoadMetrics(MetricValue.Of(50, "%"), MetricValue.Of(90, "%"), MetricValue.Of(8e9, "B"), MetricValue.Of(4e9, "B"),
                MetricValue.Missing("°C", "n/a"), MetricValue.Missing("°C", "n/a")), null, []);

    [Fact]
    public void Changes_within_noise_are_not_reported_as_improvements()
    {
        var c = BenchmarkEngine.CompareRuns(Run("a", 100, 70), Run("b", 101.5, 70.5), 3);
        Assert.Equal(ComparisonVerdict.NoSignificantChange, c.Verdict);
    }

    [Fact]
    public void Clear_improvement_is_likely_but_never_confirmed_from_single_runs()
    {
        var c = BenchmarkEngine.CompareRuns(Run("a", 100, 70), Run("b", 112, 80), 3);
        Assert.Equal(ComparisonVerdict.Improved, c.Verdict);
        Assert.Equal(Confidence.Likely, c.Confidence);
        Assert.Contains("Single-run", c.Explanation);
        Assert.Equal(12, c.Deltas.Single(d => d.Metric == "Average FPS").DeltaPercent!.Value, 6);
    }

    [Fact]
    public void Regression_and_conflicting_signals_are_reported_honestly()
    {
        Assert.Equal(ComparisonVerdict.Regressed, BenchmarkEngine.CompareRuns(Run("a", 100, 70), Run("b", 90, 60), 3).Verdict);
        Assert.Equal(ComparisonVerdict.Inconclusive, BenchmarkEngine.CompareRuns(Run("a", 100, 70), Run("b", 110, 60), 3).Verdict);
    }

    [Fact]
    public void Missing_fps_makes_comparison_inconclusive()
    {
        var noFrames = Run("b", 100, 70) with { Frames = null };
        var c = BenchmarkEngine.CompareRuns(Run("a", 100, 70), noFrames, 3);
        Assert.Equal(ComparisonVerdict.Inconclusive, c.Verdict);
        Assert.Equal(Confidence.Unknown, c.Confidence);
    }

    [Fact]
    public async Task Benchmark_engine_runs_saves_and_compares()
    {
        using var host = new TestHost();
        var events = new List<EngineEventType>();
        using var _ = host.Engine.Events.Subscribe(e => { lock (events) events.Add(e.Type); });
        var a = await host.Engine.RunBenchmarkAsync(new BenchmarkRequest("baseline", TimeSpan.FromSeconds(3), "Cyberpunk2077.exe"));
        host.Platform.Frames.MeanFrameTimeMs = 1000.0 / 140;
        var b = await host.Engine.RunBenchmarkAsync(new BenchmarkRequest("after", TimeSpan.FromSeconds(3), "Cyberpunk2077.exe"));

        Assert.NotNull(a.Frames);
        Assert.InRange(a.Frames!.AverageFps.Value!.Value, 110, 130);
        Assert.Equal(2, host.Engine.Benchmarks.GetResults().Count(r => r.BenchmarkId == a.BenchmarkId || r.BenchmarkId == b.BenchmarkId));
        var cmp = host.Engine.Benchmarks.CompareRuns(a.BenchmarkId, b.BenchmarkId);
        Assert.Equal(ComparisonVerdict.Improved, cmp.Verdict);
        lock (events)
        {
            Assert.Contains(EngineEventType.BenchmarkStarted, events);
            Assert.Contains(EngineEventType.BenchmarkUpdated, events);
            Assert.Contains(EngineEventType.BenchmarkCompleted, events);
        }
    }

    [Fact]
    public async Task Without_a_frame_source_no_fps_is_invented()
    {
        using var host = new TestHost();
        var r = await host.Engine.RunBenchmarkAsync(new BenchmarkRequest("load only", TimeSpan.FromSeconds(2)));
        Assert.Null(r.Frames);
        Assert.Equal("none", r.FrameSource);
        Assert.Contains(r.Notes, n => n.Contains("no FPS"));
        Assert.Equal(SensorAvailability.Available, r.Load.CpuUsageAvg.Availability);
    }
}
