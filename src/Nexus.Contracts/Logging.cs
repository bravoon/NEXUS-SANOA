namespace Nexus.Contracts;

public sealed record LogEntry(long Id, DateTimeOffset Timestamp, NexusLogLevel Level, string Category, string Message, string? CorrelationId);
