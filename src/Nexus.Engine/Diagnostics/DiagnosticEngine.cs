using System.Globalization;
using Nexus.Contracts;
using Nexus.Data.Configuration;
using Nexus.Engine.Hardware;

namespace Nexus.Engine.Diagnostics;

/// <summary>Modules contribute area-specific findings (drivers, storage, memory, ...).</summary>
public interface IDiagnosticContributor
{
    IEnumerable<DiagnosticFinding> Analyze(SystemSnapshot snapshot, NexusConfiguration configuration);
}

/// <summary>
/// Turns raw measurements into diagnostics. Confidence semantics:
///   CONFIRMED — directly measured and sustained over enough samples (or a plain fact such as a setting value);
///   LIKELY    — strong evidence, but an alternative explanation cannot be excluded;
///   POSSIBLE  — weak or partial evidence (few samples, missing sensors);
///   UNKNOWN   — not enough data to say anything.
/// Hypotheses are never reported as facts.
/// </summary>
public sealed class DiagnosticEngine(NexusConfiguration config, IEnumerable<IDiagnosticContributor> contributors)
{
    private DiagnosticThresholds T => config.Diagnostics;

    public AnalysisReport Analyze(SystemSnapshot snapshot)
    {
        var findings = new List<DiagnosticFinding>();
        var bottleneck = AssessBottleneck(snapshot.UsageSamples);
        findings.AddRange(ThermalFindings(snapshot.UsageSamples));
        findings.AddRange(SensorAvailabilityFindings(snapshot.UsageSamples));
        foreach (var c in contributors)
        {
            try { findings.AddRange(c.Analyze(snapshot, config)); }
            catch (Exception ex)
            {
                findings.Add(new DiagnosticFinding($"diagnostics.contributor-error.{c.GetType().Name}", "A diagnostic module failed", "Engine",
                    Severity.Info, Confidence.Confirmed, ex.Message, [], []));
            }
        }
        var ordered = findings.OrderByDescending(f => f.Severity).ThenByDescending(f => f.Confidence).ToList();
        return new AnalysisReport(snapshot.Id, DateTimeOffset.UtcNow, bottleneck, ordered);
    }

    private static string P(double v) => v.ToString("F0", CultureInfo.InvariantCulture) + "%";

    public BottleneckAssessment AssessBottleneck(IReadOnlyList<HardwareSample> samples)
    {
        var n = samples.Count;
        if (n == 0)
            return new BottleneckAssessment(Bottleneck.Unknown, Confidence.Unknown, "No usage samples were collected.", [], 0, false);

        var cpu = samples.Where(s => s.Cpu.Utilization.HasValue).Select(s => s.Cpu.Utilization.Value!.Value).ToList();
        var core = samples.Where(s => s.Cpu.MaxCoreUtilization?.HasValue == true).Select(s => s.Cpu.MaxCoreUtilization!.Value!.Value).ToList();
        var gpu = samples.Select(HardwareEngine.GpuUtilization).OfType<double>().ToList();
        var mem = samples.Select(HardwareEngine.MemoryUsedPercent).OfType<double>().ToList();
        var disk = samples.Select(HardwareEngine.MaxDiskActive).OfType<double>().ToList();

        double Avg(List<double> l) => l.Count == 0 ? 0 : l.Average();
        double Frac(List<double> l, double thr) => l.Count == 0 ? 0 : (double)l.Count(v => v >= thr) / l.Count;

        var evidence = new List<Evidence>
        {
            new("CPU utilization (avg)", cpu.Count == 0 ? "unavailable" : P(Avg(cpu)), P(T.CpuHighPercent)),
            new("Busiest logical CPU (avg)", core.Count == 0 ? "unavailable" : P(Avg(core)), P(T.CoreSaturationPercent)),
            new("GPU utilization (avg)", gpu.Count == 0 ? "unavailable" : P(Avg(gpu)), P(T.GpuSaturationPercent)),
            new("RAM in use (avg)", mem.Count == 0 ? "unavailable" : P(Avg(mem)), P(T.MemoryHighPercent)),
            new("Disk active time (avg)", disk.Count == 0 ? "unavailable" : P(Avg(disk)), P(T.DiskActiveHighPercent)),
            new("Samples", n.ToString(CultureInfo.InvariantCulture), T.MinSamplesForConfirmed.ToString(CultureInfo.InvariantCulture)),
        };

        var enough = n >= T.MinSamplesForConfirmed;
        var gpuKnown = gpu.Count > 0;
        var underLoad = Avg(cpu) >= T.LoadThresholdPercent || Avg(gpu) >= T.LoadThresholdPercent || Avg(core) >= 90 || Avg(disk) >= T.DiskActiveHighPercent || Avg(mem) >= T.MemoryHighPercent;

        BottleneckAssessment Result(Bottleneck b, Confidence c, string why) => new(b, c, why, evidence, n, underLoad);

        if (!underLoad)
            return Result(Bottleneck.None, Confidence.Unknown,
                "The system was not under significant load while sampling. A bottleneck can only be identified while a demanding workload (for example a game) is running.");

        var gpuSat = Frac(gpu, T.GpuSaturationPercent) >= T.SustainedFraction;
        var cpuHigh = Frac(cpu, T.CpuHighPercent) >= T.SustainedFraction;
        var coreSat = Frac(core, T.CoreSaturationPercent) >= T.SustainedFraction;

        if (gpuSat && (cpuHigh || coreSat))
            return Result(Bottleneck.Gpu, Confidence.Possible,
                "Both the GPU and the CPU are near saturation. The workload is balanced; neither component can be singled out with confidence.");

        if (gpuSat)
            return Result(Bottleneck.Gpu, enough ? Confidence.Confirmed : Confidence.Likely,
                $"GPU utilization stayed at or above {P(T.GpuSaturationPercent)} in {P(Frac(gpu, T.GpuSaturationPercent) * 100)} of samples while CPU utilization remained moderate.");

        if (gpuKnown && Avg(gpu) >= T.GpuHighPercent && Avg(cpu) < T.CpuHighPercent)
            return Result(Bottleneck.Gpu, enough ? Confidence.Likely : Confidence.Possible,
                "GPU utilization is high on average but not consistently saturated.");

        if (cpuHigh)
            return Result(Bottleneck.Cpu, !gpuKnown ? Confidence.Possible : enough ? Confidence.Confirmed : Confidence.Likely,
                gpuKnown
                    ? $"CPU utilization stayed at or above {P(T.CpuHighPercent)} while the GPU had headroom ({P(Avg(gpu))} average)."
                    : "CPU utilization is sustained-high, but GPU utilization is unavailable so a GPU limit cannot be ruled out.");

        if (coreSat)
            return Result(Bottleneck.CpuSingleThread, gpuKnown ? Confidence.Likely : Confidence.Possible,
                "At least one logical CPU is saturated while overall CPU usage is moderate — typical of a main-thread-bound workload. " +
                "This is an inference from utilization patterns, not a direct measurement of the application's threads.");

        if (Avg(mem) >= T.MemoryHighPercent)
            return Result(Bottleneck.Memory, Confidence.Likely,
                "Physical memory is nearly exhausted; Windows is likely paging. Page-fault rates were not measured, so the impact is inferred.");

        if (Frac(disk, T.DiskActiveHighPercent) >= T.SustainedFraction)
            return Result(Bottleneck.Storage, enough ? Confidence.Likely : Confidence.Possible,
                "Storage was busy most of the time. Queue length and latency were not measured, so the impact is inferred.");

        return Result(Bottleneck.None, Confidence.Likely,
            "The system is under load but no component is saturated. The limit is probably elsewhere (frame limiter, V-Sync, engine or network).");
    }

    private IEnumerable<DiagnosticFinding> ThermalFindings(IReadOnlyList<HardwareSample> samples)
    {
        var temps = samples.Where(s => s.Cpu.Temperature.HasValue).Select(s => (Temp: s.Cpu.Temperature.Value!.Value, Freq: s.Cpu.Frequency.Value)).ToList();
        if (temps.Count > 0)
        {
            var max = temps.Max(t => t.Temp);
            if (max >= T.CpuTempHighCelsius)
            {
                var freqs = temps.Select(t => t.Freq).OfType<double>().ToList();
                var throttling = freqs.Count > 1 && freqs.Min() < freqs.Max() * 0.8;
                yield return new DiagnosticFinding("thermal.cpu-hot", "CPU temperature is high", "Thermal", Severity.High,
                    throttling ? Confidence.Likely : Confidence.Possible,
                    throttling
                        ? "CPU temperature reached a high level and clock speed dropped at the same time, which is consistent with thermal throttling."
                        : "CPU temperature reached a high level. No clock drop was observed, so throttling is not established.",
                    [new Evidence("CPU temperature (max)", $"{max:F0} °C", $"{T.CpuTempHighCelsius:F0} °C", samples[0].Cpu.Temperature.Source)], []);
            }
        }
        var gpuTemps = samples.SelectMany(s => s.Gpus).Where(g => g.Temperature.HasValue).Select(g => g.Temperature.Value!.Value).ToList();
        if (gpuTemps.Count > 0 && gpuTemps.Max() >= T.GpuTempHighCelsius)
            yield return new DiagnosticFinding("thermal.gpu-hot", "GPU temperature is high", "Thermal", Severity.Medium, Confidence.Possible,
                "GPU temperature is high. Modern GPUs manage clocks automatically; check case airflow and fan curves if performance drops over time.",
                [new Evidence("GPU temperature (max)", $"{gpuTemps.Max():F0} °C", $"{T.GpuTempHighCelsius:F0} °C")], []);
    }

    private static IEnumerable<DiagnosticFinding> SensorAvailabilityFindings(IReadOnlyList<HardwareSample> samples)
    {
        if (samples.Count == 0) yield break;
        var s = samples[^1];
        var missing = new List<Evidence>();
        void Check(string name, SensorReading r) { if (!r.HasValue) missing.Add(new Evidence(name, r.Availability.ToString(), null, r.Source)); }
        Check("CPU temperature", s.Cpu.Temperature);
        foreach (var g in s.Gpus) { Check($"{g.Name} utilization", g.Utilization); Check($"{g.Name} temperature", g.Temperature); }
        foreach (var d in s.Storage) Check($"{d.Drive} temperature", d.Temperature);
        if (missing.Count > 0)
            yield return new DiagnosticFinding("sensors.unavailable", "Some sensors are not available", "Hardware", Severity.Info, Confidence.Confirmed,
                "These readings are not exposed on this system (or need administrator rights). Nexus reports them as unavailable instead of estimating them.",
                missing, []);
    }
}
