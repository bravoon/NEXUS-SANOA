using System.Text.Json;
using Nexus.Contracts;
using Nexus.Contracts.Api;
using Nexus.Platform.Abstractions;

namespace Nexus.Platform.Simulation;

/// <summary>
/// A fully in-memory machine. Used by the automated tests and by "nexus --simulate" so the engine can be
/// exercised on any OS without modifying a real computer. Every reading is labelled as simulated.
/// </summary>
public sealed class SimulatedPlatform : IPlatform
{
    public string Name => "Simulated Windows 11";
    public bool IsSimulated => true;

    public SimulatedRegistry Reg { get; } = new();
    public SimulatedServices Svc { get; } = new();
    public SimulatedProcesses Procs { get; } = new();
    public SimulatedSignatures Sigs { get; } = new();
    public SimulatedPower Pwr { get; } = new();
    public SimulatedTasks Tsk { get; } = new();
    public SimulatedFileSystem Fs { get; } = new();
    public SimulatedSensors Sens { get; } = new();
    public SimulatedSystemInfo Info { get; } = new();
    public SimulatedPrivileges Priv { get; } = new();
    public SimulatedRestorePoints Rp { get; } = new();
    public SimulatedFrameTimes Frames { get; } = new();

    public IRegistryAccessor Registry => Reg;
    public IServiceManager Services => Svc;
    public IProcessManager Processes => Procs;
    public ISignatureVerifier Signatures => Sigs;
    public IPowerManager Power => Pwr;
    public ITaskSchedulerAccessor Tasks => Tsk;
    public IFileSystem Files => Fs;
    public IHardwareSensorProvider Sensors => Sens;
    public ISystemInfoProvider SystemInfo => Info;
    public IPrivilegeProvider Privileges => Priv;
    public IRestorePointProvider RestorePoints => Rp;
    public IFrameTimeSource FrameTimes => Frames;

    /// <summary>An empty machine (only known folders). Tests seed exactly what they need.</summary>
    public static SimulatedPlatform CreateEmpty()
    {
        var p = new SimulatedPlatform();
        p.Fs.Folders[KnownFolder.Windows] = @"C:\Windows";
        p.Fs.Folders[KnownFolder.System32] = @"C:\Windows\System32";
        p.Fs.Folders[KnownFolder.ProgramFiles] = @"C:\Program Files";
        p.Fs.Folders[KnownFolder.ProgramFilesX86] = @"C:\Program Files (x86)";
        p.Fs.Folders[KnownFolder.ProgramData] = @"C:\ProgramData";
        p.Fs.Folders[KnownFolder.UserProfile] = @"C:\Users\sim";
        p.Fs.Folders[KnownFolder.LocalAppData] = @"C:\Users\sim\AppData\Local";
        p.Fs.Folders[KnownFolder.Temp] = @"C:\Users\sim\AppData\Local\Temp";
        p.Fs.Folders[KnownFolder.Downloads] = @"C:\Users\sim\Downloads";
        p.Fs.Folders[KnownFolder.UserStartup] = @"C:\Users\sim\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup";
        p.Fs.Folders[KnownFolder.CommonStartup] = @"C:\ProgramData\Microsoft\Windows\Start Menu\Programs\Startup";
        foreach (var f in p.Fs.Folders.Values) p.Fs.CreateDirectory(f);
        return p;
    }

    /// <summary>A realistic gaming PC with a handful of typical issues, used by "--simulate".</summary>
    public static SimulatedPlatform CreateSampleMachine()
    {
        var p = CreateEmpty();
        var now = DateTimeOffset.UtcNow;
        var ms = new SignatureInfo(true, true, "Microsoft Windows");
        void Proc(int pid, string name, string? path, int session, long wsMb, ProcessPriority prio, bool? critical = false, bool? system = false, SignatureInfo? sig = null, double cpuSec = 5)
        {
            p.Procs.Items.Add(new ProcessFacts(pid, name, path, session, wsMb * 1024 * 1024, wsMb * 1024 * 1024, TimeSpan.FromSeconds(cpuSec),
                now.AddMinutes(-pid % 97 - 1), prio, critical, system, (ulong)(pid * 1000), 0xFFFF));
            if (path is not null && sig is not null) p.Sigs.Map[path] = sig;
        }

        Proc(0, "Idle", null, 0, 0, ProcessPriority.Idle, true, true);
        Proc(4, "System", null, 0, 1, ProcessPriority.High, true, true);
        Proc(120, "Registry", null, 0, 40, ProcessPriority.Normal, false, true);
        Proc(460, "smss.exe", @"C:\Windows\System32\smss.exe", 0, 1, ProcessPriority.AboveNormal, true, true, ms);
        Proc(612, "csrss.exe", @"C:\Windows\System32\csrss.exe", 1, 5, ProcessPriority.High, true, true, ms);
        Proc(700, "wininit.exe", @"C:\Windows\System32\wininit.exe", 0, 6, ProcessPriority.High, true, true, ms);
        Proc(780, "services.exe", @"C:\Windows\System32\services.exe", 0, 10, ProcessPriority.Normal, true, true, ms);
        Proc(790, "lsass.exe", @"C:\Windows\System32\lsass.exe", 0, 24, ProcessPriority.Normal, true, true, ms);
        Proc(812, "winlogon.exe", @"C:\Windows\System32\winlogon.exe", 1, 9, ProcessPriority.High, true, true, ms);
        Proc(1020, "svchost.exe", @"C:\Windows\System32\svchost.exe", 0, 30, ProcessPriority.Normal, false, true, ms);
        Proc(4100, "explorer.exe", @"C:\Windows\explorer.exe", 1, 180, ProcessPriority.Normal, false, false, ms);
        Proc(5200, "Discord.exe", @"C:\Users\sim\AppData\Local\Discord\app-1.0.9163\Discord.exe", 1, 420, ProcessPriority.Normal, false, false, new SignatureInfo(true, true, "Discord Inc."), 60);
        Proc(5300, "steam.exe", @"C:\Program Files (x86)\Steam\steam.exe", 1, 250, ProcessPriority.Normal, false, false, new SignatureInfo(true, true, "Valve Corp."), 30);
        Proc(5400, "OneDrive.exe", @"C:\Users\sim\AppData\Local\Microsoft\OneDrive\OneDrive.exe", 1, 110, ProcessPriority.Normal, false, false, new SignatureInfo(true, true, "Microsoft Corporation"));
        Proc(6100, "chrome.exe", @"C:\Program Files\Google\Chrome\Application\chrome.exe", 1, 900, ProcessPriority.Normal, false, false, new SignatureInfo(true, true, "Google LLC"), 120);
        Proc(6660, "svchost.exe", @"C:\Users\sim\AppData\Local\Temp\svchost.exe", 1, 35, ProcessPriority.Normal, false, false, new SignatureInfo(false, false, null), 40);
        Proc(7000, "mytool.exe", @"C:\Tools\mytool.exe", 1, 20, ProcessPriority.Normal, false, false, new SignatureInfo(false, false, null));
        Proc(8800, "Cyberpunk2077.exe", @"D:\SteamLibrary\steamapps\common\Cyberpunk 2077\bin\x64\Cyberpunk2077.exe", 1, 7800, ProcessPriority.Normal, false, false, new SignatureInfo(true, true, "CD PROJEKT S.A."), 900);
        p.Sens.PerProcessGpu[8800] = 3; p.Sens.PerProcessGpu[6100] = 2;
        p.Procs.CpuLoad[6100] = 6; p.Procs.CpuLoad[5200] = 1.5; p.Procs.CpuLoad[6660] = 4; p.Procs.CpuLoad[4100] = 0.5;

        // Registry: startup entries
        const string run = @"HKCU\Software\Microsoft\Windows\CurrentVersion\Run";
        const string runLm = @"HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Run";
        p.Reg.Seed(run, "Discord", RegValue.Str("\"C:\\Users\\sim\\AppData\\Local\\Discord\\Update.exe\" --processStart Discord.exe"));
        p.Reg.Seed(run, "Steam", RegValue.Str("\"C:\\Program Files (x86)\\Steam\\steam.exe\" -silent"));
        p.Reg.Seed(run, "OneDrive", RegValue.Str("\"C:\\Users\\sim\\AppData\\Local\\Microsoft\\OneDrive\\OneDrive.exe\" /background"));
        p.Reg.Seed(runLm, "SecurityHealth", RegValue.Str("%windir%\\system32\\SecurityHealthSystray.exe"));
        p.Reg.Seed(runLm, "RtkAudUService", RegValue.Str("\"C:\\Windows\\System32\\RtkAudUService64.exe\" -background"));
        p.Reg.Seed(@"HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run", "OneDrive", RegValue.Binary([2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]));
        p.Fs.AddFile(@"C:\Users\sim\AppData\Local\Discord\Update.exe", 1_600_000, now.AddDays(-20));
        p.Fs.AddFile(@"C:\Program Files (x86)\Steam\steam.exe", 4_300_000, now.AddDays(-10));
        p.Fs.AddFile(@"C:\Users\sim\AppData\Local\Microsoft\OneDrive\OneDrive.exe", 3_000_000, now.AddDays(-12));
        p.Fs.AddFile(@"C:\Windows\System32\SecurityHealthSystray.exe", 100_000, now.AddDays(-50));
        p.Fs.AddFile(@"C:\Windows\System32\RtkAudUService64.exe", 1_200_000, now.AddDays(-400));
        p.Sigs.Map[@"C:\Users\sim\AppData\Local\Discord\Update.exe"] = new SignatureInfo(true, true, "Discord Inc.");
        p.Sigs.Map[@"C:\Windows\System32\SecurityHealthSystray.exe"] = ms;
        p.Sigs.Map[@"C:\Windows\System32\RtkAudUService64.exe"] = new SignatureInfo(true, true, "Realtek Semiconductor Corp.");
        p.Fs.AddFile(@"C:\Users\sim\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup\Spotify.lnk", 2_000, now.AddDays(-90), @"C:\Users\sim\AppData\Roaming\Spotify\Spotify.exe");

        // Gaming-related settings
        p.Reg.Seed(@"HKCU\Software\Microsoft\GameBar", "AutoGameModeEnabled", RegValue.DWord(0));
        p.Reg.Seed(@"HKCU\System\GameConfigStore", "GameDVR_Enabled", RegValue.DWord(1));
        p.Reg.Seed(@"HKCU\Software\Microsoft\Windows\CurrentVersion\GameDVR", "AppCaptureEnabled", RegValue.DWord(1));
        p.Reg.Seed(@"HKLM\SYSTEM\CurrentControlSet\Control\GraphicsDrivers", "HwSchMode", RegValue.DWord(1));
        p.Reg.Seed(@"HKCU\Software\Microsoft\Windows\CurrentVersion\ContentDeliveryManager", "SilentInstalledAppsEnabled", RegValue.DWord(1));
        p.Reg.Seed(@"HKCU\Software\Microsoft\Windows\CurrentVersion\ContentDeliveryManager", "SubscribedContent-338388Enabled", RegValue.DWord(1));
        p.Reg.Seed(@"HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion", "ProductName", RegValue.Str("Windows 11 Pro"));

        // Services
        p.Svc.Items.AddRange(
        [
            new("DiagTrack", "Connected User Experiences and Telemetry", ServiceStartMode.Automatic, ServiceRunState.Running, @"C:\Windows\System32\svchost.exe -k utcsvc -p"),
            new("SysMain", "SysMain", ServiceStartMode.Automatic, ServiceRunState.Running, @"C:\Windows\system32\svchost.exe -k LocalSystemNetworkRestricted -p"),
            new("WSearch", "Windows Search", ServiceStartMode.AutomaticDelayed, ServiceRunState.Running, @"C:\Windows\system32\SearchIndexer.exe /Embedding"),
            new("wuauserv", "Windows Update", ServiceStartMode.Manual, ServiceRunState.Running, @"C:\Windows\system32\svchost.exe -k netsvcs -p"),
            new("WinDefend", "Microsoft Defender Antivirus Service", ServiceStartMode.Automatic, ServiceRunState.Running, @"C:\ProgramData\Microsoft\Windows Defender\platform\MsMpEng.exe"),
            new("RpcSs", "Remote Procedure Call (RPC)", ServiceStartMode.Automatic, ServiceRunState.Running, @"C:\Windows\system32\svchost.exe -k rpcss -p"),
            new("XblGameSave", "Xbox Live Game Save", ServiceStartMode.Manual, ServiceRunState.Stopped, @"C:\Windows\system32\svchost.exe -k netsvcs -p"),
        ]);

        // Scheduled tasks
        p.Tsk.Items.Add(new ScheduledTaskFacts(@"\Adobe Acrobat Update Task", "Adobe Acrobat Update Task", true, @"C:\Program Files (x86)\Common Files\Adobe\ARM\1.0\AdobeARM.exe", "Adobe Systems Incorporated", true, false));
        p.Tsk.Items.Add(new ScheduledTaskFacts(@"\Microsoft\Windows\Defrag\ScheduledDefrag", "ScheduledDefrag", true, @"%windir%\system32\defrag.exe -c -h -o -$", "Microsoft Corporation", false, false));
        p.Sigs.Map[@"C:\Program Files (x86)\Common Files\Adobe\ARM\1.0\AdobeARM.exe"] = new SignatureInfo(true, true, "Adobe Inc.");
        p.Fs.AddFile(@"C:\Program Files (x86)\Common Files\Adobe\ARM\1.0\AdobeARM.exe", 2_500_000, now.AddDays(-200));

        // Temp files (some old, some recent)
        var temp = p.Fs.Folders[KnownFolder.Temp];
        for (var i = 0; i < 40; i++) p.Fs.AddFile(PathUtil.Combine(temp, $"installer_cache_{i}.tmp"), 18_000_000, now.AddDays(-30 - i));
        for (var i = 0; i < 5; i++) p.Fs.AddFile(PathUtil.Combine(temp, $"recent_{i}.tmp"), 1_000_000, now.AddHours(-2));

        // Game libraries
        p.Fs.AddFile(@"C:\Program Files (x86)\Steam\steamapps\libraryfolders.vdf", 500, now,
            "\"libraryfolders\"\n{\n\t\"0\"\n\t{\n\t\t\"path\"\t\t\"C:\\\\Program Files (x86)\\\\Steam\"\n\t}\n\t\"1\"\n\t{\n\t\t\"path\"\t\t\"D:\\\\SteamLibrary\"\n\t}\n}\n");
        p.Fs.AddFile(@"D:\SteamLibrary\steamapps\appmanifest_1091500.acf", 800, now,
            "\"AppState\"\n{\n\t\"appid\"\t\t\"1091500\"\n\t\"name\"\t\t\"Cyberpunk 2077\"\n\t\"installdir\"\t\t\"Cyberpunk 2077\"\n}\n");
        p.Fs.AddFile(@"D:\SteamLibrary\steamapps\common\Cyberpunk 2077\bin\x64\Cyberpunk2077.exe", 60_000_000, now.AddDays(-5));
        p.Fs.AddFile(@"C:\Program Files (x86)\Steam\steamapps\appmanifest_730.acf", 800, now,
            "\"AppState\"\n{\n\t\"appid\"\t\t\"730\"\n\t\"name\"\t\t\"Counter-Strike 2\"\n\t\"installdir\"\t\t\"Counter-Strike Global Offensive\"\n}\n");
        p.Fs.AddFile(@"C:\Program Files (x86)\Steam\steamapps\common\Counter-Strike Global Offensive\game\bin\win64\cs2.exe", 1_000_000, now.AddDays(-3));
        p.Fs.AddFile(@"C:\ProgramData\Epic\EpicGamesLauncher\Data\Manifests\ABC123.item", 700, now,
            "{\"DisplayName\":\"Fortnite\",\"InstallLocation\":\"C:\\\\Program Files\\\\Epic Games\\\\Fortnite\",\"LaunchExecutable\":\"FortniteGame/Binaries/Win64/FortniteLauncher.exe\",\"AppName\":\"Fortnite\"}");
        return p;
    }

    private sealed record PersistedState(
        Dictionary<string, Dictionary<string, RegValue>> Registry,
        Dictionary<string, ServiceStartMode> Services,
        Guid ActivePowerScheme,
        Dictionary<string, bool> Tasks,
        List<SimulatedFileSystem.FileEntry> Files);

    /// <summary>Persists the mutable parts of the simulated machine so separate CLI runs see each other's changes.</summary>
    public void SaveState(string path)
    {
        var state = new PersistedState(Reg.Export(), Svc.Items.ToDictionary(s => s.Name, s => s.StartMode), Pwr.Active,
            Tsk.Items.ToDictionary(t => t.Path, t => t.Enabled), Fs.ExportFiles());
        File.WriteAllText(path, JsonSerializer.Serialize(state, NexusJson.Options));
    }

    public static SimulatedPlatform LoadOrCreate(string path)
    {
        var p = CreateSampleMachine();
        if (!File.Exists(path)) return p;
        try
        {
            var state = JsonSerializer.Deserialize<PersistedState>(File.ReadAllText(path), NexusJson.Options);
            if (state is null) return p;
            p.Reg.Import(state.Registry);
            for (var i = 0; i < p.Svc.Items.Count; i++)
                if (state.Services.TryGetValue(p.Svc.Items[i].Name, out var m)) p.Svc.Items[i] = p.Svc.Items[i] with { StartMode = m };
            p.Pwr.Active = state.ActivePowerScheme;
            for (var i = 0; i < p.Tsk.Items.Count; i++)
                if (state.Tasks.TryGetValue(p.Tsk.Items[i].Path, out var e)) p.Tsk.Items[i] = p.Tsk.Items[i] with { Enabled = e };
            p.Fs.ImportFiles(state.Files);
            foreach (var f in p.Fs.Folders.Values) p.Fs.CreateDirectory(f);
        }
        catch (JsonException) { /* corrupted state: start from the sample machine */ }
        return p;
    }
}
