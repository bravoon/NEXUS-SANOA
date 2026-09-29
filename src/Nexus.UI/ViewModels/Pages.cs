using System.Collections.ObjectModel;
using System.Windows;
using System.Windows.Threading;
using Nexus.Contracts;
using Nexus.Contracts.Api;
using Nexus.UI.Infrastructure;

namespace Nexus.UI.ViewModels;

public sealed class DashboardViewModel : PageViewModel
{
    private readonly DispatcherTimer _timer = new() { Interval = TimeSpan.FromSeconds(2) };
    private SystemStatus? _status;
    private HardwareSample? _live;

    public DashboardViewModel(Api api) : base(api)
    {
        _timer.Tick += async (_, _) => { try { Live = await Api.Get<HardwareSample>(ApiRoutes.SystemTelemetry); } catch { } };
        RefreshCommand = new AsyncCommand(() => Run(LoadAsync));
    }

    public AsyncCommand RefreshCommand { get; }
    public SystemStatus? Status { get => _status; private set => Set(ref _status, value); }

    public HardwareSample? Live
    {
        get => _live;
        private set
        {
            Set(ref _live, value);
            Raise(nameof(Cpu)); Raise(nameof(Gpu)); Raise(nameof(Memory)); Raise(nameof(Disk)); Raise(nameof(CpuTemp)); Raise(nameof(GpuTemp));
        }
    }

    public string Cpu => Format.Reading(Live?.Cpu.Utilization);
    public string CpuTemp => Format.Reading(Live?.Cpu.Temperature);
    public string Gpu => Live?.Gpus.Count > 0 ? Format.Reading(Live.Gpus[0].Utilization) : "n/a";
    public string GpuTemp => Live?.Gpus.Count > 0 ? Format.Reading(Live.Gpus[0].Temperature) : "n/a";
    public string Memory => Live is null ? "n/a" : $"{Format.Reading(Live.Memory.Used)} / {Format.Reading(Live.Memory.Total)}";
    public string Disk => Live?.Storage.Count > 0 ? Format.Reading(Live.Storage[0].ActiveTime) : "n/a";

    protected override async Task LoadAsync()
    {
        Status = await Api.Get<SystemStatus>(ApiRoutes.SystemStatus);
        Live = Status?.Live;
        _timer.Start();
    }

    public override void OnEngineEvent(EngineEvent e)
    {
        if (e.Type is EngineEventType.OptimizationCompleted or EngineEventType.RollbackCompleted or EngineEventType.ProfileApplied or EngineEventType.ScanCompleted)
            _ = Run(async () => Status = await Api.Get<SystemStatus>(ApiRoutes.SystemStatus));
    }
}

public sealed class DiagnosticsViewModel : PageViewModel
{
    private AnalysisReport? _report;
    private SystemSnapshot? _snapshot;
    private double _progress;
    private int _seconds = 10;

    public DiagnosticsViewModel(Api api) : base(api) =>
        ScanCommand = new AsyncCommand(() => Run(async () =>
        {
            Message = "Scanning… run your game or workload now for a meaningful bottleneck analysis.";
            Snapshot = await Api.Get<SystemSnapshot>(ApiRoutes.SystemScan, new ScanRequest(SampleSeconds));
            Report = await Api.Get<AnalysisReport>(ApiRoutes.SystemAnalyze);
            Message = null;
        }));

    public AsyncCommand ScanCommand { get; }
    public int SampleSeconds { get => _seconds; set => Set(ref _seconds, Math.Clamp(value, 1, 120)); }
    public double Progress { get => _progress; private set => Set(ref _progress, value); }
    public SystemSnapshot? Snapshot { get => _snapshot; private set => Set(ref _snapshot, value); }
    public AnalysisReport? Report { get => _report; private set => Set(ref _report, value); }

    public override void OnEngineEvent(EngineEvent e)
    {
        if (e.Type is EngineEventType.ScanStarted) Progress = 0;
        if (e.Type is EngineEventType.ScanProgress or EngineEventType.ScanCompleted && e.Progress is { } p) Progress = p * 100;
    }
}

public sealed class RecommendationItem(OptimizationRecommendation r) : ObservableObject
{
    private bool _selected;
    public OptimizationRecommendation R { get; } = r;
    public bool Selectable => R.Status is RecommendationStatus.Recommended or RecommendationStatus.Optional;
    public bool IsSelected { get => _selected; set => Set(ref _selected, value && Selectable); }
}

public sealed class OptimizationsViewModel : PageViewModel
{
    private RecommendationItem? _current;
    private OptimizationPreview? _preview;
    private ExecutionResult? _result;
    private bool _showAll;
    private List<OptimizationRecommendation> _all = [];

    public OptimizationsViewModel(Api api) : base(api)
    {
        RefreshCommand = new AsyncCommand(() => Run(LoadAsync));
        SelectRecommendedCommand = new RelayCommand(_ => { foreach (var i in Items) i.IsSelected = i.R.Status == RecommendationStatus.Recommended; });
        ApplyCommand = new AsyncCommand(() => Run(() => ApplyAsync()), () => Items.Any(i => i.IsSelected));
        DryRunCommand = new AsyncCommand(() => Run(() => ApplyAsync(dryRun: true)), () => Items.Any(i => i.IsSelected));
    }

    public ObservableCollection<RecommendationItem> Items { get; } = [];
    public AsyncCommand RefreshCommand { get; }
    public RelayCommand SelectRecommendedCommand { get; }
    public AsyncCommand ApplyCommand { get; }
    public AsyncCommand DryRunCommand { get; }
    public OptimizationPreview? Preview { get => _preview; private set => Set(ref _preview, value); }
    public ExecutionResult? Result { get => _result; private set => Set(ref _result, value); }

    public bool ShowAll { get => _showAll; set { if (Set(ref _showAll, value)) Fill(); } }

    public RecommendationItem? Current
    {
        get => _current;
        set
        {
            if (Set(ref _current, value) && value is not null)
                _ = Run(async () => Preview = await Api.Get<OptimizationPreview>(ApiRoutes.OptimizationPreview, new IdRequest(value.R.OptimizationId)));
        }
    }

    protected override async Task LoadAsync()
    {
        _all = await Api.Get<List<OptimizationRecommendation>>(ApiRoutes.OptimizationRecommendations) ?? [];
        Fill();
    }

    private void Fill()
    {
        Items.Clear();
        foreach (var r in _all.Where(r => ShowAll || r.Status is RecommendationStatus.Recommended or RecommendationStatus.Optional))
            Items.Add(new RecommendationItem(r));
    }

    private async Task ApplyAsync(bool dryRun = false)
    {
        var ids = Items.Where(i => i.IsSelected).Select(i => i.R.OptimizationId).ToList();
        if (!dryRun && MessageBox.Show($"Apply {ids.Count} optimization(s) as one transaction?\n\nA backup is taken first and everything can be undone from History & Restore.",
                "NEXUS OPTIMIZER", MessageBoxButton.OKCancel, MessageBoxImage.Question) != MessageBoxResult.OK) return;
        Result = await Api.Get<ExecutionResult>(ApiRoutes.OptimizationApply, new ExecuteOptimizationRequest(ids, dryRun));
        if (!dryRun) await LoadAsync();
    }
}

public sealed class ProcessesViewModel : PageViewModel
{
    private ProcessInfo? _selected;

    public ProcessesViewModel(Api api) : base(api)
    {
        RefreshCommand = new AsyncCommand(() => Run(LoadAsync));
        PriorityCommand = new AsyncCommand(p => Run(async () =>
        {
            if (Selected is null || p is not string s) return;
            var r = await Api.Get<ProcessActionResult>(ApiRoutes.ProcessSetPriority, new SetPriorityRequest(Selected.Pid, Enum.Parse<ProcessPriority>(s)));
            Message = r?.Message;
        }), _ => Selected is not null);
        TerminateCommand = new AsyncCommand(_ => Run(async () =>
        {
            if (Selected is null) return;
            if (MessageBox.Show($"Terminate {Selected.Name} (PID {Selected.Pid})?\nUnsaved work in this program will be lost. This cannot be undone.",
                    "NEXUS OPTIMIZER", MessageBoxButton.YesNo, MessageBoxImage.Warning) != MessageBoxResult.Yes) return;
            var r = await Api.Get<ProcessActionResult>(ApiRoutes.ProcessTerminate, new TerminateProcessRequest(Selected.Pid, true));
            Message = r?.Message;
            await LoadAsync();
        }), _ => Selected is { IsProtected: false });
    }

    public ObservableCollection<ProcessInfo> Items { get; } = [];
    public ProcessInfo? Selected { get => _selected; set => Set(ref _selected, value); }
    public AsyncCommand RefreshCommand { get; }
    public AsyncCommand PriorityCommand { get; }
    public AsyncCommand TerminateCommand { get; }
    public IReadOnlyList<string> Priorities { get; } = ["Idle", "BelowNormal", "Normal", "AboveNormal", "High"];

    protected override async Task LoadAsync()
    {
        var list = await Api.Get<List<ProcessInfo>>(ApiRoutes.Processes, new ProcessListRequest(500)) ?? [];
        Items.Clear();
        foreach (var p in list) Items.Add(p);
    }
}

public sealed class StartupViewModel : PageViewModel
{
    public StartupViewModel(Api api) : base(api)
    {
        RefreshCommand = new AsyncCommand(() => Run(LoadAsync));
        ToggleCommand = new AsyncCommand(p => Run(async () =>
        {
            if (p is not StartupEntryInfo e) return;
            var r = await Api.Get<ExecutionResult>(ApiRoutes.StartupSetEnabled, new StartupToggleRequest(e.Id, !e.Enabled));
            Message = r is null ? null : $"{r.Status}: {string.Join(" ", r.Messages)}";
            await LoadAsync();
        }));
    }

    public ObservableCollection<StartupEntryInfo> Items { get; } = [];
    public AsyncCommand RefreshCommand { get; }
    public AsyncCommand ToggleCommand { get; }

    protected override async Task LoadAsync()
    {
        var list = await Api.Get<List<StartupEntryInfo>>(ApiRoutes.Startup) ?? [];
        Items.Clear();
        foreach (var e in list.OrderByDescending(x => x.Enabled).ThenByDescending(x => x.Impact)) Items.Add(e);
    }
}

public sealed class GamingViewModel : PageViewModel
{
    private GameInfo? _game;
    private string _priority = "High";
    private string _gpu = "highPerformance";
    private string _background = "";
    private bool _auto = true;
    private ExecutionResult? _result;

    public GamingViewModel(Api api) : base(api)
    {
        RefreshCommand = new AsyncCommand(() => Run(LoadAsync));
        SaveCommand = new AsyncCommand(() => Run(async () =>
        {
            var g = Game!;
            await Api.Get<GameProfile>(ApiRoutes.GamingSaveProfile, new GameProfile(g.GameId, g.Executable ?? g.Name,
                Enum.Parse<ProcessPriority>(Priority), null, new Dictionary<string, string> { ["gpuPreference"] = GpuPreference }, null,
                Background.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries), AutoApply));
            Message = $"Profile saved for {g.Name}.";
            await LoadAsync();
        }), () => Game is not null);
        ApplyCommand = new AsyncCommand(() => Run(async () =>
            Result = await Api.Get<ExecutionResult>(ApiRoutes.GamingApply, new GameApplyRequest(Game!.GameId))), () => Game is not null);
    }

    public ObservableCollection<GameInfo> Games { get; } = [];
    public ObservableCollection<LauncherInfo> Launchers { get; } = [];
    public ObservableCollection<GameProfile> Profiles { get; } = [];
    public AsyncCommand RefreshCommand { get; }
    public AsyncCommand SaveCommand { get; }
    public AsyncCommand ApplyCommand { get; }
    public IReadOnlyList<string> Priorities { get; } = ["Normal", "AboveNormal", "High"];
    public IReadOnlyList<string> GpuPreferences { get; } = ["default", "powerSaving", "highPerformance"];

    public GameInfo? Game { get => _game; set => Set(ref _game, value); }
    public string Priority { get => _priority; set => Set(ref _priority, value); }
    public string GpuPreference { get => _gpu; set => Set(ref _gpu, value); }
    public string Background { get => _background; set => Set(ref _background, value); }
    public bool AutoApply { get => _auto; set => Set(ref _auto, value); }
    public ExecutionResult? Result { get => _result; private set => Set(ref _result, value); }

    protected override async Task LoadAsync()
    {
        Replace(Games, await Api.Get<List<GameInfo>>(ApiRoutes.GamingGames));
        Replace(Launchers, await Api.Get<List<LauncherInfo>>(ApiRoutes.GamingLaunchers));
        Replace(Profiles, await Api.Get<List<GameProfile>>(ApiRoutes.GamingProfiles));
    }

    internal static void Replace<T>(ObservableCollection<T> target, IEnumerable<T>? items)
    {
        target.Clear();
        foreach (var i in items ?? []) target.Add(i);
    }
}

public sealed class BenchmarkViewModel : PageViewModel
{
    private string _name = "Baseline";
    private int _duration = 60;
    private string _process = "";
    private string? _runningId;
    private double _progress;
    private BenchmarkResult? _baseline, _candidate;
    private BenchmarkComparison? _comparison;

    public BenchmarkViewModel(Api api) : base(api)
    {
        StartCommand = new AsyncCommand(() => Run(async () =>
        {
            var id = await Api.Get<IdRequest>(ApiRoutes.BenchmarkStart,
                new BenchmarkRequest(Name, TimeSpan.FromSeconds(Duration), string.IsNullOrWhiteSpace(ProcessName) ? null : ProcessName.Trim()));
            RunningId = id?.Id;
        }), () => RunningId is null);
        StopCommand = new AsyncCommand(() => Run(async () => { await Api.Get<BenchmarkResult>(ApiRoutes.BenchmarkStop, new IdRequest(RunningId!)); }), () => RunningId is not null);
        CompareCommand = new AsyncCommand(() => Run(async () =>
            Comparison = await Api.Get<BenchmarkComparison>(ApiRoutes.BenchmarkCompare, new CompareRequest(Baseline!.BenchmarkId, Candidate!.BenchmarkId))),
            () => Baseline is not null && Candidate is not null && Baseline != Candidate);
        RefreshCommand = new AsyncCommand(() => Run(LoadAsync));
    }

    public ObservableCollection<BenchmarkResult> Results { get; } = [];
    public AsyncCommand StartCommand { get; }
    public AsyncCommand StopCommand { get; }
    public AsyncCommand CompareCommand { get; }
    public AsyncCommand RefreshCommand { get; }
    public string Name { get => _name; set => Set(ref _name, value); }
    public int Duration { get => _duration; set => Set(ref _duration, Math.Clamp(value, 5, 3600)); }
    public string ProcessName { get => _process; set => Set(ref _process, value); }
    public string? RunningId { get => _runningId; private set => Set(ref _runningId, value); }
    public double Progress { get => _progress; private set => Set(ref _progress, value); }
    public BenchmarkResult? Baseline { get => _baseline; set => Set(ref _baseline, value); }
    public BenchmarkResult? Candidate { get => _candidate; set => Set(ref _candidate, value); }
    public BenchmarkComparison? Comparison { get => _comparison; private set => Set(ref _comparison, value); }

    protected override async Task LoadAsync() => GamingViewModel.Replace(Results, await Api.Get<List<BenchmarkResult>>(ApiRoutes.BenchmarkResults));

    public override void OnEngineEvent(EngineEvent e)
    {
        if (e.CorrelationId != RunningId || RunningId is null) return;
        if (e.Type == EngineEventType.BenchmarkUpdated && e.Progress is { } p) Progress = p * 100;
        if (e.Type == EngineEventType.BenchmarkCompleted)
        {
            RunningId = null;
            Progress = 100;
            _ = Run(LoadAsync);
        }
    }
}

public sealed class ProfilesViewModel : PageViewModel
{
    private ProfileDefinition? _selected;
    private ExecutionResult? _result;

    public ProfilesViewModel(Api api) : base(api)
    {
        PreviewCommand = new AsyncCommand(() => Run(async () => Result = await Api.Get<ExecutionResult>(ApiRoutes.ProfileApply, new ApplyProfileRequest(Selected!.Name, true))), () => Selected is not null);
        ApplyCommand = new AsyncCommand(() => Run(async () => Result = await Api.Get<ExecutionResult>(ApiRoutes.ProfileApply, new ApplyProfileRequest(Selected!.Name))), () => Selected is not null);
    }

    public ObservableCollection<ProfileDefinition> Profiles { get; } = [];
    public ObservableCollection<ProfileSettingDescriptor> Settings { get; } = [];
    public AsyncCommand PreviewCommand { get; }
    public AsyncCommand ApplyCommand { get; }
    public ProfileDefinition? Selected { get => _selected; set => Set(ref _selected, value); }
    public ExecutionResult? Result { get => _result; private set => Set(ref _result, value); }

    private sealed record ProfilesPayload(List<ProfileDefinition> Profiles, List<ProfileSettingDescriptor> Settings);

    protected override async Task LoadAsync()
    {
        var p = await Api.Get<ProfilesPayload>(ApiRoutes.Profiles);
        GamingViewModel.Replace(Profiles, p?.Profiles);
        GamingViewModel.Replace(Settings, p?.Settings);
    }
}

public sealed class HistoryViewModel : PageViewModel
{
    private OptimizationTransaction? _selected;
    private RollbackResult? _result;

    public HistoryViewModel(Api api) : base(api)
    {
        RefreshCommand = new AsyncCommand(() => Run(LoadAsync));
        RollbackCommand = new AsyncCommand(() => Run(() => Rollback(null)), () => Selected is not null);
        RollbackItemCommand = new AsyncCommand(p => Run(() => Rollback((p as TransactionItem)?.ItemId)), p => p is TransactionItem { Status: TransactionItemStatus.Applied });
    }

    public ObservableCollection<OptimizationTransaction> Items { get; } = [];
    public AsyncCommand RefreshCommand { get; }
    public AsyncCommand RollbackCommand { get; }
    public AsyncCommand RollbackItemCommand { get; }
    public OptimizationTransaction? Selected { get => _selected; set => Set(ref _selected, value); }
    public RollbackResult? Result { get => _result; private set => Set(ref _result, value); }

    protected override async Task LoadAsync() => GamingViewModel.Replace(Items, await Api.Get<List<OptimizationTransaction>>(ApiRoutes.RestoreHistory));

    private async Task Rollback(string? itemId)
    {
        Result = await Api.Get<RollbackResult>(ApiRoutes.RestoreRollback, new RollbackRequest(Selected!.TransactionId, itemId));
        await LoadAsync();
    }

    public override void OnEngineEvent(EngineEvent e)
    {
        if (e.Type is EngineEventType.OptimizationCompleted or EngineEventType.OptimizationFailed or EngineEventType.RollbackCompleted) _ = Run(LoadAsync);
    }
}
