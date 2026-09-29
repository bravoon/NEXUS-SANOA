namespace Nexus.Contracts;

public sealed record GameInfo(string GameId, string Name, string Launcher, string? InstallPath, string? Executable);

public sealed record LauncherInfo(string Name, bool Installed, bool Running, string? Path);

/// <summary>
/// Per-game session profile. Applied when the game starts, reverted when it exits.
/// Background processes are de-prioritised, never killed.
/// </summary>
public sealed record GameProfile(
    string GameId,
    string Executable,
    ProcessPriority Priority = ProcessPriority.Normal,
    long? CpuAffinity = null,
    IReadOnlyDictionary<string, string>? GraphicsSettings = null,
    IReadOnlyDictionary<string, string>? WindowsSettings = null,
    IReadOnlyList<string>? BackgroundProcesses = null,
    bool AutoApply = false);

public sealed record GameSessionState(string GameId, int Pid, DateTimeOffset StartedAt, string? TransactionId);
