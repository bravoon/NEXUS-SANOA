using System.Text.Json;
using System.Text.Json.Serialization;

namespace Nexus.Contracts.Api;

/// <summary>Command routes of the internal API. The UI, CLI and any future client use only these.</summary>
public static class ApiRoutes
{
    public const string SystemScan = "/system/scan";
    public const string SystemStatus = "/system/status";
    public const string SystemAnalyze = "/system/analyze";
    public const string SystemTelemetry = "/system/telemetry";

    public const string OptimizationRules = "/optimization/rules";
    public const string OptimizationRecommendations = "/optimization/recommendations";
    public const string OptimizationPreview = "/optimization/preview";
    public const string OptimizationApply = "/optimization/apply";
    public const string OptimizationRollback = "/optimization/rollback";

    public const string Processes = "/processes";
    public const string ProcessSetPriority = "/processes/priority";
    public const string ProcessTerminate = "/processes/terminate";

    public const string Startup = "/startup";
    public const string StartupSetEnabled = "/startup/set-enabled";

    public const string GamingGames = "/gaming/games";
    public const string GamingLaunchers = "/gaming/launchers";
    public const string GamingProfiles = "/gaming/profiles";
    public const string GamingSaveProfile = "/gaming/profiles/save";
    public const string GamingApply = "/gaming/apply";

    public const string Profiles = "/profiles";
    public const string ProfileSave = "/profiles/save";
    public const string ProfileApply = "/profiles/apply";

    public const string BenchmarkStart = "/benchmark/start";
    public const string BenchmarkStop = "/benchmark/stop";
    public const string BenchmarkResults = "/benchmark/results";
    public const string BenchmarkCompare = "/benchmark/compare";

    public const string RestoreHistory = "/restore/history";
    public const string RestoreRollback = "/restore/rollback";

    public const string Logs = "/logs";
    public const string EventsSubscribe = "/events/subscribe";

    public static readonly IReadOnlySet<string> All = typeof(ApiRoutes)
        .GetFields()
        .Where(f => f.IsLiteral && f.FieldType == typeof(string))
        .Select(f => (string)f.GetRawConstantValue()!)
        .ToHashSet(StringComparer.Ordinal);
}

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum MessageKind { Request, Response, Event }

public sealed record ApiError(string Code, string Message);

/// <summary>Wire envelope. One JSON document per length-prefixed frame.</summary>
public sealed record ApiEnvelope(
    MessageKind Kind,
    string Id,
    string? Route = null,
    JsonElement? Payload = null,
    bool Success = true,
    ApiError? Error = null,
    EngineEvent? Event = null);

public static class ErrorCodes
{
    public const string UnknownRoute = "unknown_route";
    public const string InvalidRequest = "invalid_request";
    public const string NotFound = "not_found";
    public const string ElevationRequired = "elevation_required";
    public const string Refused = "refused";
    public const string Internal = "internal_error";
    public const string Busy = "busy";
}

// ----- Request payloads -----
public sealed record ScanRequest(int? SampleSeconds = null);
public sealed record IdRequest(string Id);
public sealed record ProcessListRequest(int Top = 50, bool IncludeSystem = true);
public sealed record SetPriorityRequest(int Pid, ProcessPriority Priority);
public sealed record TerminateProcessRequest(int Pid, bool UserConfirmed);
public sealed record StartupToggleRequest(string EntryId, bool Enabled);
public sealed record ApplyProfileRequest(string Name, bool DryRun = false);
public sealed record GameApplyRequest(string GameId, bool DryRun = false);
public sealed record CompareRequest(string BaselineId, string CandidateId);
public sealed record LogQuery(int Take = 200, NexusLogLevel MinLevel = NexusLogLevel.Info);

public static class NexusJson
{
    public static readonly JsonSerializerOptions Options = Create();

    private static JsonSerializerOptions Create()
    {
        var o = new JsonSerializerOptions(JsonSerializerDefaults.Web)
        {
            WriteIndented = false,
            DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        };
        o.Converters.Add(new JsonStringEnumConverter());
        return o;
    }

    public static readonly JsonSerializerOptions Indented = new(Options) { WriteIndented = true };

    public static JsonElement ToElement<T>(T value) => JsonSerializer.SerializeToElement(value, Options);
    public static T? FromElement<T>(JsonElement? element) =>
        element is null || element.Value.ValueKind is JsonValueKind.Undefined or JsonValueKind.Null
            ? default
            : element.Value.Deserialize<T>(Options);
}
