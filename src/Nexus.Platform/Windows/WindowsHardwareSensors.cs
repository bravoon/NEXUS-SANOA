using System.Diagnostics;
using System.Globalization;
using System.Management;
using System.Net.NetworkInformation;
using System.Runtime.Versioning;
using Nexus.Contracts;
using Nexus.Platform.Abstractions;

namespace Nexus.Platform.Windows;

/// <summary>
/// Live telemetry from Performance Counters, WMI and (when installed) nvidia-smi.
/// A sensor that cannot be read is returned as Unavailable/RequiresAdmin — never estimated.
/// </summary>
[SupportedOSPlatform("windows")]
public sealed class WindowsHardwareSensors : IHardwareSensorProvider, IDisposable
{
    private readonly object _gate = new();
    private readonly ISystemInfoProvider _info;
    private readonly IPrivilegeProvider _privileges;
    private PerformanceCounter? _cpuTotal;
    private List<PerformanceCounter>? _cpuCores;
    private PerformanceCounter? _cpuFreq, _cpuPerf, _diskIdle;
    private bool _primed;
    private string? _nvidiaSmi;
    private bool _nvidiaSmiProbed;

    public WindowsHardwareSensors(ISystemInfoProvider info, IPrivilegeProvider privileges)
    {
        _info = info;
        _privileges = privileges;
    }

    private static PerformanceCounter? TryCounter(string category, string counter, string instance)
    {
        try
        {
            var c = new PerformanceCounter(category, counter, instance, readOnly: true);
            c.NextValue();
            return c;
        }
        catch { return null; }
    }

    private void EnsureCounters()
    {
        if (_primed) return;
        _cpuTotal = TryCounter("Processor Information", "% Processor Utility", "_Total")
                    ?? TryCounter("Processor", "% Processor Time", "_Total");
        _cpuFreq = TryCounter("Processor Information", "Processor Frequency", "_Total");
        _cpuPerf = TryCounter("Processor Information", "% Processor Performance", "_Total");
        _diskIdle = TryCounter("PhysicalDisk", "% Idle Time", "_Total");
        try
        {
            var cat = new PerformanceCounterCategory("Processor Information");
            _cpuCores = cat.GetInstanceNames()
                .Where(n => !n.Contains("_Total", StringComparison.Ordinal))
                .Select(n => TryCounter("Processor Information", "% Processor Utility", n))
                .OfType<PerformanceCounter>()
                .ToList();
        }
        catch { _cpuCores = null; }
        _primed = true;
    }

    public HardwareSample Sample(TimeSpan window, CancellationToken cancellationToken)
    {
        lock (_gate)
        {
            EnsureCounters();
            var net0 = ReadNetworkBytes();
            var gpuEngine0 = ReadGpuEngineRaw();
            if (window > TimeSpan.Zero) cancellationToken.WaitHandle.WaitOne(window);
            cancellationToken.ThrowIfCancellationRequested();
            var ts = DateTimeOffset.UtcNow;

            var cpu = ReadCpu();
            var gpus = ReadGpus(gpuEngine0);
            var mem = ReadMemory();
            var storage = ReadStorage();
            var net1 = ReadNetworkBytes();
            var seconds = Math.Max(window.TotalSeconds, 0.001);
            var network = net1.Select(kv =>
            {
                net0.TryGetValue(kv.Key, out var before);
                return new NetworkTelemetry(kv.Key,
                    SensorReading.Of(Math.Max(0, kv.Value.Rx - before.Rx) / seconds, "B/s", "NetworkInterface"),
                    SensorReading.Of(Math.Max(0, kv.Value.Tx - before.Tx) / seconds, "B/s", "NetworkInterface"));
            }).ToList();
            return new HardwareSample(ts, cpu, gpus, mem, storage, network);
        }
    }

    private CpuTelemetry ReadCpu()
    {
        var cpuInfo = _info.GetCpu();
        SensorReading util = _cpuTotal is null
            ? SensorReading.Missing("%", "PerformanceCounter")
            : SensorReading.Of(Math.Clamp(_cpuTotal.NextValue(), 0, 100), "%", "PerformanceCounter: Processor Information");
        SensorReading? maxCore = null;
        if (_cpuCores is { Count: > 0 })
            maxCore = SensorReading.Of(Math.Clamp(_cpuCores.Max(c => SafeNext(c)), 0, 100), "%", "PerformanceCounter: per logical processor");
        SensorReading freq = _cpuFreq is null
            ? SensorReading.Missing("MHz", "PerformanceCounter")
            : SensorReading.Of(_cpuFreq.NextValue() * ((_cpuPerf?.NextValue() ?? 100f) / 100f), "MHz", "PerformanceCounter: effective frequency");
        return new CpuTelemetry(util, maxCore, freq, ReadCpuTemperature(), cpuInfo.PhysicalCores, cpuInfo.LogicalProcessors);
    }

    private static float SafeNext(PerformanceCounter c)
    {
        try { return c.NextValue(); } catch { return 0; }
    }

    private SensorReading ReadCpuTemperature()
    {
        const string src = "WMI MSAcpi_ThermalZoneTemperature";
        try
        {
            using var searcher = new ManagementObjectSearcher(@"root\WMI", "SELECT CurrentTemperature FROM MSAcpi_ThermalZoneTemperature");
            double? max = null;
            foreach (ManagementObject mo in searcher.Get())
            {
                using (mo)
                {
                    var tenthsKelvin = Convert.ToDouble(mo["CurrentTemperature"], CultureInfo.InvariantCulture);
                    var c = tenthsKelvin / 10.0 - 273.15;
                    if (c is > 0 and < 125) max = Math.Max(max ?? c, c);
                }
            }
            return max is { } v
                ? new SensorReading(v, "°C", DateTimeOffset.UtcNow, src, SensorAvailability.Available, "ACPI thermal zone; may differ from CPU die temperature")
                : SensorReading.Missing("°C", src, SensorAvailability.NotSupported, "Firmware exposes no thermal zone");
        }
        catch (ManagementException ex) when (ex.ErrorCode == ManagementStatus.AccessDenied)
        {
            return SensorReading.Missing("°C", src, SensorAvailability.RequiresAdmin);
        }
        catch (Exception ex) when (ex is ManagementException or UnauthorizedAccessException or System.Runtime.InteropServices.COMException)
        {
            return SensorReading.Missing("°C", src, _privileges.IsElevated ? SensorAvailability.NotSupported : SensorAvailability.RequiresAdmin);
        }
    }

    // ---------- GPU ----------
    private static Dictionary<string, CounterSample> ReadGpuEngineRaw()
    {
        var result = new Dictionary<string, CounterSample>(StringComparer.Ordinal);
        try
        {
            var cat = new PerformanceCounterCategory("GPU Engine");
            var data = cat.ReadCategory();
            if (data["Utilization Percentage"] is { } col)
                foreach (InstanceData d in col.Values) result[d.InstanceName] = d.Sample;
        }
        catch { /* GPU Engine counters need Windows 10 1709+ and a WDDM 2.x driver */ }
        return result;
    }

    /// <summary>Per-engine utilisation from two raw samples (engine instance → %).</summary>
    private static Dictionary<string, double> EngineUtilization(Dictionary<string, CounterSample> before, Dictionary<string, CounterSample> after)
    {
        var r = new Dictionary<string, double>(StringComparer.Ordinal);
        foreach (var (name, s1) in after)
            if (before.TryGetValue(name, out var s0)) r[name] = CounterSample.Calculate(s0, s1);
        return r;
    }

    private Dictionary<string, CounterSample>? _lastGpuRaw;

    public IReadOnlyDictionary<int, double>? GetPerProcessGpuUtilization()
    {
        lock (_gate)
        {
            var now = ReadGpuEngineRaw();
            if (now.Count == 0) return null;
            var prev = _lastGpuRaw;
            _lastGpuRaw = now;
            if (prev is null)
            {
                Thread.Sleep(500);
                prev = now;
                now = ReadGpuEngineRaw();
                _lastGpuRaw = now;
            }
            var util = EngineUtilization(prev, now);
            var perPid = new Dictionary<int, double>();
            foreach (var (name, v) in util)
            {
                // Instance: pid_1234_luid_0x..._phys_0_eng_0_engtype_3D
                var parts = name.Split('_');
                if (parts.Length < 2 || parts[0] != "pid" || !int.TryParse(parts[1], out var pid)) continue;
                perPid[pid] = Math.Min(100, perPid.GetValueOrDefault(pid) + v);
            }
            return perPid;
        }
    }

    private IReadOnlyList<GpuTelemetry> ReadGpus(Dictionary<string, CounterSample> engineBefore)
    {
        var infos = _info.GetGpus();
        var engineAfter = ReadGpuEngineRaw();
        _lastGpuRaw = engineAfter;
        var util = EngineUtilization(engineBefore, engineAfter);

        // Task Manager semantics: per adapter, sum per engine type across processes, then take the busiest engine type.
        SensorReading utilization;
        if (util.Count == 0)
            utilization = SensorReading.Missing("%", "PerformanceCounter: GPU Engine", SensorAvailability.NotSupported);
        else
        {
            var byEngineType = util.GroupBy(kv => EngineKey(kv.Key)).Select(g => g.Sum(x => x.Value));
            utilization = SensorReading.Of(Math.Clamp(byEngineType.DefaultIfEmpty(0).Max(), 0, 100), "%", "PerformanceCounter: GPU Engine");
        }

        var dedicated = ReadDedicatedVram();
        var nv = ReadNvidiaSmi();
        var result = new List<GpuTelemetry>();
        for (var i = 0; i < Math.Max(1, infos.Count); i++)
        {
            var info = infos.Count > i ? infos[i] : null;
            var isNvidia = info?.Vendor.Contains("NVIDIA", StringComparison.OrdinalIgnoreCase) == true;
            var n = isNvidia && nv is not null && nv.Count > 0 ? nv[Math.Min(i, nv.Count - 1)] : null;
            result.Add(new GpuTelemetry(
                info?.Name ?? "GPU",
                n?.Util ?? (i == 0 ? utilization : SensorReading.Missing("%", "PerformanceCounter: GPU Engine")),
                n?.Temp ?? SensorReading.Missing("°C", "vendor API", SensorAvailability.NotSupported, "GPU temperature requires a vendor interface (nvidia-smi for NVIDIA)"),
                n?.Clock ?? SensorReading.Missing("MHz", "vendor API", SensorAvailability.NotSupported),
                n?.MemUsed ?? (i == 0 && dedicated is { } d ? SensorReading.Of(d, "B", "PerformanceCounter: GPU Adapter Memory") : SensorReading.Missing("B", "PerformanceCounter: GPU Adapter Memory")),
                n?.MemTotal ?? (info?.DedicatedVramBytes is { } t ? SensorReading.Of(t, "B", "Registry: HardwareInformation.qwMemorySize") : SensorReading.Missing("B", "Registry")),
                n?.Power ?? SensorReading.Missing("W", "vendor API", SensorAvailability.NotSupported)));
        }
        return result;
    }

    /// <summary>"pid_1234_luid_0x..._phys_0_eng_3_engtype_3D" → "luid_..._phys_0_eng_3_engtype_3D" (adapter + engine).</summary>
    private static string EngineKey(string instance)
    {
        var luid = instance.IndexOf("luid_", StringComparison.Ordinal);
        return luid >= 0 ? instance[luid..] : instance;
    }

    private static double? ReadDedicatedVram()
    {
        try
        {
            var cat = new PerformanceCounterCategory("GPU Adapter Memory");
            var data = cat.ReadCategory();
            if (data["Dedicated Usage"] is not { } col) return null;
            double max = 0;
            foreach (InstanceData d in col.Values) max = Math.Max(max, d.RawValue);
            return max;
        }
        catch { return null; }
    }

    private sealed record NvReading(SensorReading Util, SensorReading Temp, SensorReading Clock, SensorReading MemUsed, SensorReading MemTotal, SensorReading Power);

    private List<NvReading>? ReadNvidiaSmi()
    {
        if (!_nvidiaSmiProbed)
        {
            _nvidiaSmiProbed = true;
            var candidates = new[]
            {
                Path.Combine(Environment.SystemDirectory, "nvidia-smi.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "NVIDIA Corporation", "NVSMI", "nvidia-smi.exe"),
            };
            _nvidiaSmi = candidates.FirstOrDefault(File.Exists);
        }
        if (_nvidiaSmi is null) return null;
        try
        {
            var psi = new ProcessStartInfo(_nvidiaSmi,
                "--query-gpu=utilization.gpu,temperature.gpu,clocks.gr,memory.used,memory.total,power.draw --format=csv,noheader,nounits")
            {
                RedirectStandardOutput = true, UseShellExecute = false, CreateNoWindow = true,
            };
            using var p = Process.Start(psi)!;
            var output = p.StandardOutput.ReadToEnd();
            if (!p.WaitForExit(3000)) { p.Kill(); return null; }
            const string src = "nvidia-smi";
            return output.Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).Select(line =>
            {
                var f = line.Split(',', StringSplitOptions.TrimEntries);
                SensorReading R(int i, string unit, double scale = 1) =>
                    f.Length > i && double.TryParse(f[i], NumberStyles.Float, CultureInfo.InvariantCulture, out var v)
                        ? SensorReading.Of(v * scale, unit, src)
                        : SensorReading.Missing(unit, src, SensorAvailability.NotSupported);
                return new NvReading(R(0, "%"), R(1, "°C"), R(2, "MHz"), R(3, "B", 1024 * 1024), R(4, "B", 1024 * 1024), R(5, "W"));
            }).ToList();
        }
        catch { return null; }
    }

    // ---------- Memory / Storage / Network ----------
    private static MemoryTelemetry ReadMemory()
    {
        const string src = "GlobalMemoryStatusEx";
        var s = NativeMethods.GetMemoryStatus();
        var commit = s.ullTotalPageFile == 0 ? 0 : (double)(s.ullTotalPageFile - s.ullAvailPageFile) / s.ullTotalPageFile * 100;
        return new MemoryTelemetry(
            SensorReading.Of(s.ullTotalPhys, "B", src),
            SensorReading.Of(s.ullTotalPhys - s.ullAvailPhys, "B", src),
            SensorReading.Of(s.ullAvailPhys, "B", src),
            SensorReading.Of(commit, "%", src));
    }

    private IReadOnlyList<StorageTelemetry> ReadStorage()
    {
        var active = _diskIdle is null
            ? SensorReading.Missing("%", "PerformanceCounter: PhysicalDisk")
            : SensorReading.Of(Math.Clamp(100 - _diskIdle.NextValue(), 0, 100), "%", "PerformanceCounter: PhysicalDisk (_Total)");
        var health = ReadDiskHealth();
        return DriveInfo.GetDrives().Where(d => d.DriveType == DriveType.Fixed && d.IsReady).Select(d => new StorageTelemetry(
            d.Name.TrimEnd('\\'),
            SensorReading.Of(d.TotalSize, "B", "DriveInfo"),
            SensorReading.Of(d.AvailableFreeSpace, "B", "DriveInfo"),
            active,
            health,
            SensorReading.Missing("°C", "MSFT_StorageReliabilityCounter", _privileges.IsElevated ? SensorAvailability.NotSupported : SensorAvailability.RequiresAdmin)))
            .ToList();
    }

    private static SensorReading ReadDiskHealth()
    {
        const string src = "WMI MSFT_PhysicalDisk.HealthStatus";
        try
        {
            using var searcher = new ManagementObjectSearcher(@"root\Microsoft\Windows\Storage", "SELECT HealthStatus FROM MSFT_PhysicalDisk");
            int worst = -1;
            foreach (ManagementObject mo in searcher.Get())
                using (mo) worst = Math.Max(worst, Convert.ToInt32(mo["HealthStatus"], CultureInfo.InvariantCulture));
            return worst switch
            {
                0 => SensorReading.Of(100, "%", src) with { Note = "Healthy" },
                1 => SensorReading.Of(50, "%", src) with { Note = "Warning" },
                2 => SensorReading.Of(0, "%", src) with { Note = "Unhealthy" },
                _ => SensorReading.Missing("%", src, SensorAvailability.NotSupported),
            };
        }
        catch { return SensorReading.Missing("%", src, SensorAvailability.NotSupported); }
    }

    private static Dictionary<string, (long Rx, long Tx)> ReadNetworkBytes()
    {
        var r = new Dictionary<string, (long, long)>();
        try
        {
            foreach (var ni in NetworkInterface.GetAllNetworkInterfaces())
            {
                if (ni.OperationalStatus != OperationalStatus.Up || ni.NetworkInterfaceType == NetworkInterfaceType.Loopback) continue;
                var s = ni.GetIPStatistics();
                r[ni.Name] = (s.BytesReceived, s.BytesSent);
            }
        }
        catch (NetworkInformationException) { }
        return r;
    }

    public void Dispose()
    {
        _cpuTotal?.Dispose(); _cpuFreq?.Dispose(); _cpuPerf?.Dispose(); _diskIdle?.Dispose();
        _cpuCores?.ForEach(c => c.Dispose());
    }
}
