using Nexus.Contracts;
using Nexus.Platform.Abstractions;

namespace Nexus.Platform.Simulation;

/// <summary>In-memory registry. Used by tests and by "--simulate" mode; never touches the real machine.</summary>
public sealed class SimulatedRegistry : IRegistryAccessor
{
    private readonly Dictionary<string, Dictionary<string, RegValue>> _keys = new(StringComparer.OrdinalIgnoreCase);

    /// <summary>Value targets ("key|name") whose writes throw — used to exercise rollback paths.</summary>
    public HashSet<string> FailingWrites { get; } = new(StringComparer.OrdinalIgnoreCase);
    public int WriteCount { get; private set; }

    private static string Norm(string key) => key.Replace("HKEY_CURRENT_USER", "HKCU").Replace("HKEY_LOCAL_MACHINE", "HKLM").TrimEnd('\\');

    public void Seed(string key, string name, RegValue value)
    {
        key = Norm(key);
        EnsureKey(key);
        _keys[key][name] = value;
    }

    private void EnsureKey(string key)
    {
        var parts = key.Split('\\');
        for (var i = 1; i <= parts.Length; i++)
        {
            var k = string.Join('\\', parts[..i]);
            if (!_keys.ContainsKey(k)) _keys[k] = new Dictionary<string, RegValue>(StringComparer.OrdinalIgnoreCase);
        }
    }

    public RegValue? GetValue(string keyPath, string name) =>
        _keys.TryGetValue(Norm(keyPath), out var k) && k.TryGetValue(name, out var v) ? v : null;

    public IReadOnlyList<string> GetValueNames(string keyPath) =>
        _keys.TryGetValue(Norm(keyPath), out var k) ? k.Keys.ToList() : [];

    public IReadOnlyList<string> GetSubKeyNames(string keyPath)
    {
        var prefix = Norm(keyPath) + "\\";
        return _keys.Keys.Where(k => k.StartsWith(prefix, StringComparison.OrdinalIgnoreCase) && !k[prefix.Length..].Contains('\\'))
            .Select(k => k[prefix.Length..]).ToList();
    }

    public bool KeyExists(string keyPath) => _keys.ContainsKey(Norm(keyPath));

    public void SetValue(string keyPath, string name, RegValue value)
    {
        if (FailingWrites.Contains(RegistryPaths.Target(Norm(keyPath), name)))
            throw new UnauthorizedAccessException($"Simulated write failure for {keyPath}\\{name}");
        WriteCount++;
        Seed(keyPath, name, value);
    }

    public void DeleteValue(string keyPath, string name)
    {
        WriteCount++;
        if (_keys.TryGetValue(Norm(keyPath), out var k)) k.Remove(name);
    }

    public Dictionary<string, Dictionary<string, RegValue>> Export() =>
        _keys.ToDictionary(k => k.Key, k => k.Value.ToDictionary(v => v.Key, v => v.Value), StringComparer.OrdinalIgnoreCase);

    public void Import(Dictionary<string, Dictionary<string, RegValue>> data)
    {
        _keys.Clear();
        foreach (var (k, values) in data)
        {
            EnsureKey(k);
            foreach (var (n, v) in values) _keys[k][n] = v;
        }
    }
}

public sealed class SimulatedServices : IServiceManager
{
    public List<ServiceFacts> Items { get; } = [];
    public IReadOnlyList<ServiceFacts> GetServices() => Items.ToList();
    public ServiceFacts? GetService(string name) => Items.FirstOrDefault(s => s.Name.Equals(name, StringComparison.OrdinalIgnoreCase));

    public void SetStartMode(string name, ServiceStartMode mode)
    {
        var i = Items.FindIndex(s => s.Name.Equals(name, StringComparison.OrdinalIgnoreCase));
        if (i < 0) throw new InvalidOperationException($"Service {name} not found");
        Items[i] = Items[i] with { StartMode = mode };
    }
}

public sealed class SimulatedProcesses : IProcessManager
{
    public List<ProcessFacts> Items { get; } = [];
    public List<int> Terminated { get; } = [];
    public int CurrentProcessId { get; set; } = 9999;

    /// <summary>Simulated steady CPU load per PID, in percent of the whole machine (16 logical processors).</summary>
    public Dictionary<int, double> CpuLoad { get; } = new();
    private readonly DateTime _epoch = DateTime.UtcNow;

    private ProcessFacts Live(ProcessFacts p) =>
        CpuLoad.TryGetValue(p.Pid, out var load)
            ? p with { TotalProcessorTime = (p.TotalProcessorTime ?? TimeSpan.Zero) + TimeSpan.FromTicks((long)((DateTime.UtcNow - _epoch).Ticks * load / 100 * 16)) }
            : p;

    public IReadOnlyList<ProcessFacts> GetProcesses() => Items.Select(Live).ToList();
    public ProcessFacts? GetProcess(int pid) => Items.FirstOrDefault(p => p.Pid == pid) is { } p ? Live(p) : null;

    private void Update(int pid, Func<ProcessFacts, ProcessFacts> f)
    {
        var i = Items.FindIndex(p => p.Pid == pid);
        if (i < 0) throw new InvalidOperationException($"Process {pid} not found");
        Items[i] = f(Items[i]);
    }

    public void SetPriority(int pid, ProcessPriority priority) => Update(pid, p => p with { Priority = priority });
    public void SetAffinity(int pid, long mask) => Update(pid, p => p with { Affinity = mask });

    public void Terminate(int pid)
    {
        Terminated.Add(pid);
        Items.RemoveAll(p => p.Pid == pid);
    }

    /// <summary>Simulates CPU work between two samples.</summary>
    public void AdvanceCpu(int pid, TimeSpan extra) =>
        Update(pid, p => p with { TotalProcessorTime = (p.TotalProcessorTime ?? TimeSpan.Zero) + extra });
}

public sealed class SimulatedSignatures : ISignatureVerifier
{
    public Dictionary<string, SignatureInfo> Map { get; } = new(StringComparer.OrdinalIgnoreCase);
    public SignatureInfo Verify(string path) => Map.TryGetValue(path, out var s) ? s : new SignatureInfo(false, false, null);
}

public sealed class SimulatedPower : IPowerManager
{
    public List<PowerScheme> Schemes { get; } =
    [
        new(WellKnownPowerSchemes.Balanced, "Balanced"),
        new(WellKnownPowerSchemes.HighPerformance, "High performance"),
        new(WellKnownPowerSchemes.PowerSaver, "Power saver"),
    ];
    public Guid Active { get; set; } = WellKnownPowerSchemes.Balanced;
    public PowerSourceStatus Source { get; set; } = new(true, false, null);

    public IReadOnlyList<PowerScheme> GetSchemes() => Schemes;
    public Guid GetActiveScheme() => Active;
    public void SetActiveScheme(Guid id) => Active = id;
    public PowerSourceStatus GetPowerSource() => Source;
}

public sealed class SimulatedTasks : ITaskSchedulerAccessor
{
    public List<ScheduledTaskFacts> Items { get; } = [];
    public IReadOnlyList<ScheduledTaskFacts> GetTasks() => Items.ToList();
    public ScheduledTaskFacts? GetTask(string path) => Items.FirstOrDefault(t => t.Path.Equals(path, StringComparison.OrdinalIgnoreCase));

    public void SetEnabled(string path, bool enabled)
    {
        var i = Items.FindIndex(t => t.Path.Equals(path, StringComparison.OrdinalIgnoreCase));
        if (i < 0) throw new InvalidOperationException($"Task {path} not found");
        Items[i] = Items[i] with { Enabled = enabled };
    }
}

public sealed class SimulatedFileSystem : IFileSystem
{
    private readonly Dictionary<string, (long Length, DateTimeOffset Modified, string Content)> _files = new(StringComparer.OrdinalIgnoreCase);
    private readonly HashSet<string> _dirs = new(StringComparer.OrdinalIgnoreCase);
    public Dictionary<KnownFolder, string> Folders { get; } = new();

    private static string N(string p) => PathUtil.Normalize(p).TrimEnd('\\');

    public void AddFile(string path, long length, DateTimeOffset modified, string content = "")
    {
        _files[N(path)] = (length, modified, content);
        for (var d = PathUtil.GetDirectory(N(path)); d is not null; d = PathUtil.GetDirectory(d)) _dirs.Add(d);
    }

    public bool FileExists(string path) => _files.ContainsKey(N(path));
    public bool DirectoryExists(string path) => _dirs.Contains(N(path));

    public IEnumerable<FileFacts> EnumerateFiles(string directory, string pattern, bool recursive)
    {
        var dir = N(directory);
        var suffix = pattern.StartsWith("*.") ? pattern[1..] : null;
        return _files.Where(f =>
                PathUtil.IsUnder(f.Key, dir) &&
                (recursive || string.Equals(PathUtil.GetDirectory(f.Key), dir, StringComparison.OrdinalIgnoreCase)) &&
                (pattern == "*" || (suffix is not null ? f.Key.EndsWith(suffix, StringComparison.OrdinalIgnoreCase) : PathUtil.GetFileName(f.Key).Equals(pattern, StringComparison.OrdinalIgnoreCase))))
            .Select(f => new FileFacts(f.Key, f.Value.Length, f.Value.Modified))
            .ToList();
    }

    public IEnumerable<string> EnumerateDirectories(string directory)
    {
        var dir = N(directory);
        return _dirs.Where(d => string.Equals(PathUtil.GetDirectory(d), dir, StringComparison.OrdinalIgnoreCase)).ToList();
    }

    public FileFacts? GetFile(string path) => _files.TryGetValue(N(path), out var f) ? new FileFacts(N(path), f.Length, f.Modified) : null;
    public string ReadAllText(string path) => _files.TryGetValue(N(path), out var f) ? f.Content : throw new FileNotFoundException(path);

    public void MoveFile(string source, string destination)
    {
        if (!_files.Remove(N(source), out var f)) throw new FileNotFoundException(source);
        if (_files.ContainsKey(N(destination))) throw new IOException($"Destination exists: {destination}");
        AddFile(destination, f.Length, f.Modified, f.Content);
    }

    public void CreateDirectory(string path) => _dirs.Add(N(path));

    public sealed record FileEntry(string Path, long Length, DateTimeOffset Modified, string Content);
    public List<FileEntry> ExportFiles() => _files.Select(f => new FileEntry(f.Key, f.Value.Length, f.Value.Modified, f.Value.Content)).ToList();
    public void ImportFiles(IEnumerable<FileEntry> files)
    {
        _files.Clear();
        foreach (var f in files) AddFile(f.Path, f.Length, f.Modified, f.Content);
    }
    public string? GetKnownFolder(KnownFolder folder) => Folders.TryGetValue(folder, out var p) ? p : null;
    public string? ResolveShortcut(string path) => _files.TryGetValue(N(path), out var f) && f.Content.Length > 0 ? f.Content : null;
}

/// <summary>
/// Deterministic sensor model. Load is configurable so tests can create CPU-, GPU- or memory-bound scenarios.
/// Values are clearly labelled with source "simulated".
/// </summary>
public sealed class SimulatedSensors : IHardwareSensorProvider
{
    private readonly Random _random = new(42);
    public double CpuLoad { get; set; } = 18;
    public double MaxCoreLoad { get; set; } = 35;
    public double GpuLoad { get; set; } = 7;
    public double MemoryUsedFraction { get; set; } = 0.55;
    public double DiskActive { get; set; } = 4;
    public double? CpuTemp { get; set; } = 52;
    public double? GpuTemp { get; set; } = 44;
    public bool GpuTelemetryAvailable { get; set; } = true;
    public double Noise { get; set; } = 2;
    public long TotalMemory { get; set; } = 16L * 1024 * 1024 * 1024;
    public Dictionary<int, double> PerProcessGpu { get; } = new();

    private double N(double v, double max = 100) => Math.Clamp(v + (_random.NextDouble() * 2 - 1) * Noise, 0, max);
    private const string Src = "simulated";

    public HardwareSample Sample(TimeSpan window, CancellationToken cancellationToken)
    {
        var now = DateTimeOffset.UtcNow;
        var used = (long)(TotalMemory * Math.Clamp(MemoryUsedFraction + (_random.NextDouble() - 0.5) * 0.01, 0, 1));
        var cpu = new CpuTelemetry(
            SensorReading.Of(N(CpuLoad), "%", Src),
            SensorReading.Of(N(MaxCoreLoad), "%", Src),
            SensorReading.Of(N(4200, 5000), "MHz", Src),
            CpuTemp is { } t ? SensorReading.Of(N(t, 110), "°C", Src) : SensorReading.Missing("°C", Src, SensorAvailability.NotSupported, "No CPU temperature sensor exposed"),
            8, 16);
        var gpu = GpuTelemetryAvailable
            ? new GpuTelemetry("Simulated GPU (RTX-class, 8 GB)",
                SensorReading.Of(N(GpuLoad), "%", Src),
                GpuTemp is { } g ? SensorReading.Of(N(g, 110), "°C", Src) : SensorReading.Missing("°C", Src),
                SensorReading.Of(N(1800, 2200), "MHz", Src),
                SensorReading.Of(2.1e9 + GpuLoad * 5e7, "B", Src),
                SensorReading.Of(8.0 * 1024 * 1024 * 1024, "B", Src),
                SensorReading.Of(N(40 + GpuLoad * 1.8, 400), "W", Src))
            : new GpuTelemetry("Simulated GPU (no telemetry)",
                SensorReading.Missing("%", Src), SensorReading.Missing("°C", Src), SensorReading.Missing("MHz", Src),
                SensorReading.Missing("B", Src), SensorReading.Missing("B", Src), SensorReading.Missing("W", Src));
        var mem = new MemoryTelemetry(
            SensorReading.Of(TotalMemory, "B", Src),
            SensorReading.Of(used, "B", Src),
            SensorReading.Of(TotalMemory - used, "B", Src),
            SensorReading.Of(Math.Min(100, MemoryUsedFraction * 100 + 12), "%", Src));
        var disk = new StorageTelemetry("C:",
            SensorReading.Of(1_000_204_886_016, "B", Src),
            SensorReading.Of(61_000_000_000, "B", Src),
            SensorReading.Of(N(DiskActive), "%", Src),
            SensorReading.Of(100, "%", Src) with { Note = "Healthy" },
            SensorReading.Missing("°C", Src, SensorAvailability.RequiresAdmin));
        var net = new NetworkTelemetry("Ethernet", SensorReading.Of(N(120_000, 1e9), "B/s", Src), SensorReading.Of(N(15_000, 1e9), "B/s", Src));
        return new HardwareSample(now, cpu, [gpu], mem, [disk], [net]);
    }

    public IReadOnlyDictionary<int, double>? GetPerProcessGpuUtilization() => GpuTelemetryAvailable ? PerProcessGpu : null;
}

public sealed class SimulatedSystemInfo : ISystemInfoProvider
{
    public OsInfo Os { get; set; } = new("Windows 11 Pro (simulated)", "10.0.22631", "22631", "x64", false, DateTimeOffset.UtcNow.AddHours(-30));
    public CpuInfo Cpu { get; set; } = new("Simulated 8-Core Processor", "AuthenticAMD", 8, 16, 3800);
    public List<GpuInfo> Gpus { get; set; } = [new("Simulated GPU (RTX-class, 8 GB)", "NVIDIA", 8L * 1024 * 1024 * 1024, "31.0.15.3623", DateTimeOffset.UtcNow.AddMonths(-16))];
    public MemoryInfo Memory { get; set; } = new(16L * 1024 * 1024 * 1024, 7L * 1024 * 1024 * 1024, 3200, 2);
    public List<DiskInfo> Disks { get; set; } = [new("C:", "NTFS", 1_000_204_886_016, 61_000_000_000, "SSD", true)];
    public List<NetworkAdapterInfo> Adapters { get; set; } = [new("Ethernet", "Simulated 2.5GbE Controller", "Ethernet", 2_500_000_000, true)];
    public List<DriverInfo> Drivers { get; set; } =
    [
        new("Simulated GPU (RTX-class, 8 GB)", "Display", "31.0.15.3623", DateTimeOffset.UtcNow.AddMonths(-16), "NVIDIA", 0),
        new("Simulated Audio Device", "MEDIA", "6.0.9.1", DateTimeOffset.UtcNow.AddMonths(-30), "Realtek", 0),
        new("Unknown USB Device (Device Descriptor Request Failed)", "USB", null, null, null, 43),
    ];

    public OsInfo GetOs() => Os;
    public CpuInfo GetCpu() => Cpu;
    public IReadOnlyList<GpuInfo> GetGpus() => Gpus;
    public MemoryInfo GetMemory() => Memory;
    public IReadOnlyList<DiskInfo> GetDisks() => Disks;
    public IReadOnlyList<NetworkAdapterInfo> GetNetworkAdapters() => Adapters;
    public IReadOnlyList<DriverInfo> GetDrivers() => Drivers;
}

public sealed class SimulatedPrivileges : IPrivilegeProvider
{
    public bool IsElevated { get; set; }
    public string UserName { get; set; } = "sim-user";
    public bool CanRequestElevation { get; set; }
}

public sealed class SimulatedRestorePoints : IRestorePointProvider
{
    public List<string> Created { get; } = [];
    public RestorePointResult TryCreate(string description)
    {
        Created.Add(description);
        return new RestorePointResult(true, $"SIM-RP-{Created.Count}", "Simulated restore point created");
    }
}

/// <summary>Generates a deterministic frame-time trace with occasional stutters.</summary>
public sealed class SimulatedFrameTimes : IFrameTimeSource
{
    public string Name => "simulated";
    public bool IsAvailable => true;
    public double MeanFrameTimeMs { get; set; } = 1000.0 / 120;
    public int Seed { get; set; } = 7;

    public Task<IReadOnlyList<double>> CaptureAsync(string processName, TimeSpan duration, CancellationToken cancellationToken)
    {
        var rnd = new Random(Seed);
        var frames = new List<double>();
        double elapsed = 0;
        while (elapsed < duration.TotalMilliseconds)
        {
            var ft = MeanFrameTimeMs * (0.9 + rnd.NextDouble() * 0.2);
            if (rnd.NextDouble() < 0.01) ft *= 2.5; // stutter
            frames.Add(ft);
            elapsed += ft;
        }
        return Task.FromResult<IReadOnlyList<double>>(frames);
    }
}
