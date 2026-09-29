using System.ComponentModel;
using System.Runtime.Versioning;
using System.ServiceProcess;
using Nexus.Contracts;
using ScStart = System.ServiceProcess.ServiceStartMode;
using Nexus.Platform.Abstractions;

namespace Nexus.Platform.Windows;

[SupportedOSPlatform("windows")]
public sealed class WindowsServiceManager(IRegistryAccessor registry) : IServiceManager
{
    public IReadOnlyList<ServiceFacts> GetServices()
    {
        var result = new List<ServiceFacts>();
        foreach (var sc in ServiceController.GetServices())
        {
            using (sc)
            {
                try { result.Add(ToFacts(sc)); }
                catch (InvalidOperationException) { /* service removed while enumerating */ }
            }
        }
        return result;
    }

    public ServiceFacts? GetService(string name)
    {
        try
        {
            using var sc = new ServiceController(name);
            return ToFacts(sc);
        }
        catch (InvalidOperationException) { return null; }
    }

    private ServiceFacts ToFacts(ServiceController sc)
    {
        var key = $@"HKLM\SYSTEM\CurrentControlSet\Services\{sc.ServiceName}";
        var delayed = registry.GetValue(key, "DelayedAutostart")?.AsDWord() == 1;
        var mode = sc.StartType switch
        {
            ScStart.Boot => Contracts.ServiceStartMode.Boot,
            ScStart.System => Contracts.ServiceStartMode.System,
            ScStart.Automatic => delayed ? Contracts.ServiceStartMode.AutomaticDelayed : Contracts.ServiceStartMode.Automatic,
            ScStart.Manual => Contracts.ServiceStartMode.Manual,
            ScStart.Disabled => Contracts.ServiceStartMode.Disabled,
            _ => Contracts.ServiceStartMode.Unknown,
        };
        var state = sc.Status switch
        {
            ServiceControllerStatus.Running => ServiceRunState.Running,
            ServiceControllerStatus.Stopped => ServiceRunState.Stopped,
            ServiceControllerStatus.Paused => ServiceRunState.Paused,
            ServiceControllerStatus.StartPending => ServiceRunState.StartPending,
            ServiceControllerStatus.StopPending => ServiceRunState.StopPending,
            _ => ServiceRunState.Unknown,
        };
        var image = registry.GetValue(key, "ImagePath")?.Text;
        return new ServiceFacts(sc.ServiceName, sc.DisplayName, mode, state, image);
    }

    public void SetStartMode(string name, Contracts.ServiceStartMode mode)
    {
        uint startType = mode switch
        {
            Contracts.ServiceStartMode.Automatic or Contracts.ServiceStartMode.AutomaticDelayed => 2,
            Contracts.ServiceStartMode.Manual => 3,
            Contracts.ServiceStartMode.Disabled => 4,
            _ => throw new ArgumentOutOfRangeException(nameof(mode), mode, "Unsupported start mode"),
        };

        var scm = NativeMethods.OpenSCManagerW(null, null, NativeMethods.SC_MANAGER_CONNECT);
        if (scm == IntPtr.Zero) throw new Win32Exception();
        try
        {
            var svc = NativeMethods.OpenServiceW(scm, name, NativeMethods.SERVICE_CHANGE_CONFIG | NativeMethods.SERVICE_QUERY_CONFIG);
            if (svc == IntPtr.Zero) throw new Win32Exception();
            try
            {
                if (!NativeMethods.ChangeServiceConfigW(svc, NativeMethods.SERVICE_NO_CHANGE, startType, NativeMethods.SERVICE_NO_CHANGE,
                        null, null, IntPtr.Zero, null, null, null, null))
                    throw new Win32Exception();
                if (startType == 2)
                {
                    var info = new NativeMethods.SERVICE_DELAYED_AUTO_START_INFO { fDelayedAutostart = mode == Contracts.ServiceStartMode.AutomaticDelayed };
                    if (!NativeMethods.ChangeServiceConfig2W(svc, NativeMethods.SERVICE_CONFIG_DELAYED_AUTO_START_INFO, ref info))
                        throw new Win32Exception();
                }
            }
            finally { NativeMethods.CloseServiceHandle(svc); }
        }
        finally { NativeMethods.CloseServiceHandle(scm); }
    }
}
