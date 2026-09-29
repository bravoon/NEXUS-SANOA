using System.Diagnostics;
using System.IO;
using Nexus.Contracts;
using Nexus.Ipc;

namespace Nexus.UI.Services;

/// <summary>
/// Connects the UI to the engine host ("nexus serve") over the per-user named pipe, starting the host if needed.
/// This is the UI's only link to the optimization engine.
/// </summary>
public sealed class EngineConnection : IAsyncDisposable
{
    private readonly bool _simulate;
    private Process? _hostProcess;

    public EngineConnection(bool simulate) => _simulate = simulate;

    public NexusApiClient? Client { get; private set; }
    public event Action<EngineEvent>? EventReceived;
    public event Action? Disconnected;

    public async Task ConnectAsync(CancellationToken ct = default)
    {
        var pipe = PipeNames.ForCurrentUser(_simulate);
        if (!await TryConnect(pipe, TimeSpan.FromMilliseconds(600), ct))
        {
            StartHost();
            var deadline = DateTime.UtcNow.AddSeconds(20);
            while (!await TryConnect(pipe, TimeSpan.FromSeconds(1), ct))
                if (DateTime.UtcNow > deadline) throw new TimeoutException("The Nexus engine did not start. Run 'nexus serve' manually to see why.");
        }
        Client!.EventReceived += e => EventReceived?.Invoke(e);
        Client.Disconnected += () => Disconnected?.Invoke();
        await Client.SubscribeEventsAsync(ct);
    }

    private async Task<bool> TryConnect(string pipe, TimeSpan timeout, CancellationToken ct)
    {
        var client = new NexusApiClient(pipe);
        try
        {
            await client.ConnectAsync(timeout, ct);
            Client = client;
            return true;
        }
        catch (Exception ex) when (ex is TimeoutException or IOException or UnauthorizedAccessException)
        {
            await client.DisposeAsync();
            return false;
        }
    }

    /// <summary>Starts the engine host that ships next to the UI. The host runs as the current user (never elevated).</summary>
    private void StartHost()
    {
        var exe = Path.Combine(AppContext.BaseDirectory, "nexus.exe");
        if (!File.Exists(exe)) throw new FileNotFoundException("Engine host 'nexus.exe' was not found next to the application.", exe);
        var psi = new ProcessStartInfo(exe) { UseShellExecute = false, CreateNoWindow = true };
        psi.ArgumentList.Add("serve");
        psi.ArgumentList.Add("--idle-exit");
        psi.ArgumentList.Add("30"); // the host stops by itself shortly after the last client disconnects
        if (_simulate) psi.ArgumentList.Add("--simulate");
        _hostProcess = Process.Start(psi);
    }

    public async ValueTask DisposeAsync()
    {
        // Disconnecting is enough: a host started by the UI exits on its own after 30 s without clients (--idle-exit).
        if (Client is not null) await Client.DisposeAsync();
        _hostProcess?.Dispose();
    }
}
