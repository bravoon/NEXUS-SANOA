namespace Nexus.Contracts;

/// <summary>
/// A single measured value. Sensors that are not available are reported as such —
/// the engine never fabricates a value.
/// </summary>
public sealed record SensorReading(
    double? Value,
    string Unit,
    DateTimeOffset Timestamp,
    string Source,
    SensorAvailability Availability,
    string? Note = null)
{
    public bool HasValue => Availability == SensorAvailability.Available && Value.HasValue;

    public static SensorReading Of(double value, string unit, string source) =>
        new(value, unit, DateTimeOffset.UtcNow, source, SensorAvailability.Available);

    public static SensorReading Missing(string unit, string source, SensorAvailability availability = SensorAvailability.Unavailable, string? note = null) =>
        new(null, unit, DateTimeOffset.UtcNow, source, availability, note);
}

public sealed record CpuTelemetry(
    SensorReading Utilization,
    SensorReading? MaxCoreUtilization,
    SensorReading Frequency,
    SensorReading Temperature,
    int PhysicalCores,
    int LogicalProcessors);

public sealed record GpuTelemetry(
    string Name,
    SensorReading Utilization,
    SensorReading Temperature,
    SensorReading CoreClock,
    SensorReading VramUsed,
    SensorReading VramTotal,
    SensorReading Power);

public sealed record MemoryTelemetry(SensorReading Total, SensorReading Used, SensorReading Available, SensorReading CommitPercent);

public sealed record StorageTelemetry(
    string Drive,
    SensorReading TotalBytes,
    SensorReading FreeBytes,
    SensorReading ActiveTime,
    SensorReading Health,
    SensorReading Temperature);

public sealed record NetworkTelemetry(string Adapter, SensorReading ReceiveBytesPerSec, SensorReading SendBytesPerSec);

/// <summary>A point-in-time hardware usage sample produced by the HardwareEngine.</summary>
public sealed record HardwareSample(
    DateTimeOffset Timestamp,
    CpuTelemetry Cpu,
    IReadOnlyList<GpuTelemetry> Gpus,
    MemoryTelemetry Memory,
    IReadOnlyList<StorageTelemetry> Storage,
    IReadOnlyList<NetworkTelemetry> Network);
