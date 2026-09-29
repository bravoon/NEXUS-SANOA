using System.Globalization;
using System.Management;
using System.Net.NetworkInformation;
using System.Runtime.Versioning;
using Nexus.Contracts;
using Nexus.Platform.Abstractions;

namespace Nexus.Platform.Windows;

/// <summary>Static hardware / OS inventory through WMI (read-only).</summary>
[SupportedOSPlatform("windows")]
public sealed class WmiSystemInfoProvider(IRegistryAccessor registry) : ISystemInfoProvider
{
    private CpuInfo? _cpu;
    private IReadOnlyList<GpuInfo>? _gpus;

    private static IEnumerable<ManagementObject> Query(string scope, string wql)
    {
        using var searcher = new ManagementObjectSearcher(scope, wql);
        ManagementObjectCollection results;
        try { results = searcher.Get(); }
        catch (Exception ex) when (ex is ManagementException or UnauthorizedAccessException or System.Runtime.InteropServices.COMException) { yield break; }
        foreach (ManagementObject mo in results) yield return mo;
    }

    private static string? S(ManagementBaseObject mo, string p) => mo[p]?.ToString();

    private static DateTimeOffset? CimDate(object? v)
    {
        if (v is not string s || s.Length < 14) return null;
        try { return new DateTimeOffset(ManagementDateTimeConverter.ToDateTime(s)); } catch { return null; }
    }

    public OsInfo GetOs()
    {
        foreach (var mo in Query(@"root\CIMV2", "SELECT Caption, Version, BuildNumber, OSArchitecture, LastBootUpTime FROM Win32_OperatingSystem"))
            using (mo)
                return new OsInfo(S(mo, "Caption") ?? "Windows", S(mo, "Version") ?? Environment.OSVersion.Version.ToString(),
                    S(mo, "BuildNumber") ?? "", S(mo, "OSArchitecture") ?? "", false, CimDate(mo["LastBootUpTime"]));
        return new OsInfo("Windows", Environment.OSVersion.Version.ToString(), Environment.OSVersion.Version.Build.ToString(CultureInfo.InvariantCulture),
            Environment.Is64BitOperatingSystem ? "64-bit" : "32-bit", false, null);
    }

    public CpuInfo GetCpu()
    {
        if (_cpu is not null) return _cpu;
        string name = "CPU", vendor = "";
        int cores = 0, logical = 0;
        double? clock = null;
        foreach (var mo in Query(@"root\CIMV2", "SELECT Name, Manufacturer, NumberOfCores, NumberOfLogicalProcessors, MaxClockSpeed FROM Win32_Processor"))
            using (mo)
            {
                name = S(mo, "Name")?.Trim() ?? name;
                vendor = S(mo, "Manufacturer") ?? vendor;
                cores += Convert.ToInt32(mo["NumberOfCores"] ?? 0, CultureInfo.InvariantCulture);
                logical += Convert.ToInt32(mo["NumberOfLogicalProcessors"] ?? 0, CultureInfo.InvariantCulture);
                clock = Convert.ToDouble(mo["MaxClockSpeed"] ?? 0, CultureInfo.InvariantCulture);
            }
        return _cpu = new CpuInfo(name, vendor, cores, logical == 0 ? Environment.ProcessorCount : logical, clock);
    }

    public IReadOnlyList<GpuInfo> GetGpus()
    {
        if (_gpus is not null) return _gpus;
        var vram = ReadVramFromRegistry();
        var list = new List<GpuInfo>();
        foreach (var mo in Query(@"root\CIMV2", "SELECT Name, AdapterCompatibility, DriverVersion, DriverDate, AdapterRAM FROM Win32_VideoController"))
            using (mo)
            {
                var name = S(mo, "Name") ?? "GPU";
                if (name.Contains("Basic Display", StringComparison.OrdinalIgnoreCase) || name.Contains("Remote Display", StringComparison.OrdinalIgnoreCase)) continue;
                // Win32_VideoController.AdapterRAM is a UInt32 and saturates at 4 GB; the registry value is authoritative.
                long? mem = vram.TryGetValue(name, out var v) ? v : null;
                list.Add(new GpuInfo(name, S(mo, "AdapterCompatibility") ?? "", mem, S(mo, "DriverVersion"), CimDate(mo["DriverDate"])));
            }
        return _gpus = list;
    }

    private Dictionary<string, long> ReadVramFromRegistry()
    {
        const string cls = @"HKLM\SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}";
        var r = new Dictionary<string, long>(StringComparer.OrdinalIgnoreCase);
        foreach (var sub in registry.GetSubKeyNames(cls))
        {
            if (!sub.All(char.IsDigit)) continue;
            var key = $@"{cls}\{sub}";
            var desc = registry.GetValue(key, "DriverDesc")?.Text;
            var q = registry.GetValue(key, "HardwareInformation.qwMemorySize");
            if (desc is null || q is null) continue;
            if (q.Kind == RegValueKind.QWord && long.TryParse(q.Text, out var bytes)) r[desc] = bytes;
            else if (q.Kind == RegValueKind.Binary && q.AsBytes() is { Length: >= 8 } b) r[desc] = BitConverter.ToInt64(b, 0);
        }
        return r;
    }

    public MemoryInfo GetMemory()
    {
        var s = NativeMethods.GetMemoryStatus();
        int? speed = null;
        var count = 0;
        foreach (var mo in Query(@"root\CIMV2", "SELECT Speed, ConfiguredClockSpeed FROM Win32_PhysicalMemory"))
            using (mo)
            {
                count++;
                var sp = mo["ConfiguredClockSpeed"] ?? mo["Speed"];
                if (sp is not null) speed = Convert.ToInt32(sp, CultureInfo.InvariantCulture);
            }
        return new MemoryInfo((long)s.ullTotalPhys, (long)s.ullAvailPhys, speed, count == 0 ? null : count);
    }

    public IReadOnlyList<DiskInfo> GetDisks()
    {
        var media = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        var diskMedia = new Dictionary<string, string>();
        foreach (var mo in Query(@"root\Microsoft\Windows\Storage", "SELECT DeviceId, MediaType FROM MSFT_PhysicalDisk"))
            using (mo)
                diskMedia[S(mo, "DeviceId") ?? ""] = Convert.ToInt32(mo["MediaType"] ?? 0, CultureInfo.InvariantCulture) switch { 3 => "HDD", 4 => "SSD", 5 => "SCM", _ => "Unspecified" };
        foreach (var mo in Query(@"root\Microsoft\Windows\Storage", "SELECT DriveLetter, DiskNumber FROM MSFT_Partition"))
            using (mo)
            {
                var letter = mo["DriveLetter"] is char c && c != '\0' ? c.ToString() : S(mo, "DriveLetter");
                if (string.IsNullOrWhiteSpace(letter) || letter == "\0") continue;
                if (diskMedia.TryGetValue(S(mo, "DiskNumber") ?? "", out var m)) media[letter + ":"] = m;
            }

        var sysDrive = Path.GetPathRoot(Environment.SystemDirectory)?.TrimEnd('\\');
        return DriveInfo.GetDrives().Where(d => d.DriveType == DriveType.Fixed && d.IsReady).Select(d =>
        {
            var name = d.Name.TrimEnd('\\');
            return new DiskInfo(name, d.DriveFormat, d.TotalSize, d.AvailableFreeSpace, media.GetValueOrDefault(name),
                string.Equals(name, sysDrive, StringComparison.OrdinalIgnoreCase));
        }).ToList();
    }

    public IReadOnlyList<NetworkAdapterInfo> GetNetworkAdapters() =>
        NetworkInterface.GetAllNetworkInterfaces()
            .Where(n => n.NetworkInterfaceType != NetworkInterfaceType.Loopback)
            .Select(n => new NetworkAdapterInfo(n.Name, n.Description, n.NetworkInterfaceType.ToString(),
                n.Speed > 0 ? n.Speed : null, n.OperationalStatus == OperationalStatus.Up))
            .ToList();

    public IReadOnlyList<DriverInfo> GetDrivers()
    {
        var list = new List<DriverInfo>();
        foreach (var mo in Query(@"root\CIMV2",
                     "SELECT DeviceName, DeviceClass, DriverVersion, DriverDate, DriverProviderName FROM Win32_PnPSignedDriver " +
                     "WHERE DeviceClass='DISPLAY' OR DeviceClass='NET' OR DeviceClass='MEDIA' OR DeviceClass='SCSIADAPTER' OR DeviceClass='HDC'"))
            using (mo)
            {
                var name = S(mo, "DeviceName");
                if (name is null) continue;
                list.Add(new DriverInfo(name, S(mo, "DeviceClass") ?? "", S(mo, "DriverVersion"), CimDate(mo["DriverDate"]), S(mo, "DriverProviderName"), 0));
            }
        foreach (var mo in Query(@"root\CIMV2", "SELECT Name, PNPClass, ConfigManagerErrorCode FROM Win32_PnPEntity WHERE ConfigManagerErrorCode <> 0"))
            using (mo)
            {
                var code = Convert.ToInt32(mo["ConfigManagerErrorCode"] ?? 0, CultureInfo.InvariantCulture);
                if (code == 22) continue; // 22 = disabled by the user: intentional, not a fault
                list.Add(new DriverInfo(S(mo, "Name") ?? "Unknown device", S(mo, "PNPClass") ?? "", null, null, null, code));
            }
        return list;
    }
}
