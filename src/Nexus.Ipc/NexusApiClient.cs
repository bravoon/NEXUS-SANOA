using System.Collections.Concurrent;
using System.IO.Pipes;
using Nexus.Contracts;
using Nexus.Contracts.Api;

namespace Nexus.Ipc;

public sealed class NexusApiException(string code, string message) : Exception(message)
{
    public string Code { get; } = code;
}

/// <summary>
/// Client of the internal API. This is everything a UI needs: typed request/response over the pipe plus a stream
/// of engine events. It carries no optimization logic.
/// </summary>
public sealed class NexusApiClient : IAsyncDisposable
{
    private readonly string _pipeName;
    private NamedPipeClientStream? _pipe;
    private readonly ConcurrentDictionary<string, TaskCompletionSource<ApiEnvelope>> _pending = new();
    private readonly SemaphoreSlim _write = new(1, 1);
    private CancellationTokenSource? _cts;

    public NexusApiClient(string pipeName) => _pipeName = pipeName;

    public event Action<EngineEvent>? EventReceived;
    public event Action? Disconnected;
    public bool IsConnected => _pipe?.IsConnected == true;
    public TimeSpan RequestTimeout { get; set; } = TimeSpan.FromMinutes(10);

    public async Task ConnectAsync(TimeSpan timeout, CancellationToken ct = default)
    {
        // CurrentUserOnly makes the client verify that the server pipe is owned by the same user (anti-squatting).
        var pipe = new NamedPipeClientStream(".", _pipeName, PipeDirection.InOut, PipeOptions.Asynchronous | PipeOptions.CurrentUserOnly);
        await pipe.ConnectAsync((int)timeout.TotalMilliseconds, ct).ConfigureAwait(false);
        _pipe = pipe;
        _cts = new CancellationTokenSource();
        _ = Task.Run(() => ReadLoop(_cts.Token));
    }

    private async Task ReadLoop(CancellationToken ct)
    {
        try
        {
            while (!ct.IsCancellationRequested && _pipe is { IsConnected: true })
            {
                var msg = await MessageFraming.ReadAsync(_pipe, ct).ConfigureAwait(false);
                if (msg is null) break;
                if (msg.Kind == MessageKind.Event && msg.Event is not null) EventReceived?.Invoke(msg.Event);
                else if (_pending.TryRemove(msg.Id, out var tcs)) tcs.TrySetResult(msg);
            }
        }
        catch (Exception ex) when (ex is IOException or OperationCanceledException or ObjectDisposedException or InvalidDataException) { }
        foreach (var p in _pending) p.Value.TrySetException(new IOException("Connection to the Nexus engine was lost."));
        _pending.Clear();
        Disconnected?.Invoke();
    }

    public async Task<TResponse?> SendAsync<TResponse>(string route, object? payload = null, CancellationToken ct = default)
    {
        var response = await SendRawAsync(route, payload, ct).ConfigureAwait(false);
        return NexusJson.FromElement<TResponse>(response.Payload);
    }

    public async Task SendAsync(string route, object? payload = null, CancellationToken ct = default) =>
        await SendRawAsync(route, payload, ct).ConfigureAwait(false);

    private async Task<ApiEnvelope> SendRawAsync(string route, object? payload, CancellationToken ct)
    {
        if (_pipe is not { IsConnected: true }) throw new IOException("Not connected to the Nexus engine.");
        var id = Guid.NewGuid().ToString("N");
        var tcs = new TaskCompletionSource<ApiEnvelope>(TaskCreationOptions.RunContinuationsAsynchronously);
        _pending[id] = tcs;
        var request = new ApiEnvelope(MessageKind.Request, id, route, payload is null ? null : NexusJson.ToElement(payload));
        await _write.WaitAsync(ct).ConfigureAwait(false);
        try { await MessageFraming.WriteAsync(_pipe, request, ct).ConfigureAwait(false); }
        finally { _write.Release(); }

        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
        timeout.CancelAfter(RequestTimeout);
        using (timeout.Token.Register(() => { if (_pending.TryRemove(id, out var t)) t.TrySetCanceled(); }))
        {
            var response = await tcs.Task.ConfigureAwait(false);
            if (!response.Success) throw new NexusApiException(response.Error?.Code ?? ErrorCodes.Internal, response.Error?.Message ?? "Request failed.");
            return response;
        }
    }

    public Task SubscribeEventsAsync(CancellationToken ct = default) => SendAsync(ApiRoutes.EventsSubscribe, null, ct);

    public async ValueTask DisposeAsync()
    {
        _cts?.Cancel();
        if (_pipe is not null) await _pipe.DisposeAsync().ConfigureAwait(false);
        _cts?.Dispose();
    }
}
