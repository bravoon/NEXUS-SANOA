using Nexus.Contracts;
using Nexus.Data.Configuration;
using Nexus.Data.Logging;
using Nexus.Engine.Core;
using Nexus.Engine.Hardware;
using Nexus.Engine.Processes;
using Nexus.Engine.Startup;
using Nexus.Platform.Abstractions;

namespace Nexus.Engine.Analyzer;

public sealed record ScanOptions(int SampleSeconds = 5, bool IncludeProcesses = true, bool IncludeDrivers = true);

/// <summary>
/// Collects information only. The analyzer has no code path that modifies the system: it reads through the
/// platform abstractions and returns an immutable <see cref="SystemSnapshot"/>. Each collection step is
/// isolated — a failing WMI class produces a warning, not a failed scan.
/// </summary>
public sealed class SystemAnalyzer(
    IPlatform platform,
    HardwareEngine hardware,
    ProcessEngine processes,
    StartupEngine startup,
    NexusConfiguration config,
    EngineEventBus events,
    INexusLogger log)
{
    private const string Cat = "Analyzer";

    public SystemSnapshot Scan(ScanOptions options, CancellationToken ct = default)
    {
        var id = Ids.New("SNAP-");
        var warnings = new List<string>();
        events.Publish(EngineEventType.ScanStarted, "System scan started", id, 0);
        const int steps = 12;
        var step = 0;

        T Collect<T>(string what, Func<T> f, T fallback)
        {
            ct.ThrowIfCancellationRequested();
            events.Publish(EngineEventType.ScanProgress, $"Collecting {what}", id, (double)step++ / steps, new { step = what });
            try { return f(); }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                warnings.Add($"{what}: {ex.Message}");
                log.Warning(Cat, $"Could not collect {what}: {ex.Message}", id);
                return fallback;
            }
        }

        var os = Collect("operating system", () => platform.SystemInfo.GetOs() with { PendingReboot = DetectPendingReboot() },
            new OsInfo("Windows", "unknown", "unknown", "unknown", false, null));
        var cpu = Collect("CPU", platform.SystemInfo.GetCpu, new CpuInfo("unknown", "unknown", 0, Environment.ProcessorCount, null));
        var gpus = Collect("GPU", platform.SystemInfo.GetGpus, []);
        var memory = Collect("memory", platform.SystemInfo.GetMemory, new MemoryInfo(0, 0, null, null));
        var disks = Collect("storage", platform.SystemInfo.GetDisks, []);
        var network = Collect("network adapters", platform.SystemInfo.GetNetworkAdapters, []);
        var drivers = options.IncludeDrivers ? Collect("drivers", platform.SystemInfo.GetDrivers, []) : [];
        var power = Collect("power plan", ReadPower, new PowerPlanInfo(Guid.Empty, "unknown", [], null, false));
        var gaming = Collect("gaming settings", ReadGamingSettings, new GamingSettingsInfo(null, null, null, null));
        var services = Collect("services", () => platform.Services.GetServices().Select(s => new ServiceInfo(s.Name, s.DisplayName, s.StartMode, s.State, s.ImagePath,
            config.CriticalServices.Contains(s.Name, StringComparer.OrdinalIgnoreCase))).ToList(), new List<ServiceInfo>());
        var startupEntries = Collect("startup entries", startup.GetEntries, []);
        var procs = options.IncludeProcesses ? Collect("processes", () => processes.GetProcesses(TimeSpan.FromMilliseconds(config.ProcessMeasurementMs), ct), []) : [];

        events.Publish(EngineEventType.ScanProgress, $"Sampling hardware usage for {options.SampleSeconds}s", id, (double)step / steps);
        var samples = Collect("hardware usage", () => hardware.SampleSeries(TimeSpan.FromSeconds(Math.Max(1, options.SampleSeconds)),
            TimeSpan.FromSeconds(config.SampleIntervalSeconds),
            (s, i, n) => events.Publish(EngineEventType.ScanProgress, $"Usage sample {i}/{n}", id, (step + (double)i / n) / (steps + 1), s),
            ct), []);

        var snapshot = new SystemSnapshot(id, DateTimeOffset.UtcNow, platform.IsSimulated, platform.Privileges.IsElevated,
            os, cpu, gpus, memory, disks, network, drivers, power, gaming, services, startupEntries, procs, samples, warnings);
        events.Publish(EngineEventType.ScanCompleted, $"Scan completed with {warnings.Count} warning(s)", id, 1,
            new { snapshotId = id, warnings = warnings.Count });
        log.Info(Cat, $"Scan {id} completed ({procs.Count} processes, {startupEntries.Count} startup entries, {samples.Count} samples)", id);
        return snapshot;
    }

    private PowerPlanInfo ReadPower()
    {
        var schemes = platform.Power.GetSchemes();
        var active = platform.Power.GetActiveScheme();
        var src = platform.Power.GetPowerSource();
        return new PowerPlanInfo(active, schemes.FirstOrDefault(s => s.Id == active)?.Name ?? active.ToString(),
            schemes.Select(s => new PowerSchemeInfo(s.Id, s.Name, WellKnownPowerSchemes.NameOf(s.Id))).ToList(), src.OnAcPower, src.HasBattery);
    }

    internal GamingSettingsInfo ReadGamingSettings()
    {
        var reg = platform.Registry;
        var gameMode = reg.GetValue(@"HKCU\Software\Microsoft\GameBar", "AutoGameModeEnabled")?.AsDWord();
        var dvr = reg.GetValue(@"HKCU\System\GameConfigStore", "GameDVR_Enabled")?.AsDWord();
        var capture = reg.GetValue(@"HKCU\Software\Microsoft\Windows\CurrentVersion\GameDVR", "AppCaptureEnabled")?.AsDWord();
        var hags = reg.GetValue(@"HKLM\SYSTEM\CurrentControlSet\Control\GraphicsDrivers", "HwSchMode")?.AsDWord();
        var dx = reg.GetValue(@"HKCU\Software\Microsoft\DirectX\UserGpuPreferences", "DirectXUserGlobalSettings")?.Text;
        return new GamingSettingsInfo(
            GameModeEnabled: gameMode is null ? true : gameMode != 0, // Windows 10 1703+ default: enabled
            GameDvrBackgroundRecording: dvr is null && capture is null ? null : (dvr ?? 1) != 0 && (capture ?? 0) != 0,
            HardwareGpuScheduling: hags switch { 2 => true, 1 => false, _ => null },
            VariableRefreshRateOptimizations: dx is null ? null : dx.Contains("VRROptimizeEnable=1", StringComparison.OrdinalIgnoreCase));
    }

    internal bool DetectPendingReboot()
    {
        var reg = platform.Registry;
        return reg.KeyExists(@"HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Component Based Servicing\RebootPending")
               || reg.KeyExists(@"HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\WindowsUpdate\Auto Update\RebootRequired")
               || reg.GetValue(@"HKLM\SYSTEM\CurrentControlSet\Control\Session Manager", "PendingFileRenameOperations") is { Text.Length: > 0 };
    }
}
