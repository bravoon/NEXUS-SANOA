namespace Nexus.Platform.Abstractions;

/// <summary>Aggregates every system facility. Implemented by the Windows layer and by the simulator.</summary>
public interface IPlatform
{
    string Name { get; }
    bool IsSimulated { get; }
    IRegistryAccessor Registry { get; }
    IServiceManager Services { get; }
    IProcessManager Processes { get; }
    ISignatureVerifier Signatures { get; }
    IPowerManager Power { get; }
    ITaskSchedulerAccessor Tasks { get; }
    IFileSystem Files { get; }
    IHardwareSensorProvider Sensors { get; }
    ISystemInfoProvider SystemInfo { get; }
    IPrivilegeProvider Privileges { get; }
    IRestorePointProvider RestorePoints { get; }
    IFrameTimeSource FrameTimes { get; }
}
