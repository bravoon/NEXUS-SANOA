using Nexus.Application.Services;
using Nexus.Contracts;
using Nexus.Contracts.Api;
using Nexus.Ipc;

namespace Nexus.Application.Hosting;

/// <summary>Maps API routes to application services. The only entry point of remote clients into the engine.</summary>
public sealed class ApiDispatcher(NexusApplication app) : IApiRequestHandler
{
    public async Task<ApiEnvelope> HandleAsync(ApiEnvelope request, CancellationToken ct)
    {
        try
        {
            var payload = await RouteAsync(request, ct).ConfigureAwait(false);
            return new ApiEnvelope(MessageKind.Response, request.Id, request.Route, payload is null ? null : NexusJson.ToElement(payload));
        }
        catch (Exception ex) when (ex is ArgumentException or FormatException or System.Text.Json.JsonException)
        {
            return NexusPipeServer.Error(request.Id, ErrorCodes.InvalidRequest, ex.Message);
        }
        catch (KeyNotFoundException ex)
        {
            return NexusPipeServer.Error(request.Id, ErrorCodes.NotFound, ex.Message);
        }
        catch (InvalidOperationException ex)
        {
            return NexusPipeServer.Error(request.Id, ErrorCodes.Refused, ex.Message);
        }
    }

    private static T Req<T>(ApiEnvelope r) => NexusJson.FromElement<T>(r.Payload) ?? throw new ArgumentException($"Payload of type {typeof(T).Name} is required.");

    private async Task<object?> RouteAsync(ApiEnvelope r, CancellationToken ct) => r.Route switch
    {
        ApiRoutes.SystemScan => await app.System.ScanAsync(NexusJson.FromElement<ScanRequest>(r.Payload)?.SampleSeconds, ct),
        ApiRoutes.SystemStatus => await app.System.StatusAsync(ct),
        ApiRoutes.SystemAnalyze => await app.System.AnalyzeAsync(ct),
        ApiRoutes.SystemTelemetry => app.System.Telemetry(ct),

        ApiRoutes.OptimizationRules => app.Optimization.Rules(),
        ApiRoutes.OptimizationRecommendations => await app.Optimization.RecommendationsAsync(ct),
        ApiRoutes.OptimizationPreview => await app.Optimization.PreviewAsync(Req<IdRequest>(r).Id, ct),
        ApiRoutes.OptimizationApply => await app.Optimization.ApplyAsync(Req<ExecuteOptimizationRequest>(r), ct),
        ApiRoutes.OptimizationRollback or ApiRoutes.RestoreRollback => await app.Restore.RollbackAsync(Req<RollbackRequest>(r), ct),

        ApiRoutes.Processes => await Task.Run(() => { var q = NexusJson.FromElement<ProcessListRequest>(r.Payload) ?? new(); return app.Processes.List(q.Top, q.IncludeSystem, ct); }, ct),
        ApiRoutes.ProcessSetPriority => await app.Processes.SetPriorityAsync(Req<SetPriorityRequest>(r).Pid, Req<SetPriorityRequest>(r).Priority, ct),
        ApiRoutes.ProcessTerminate => await app.Processes.TerminateAsync(Req<TerminateProcessRequest>(r).Pid, Req<TerminateProcessRequest>(r).UserConfirmed, ct),

        ApiRoutes.Startup => await Task.Run(app.Startup.List, ct),
        ApiRoutes.StartupSetEnabled => await app.Startup.SetEnabledAsync(Req<StartupToggleRequest>(r).EntryId, Req<StartupToggleRequest>(r).Enabled, ct),

        ApiRoutes.GamingGames => await Task.Run(app.Gaming.Games, ct),
        ApiRoutes.GamingLaunchers => await Task.Run(app.Gaming.Launchers, ct),
        ApiRoutes.GamingProfiles => app.Gaming.Profiles(),
        ApiRoutes.GamingSaveProfile => app.Gaming.SaveProfile(Req<GameProfile>(r)),
        ApiRoutes.GamingApply => await app.Gaming.ApplyAsync(Req<GameApplyRequest>(r).GameId, Req<GameApplyRequest>(r).DryRun, ct),

        ApiRoutes.Profiles => new { profiles = app.Profiles.List(), settings = app.Profiles.Settings() },
        ApiRoutes.ProfileSave => await app.Profiles.SaveAsync(Req<ProfileDefinition>(r), ct),
        ApiRoutes.ProfileApply => await app.Profiles.ApplyAsync(Req<ApplyProfileRequest>(r).Name, Req<ApplyProfileRequest>(r).DryRun, ct),

        ApiRoutes.BenchmarkStart => new IdRequest(app.Benchmark.Start(Req<BenchmarkRequest>(r))),
        ApiRoutes.BenchmarkStop => await app.Benchmark.StopAsync(Req<IdRequest>(r).Id),
        ApiRoutes.BenchmarkResults => app.Benchmark.Results(),
        ApiRoutes.BenchmarkCompare => app.Benchmark.Compare(Req<CompareRequest>(r).BaselineId, Req<CompareRequest>(r).CandidateId),

        ApiRoutes.RestoreHistory => app.Restore.History(),
        ApiRoutes.Logs => app.System.Logs((NexusJson.FromElement<LogQuery>(r.Payload) ?? new()).Take, (NexusJson.FromElement<LogQuery>(r.Payload) ?? new()).MinLevel),
        _ => throw new ArgumentException($"Route '{r.Route}' is not handled."),
    };
}
