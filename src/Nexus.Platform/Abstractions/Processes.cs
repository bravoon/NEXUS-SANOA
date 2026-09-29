using Nexus.Contracts;

namespace Nexus.Platform.Abstractions;

/// <summary>Raw process facts. Fields that could not be read (access denied) are null.</summary>
public sealed record ProcessFacts(
    int Pid,
    string Name,
    string? Path,
    int SessionId,
    long WorkingSetBytes,
    long PrivateBytes,
    TimeSpan? TotalProcessorTime,
    DateTimeOffset? StartTime,
    ProcessPriority? Priority,
    bool? IsCritical,
    bool? RunsAsSystemAccount,
    ulong? IoBytesTotal,
    long? Affinity);

public interface IProcessManager
{
    IReadOnlyList<ProcessFacts> GetProcesses();
    ProcessFacts? GetProcess(int pid);
    void SetPriority(int pid, ProcessPriority priority);
    void SetAffinity(int pid, long mask);
    void Terminate(int pid);
    int CurrentProcessId { get; }
}

public sealed record SignatureInfo(bool? Signed, bool? Valid, string? Publisher);

public interface ISignatureVerifier
{
    SignatureInfo Verify(string path);
}
