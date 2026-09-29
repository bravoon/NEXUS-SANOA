using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Runtime.Versioning;
using System.Security.Principal;
using System.Text;
using Nexus.Contracts;
using Nexus.Platform.Abstractions;

namespace Nexus.Platform.Windows;

[SupportedOSPlatform("windows")]
public sealed class WindowsProcessManager : IProcessManager
{
    private static readonly SecurityIdentifier LocalSystem = new(WellKnownSidType.LocalSystemSid, null);

    public int CurrentProcessId => Environment.ProcessId;

    public IReadOnlyList<ProcessFacts> GetProcesses()
    {
        var list = new List<ProcessFacts>();
        foreach (var p in Process.GetProcesses())
        {
            using (p)
            {
                var f = ToFacts(p);
                if (f is not null) list.Add(f);
            }
        }
        return list;
    }

    public ProcessFacts? GetProcess(int pid)
    {
        try
        {
            using var p = Process.GetProcessById(pid);
            return ToFacts(p);
        }
        catch (ArgumentException) { return null; }
    }

    private static T? Try<T>(Func<T> f) where T : struct
    {
        try { return f(); } catch { return null; }
    }

    private static ProcessFacts? ToFacts(Process p)
    {
        try
        {
            var pid = p.Id;
            var name = pid switch { 0 => "Idle", 4 => "System", _ => p.ProcessName + ".exe" };
            if (pid != 0 && pid != 4 && p.ProcessName is "Registry" or "Secure System" or "Memory Compression") name = p.ProcessName;

            string? path = null;
            bool? critical = null;
            bool? system = pid is 0 or 4 ? true : null;
            ulong? io = null;
            var h = NativeMethods.OpenProcess(NativeMethods.PROCESS_QUERY_LIMITED_INFORMATION, false, pid);
            if (h != IntPtr.Zero)
            {
                try
                {
                    var sb = new StringBuilder(1024);
                    var size = (uint)sb.Capacity;
                    if (NativeMethods.QueryFullProcessImageNameW(h, 0, sb, ref size)) path = sb.ToString(0, (int)size);
                    if (NativeMethods.IsProcessCritical(h, out var c)) critical = c;
                    if (NativeMethods.GetProcessIoCounters(h, out var ioc)) io = ioc.ReadTransferCount + ioc.WriteTransferCount;
                    system = IsLocalSystem(h) ?? system;
                }
                finally { NativeMethods.CloseHandle(h); }
            }

            return new ProcessFacts(
                pid, name, path, p.SessionId, p.WorkingSet64, p.PrivateMemorySize64,
                Try(() => p.TotalProcessorTime),
                Try(() => new DateTimeOffset(p.StartTime)),
                Try(() => Map(p.PriorityClass)),
                critical, system, io,
                Try(() => (long)p.ProcessorAffinity));
        }
        catch (InvalidOperationException) { return null; } // exited
    }

    private static bool? IsLocalSystem(IntPtr process)
    {
        if (!NativeMethods.OpenProcessToken(process, NativeMethods.TOKEN_QUERY, out var token)) return null;
        try
        {
            NativeMethods.GetTokenInformation(token, 1 /* TokenUser */, IntPtr.Zero, 0, out var len);
            if (len <= 0) return null;
            var buf = Marshal.AllocHGlobal(len);
            try
            {
                if (!NativeMethods.GetTokenInformation(token, 1, buf, len, out _)) return null;
                var sidPtr = Marshal.ReadIntPtr(buf);
                return new SecurityIdentifier(sidPtr) == LocalSystem;
            }
            finally { Marshal.FreeHGlobal(buf); }
        }
        finally { NativeMethods.CloseHandle(token); }
    }

    private static ProcessPriority Map(ProcessPriorityClass c) => c switch
    {
        ProcessPriorityClass.Idle => ProcessPriority.Idle,
        ProcessPriorityClass.BelowNormal => ProcessPriority.BelowNormal,
        ProcessPriorityClass.AboveNormal => ProcessPriority.AboveNormal,
        ProcessPriorityClass.High => ProcessPriority.High,
        ProcessPriorityClass.RealTime => ProcessPriority.RealTime,
        _ => ProcessPriority.Normal,
    };

    public void SetPriority(int pid, ProcessPriority priority)
    {
        using var p = Process.GetProcessById(pid);
        p.PriorityClass = priority switch
        {
            ProcessPriority.Idle => ProcessPriorityClass.Idle,
            ProcessPriority.BelowNormal => ProcessPriorityClass.BelowNormal,
            ProcessPriority.AboveNormal => ProcessPriorityClass.AboveNormal,
            ProcessPriority.High => ProcessPriorityClass.High,
            ProcessPriority.Normal => ProcessPriorityClass.Normal,
            _ => throw new InvalidOperationException("RealTime priority is not permitted."),
        };
    }

    public void SetAffinity(int pid, long mask)
    {
        using var p = Process.GetProcessById(pid);
        p.ProcessorAffinity = (IntPtr)mask;
    }

    public void Terminate(int pid)
    {
        using var p = Process.GetProcessById(pid);
        p.Kill(entireProcessTree: false);
        p.WaitForExit(5000);
    }
}
