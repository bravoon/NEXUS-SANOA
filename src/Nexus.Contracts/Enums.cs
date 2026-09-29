using System.Text.Json.Serialization;

namespace Nexus.Contracts;

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum ImpactLevel { None, Low, Medium, High }

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum RiskLevel { Low, Medium, High }

/// <summary>
/// How sure the engine is about a statement. Hypotheses are never presented as facts:
/// only <see cref="Confirmed"/> findings are backed by direct, sustained measurements.
/// </summary>
[JsonConverter(typeof(JsonStringEnumConverter))]
public enum Confidence { Unknown, Possible, Likely, Confirmed }

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum Severity { Info, Low, Medium, High, Critical }

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum RecommendationStatus { Recommended, Optional, AlreadyApplied, NotApplicable, Blocked }

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum OptimizationCategory
{
    Windows, Gaming, Startup, Process, Service, Power, Network, Storage, Memory, Registry, Debloat, Driver
}

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum ProcessClassification { System, Trusted, User, Unknown, Suspicious }

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum ProcessPriority { Idle, BelowNormal, Normal, AboveNormal, High, RealTime }

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum TransactionStatus { Pending, Committed, Failed, RolledBack, PartiallyRolledBack, RollbackFailed, ElevationRequired, DryRun }

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum TransactionItemStatus { Pending, Applied, Failed, Skipped, RolledBack, RollbackFailed }

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum SensorAvailability { Available, Unavailable, RequiresAdmin, NotSupported }

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum StartupSource { RegistryRun, StartupFolder, ScheduledTask, Service }

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum StartupScope { CurrentUser, AllUsers }

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum Bottleneck { None, Cpu, CpuSingleThread, Gpu, Memory, Storage, Thermal, Unknown }

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum NexusLogLevel { Trace, Debug, Info, Warning, Error, Critical }

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum ServiceStartMode { Boot, System, Automatic, AutomaticDelayed, Manual, Disabled, Unknown }

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum ServiceRunState { Running, Stopped, Paused, StartPending, StopPending, Unknown }

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum ComparisonVerdict { Improved, Regressed, NoSignificantChange, Inconclusive }

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum ProfileKind { Balanced, Gaming, Performance, Battery, Custom }
