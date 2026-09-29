using System.Runtime.Versioning;
using Nexus.Platform.Abstractions;

namespace Nexus.Platform.Windows;

[SupportedOSPlatform("windows")]
public sealed class WindowsPlatform : IPlatform, IDisposable
{
    public WindowsPlatform(string toolsDirectory)
    {
        var registry = new WindowsRegistryAccessor();
        Registry = registry;
        Services = new WindowsServiceManager(registry);
        Processes = new WindowsProcessManager();
        Signatures = new AuthenticodeVerifier();
        Power = new WindowsPowerManager();
        Tasks = new WindowsTaskScheduler();
        Files = new WindowsFileSystem();
        Privileges = new WindowsPrivilegeProvider();
        SystemInfo = new WmiSystemInfoProvider(registry);
        _sensors = new WindowsHardwareSensors(SystemInfo, Privileges);
        RestorePoints = new WindowsRestorePointProvider();
        FrameTimes = new PresentMonFrameTimeSource(toolsDirectory);
    }

    private readonly WindowsHardwareSensors _sensors;

    public string Name => $"Windows {Environment.OSVersion.Version}";
    public bool IsSimulated => false;
    public IRegistryAccessor Registry { get; }
    public IServiceManager Services { get; }
    public IProcessManager Processes { get; }
    public ISignatureVerifier Signatures { get; }
    public IPowerManager Power { get; }
    public ITaskSchedulerAccessor Tasks { get; }
    public IFileSystem Files { get; }
    public IHardwareSensorProvider Sensors => _sensors;
    public ISystemInfoProvider SystemInfo { get; }
    public IPrivilegeProvider Privileges { get; }
    public IRestorePointProvider RestorePoints { get; }
    public IFrameTimeSource FrameTimes { get; }

    public void Dispose() => _sensors.Dispose();
}
