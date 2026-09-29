using System.Collections.ObjectModel;
using System.Windows;
using Nexus.Contracts;
using Nexus.Contracts.Api;
using Nexus.Ipc;
using Nexus.UI.Infrastructure;
using Nexus.UI.Services;

namespace Nexus.UI.ViewModels;

public sealed record NavItem(string Title, string Glyph, PageViewModel Page);

/// <summary>Shell: navigation, connection state, status bar and live engine event feed.</summary>
public sealed class MainViewModel : ObservableObject
{
    private readonly EngineConnection _connection;
    private NavItem? _selected;
    private string _status = "Connecting to the Nexus engine…";
    private bool _connected;
    private SystemStatus? _engineStatus;

    public MainViewModel(EngineConnection connection)
    {
        _connection = connection;
        var api = new Api(() => _connection.Client);
        Dashboard = new DashboardViewModel(api);
        Nav =
        [
            new("Dashboard", "", Dashboard),
            new("Diagnostics", "", new DiagnosticsViewModel(api)),
            new("Optimizations", "", new OptimizationsViewModel(api)),
            new("Processes", "", new ProcessesViewModel(api)),
            new("Startup", "", new StartupViewModel(api)),
            new("Gaming", "", new GamingViewModel(api)),
            new("Benchmark", "", new BenchmarkViewModel(api)),
            new("Profiles", "", new ProfilesViewModel(api)),
            new("History & Restore", "", new HistoryViewModel(api)),
        ];
        Selected = Nav[0];
        AsyncCommand.ErrorHandler = ex => Status = ex is NexusApiException a ? $"{a.Code}: {a.Message}" : ex.Message;
    }

    public DashboardViewModel Dashboard { get; }
    public IReadOnlyList<NavItem> Nav { get; }
    public ObservableCollection<EngineEvent> Events { get; } = [];

    public NavItem? Selected
    {
        get => _selected;
        set
        {
            if (Set(ref _selected, value) && value is not null && _connected) _ = value.Page.ActivateAsync();
        }
    }

    public string Status { get => _status; set => Set(ref _status, value); }
    public bool Connected { get => _connected; private set => Set(ref _connected, value); }
    public SystemStatus? EngineStatus { get => _engineStatus; private set => Set(ref _engineStatus, value); }

    public async Task StartAsync()
    {
        try
        {
            _connection.EventReceived += e => Application.Current.Dispatcher.BeginInvoke(() => OnEvent(e));
            _connection.Disconnected += () => Application.Current.Dispatcher.BeginInvoke(() => { Connected = false; Status = "Disconnected from the engine."; });
            await _connection.ConnectAsync();
            Connected = true;
            EngineStatus = await _connection.Client!.SendAsync<SystemStatus>(ApiRoutes.SystemStatus);
            Status = EngineStatus!.IsSimulated ? "Connected — SIMULATION MODE (your PC is not modified)" : "Connected to the Nexus engine";
            if (Selected is not null) await Selected.Page.ActivateAsync();
        }
        catch (Exception ex)
        {
            Status = "Engine unavailable: " + ex.Message;
        }
    }

    private void OnEvent(EngineEvent e)
    {
        Events.Insert(0, e);
        while (Events.Count > 200) Events.RemoveAt(Events.Count - 1);
        if (e.Type is not (EngineEventType.ScanProgress or EngineEventType.BenchmarkUpdated)) Status = e.Message;
        foreach (var n in Nav) n.Page.OnEngineEvent(e);
    }
}

/// <summary>Thin typed wrapper around the pipe client, shared by page view models.</summary>
public sealed class Api(Func<NexusApiClient?> client)
{
    private NexusApiClient C => client() ?? throw new InvalidOperationException("Not connected to the engine.");
    public Task<T?> Get<T>(string route, object? payload = null) => C.SendAsync<T>(route, payload);
}

public abstract class PageViewModel : ObservableObject
{
    private bool _busy;
    private string? _message;
    private bool _loaded;

    protected PageViewModel(Api api) => Api = api;
    protected Api Api { get; }

    public bool Busy { get => _busy; protected set => Set(ref _busy, value); }
    public string? Message { get => _message; protected set => Set(ref _message, value); }

    public async Task ActivateAsync()
    {
        if (_loaded) return;
        _loaded = true;
        await Run(LoadAsync);
    }

    protected virtual Task LoadAsync() => Task.CompletedTask;
    public virtual void OnEngineEvent(EngineEvent e) { }

    protected async Task Run(Func<Task> work)
    {
        Busy = true;
        try { await work(); }
        catch (NexusApiException ex) { Message = ex.Message; }
        catch (Exception ex) { Message = ex.Message; }
        finally { Busy = false; }
    }
}
