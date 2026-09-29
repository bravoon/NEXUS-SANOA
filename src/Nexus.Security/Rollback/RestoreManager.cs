using Nexus.Contracts;
using Nexus.Data.Logging;
using Nexus.Data.Repositories;
using Nexus.Platform.Changes;

namespace Nexus.Security.Rollback;

/// <summary>Restores individual captured states (used by the RollbackEngine and for manual restores).</summary>
public sealed class RestoreManager(ChangeHandlerRegistry handlers, INexusLogger log)
{
    public bool Restore(string kind, string target, StateValue desired, StateValue current)
    {
        var handler = handlers.Get(kind);
        handler.Apply(target, desired, current);
        var after = handler.Capture(target);
        var ok = handler.Matches(after, desired);
        log.Info("Restore", $"{kind} {target} → {desired} : {(ok ? "verified" : "MISMATCH")}");
        return ok;
    }

    public bool Restore(BackupRecord backup) =>
        Restore(backup.Kind, backup.Target, backup.State, handlers.Get(backup.Kind).Capture(backup.Target));
}
