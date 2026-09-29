using System.Text.Json;
using System.Text.Json.Serialization;

namespace Nexus.Contracts;

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum EngineEventType
{
    ScanStarted, ScanProgress, ScanCompleted,
    AnalysisCompleted,
    OptimizationStarted, OptimizationProgress, OptimizationCompleted, OptimizationFailed,
    RollbackStarted, RollbackCompleted, RollbackFailed,
    BenchmarkStarted, BenchmarkUpdated, BenchmarkCompleted,
    ProfileApplied,
    GameStarted, GameStopped,
    ElevationRequired,
    Log
}

/// <summary>An engine event. <see cref="Data"/> carries a structured payload whose shape depends on <see cref="Type"/>.</summary>
public sealed record EngineEvent(
    EngineEventType Type,
    DateTimeOffset Timestamp,
    string? CorrelationId,
    double? Progress,
    string Message,
    JsonElement? Data = null);
