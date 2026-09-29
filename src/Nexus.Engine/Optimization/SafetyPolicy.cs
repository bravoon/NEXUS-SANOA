using Nexus.Contracts;
using Nexus.Data.Configuration;
using Nexus.Engine.Core;
using Nexus.Engine.Processes;
using Nexus.Platform;
using Nexus.Platform.Abstractions;
using Nexus.Platform.Changes;

namespace Nexus.Engine.Optimization;

/// <summary>
/// Last line of defence, evaluated for every single change regardless of which rule produced it.
/// Blocks: protected/critical processes, critical services, security-sensitive registry locations,
/// file operations outside temporary folders, RealTime priority and empty affinity masks.
/// </summary>
public sealed class SafetyPolicy(NexusConfiguration config, IPlatform platform, ProcessEngine processes)
{
    private static readonly string[] DeniedRegistryPrefixes =
    [
        @"HKLM\SAM", @"HKLM\SECURITY", @"HKLM\SYSTEM\CurrentControlSet\Control\Lsa",
        @"HKLM\SYSTEM\CurrentControlSet\Services", // service changes must go through the service handler
        @"HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon",
        @"HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Image File Execution Options",
        @"HKLM\SOFTWARE\Policies\Microsoft\Windows Defender",
        @"HKLM\BCD00000000",
    ];

    public IReadOnlyList<string> Check(ChangeOperation op)
    {
        var problems = new List<string>();
        switch (op.Kind)
        {
            case ChangeKinds.RegistryValue:
            {
                var (key, _) = RegistryPaths.ParseTarget(op.Target);
                var norm = key.Replace("HKEY_LOCAL_MACHINE", "HKLM");
                if (DeniedRegistryPrefixes.Any(p => norm.StartsWith(p, StringComparison.OrdinalIgnoreCase)))
                    problems.Add($"Registry location '{key}' is protected.");
                break;
            }
            case ChangeKinds.ServiceStartMode:
                if (config.CriticalServices.Contains(op.Target, StringComparer.OrdinalIgnoreCase))
                    problems.Add($"Service '{op.Target}' is critical to Windows and cannot be modified.");
                if (op.Desired.Value == nameof(ServiceStartMode.Disabled) && op.Target.Equals("WinDefend", StringComparison.OrdinalIgnoreCase))
                    problems.Add("Security services are never disabled.");
                break;
            case ChangeKinds.ProcessPriority or ChangeKinds.ProcessAffinity or ChangeKinds.ProcessTerminate:
            {
                var pid = int.Parse(op.Target.Split(':')[0], System.Globalization.CultureInfo.InvariantCulture);
                var facts = platform.Processes.GetProcess(pid);
                if (facts is null) break;
                if (pid == platform.Processes.CurrentProcessId && op.Kind == ChangeKinds.ProcessTerminate)
                    problems.Add("Nexus will not terminate itself.");
                var protection = processes.EvaluateProtection(facts);
                if (protection.IsProtected && op.Kind is ChangeKinds.ProcessTerminate or ChangeKinds.ProcessAffinity)
                    problems.Add($"Process {facts.Name} ({pid}) is protected: {protection.Reason}.");
                if (protection.IsProtected && op.Kind == ChangeKinds.ProcessPriority && op.Desired.Value is nameof(ProcessPriority.Idle) or nameof(ProcessPriority.BelowNormal))
                    problems.Add($"Lowering the priority of protected process {facts.Name} could destabilise Windows.");
                if (op.Kind == ChangeKinds.ProcessPriority && op.Desired.Value == nameof(ProcessPriority.RealTime))
                    problems.Add("RealTime priority is never applied.");
                break;
            }
            case ChangeKinds.FileQuarantine:
            {
                var temp = platform.Files.GetKnownFolder(KnownFolder.Temp);
                var winTemp = platform.Files.GetKnownFolder(KnownFolder.Windows) is { } w ? PathUtil.Combine(w, "Temp") : null;
                if (!PathUtil.IsUnder(op.Target, temp) && !PathUtil.IsUnder(op.Target, winTemp))
                    problems.Add($"File operations are only allowed inside temporary folders ('{op.Target}').");
                break;
            }
        }
        return problems;
    }
}
