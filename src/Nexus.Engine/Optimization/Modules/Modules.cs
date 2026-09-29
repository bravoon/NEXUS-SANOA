using System.Globalization;
using Nexus.Contracts;
using Nexus.Data.Configuration;
using Nexus.Engine.Hardware;
using Nexus.Engine.Rules;
using Nexus.Engine.Rules.BuiltIn;
using Nexus.Engine.Startup;
using Nexus.Platform.Abstractions;

namespace Nexus.Engine.Optimization.Modules;

public sealed class WindowsOptimizer : OptimizationModule
{
    public override string Id => "windows";
    public override string Name => "Windows";
    public override OptimizationCategory Category => OptimizationCategory.Windows;

    public override IEnumerable<DiagnosticFinding> Analyze(SystemSnapshot s, NexusConfiguration c)
    {
        if (s.Os.PendingReboot)
            yield return Finding("windows.pending-reboot", "A restart is pending", "Windows", Severity.Medium, Confidence.Confirmed,
                "Windows has pending updates or file operations that complete on restart. Restart before measuring performance.");
        if (s.Os.LastBoot is { } boot && DateTimeOffset.UtcNow - boot > TimeSpan.FromDays(14))
            yield return Finding("windows.long-uptime", "System has not been restarted for a long time", "Windows", Severity.Low, Confidence.Confirmed,
                "Long uptimes are not a problem by themselves, but updates and driver changes may be waiting for a restart.",
                [new Evidence("Uptime", $"{(DateTimeOffset.UtcNow - boot).TotalDays:F0} days", "14 days")]);
    }
}

public sealed class GamingOptimizer : OptimizationModule
{
    public override string Id => "gaming";
    public override string Name => "Gaming";
    public override OptimizationCategory Category => OptimizationCategory.Gaming;
    public override IReadOnlyList<IOptimizationRule> BuiltInRules { get; } =
        [new EnableGameModeRule(), new DisableBackgroundCaptureRule(), new HardwareGpuSchedulingRule()];

    public override IEnumerable<DiagnosticFinding> Analyze(SystemSnapshot s, NexusConfiguration c)
    {
        if (s.Gaming.GameModeEnabled == false)
            yield return Finding("gaming.game-mode-off", "Game Mode is disabled", "Gaming", Severity.Low, Confidence.Confirmed,
                "Game Mode was turned off. Its effect on FPS is game-dependent and is often small.", null, "gaming.enable-game-mode");
        if (s.Gaming.GameDvrBackgroundRecording == true)
            yield return Finding("gaming.capture-on", "Game Bar capture is enabled", "Gaming", Severity.Info, Confidence.Confirmed,
                "Capture is enabled. It only costs performance while background recording is actually active (impact: POSSIBLE).", null, "gaming.disable-background-capture");
    }
}

public sealed class StartupOptimizer(StartupEngine startup) : OptimizationModule
{
    public override string Id => "startup";
    public override string Name => "Startup";
    public override OptimizationCategory Category => OptimizationCategory.Startup;
    public override IReadOnlyList<IOptimizationRule> BuiltInRules { get; } = [new DisableHighImpactStartupRule(startup)];

    public override ModuleScanSummary Scan(SystemSnapshot s) => new(Id, Category, new Dictionary<string, string>
    {
        ["entries"] = s.Startup.Count.ToString(CultureInfo.InvariantCulture),
        ["enabled"] = s.Startup.Count(e => e.Enabled).ToString(CultureInfo.InvariantCulture),
        ["highImpactEnabled"] = s.Startup.Count(e => e.Enabled && e.Impact == ImpactLevel.High).ToString(CultureInfo.InvariantCulture),
    });

    public override IEnumerable<DiagnosticFinding> Analyze(SystemSnapshot s, NexusConfiguration c)
    {
        var heavy = s.Startup.Where(e => e.Enabled && e.Impact == ImpactLevel.High && !e.IsCritical).ToList();
        if (heavy.Count >= 2)
            yield return Finding("startup.heavy", $"{heavy.Count} high-impact applications start with Windows", "Startup", Severity.Medium, Confidence.Likely,
                "Several heavy applications start at sign-in, which likely lengthens the time until the desktop is responsive. Impact levels are estimates.",
                heavy.Select(e => new Evidence(e.Name, e.Impact.ToString(), null, e.ImpactBasis)), "startup.disable-high-impact");
    }
}

public sealed class ProcessOptimizer : OptimizationModule
{
    public override string Id => "process";
    public override string Name => "Processes";
    public override OptimizationCategory Category => OptimizationCategory.Process;
    public override IReadOnlyList<IOptimizationRule> BuiltInRules { get; } = [new DeprioritizeBackgroundProcessRule()];

    public override IEnumerable<DiagnosticFinding> Analyze(SystemSnapshot s, NexusConfiguration c)
    {
        foreach (var p in s.Processes.Where(p => p.Classification == ProcessClassification.Suspicious))
            yield return Finding($"process.suspicious.{p.Pid}", $"Suspicious process indicators: {p.Name} ({p.Pid})", "Security", Severity.High, Confidence.Possible,
                "These are indicators, not a malware verdict. Verify the file with your antivirus before taking action. Nexus never terminates processes automatically.",
                p.ClassificationReasons.Select(r => new Evidence("Indicator", r, null, p.Path)));
        var hogs = s.Processes.Where(p => p.CpuPercent >= 25 && !p.IsProtected).OrderByDescending(p => p.CpuPercent).Take(3).ToList();
        foreach (var p in hogs)
            yield return Finding($"process.cpu.{p.Pid}", $"{p.Name} used {p.CpuPercent:F0}% CPU while sampling", "Processes", Severity.Low, Confidence.Confirmed,
                "Measured during the scan window only; a short spike is not necessarily a problem.",
                [new Evidence("CPU", $"{p.CpuPercent:F0}%", "25%")], "process.deprioritize-background");
    }
}

public sealed class ServiceOptimizer : OptimizationModule
{
    public override string Id => "service";
    public override string Name => "Services";
    public override OptimizationCategory Category => OptimizationCategory.Service;
    public override IReadOnlyList<IOptimizationRule> BuiltInRules { get; } = [new TelemetryServiceManualRule()];

    public override IEnumerable<DiagnosticFinding> Analyze(SystemSnapshot s, NexusConfiguration c)
    {
        foreach (var svc in s.Services.Where(x => x.IsCritical && x.StartMode is ServiceStartMode.Automatic && x.State == ServiceRunState.Stopped))
            yield return Finding($"service.critical-stopped.{svc.Name}", $"Critical service is not running: {svc.DisplayName}", "Services", Severity.High, Confidence.Confirmed,
                "An automatic, critical Windows service is stopped. This can cause instability; Nexus does not change critical services.");
    }
}

public sealed class PowerOptimizer : OptimizationModule
{
    public override string Id => "power";
    public override string Name => "Power";
    public override OptimizationCategory Category => OptimizationCategory.Power;
    public override IReadOnlyList<IOptimizationRule> BuiltInRules { get; } = [new HighPerformancePowerPlanRule()];

    public override IEnumerable<DiagnosticFinding> Analyze(SystemSnapshot s, NexusConfiguration c)
    {
        if (s.Power.ActiveSchemeId == WellKnownPowerSchemes.PowerSaver && s.Power.OnAcPower == true)
            yield return Finding("power.saver-on-ac", "Power saver plan is active on AC power", "Power", Severity.Medium, Confidence.Confirmed,
                "The CPU is limited to save energy although the device is plugged in.", [new Evidence("Active plan", s.Power.ActiveSchemeName)], "power.high-performance-plan");
        if (s.Power.OnAcPower == false)
            yield return Finding("power.on-battery", "Running on battery", "Power", Severity.Info, Confidence.Confirmed,
                "Windows and the GPU reduce performance on battery. Measurements taken now are not representative of plugged-in performance.");
    }
}

public sealed class NetworkOptimizer : OptimizationModule
{
    public override string Id => "network";
    public override string Name => "Network";
    public override OptimizationCategory Category => OptimizationCategory.Network;

    public override IEnumerable<DiagnosticFinding> Analyze(SystemSnapshot s, NexusConfiguration c)
    {
        foreach (var a in s.NetworkAdapters.Where(a => a.IsUp && a.Type.Contains("Ethernet", StringComparison.OrdinalIgnoreCase) && a.LinkSpeedBitsPerSec is <= 100_000_000))
            yield return Finding($"network.slow-link.{a.Name}", $"{a.Name} negotiated {a.LinkSpeedBitsPerSec / 1_000_000} Mb/s", "Network", Severity.Medium, Confidence.Confirmed,
                "A wired adapter linked at 100 Mb/s or less usually indicates a damaged cable or port. This affects downloads, not in-game latency.",
                [new Evidence("Link speed", $"{a.LinkSpeedBitsPerSec / 1_000_000} Mb/s", "1000 Mb/s")]);
    }
}

public sealed class StorageOptimizer : OptimizationModule
{
    public override string Id => "storage";
    public override string Name => "Storage";
    public override OptimizationCategory Category => OptimizationCategory.Storage;
    public override IReadOnlyList<IOptimizationRule> BuiltInRules { get; } = [new QuarantineOldTempFilesRule()];

    public override IEnumerable<DiagnosticFinding> Analyze(SystemSnapshot s, NexusConfiguration c)
    {
        foreach (var d in s.Disks.Where(d => d.TotalBytes > 0))
        {
            var pct = (double)d.FreeBytes / d.TotalBytes * 100;
            if (pct < c.Diagnostics.LowFreeSpacePercent)
                yield return Finding($"storage.low-space.{d.Drive}", $"{d.Drive} is low on free space", "Storage", d.IsSystemDrive ? Severity.High : Severity.Medium, Confidence.Confirmed,
                    "Low free space slows Windows Update, paging and SSD garbage collection.",
                    [new Evidence("Free", $"{pct:F1}% ({d.FreeBytes / 1e9:F1} GB)", $"{c.Diagnostics.LowFreeSpacePercent}%")], "storage.quarantine-old-temp-files");
            if (d.IsSystemDrive && d.MediaType == "HDD")
                yield return Finding("storage.system-hdd", "Windows is installed on a hard disk (HDD)", "Storage", Severity.Medium, Confidence.Confirmed,
                    "Boot, application and game load times are likely limited by the mechanical disk. Software tweaks cannot compensate for this.");
        }
        var health = s.UsageSamples.LastOrDefault()?.Storage.FirstOrDefault(d => d.Health.HasValue && d.Health.Value < 100);
        if (health is not null)
            yield return Finding("storage.health", "A disk reports a health warning", "Storage", Severity.Critical, Confidence.Confirmed,
                "Back up your data. The drive's own health status is not OK.", [new Evidence("Health", health.Health.Note ?? $"{health.Health.Value}", null, health.Health.Source)]);
    }
}

/// <summary>Memory diagnostics only. "RAM cleaners" (forced working-set trimming) are deliberately not implemented: they move data to the page file and make things slower.</summary>
public sealed class MemoryOptimizer : OptimizationModule
{
    public override string Id => "memory";
    public override string Name => "Memory";
    public override OptimizationCategory Category => OptimizationCategory.Memory;

    public override IEnumerable<DiagnosticFinding> Analyze(SystemSnapshot s, NexusConfiguration c)
    {
        var used = s.UsageSamples.Select(HardwareEngine.MemoryUsedPercent).OfType<double>().ToList();
        if (used.Count > 0 && used.Average() >= c.Diagnostics.MemoryHighPercent)
        {
            var top = s.Processes.OrderByDescending(p => p.PrivateBytes).Take(5);
            yield return Finding("memory.pressure", "Memory usage is very high", "Memory", Severity.High, Confidence.Likely,
                "Physical memory is nearly full, so Windows is likely paging. Closing large applications helps; 'memory cleaners' do not.",
                top.Select(p => new Evidence(p.Name, $"{p.PrivateBytes / 1024 / 1024} MB private")));
        }
        var gb = s.Memory.TotalBytes / 1024d / 1024 / 1024;
        if (gb is > 0 and < 12)
            yield return Finding("memory.capacity", $"{gb:F0} GB of RAM installed", "Memory", Severity.Low, Confidence.Possible,
                "Many current games recommend 16 GB. Whether this limits you depends on the games you play.");
        if (s.Memory.ModuleCount == 1)
            yield return Finding("memory.single-module", "Only one memory module detected", "Memory", Severity.Low, Confidence.Possible,
                "A single module usually runs in single-channel mode, which reduces memory bandwidth. Some laptops have soldered memory not reported as modules.");
    }
}

/// <summary>Hosts registry-level declarative rules. Registry "cleaning" is intentionally not offered: it has no measurable benefit and real risk.</summary>
public sealed class RegistryOptimizer : OptimizationModule
{
    public override string Id => "registry";
    public override string Name => "Registry";
    public override OptimizationCategory Category => OptimizationCategory.Registry;
}

public sealed class DebloatOptimizer : OptimizationModule
{
    public override string Id => "debloat";
    public override string Name => "Debloat";
    public override OptimizationCategory Category => OptimizationCategory.Debloat;
    public override IReadOnlyList<IOptimizationRule> BuiltInRules { get; } = [new DisableConsumerSuggestionsRule()];
}

/// <summary>Analysis only: drivers are never installed, updated or removed automatically.</summary>
public sealed class DriverAnalyzer : OptimizationModule
{
    public override string Id => "driver";
    public override string Name => "Drivers";
    public override OptimizationCategory Category => OptimizationCategory.Driver;

    public override IEnumerable<DiagnosticFinding> Analyze(SystemSnapshot s, NexusConfiguration c)
    {
        foreach (var d in s.Drivers.Where(d => d.ProblemCode != 0))
            yield return Finding($"driver.problem.{d.DeviceName}", $"Device has a problem: {d.DeviceName}", "Drivers", Severity.Medium, Confidence.Confirmed,
                "Device Manager reports an error for this device (Configuration Manager error code).",
                [new Evidence("Problem code", d.ProblemCode.ToString(CultureInfo.InvariantCulture), null, "Win32_PnPEntity.ConfigManagerErrorCode")]);
        foreach (var d in s.Drivers.Where(d => d.DeviceClass.Equals("Display", StringComparison.OrdinalIgnoreCase) && d.Date is not null))
        {
            var months = (DateTimeOffset.UtcNow - d.Date!.Value).TotalDays / 30.4;
            if (months >= c.Diagnostics.DriverAgeMonthsWarning)
                yield return Finding($"driver.gpu-age.{d.DeviceName}", $"GPU driver is {months:F0} months old", "Drivers", Severity.Low, Confidence.Possible,
                    "Newer GPU drivers often include game-specific fixes. An old driver is not necessarily a problem — update from the GPU vendor if a game misbehaves.",
                    [new Evidence("Driver", $"{d.Version} ({d.Date:yyyy-MM-dd})", $"{c.Diagnostics.DriverAgeMonthsWarning} months")]);
        }
    }
}
