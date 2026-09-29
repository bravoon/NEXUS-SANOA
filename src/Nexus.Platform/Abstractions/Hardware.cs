using Nexus.Contracts;

namespace Nexus.Platform.Abstractions;

public interface IHardwareSensorProvider
{
    /// <summary>Takes one usage sample. Counter-based metrics are averaged over <paramref name="window"/>.</summary>
    HardwareSample Sample(TimeSpan window, CancellationToken cancellationToken);

    /// <summary>GPU utilisation per process id, if the platform exposes it.</summary>
    IReadOnlyDictionary<int, double>? GetPerProcessGpuUtilization();
}

public interface ISystemInfoProvider
{
    OsInfo GetOs();
    CpuInfo GetCpu();
    IReadOnlyList<GpuInfo> GetGpus();
    MemoryInfo GetMemory();
    IReadOnlyList<DiskInfo> GetDisks();
    IReadOnlyList<NetworkAdapterInfo> GetNetworkAdapters();
    IReadOnlyList<DriverInfo> GetDrivers();
}

public interface IPrivilegeProvider
{
    bool IsElevated { get; }
    string UserName { get; }
    bool CanRequestElevation { get; }
}

public sealed record RestorePointResult(bool Created, string? Id, string Message);

public interface IRestorePointProvider
{
    RestorePointResult TryCreate(string description);
}

/// <summary>Frame-time capture (PresentMon or an imported CSV). Returns frame times in milliseconds.</summary>
public interface IFrameTimeSource
{
    string Name { get; }
    bool IsAvailable { get; }
    Task<IReadOnlyList<double>> CaptureAsync(string processName, TimeSpan duration, CancellationToken cancellationToken);
}
