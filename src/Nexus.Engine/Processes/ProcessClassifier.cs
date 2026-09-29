using Nexus.Contracts;
using Nexus.Data.Configuration;
using Nexus.Platform;
using Nexus.Platform.Abstractions;

namespace Nexus.Engine.Processes;

public sealed record ProtectionVerdict(bool IsProtected, string Reason);

/// <summary>Resolved locations used by classification (%System32%, %Windows%, temp and download folders).</summary>
public sealed record SystemLocations(string? Windows, string? System32, string? Temp, string? Downloads, string? ProgramFiles, string? ProgramFilesX86)
{
    public static SystemLocations From(IFileSystem fs) => new(
        fs.GetKnownFolder(KnownFolder.Windows), fs.GetKnownFolder(KnownFolder.System32), fs.GetKnownFolder(KnownFolder.Temp),
        fs.GetKnownFolder(KnownFolder.Downloads), fs.GetKnownFolder(KnownFolder.ProgramFiles), fs.GetKnownFolder(KnownFolder.ProgramFilesX86));

    public string? Expand(string? dir) => dir switch
    {
        null => null,
        "%System32%" => System32,
        "%Windows%" => Windows,
        _ => dir,
    };
}

/// <summary>
/// Pure classification logic (SYSTEM / TRUSTED / USER / UNKNOWN / SUSPICIOUS) and protection policy.
/// Protection is based on what the process IS (critical flag, LocalSystem service in the Windows directory,
/// location of well-known binaries), not only on its name — a "csrss.exe" outside System32 is not protected, it is suspicious.
/// </summary>
public sealed class ProcessClassifier(IReadOnlyList<ProtectedProcessRule> protectedRules, SystemLocations locations, int currentProcessId)
{
    private static readonly string[] KernelPseudoProcesses = ["Idle", "System Idle Process", "System", "Registry", "Secure System", "Memory Compression"];

    private ProtectedProcessRule? MatchRule(ProcessFacts p) =>
        protectedRules.FirstOrDefault(r => string.Equals(r.Name, p.Name, StringComparison.OrdinalIgnoreCase));

    private bool IsKernel(ProcessFacts p) =>
        p.Pid is 0 or 4 || (p.Path is null && KernelPseudoProcesses.Contains(p.Name, StringComparer.OrdinalIgnoreCase) && p.SessionId == 0);

    /// <summary>True when a protected name runs from somewhere other than its expected directory.</summary>
    private bool ImpersonatesProtected(ProcessFacts p)
    {
        var rule = MatchRule(p);
        if (rule?.ExpectedDirectory is null || p.Path is null) return false;
        var expected = locations.Expand(rule.ExpectedDirectory);
        return expected is not null && !PathUtil.EqualsPath(PathUtil.GetDirectory(p.Path), expected);
    }

    public ProtectionVerdict EvaluateProtection(ProcessFacts p)
    {
        if (IsKernel(p)) return new(true, "kernel/system pseudo-process");
        if (p.Pid == currentProcessId) return new(true, "Nexus itself");
        if (p.IsCritical == true) return new(true, "marked critical by Windows — terminating it stops the system");
        if (ImpersonatesProtected(p)) return new(false, "name of a system process but unexpected location");
        if (p.RunsAsSystemAccount == true && p.SessionId == 0 && PathUtil.IsUnder(p.Path, locations.Windows))
            return new(true, "Windows component running as LocalSystem");
        var rule = MatchRule(p);
        if (rule is not null)
        {
            var expected = locations.Expand(rule.ExpectedDirectory);
            if (expected is null || p.Path is null || PathUtil.EqualsPath(PathUtil.GetDirectory(p.Path), expected))
                return new(true, "listed in the protected-process configuration");
        }
        return new(false, "not protected");
    }

    public (ProcessClassification Classification, IReadOnlyList<string> Reasons) Classify(ProcessFacts p, SignatureInfo? sig)
    {
        var reasons = new List<string>();
        if (IsKernel(p)) return (ProcessClassification.System, ["Kernel or system pseudo-process"]);
        if (p.IsCritical == true) return (ProcessClassification.System, ["Critical system process"]);

        // Suspicious indicators — reported as indicators, never as a malware verdict.
        if (ImpersonatesProtected(p)) reasons.Add($"Uses the name of a Windows system process but runs from '{PathUtil.GetDirectory(p.Path!)}'");
        if (sig is { Signed: true, Valid: false }) reasons.Add("Digital signature present but invalid (tampered or untrusted)");
        if (sig?.Signed == false && (PathUtil.IsUnder(p.Path, locations.Temp) || PathUtil.IsUnder(p.Path, locations.Downloads)))
            reasons.Add("Unsigned executable running from a temporary or downloads folder");
        if (reasons.Count > 0) return (ProcessClassification.Suspicious, reasons);

        var microsoft = sig is { Valid: true } && (sig.Publisher?.Contains("Microsoft", StringComparison.OrdinalIgnoreCase) ?? false);
        if (microsoft && PathUtil.IsUnder(p.Path, locations.Windows))
            return (ProcessClassification.System, ["Microsoft-signed binary in the Windows directory"]);
        if (p.RunsAsSystemAccount == true && PathUtil.IsUnder(p.Path, locations.Windows) && sig?.Valid != false)
            return (ProcessClassification.System, ["Windows component running as LocalSystem"]);
        if (sig is { Valid: true })
            return (ProcessClassification.Trusted, [$"Valid signature: {sig.Publisher ?? "unknown publisher"}"]);
        if (p.Path is null)
            return (ProcessClassification.Unknown, ["Image path not accessible (may require administrator rights)"]);
        if (sig?.Signed is null)
            return (ProcessClassification.Unknown, ["Signature could not be verified"]);
        return (ProcessClassification.User, ["Unsigned user application in a regular location"]);
    }
}
