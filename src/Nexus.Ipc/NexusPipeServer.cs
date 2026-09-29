using System.IO.Pipes;
using System.Runtime.Versioning;
using System.Security.AccessControl;
using System.Security.Principal;
using Nexus.Contracts;
using Nexus.Contracts.Api;

namespace Nexus.Ipc;

public interface IApiRequestHandler
{
    Task<ApiEnvelope> HandleAsync(ApiEnvelope request, CancellationToken ct);
}

/// <summary>
/// Local-only API server. Security:
///  • Windows: pipe ACL grants access only to the current user and explicitly denies NETWORK logons;
///  • elsewhere: PipeOptions.CurrentUserOnly;
///  • only routes from <see cref="ApiRoutes"/> are accepted, frames are size-limited, errors never leak stack traces.
/// </summary>
public sealed class NexusPipeServer : IAsyncDisposable
{
    private readonly string _pipeName;
    private readonly IApiRequestHandler _handler;
    private readonly Action<string>? _diagnostic;
    private readonly List<Connection> _connections = [];
    private readonly CancellationTokenSource _cts = new();
    private Task? _acceptLoop;
    private const int MaxInstances = 8;

    public NexusPipeServer(string pipeName, IApiRequestHandler handler, Action<string>? diagnostic = null)
    {
        _pipeName = pipeName;
        _handler = handler;
        _diagnostic = diagnostic;
    }

    public void Start() => _acceptLoop = Task.Run(() => AcceptLoop(_cts.Token));

    private NamedPipeServerStream CreatePipe()
    {
        if (OperatingSystem.IsWindows()) return CreateWindowsPipe();
        return new NamedPipeServerStream(_pipeName, PipeDirection.InOut, MaxInstances, PipeTransmissionMode.Byte,
            PipeOptions.Asynchronous | PipeOptions.CurrentUserOnly);
    }

    [SupportedOSPlatform("windows")]
    private NamedPipeServerStream CreateWindowsPipe()
    {
        var security = new PipeSecurity();
        using var identity = WindowsIdentity.GetCurrent();
        security.AddAccessRule(new PipeAccessRule(identity.User!, PipeAccessRights.ReadWrite | PipeAccessRights.CreateNewInstance, AccessControlType.Allow));
        security.AddAccessRule(new PipeAccessRule(new SecurityIdentifier(WellKnownSidType.NetworkSid, null), PipeAccessRights.FullControl, AccessControlType.Deny));
        return NamedPipeServerStreamAcl.Create(_pipeName, PipeDirection.InOut, MaxInstances, PipeTransmissionMode.Byte,
            PipeOptions.Asynchronous, 0, 0, security);
    }

    private async Task AcceptLoop(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            NamedPipeServerStream pipe;
            try
            {
                pipe = CreatePipe();
                await pipe.WaitForConnectionAsync(ct).ConfigureAwait(false);
            }
            catch (OperationCanceledException) { break; }
            catch (IOException ex)
            {
                _diagnostic?.Invoke($"Pipe accept failed: {ex.Message}");
                await Task.Delay(500, ct).ConfigureAwait(false);
                continue;
            }
            var conn = new Connection(pipe);
            lock (_connections) _connections.Add(conn);
            _ = Task.Run(() => Serve(conn, ct), ct);
        }
    }

    private async Task Serve(Connection conn, CancellationToken ct)
    {
        try
        {
            while (!ct.IsCancellationRequested && conn.Pipe.IsConnected)
            {
                ApiEnvelope? request;
                try { request = await MessageFraming.ReadAsync(conn.Pipe, ct).ConfigureAwait(false); }
                catch (Exception ex) when (ex is InvalidDataException or System.Text.Json.JsonException)
                {
                    _diagnostic?.Invoke($"Malformed frame: {ex.Message}");
                    break; // protocol violation: drop the connection
                }
                if (request is null) break;
                _ = Task.Run(async () =>
                {
                    var response = await Dispatch(conn, request, ct).ConfigureAwait(false);
                    await conn.SendAsync(response, ct).ConfigureAwait(false);
                }, ct);
            }
        }
        catch (Exception ex) when (ex is IOException or OperationCanceledException or ObjectDisposedException) { }
        finally
        {
            lock (_connections) _connections.Remove(conn);
            await conn.Pipe.DisposeAsync().ConfigureAwait(false);
        }
    }

    private async Task<ApiEnvelope> Dispatch(Connection conn, ApiEnvelope request, CancellationToken ct)
    {
        if (request.Kind != MessageKind.Request || request.Route is null || !ApiRoutes.All.Contains(request.Route))
            return Error(request.Id, ErrorCodes.UnknownRoute, $"Unknown route '{request.Route}'.");
        if (request.Route == ApiRoutes.EventsSubscribe)
        {
            conn.Subscribed = true;
            return new ApiEnvelope(MessageKind.Response, request.Id, request.Route);
        }
        try
        {
            return await _handler.HandleAsync(request, ct).ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            _diagnostic?.Invoke($"Handler error on {request.Route}: {ex}");
            return Error(request.Id, ErrorCodes.Internal, ex.Message);
        }
    }

    public static ApiEnvelope Error(string id, string code, string message) =>
        new(MessageKind.Response, id, Success: false, Error: new ApiError(code, message));

    /// <summary>Pushes an engine event to every client that subscribed.</summary>
    public void Broadcast(EngineEvent e)
    {
        Connection[] targets;
        lock (_connections) targets = _connections.Where(c => c.Subscribed).ToArray();
        foreach (var c in targets)
            _ = c.SendAsync(new ApiEnvelope(MessageKind.Event, Guid.NewGuid().ToString("N"), Event: e), _cts.Token);
    }

    public int ConnectionCount { get { lock (_connections) return _connections.Count; } }

    public async ValueTask DisposeAsync()
    {
        _cts.Cancel();
        if (_acceptLoop is not null) { try { await _acceptLoop.ConfigureAwait(false); } catch { } }
        Connection[] all;
        lock (_connections) all = _connections.ToArray();
        foreach (var c in all) await c.Pipe.DisposeAsync().ConfigureAwait(false);
        _cts.Dispose();
    }

    private sealed class Connection(NamedPipeServerStream pipe)
    {
        private readonly SemaphoreSlim _write = new(1, 1);
        public NamedPipeServerStream Pipe { get; } = pipe;
        public volatile bool Subscribed;

        public async Task SendAsync(ApiEnvelope message, CancellationToken ct)
        {
            await _write.WaitAsync(ct).ConfigureAwait(false);
            try { if (Pipe.IsConnected) await MessageFraming.WriteAsync(Pipe, message, ct).ConfigureAwait(false); }
            catch (Exception ex) when (ex is IOException or ObjectDisposedException or OperationCanceledException) { }
            finally { _write.Release(); }
        }
    }
}
