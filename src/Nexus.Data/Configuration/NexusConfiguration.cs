using System.Text.Json;
using Nexus.Contracts;
using Nexus.Contracts.Api;

namespace Nexus.Data.Configuration;

public sealed record DiagnosticThresholds
{
    public double GpuSaturationPercent { get; init; } = 95;
    public double GpuHighPercent { get; init; } = 90;
    public double CpuHighPercent { get; init; } = 85;
    public double CoreSaturationPercent { get; init; } = 95;
    public double MemoryHighPercent { get; init; } = 90;
    public double DiskActiveHighPercent { get; init; } = 90;
    public double LoadThresholdPercent { get; init; } = 50;
    public double SustainedFraction { get; init; } = 0.8;
    public int MinSamplesForConfirmed { get; init; } = 5;
    public double CpuTempHighCelsius { get; init; } = 90;
    public double GpuTempHighCelsius { get; init; } = 85;
    public int DriverAgeMonthsWarning { get; init; } = 12;
    public double LowFreeSpacePercent { get; init; } = 10;
}

/// <summary>Protected processes are matched by name AND expected location, so a copy elsewhere is flagged.</summary>
public sealed record ProtectedProcessRule(string Name, string? ExpectedDirectory);

public sealed record StartupKnowledge
{
    /// <summary>Entries matching these (name, file name or publisher, case-insensitive substring) are never proposed for disabling.</summary>
    public List<string> CriticalPatterns { get; init; } =
    [
        "SecurityHealth", "Windows Defender", "MsMpEng", "RtkAud", "Realtek", "Synaptics", "ELAN", "igfx", "NVIDIA Display",
        "AMD External Events", "Bitdefender", "Kaspersky", "ESET", "Norton", "Malwarebytes", "ctfmon", "OneDrive Setup",
    ];

    /// <summary>Known typical startup cost. Anything else is estimated from file size.</summary>
    public Dictionary<string, ImpactLevel> KnownImpact { get; init; } = new(StringComparer.OrdinalIgnoreCase)
    {
        ["Discord"] = ImpactLevel.High, ["Steam"] = ImpactLevel.High, ["EpicGamesLauncher"] = ImpactLevel.High,
        ["Spotify"] = ImpactLevel.Medium, ["Teams"] = ImpactLevel.High, ["OneDrive"] = ImpactLevel.Medium,
        ["Adobe"] = ImpactLevel.Medium, ["GoogleUpdate"] = ImpactLevel.Low, ["EADesktop"] = ImpactLevel.High,
        ["Battle.net"] = ImpactLevel.High, ["UbisoftConnect"] = ImpactLevel.High, ["Skype"] = ImpactLevel.Medium,
    };
}

public sealed record NexusConfiguration
{
    public DiagnosticThresholds Diagnostics { get; init; } = new();
    public int DefaultSampleSeconds { get; init; } = 5;
    public double SampleIntervalSeconds { get; init; } = 1;
    /// <summary>Window used to measure per-process CPU and I/O during a scan.</summary>
    public int ProcessMeasurementMs { get; init; } = 1000;

    public List<ProtectedProcessRule> ProtectedProcesses { get; init; } =
    [
        new("System Idle Process", null), new("Idle", null), new("System", null), new("Registry", null),
        new("Secure System", null), new("Memory Compression", null),
        new("smss.exe", "%System32%"), new("csrss.exe", "%System32%"), new("wininit.exe", "%System32%"),
        new("services.exe", "%System32%"), new("lsass.exe", "%System32%"), new("winlogon.exe", "%System32%"),
        new("svchost.exe", "%System32%"), new("dwm.exe", "%System32%"), new("fontdrvhost.exe", "%System32%"),
        new("explorer.exe", "%Windows%"), new("MsMpEng.exe", null),
    ];

    /// <summary>Services that no rule may ever modify.</summary>
    public List<string> CriticalServices { get; init; } =
    [
        "RpcSs", "RpcEptMapper", "DcomLaunch", "LSM", "SamSs", "EventLog", "Winmgmt", "WinDefend", "mpssvc", "BFE",
        "CryptSvc", "Dhcp", "Dnscache", "nsi", "Power", "ProfSvc", "Schedule", "SENS", "UserManager", "Audiosrv",
        "AudioEndpointBuilder", "PlugPlay", "wuauserv", "TrustedInstaller", "WdNisSvc", "SecurityHealthService", "gpsvc",
    ];

    public StartupKnowledge Startup { get; init; } = new();
    public int TempCleanupMinAgeDays { get; init; } = 7;
    public long TempCleanupMinTotalMb { get; init; } = 500;
    public double BenchmarkNoiseThresholdPercent { get; init; } = 3;
    public NexusLogLevel LogLevel { get; init; } = NexusLogLevel.Info;
    public int LogRetentionDays { get; init; } = 30;
    public int SnapshotRetention { get; init; } = 20;
    public string RulesDirectory { get; init; } = "rules";
}

public static class ConfigurationLoader
{
    public static NexusConfiguration Load(string? configDirectory)
    {
        if (configDirectory is null) return new NexusConfiguration();
        var file = Path.Combine(configDirectory, "nexus.json");
        if (!File.Exists(file)) return new NexusConfiguration();
        var opts = new JsonSerializerOptions(NexusJson.Options) { ReadCommentHandling = JsonCommentHandling.Skip, AllowTrailingCommas = true };
        return JsonSerializer.Deserialize<NexusConfiguration>(File.ReadAllText(file), opts) ?? new NexusConfiguration();
    }
}

/// <summary>Resolves where the engine stores its database, logs, backups and quarantine.</summary>
public sealed record DataPaths(string Root)
{
    public string Database => Path.Combine(Root, "nexus.db");
    public string Logs => Path.Combine(Root, "logs");
    public string Backups => Path.Combine(Root, "backups");
    public string Quarantine => Path.Combine(Root, "quarantine");

    public static DataPaths Default(bool simulated)
    {
        var baseDir = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        if (string.IsNullOrEmpty(baseDir)) baseDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".local", "share");
        return new DataPaths(Path.Combine(baseDir, "NexusOptimizer", simulated ? "simulated" : "data"));
    }
}
