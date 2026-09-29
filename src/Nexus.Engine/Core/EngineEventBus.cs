using Nexus.Contracts;
using Nexus.Contracts.Api;

namespace Nexus.Engine.Core;

public interface IEngineEvents
{
    IDisposable Subscribe(Action<EngineEvent> handler);
}

/// <summary>In-process event bus. Handlers are isolated: one failing subscriber never affects the engine.</summary>
public sealed class EngineEventBus : IEngineEvents
{
    private readonly object _gate = new();
    private Action<EngineEvent>[] _handlers = [];

    public IDisposable Subscribe(Action<EngineEvent> handler)
    {
        lock (_gate) _handlers = [.. _handlers, handler];
        return new Unsubscriber(() => { lock (_gate) _handlers = _handlers.Where(h => h != handler).ToArray(); });
    }

    public void Publish(EngineEventType type, string message, string? correlationId = null, double? progress = null, object? data = null)
    {
        var e = new EngineEvent(type, DateTimeOffset.UtcNow, correlationId, progress, message,
            data is null ? null : NexusJson.ToElement(data));
        foreach (var h in _handlers)
        {
            try { h(e); } catch { /* subscriber errors are ignored by design */ }
        }
    }

    private sealed class Unsubscriber(Action dispose) : IDisposable
    {
        private Action? _dispose = dispose;
        public void Dispose() => Interlocked.Exchange(ref _dispose, null)?.Invoke();
    }
}
