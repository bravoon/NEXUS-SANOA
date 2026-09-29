using Nexus.Contracts;
using Nexus.Data.Configuration;
using Nexus.Platform.Abstractions;
using Nexus.Platform.Changes;
using Nexus.Engine.Core;

namespace Nexus.Engine.Processes;

/// <summary>Enumerates, measures and classifies processes. Never terminates anything on its own.</summary>
public sealed class ProcessEngine
{
    private readonly IPlatform _platform;
    private readonly ProcessClassifier _classifier;

    public ProcessEngine(IPlatform platform, NexusConfiguration config)
    {
        _platform = platform;
        _classifier = new ProcessClassifier(config.ProtectedProcesses, SystemLocations.From(platform.Files), platform.Processes.CurrentProcessId);
    }

    public ProcessClassifier Classifier => _classifier;

    public ProtectionVerdict EvaluateProtection(ProcessFacts p) => _classifier.EvaluateProtection(p);

    public IReadOnlyList<ProcessInfo> GetProcesses(TimeSpan measurementWindow, CancellationToken ct = default)
    {
        var first = _platform.Processes.GetProcesses().ToDictionary(p => p.Pid);
        var t0 = DateTime.UtcNow;
        if (measurementWindow > TimeSpan.Zero) ct.WaitHandle.WaitOne(measurementWindow);
        ct.ThrowIfCancellationRequested();
        var second = _platform.Processes.GetProcesses();
        var elapsed = Math.Max((DateTime.UtcNow - t0).TotalSeconds, 0.001);
        var logical = Math.Max(1, _platform.SystemInfo.GetCpu().LogicalProcessors);
        var gpu = _platform.Sensors.GetPerProcessGpuUtilization();

        var result = new List<ProcessInfo>(second.Count);
        foreach (var p in second)
        {
            double? cpu = null;
            SensorReading disk = SensorReading.Missing("B/s", "GetProcessIoCounters", SensorAvailability.RequiresAdmin);
            if (first.TryGetValue(p.Pid, out var before) && before.StartTime == p.StartTime)
            {
                if (before.TotalProcessorTime is { } a && p.TotalProcessorTime is { } b && measurementWindow > TimeSpan.Zero)
                    cpu = Math.Clamp((b - a).TotalSeconds / elapsed / logical * 100, 0, 100);
                if (before.IoBytesTotal is { } io0 && p.IoBytesTotal is { } io1 && measurementWindow > TimeSpan.Zero)
                    disk = SensorReading.Of(Math.Max(0, (double)(io1 - io0)) / elapsed, "B/s", "GetProcessIoCounters (all I/O)");
            }
            var sig = p.Path is null ? null : SafeVerify(p.Path);
            var (cls, reasons) = _classifier.Classify(p, sig);
            var prot = _classifier.EvaluateProtection(p);
            result.Add(new ProcessInfo(
                p.Pid, p.Name, p.Path, cpu, p.WorkingSetBytes, p.PrivateBytes,
                gpu is null
                    ? SensorReading.Missing("%", "GPU Engine counters", SensorAvailability.NotSupported)
                    : SensorReading.Of(gpu.GetValueOrDefault(p.Pid), "%", _platform.IsSimulated ? "simulated" : "PerformanceCounter: GPU Engine"),
                disk,
                SensorReading.Missing("B/s", "ETW", SensorAvailability.NotSupported, "Per-process network throughput requires ETW tracing"),
                p.Priority, sig?.Signed, sig?.Publisher, cls, reasons, prot.IsProtected, p.SessionId, p.StartTime));
        }
        return result;
    }

    private SignatureInfo? SafeVerify(string path)
    {
        try { return _platform.Signatures.Verify(path); } catch { return null; }
    }

    /// <summary>Resolves a PID to a target string that is safe against PID reuse.</summary>
    public string? TargetFor(int pid) =>
        _platform.Processes.GetProcess(pid) is { } p ? ProcessPriorityChangeHandler.TargetFor(p) : null;

    public ProcessFacts? Get(int pid) => _platform.Processes.GetProcess(pid);

    public ChangeOperation PriorityChange(ProcessFacts p, ProcessPriority priority) =>
        new(ChangeKinds.ProcessPriority, ProcessPriorityChangeHandler.TargetFor(p), StateValue.Of(priority.ToString()),
            $"Set priority of {p.Name} ({p.Pid}) to {priority}");

    public ChangeOperation TerminateChange(ProcessFacts p) =>
        new(ChangeKinds.ProcessTerminate, ProcessPriorityChangeHandler.TargetFor(p), StateValue.Absent, $"Terminate {p.Name} ({p.Pid})");
}
