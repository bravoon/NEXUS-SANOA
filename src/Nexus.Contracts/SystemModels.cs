namespace Nexus.Contracts;

public sealed record OsInfo(string Name, string Version, string Build, string Architecture, bool PendingReboot, DateTimeOffset? LastBoot);

public sealed record CpuInfo(string Name, string Vendor, int PhysicalCores, int LogicalProcessors, double? BaseClockMhz);

public sealed record GpuInfo(string Name, string Vendor, long? DedicatedVramBytes, string? DriverVersion, DateTimeOffset? DriverDate);

public sealed record MemoryInfo(long TotalBytes, long AvailableBytes, int? SpeedMhz, int? ModuleCount);

public sealed record DiskInfo(string Drive, string FileSystem, long TotalBytes, long FreeBytes, string? MediaType, bool IsSystemDrive);

public sealed record NetworkAdapterInfo(string Name, string Description, string Type, long? LinkSpeedBitsPerSec, bool IsUp);

public sealed record DriverInfo(string DeviceName, string DeviceClass, string? Version, DateTimeOffset? Date, string? Provider, int ProblemCode);

public sealed record PowerPlanInfo(Guid ActiveSchemeId, string ActiveSchemeName, IReadOnlyList<PowerSchemeInfo> Available, bool? OnAcPower, bool HasBattery);

public sealed record PowerSchemeInfo(Guid Id, string Name, string? WellKnown);

/// <summary>Gaming-relevant Windows settings. Null means "could not be determined".</summary>
public sealed record GamingSettingsInfo(
    bool? GameModeEnabled,
    bool? GameDvrBackgroundRecording,
    bool? HardwareGpuScheduling,
    bool? VariableRefreshRateOptimizations);

public sealed record ServiceInfo(
    string Name,
    string DisplayName,
    ServiceStartMode StartMode,
    ServiceRunState State,
    string? ImagePath,
    bool IsCritical);

public sealed record StartupEntryInfo(
    string Id,
    string Name,
    string Command,
    string? ExecutablePath,
    string? Publisher,
    bool? Signed,
    ImpactLevel Impact,
    string ImpactBasis,
    StartupSource Source,
    StartupScope Scope,
    string Location,
    bool Enabled,
    bool IsCritical);

public sealed record ProcessInfo(
    int Pid,
    string Name,
    string? Path,
    double? CpuPercent,
    long WorkingSetBytes,
    long PrivateBytes,
    SensorReading GpuPercent,
    SensorReading DiskBytesPerSec,
    SensorReading NetworkBytesPerSec,
    ProcessPriority? Priority,
    bool? Signed,
    string? Publisher,
    ProcessClassification Classification,
    IReadOnlyList<string> ClassificationReasons,
    bool IsProtected,
    int SessionId,
    DateTimeOffset? StartTime = null);

/// <summary>A read-only picture of the machine produced by the SystemAnalyzer.</summary>
public sealed record SystemSnapshot(
    string Id,
    DateTimeOffset CapturedAt,
    bool IsSimulated,
    bool IsElevated,
    OsInfo Os,
    CpuInfo Cpu,
    IReadOnlyList<GpuInfo> Gpus,
    MemoryInfo Memory,
    IReadOnlyList<DiskInfo> Disks,
    IReadOnlyList<NetworkAdapterInfo> NetworkAdapters,
    IReadOnlyList<DriverInfo> Drivers,
    PowerPlanInfo Power,
    GamingSettingsInfo Gaming,
    IReadOnlyList<ServiceInfo> Services,
    IReadOnlyList<StartupEntryInfo> Startup,
    IReadOnlyList<ProcessInfo> Processes,
    IReadOnlyList<HardwareSample> UsageSamples,
    IReadOnlyList<string> CollectionWarnings);

public sealed record SystemStatus(
    string EngineVersion,
    string Platform,
    bool IsSimulated,
    bool IsElevated,
    DateTimeOffset? LastScan,
    string? ActiveProfile,
    int TransactionsCommitted,
    HardwareSample? Live);
