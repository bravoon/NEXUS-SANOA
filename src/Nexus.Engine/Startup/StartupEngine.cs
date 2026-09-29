using Nexus.Contracts;
using Nexus.Data.Configuration;
using Nexus.Engine.Core;
using Nexus.Platform;
using Nexus.Platform.Abstractions;
using Nexus.Platform.Changes;

namespace Nexus.Engine.Startup;

/// <summary>
/// Discovers startup entries (Run keys, Startup folders, logon/boot scheduled tasks, third-party auto-start services)
/// and produces the change operations to enable/disable them. Disabling uses the same mechanism as Task Manager
/// (Explorer\StartupApproved) so the original entry is never deleted and can always be restored.
/// </summary>
public sealed class StartupEngine(IPlatform platform, NexusConfiguration config)
{
    private const string Approved = @"Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved";

    private static readonly (string Key, StartupScope Scope, string ApprovedKey)[] RunKeys =
    [
        (@"HKCU\Software\Microsoft\Windows\CurrentVersion\Run", StartupScope.CurrentUser, $@"HKCU\{Approved}\Run"),
        (@"HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Run", StartupScope.AllUsers, $@"HKLM\{Approved}\Run"),
        (@"HKLM\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Run", StartupScope.AllUsers, $@"HKLM\{Approved}\Run32"),
    ];

    public static readonly string EnabledBytes = "020000000000000000000000";
    public static readonly string DisabledBytes = "030000000000000000000000";

    public IReadOnlyList<StartupEntryInfo> GetEntries()
    {
        var list = new List<StartupEntryInfo>();
        foreach (var (key, scope, approved) in RunKeys)
        {
            foreach (var name in platform.Registry.GetValueNames(key))
            {
                var cmd = platform.Registry.GetValue(key, name)?.Text;
                if (string.IsNullOrWhiteSpace(cmd)) continue;
                list.Add(Build(name, cmd, StartupSource.RegistryRun, scope, key, IsApproved(approved, name)));
            }
        }

        foreach (var (folder, scope) in new[] { (KnownFolder.UserStartup, StartupScope.CurrentUser), (KnownFolder.CommonStartup, StartupScope.AllUsers) })
        {
            var dir = platform.Files.GetKnownFolder(folder);
            if (dir is null || !platform.Files.DirectoryExists(dir)) continue;
            var approvedKey = $@"{(scope == StartupScope.CurrentUser ? "HKCU" : "HKLM")}\{Approved}\StartupFolder";
            foreach (var f in platform.Files.EnumerateFiles(dir, "*", false))
            {
                var file = PathUtil.GetFileName(f.Path);
                if (file.Equals("desktop.ini", StringComparison.OrdinalIgnoreCase)) continue;
                var cmd = file.EndsWith(".lnk", StringComparison.OrdinalIgnoreCase) ? platform.Files.ResolveShortcut(f.Path) ?? f.Path : f.Path;
                list.Add(Build(Path.GetFileNameWithoutExtension(file), cmd, StartupSource.StartupFolder, scope, f.Path, IsApproved(approvedKey, file)));
            }
        }

        try
        {
            foreach (var t in platform.Tasks.GetTasks())
            {
                if (!(t.RunsAtLogon || t.RunsAtBoot)) continue;
                if (t.Path.StartsWith(@"\Microsoft\", StringComparison.OrdinalIgnoreCase)) continue; // OS maintenance tasks
                list.Add(Build(t.Name, t.Command ?? t.Path, StartupSource.ScheduledTask, StartupScope.AllUsers, t.Path, t.Enabled));
            }
        }
        catch (Exception) { /* Task Scheduler unavailable: other sources still reported */ }

        var windows = platform.Files.GetKnownFolder(KnownFolder.Windows);
        foreach (var s in platform.Services.GetServices())
        {
            if (s.StartMode is not (ServiceStartMode.Automatic or ServiceStartMode.AutomaticDelayed)) continue;
            var exe = PathUtil.ExtractExecutable(s.ImagePath);
            if (exe is null || PathUtil.IsUnder(Environment.ExpandEnvironmentVariables(exe), windows) || exe.Contains("system32", StringComparison.OrdinalIgnoreCase)) continue;
            if (config.CriticalServices.Contains(s.Name, StringComparer.OrdinalIgnoreCase)) continue;
            list.Add(Build(s.DisplayName, s.ImagePath ?? s.Name, StartupSource.Service, StartupScope.AllUsers, s.Name, true));
        }
        return list;
    }

    private bool IsApproved(string approvedKey, string name)
    {
        var v = platform.Registry.GetValue(approvedKey, name)?.AsBytes();
        return v is null || v.Length == 0 || (v[0] & 1) == 0; // odd first byte = disabled
    }

    private StartupEntryInfo Build(string name, string command, StartupSource source, StartupScope scope, string location, bool enabled)
    {
        var exe = PathUtil.ExtractExecutable(Environment.ExpandEnvironmentVariables(command));
        exe = exe?.Replace("%windir%", platform.Files.GetKnownFolder(KnownFolder.Windows) ?? "%windir%", StringComparison.OrdinalIgnoreCase);
        SignatureInfo? sig = null;
        if (exe is not null && platform.Files.FileExists(exe))
        {
            try { sig = platform.Signatures.Verify(exe); } catch { }
        }
        var (impact, basis) = EstimateImpact(name, exe);
        var critical = IsCritical(name, exe, sig);
        var id = Ids.Short("st-", $"{source}|{scope}|{location}|{name}");
        return new StartupEntryInfo(id, name, command, exe, sig?.Publisher, sig?.Signed, impact, basis, source, scope, location, enabled, critical);
    }

    private (ImpactLevel, string) EstimateImpact(string name, string? exe)
    {
        foreach (var (pattern, level) in config.Startup.KnownImpact)
        {
            if (name.Contains(pattern, StringComparison.OrdinalIgnoreCase) ||
                (exe is not null && PathUtil.GetFileName(exe).Contains(pattern, StringComparison.OrdinalIgnoreCase)) ||
                (exe is not null && exe.Contains($"\\{pattern}\\", StringComparison.OrdinalIgnoreCase)))
                return (level, "known application profile");
        }
        var file = exe is null ? null : platform.Files.GetFile(exe);
        if (file is null) return (ImpactLevel.Low, "estimated (executable not found)");
        var mb = file.Length / 1024.0 / 1024.0;
        return (mb > 30 ? ImpactLevel.High : mb > 5 ? ImpactLevel.Medium : ImpactLevel.Low, $"estimated from executable size ({mb:F1} MB)");
    }

    private bool IsCritical(string name, string? exe, SignatureInfo? sig)
    {
        if (config.Startup.CriticalPatterns.Any(p =>
                name.Contains(p, StringComparison.OrdinalIgnoreCase) ||
                (exe?.Contains(p, StringComparison.OrdinalIgnoreCase) ?? false) ||
                (sig?.Publisher?.Contains(p, StringComparison.OrdinalIgnoreCase) ?? false)))
            return true;
        // Microsoft-signed components in the Windows directory are part of the OS.
        return sig is { Valid: true } && (sig.Publisher?.Contains("Microsoft Windows", StringComparison.OrdinalIgnoreCase) ?? false)
               && PathUtil.IsUnder(exe, platform.Files.GetKnownFolder(KnownFolder.Windows));
    }

    /// <summary>Operations that toggle an entry. Returns null when the source cannot be toggled safely.</summary>
    public ChangeOperation? ToggleOperation(StartupEntryInfo e, bool enable)
    {
        var verb = enable ? "Enable" : "Disable";
        switch (e.Source)
        {
            case StartupSource.RegistryRun:
            {
                var approved = RunKeys.First(k => k.Key.Equals(e.Location, StringComparison.OrdinalIgnoreCase)).ApprovedKey;
                return new ChangeOperation(ChangeKinds.RegistryValue, RegistryPaths.Target(approved, e.Name),
                    new StateValue(true, enable ? EnabledBytes : DisabledBytes, nameof(RegValueKind.Binary)), $"{verb} startup entry '{e.Name}'");
            }
            case StartupSource.StartupFolder:
            {
                var approved = $@"{(e.Scope == StartupScope.CurrentUser ? "HKCU" : "HKLM")}\{Approved}\StartupFolder";
                return new ChangeOperation(ChangeKinds.RegistryValue, RegistryPaths.Target(approved, PathUtil.GetFileName(e.Location)),
                    new StateValue(true, enable ? EnabledBytes : DisabledBytes, nameof(RegValueKind.Binary)), $"{verb} startup item '{e.Name}'");
            }
            case StartupSource.ScheduledTask:
                return new ChangeOperation(ChangeKinds.ScheduledTask, e.Location, StateValue.Of(enable ? "enabled" : "disabled"), $"{verb} scheduled task '{e.Name}'");
            case StartupSource.Service:
                // Services are set to Manual, never Disabled, so anything that depends on them can still start them.
                return new ChangeOperation(ChangeKinds.ServiceStartMode, e.Location,
                    StateValue.Of(enable ? nameof(ServiceStartMode.Automatic) : nameof(ServiceStartMode.Manual)), $"{verb} auto-start of service '{e.Name}'");
            default:
                return null;
        }
    }
}
