using System.Diagnostics;
using System.Management;
using System.Runtime.Versioning;
using System.Security.Principal;
using Nexus.Platform.Abstractions;

namespace Nexus.Platform.Windows;

[SupportedOSPlatform("windows")]
public sealed class WindowsPrivilegeProvider : IPrivilegeProvider
{
    public bool IsElevated
    {
        get
        {
            using var id = WindowsIdentity.GetCurrent();
            return new WindowsPrincipal(id).IsInRole(WindowsBuiltInRole.Administrator);
        }
    }

    public string UserName => Environment.UserName;
    public bool CanRequestElevation => Environment.UserInteractive;
}

/// <summary>System Restore through WMI (root\default:SystemRestore). Requires administrator rights.</summary>
[SupportedOSPlatform("windows")]
public sealed class WindowsRestorePointProvider : IRestorePointProvider
{
    public RestorePointResult TryCreate(string description)
    {
        try
        {
            using var cls = new ManagementClass(new ManagementScope(@"\\.\root\default"), new ManagementPath("SystemRestore"), null);
            using var inParams = cls.GetMethodParameters("CreateRestorePoint");
            inParams["Description"] = description.Length > 64 ? description[..64] : description;
            inParams["RestorePointType"] = 12; // MODIFY_SETTINGS
            inParams["EventType"] = 100;       // BEGIN_SYSTEM_CHANGE
            using var result = cls.InvokeMethod("CreateRestorePoint", inParams, null);
            var rc = Convert.ToUInt32(result["ReturnValue"]);
            return rc == 0
                ? new RestorePointResult(true, description, "Restore point requested (Windows may skip it if one was created in the last 24 h).")
                : new RestorePointResult(false, null, $"System Restore returned 0x{rc:X8}. It may be disabled on the system drive.");
        }
        catch (Exception ex) when (ex is ManagementException or UnauthorizedAccessException or System.Runtime.InteropServices.COMException)
        {
            return new RestorePointResult(false, null, $"Restore point unavailable: {ex.Message}");
        }
    }
}

/// <summary>
/// Frame-time capture through Intel/GameTechDev PresentMon (ETW based, MIT licensed).
/// The binary is not bundled; drop PresentMon.exe into the "tools" folder to enable FPS metrics.
/// </summary>
[SupportedOSPlatform("windows")]
public sealed class PresentMonFrameTimeSource(string toolsDirectory) : IFrameTimeSource
{
    private string? Exe => new[] { "PresentMon.exe", "PresentMon-x64.exe" }
        .Select(n => Path.Combine(toolsDirectory, n)).FirstOrDefault(File.Exists);

    public string Name => "PresentMon";
    public bool IsAvailable => Exe is not null;

    public async Task<IReadOnlyList<double>> CaptureAsync(string processName, TimeSpan duration, CancellationToken cancellationToken)
    {
        var exe = Exe ?? throw new InvalidOperationException("PresentMon.exe not found in " + toolsDirectory);
        if (processName.IndexOfAny(['"', ' ', '&', '|', '<', '>', '^']) >= 0)
            throw new ArgumentException("Invalid process name.", nameof(processName));
        var csv = Path.Combine(Path.GetTempPath(), $"nexus-presentmon-{Guid.NewGuid():N}.csv");
        var psi = new ProcessStartInfo(exe)
        {
            UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true, RedirectStandardError = true,
        };
        foreach (var a in new[] { "--process_name", processName, "--output_file", csv, "--timed", ((int)Math.Ceiling(duration.TotalSeconds)).ToString(System.Globalization.CultureInfo.InvariantCulture),
                     "--terminate_after_timed", "--stop_existing_session", "--no_console_stats" })
            psi.ArgumentList.Add(a);
        using var p = Process.Start(psi) ?? throw new InvalidOperationException("Could not start PresentMon.");
        using (cancellationToken.Register(() => { try { p.Kill(); } catch { } }))
            await p.WaitForExitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            if (!File.Exists(csv)) return [];
            using var reader = new StreamReader(csv);
            return FrameTimeCsvParser.Parse(reader);
        }
        finally { try { File.Delete(csv); } catch { } }
    }
}
