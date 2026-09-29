using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Runtime.Versioning;
using System.Text;
using Nexus.Platform.Abstractions;

namespace Nexus.Platform.Windows;

/// <summary>Power schemes through powrprof.dll — no shell commands involved.</summary>
[SupportedOSPlatform("windows")]
public sealed class WindowsPowerManager : IPowerManager
{
    private const uint ACCESS_SCHEME = 16;

    public IReadOnlyList<PowerScheme> GetSchemes()
    {
        var list = new List<PowerScheme>();
        for (uint i = 0; ; i++)
        {
            var buf = new byte[16];
            uint size = 16;
            var rc = NativeMethods.PowerEnumerate(IntPtr.Zero, IntPtr.Zero, IntPtr.Zero, ACCESS_SCHEME, i, buf, ref size);
            if (rc != 0) break; // ERROR_NO_MORE_ITEMS
            var id = new Guid(buf);
            list.Add(new PowerScheme(id, FriendlyName(id)));
        }
        return list;
    }

    private static string FriendlyName(Guid id)
    {
        uint size = 0;
        NativeMethods.PowerReadFriendlyName(IntPtr.Zero, ref id, IntPtr.Zero, IntPtr.Zero, null, ref size);
        if (size == 0) return WellKnownPowerSchemes.NameOf(id) ?? id.ToString();
        var buf = new byte[size];
        if (NativeMethods.PowerReadFriendlyName(IntPtr.Zero, ref id, IntPtr.Zero, IntPtr.Zero, buf, ref size) != 0)
            return WellKnownPowerSchemes.NameOf(id) ?? id.ToString();
        return Encoding.Unicode.GetString(buf).TrimEnd('\0');
    }

    public Guid GetActiveScheme()
    {
        var rc = NativeMethods.PowerGetActiveScheme(IntPtr.Zero, out var ptr);
        if (rc != 0) throw new Win32Exception((int)rc);
        try { return Marshal.PtrToStructure<Guid>(ptr); }
        finally { NativeMethods.LocalFree(ptr); }
    }

    public void SetActiveScheme(Guid id)
    {
        var rc = NativeMethods.PowerSetActiveScheme(IntPtr.Zero, ref id);
        if (rc != 0) throw new Win32Exception((int)rc);
    }

    public PowerSourceStatus GetPowerSource()
    {
        if (!NativeMethods.GetSystemPowerStatus(out var s)) return new PowerSourceStatus(null, false, null);
        bool? onAc = s.ACLineStatus switch { 0 => false, 1 => true, _ => null };
        var hasBattery = (s.BatteryFlag & 128) == 0 && s.BatteryFlag != 255;
        return new PowerSourceStatus(onAc, hasBattery, s.BatteryLifePercent == 255 ? null : s.BatteryLifePercent);
    }
}
