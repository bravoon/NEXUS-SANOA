using Nexus.Contracts;
using Nexus.Platform.Abstractions;
using Nexus.Platform.Changes;

namespace Nexus.Security.Permissions;

public sealed record PermissionCheck(bool RequiresAdmin, bool IsElevated, IReadOnlyList<string> AdminTargets)
{
    public bool Allowed => !RequiresAdmin || IsElevated;
}

/// <summary>
/// Launches a short-lived elevated worker for a single transaction. Implemented by the host application
/// (it owns process creation); the engine itself never runs elevated permanently.
/// </summary>
public interface IElevationBroker
{
    Task<ExecutionResult?> ExecuteElevatedAsync(ExecuteOptimizationRequest request, CancellationToken cancellationToken);
    Task<RollbackResult?> RollbackElevatedAsync(RollbackRequest request, CancellationToken cancellationToken);
}

/// <summary>
/// Least-privilege gatekeeper. The application runs as a standard user; elevation is requested only for
/// transactions that contain machine-wide changes, and only through an explicit broker.
/// </summary>
public sealed class PermissionManager(IPrivilegeProvider privileges, ChangeHandlerRegistry handlers)
{
    public IElevationBroker? ElevationBroker { get; set; }

    public bool IsElevated => privileges.IsElevated;

    public bool CanElevate => ElevationBroker is not null && privileges.CanRequestElevation;

    public PermissionCheck Check(IEnumerable<(string Kind, string Target)> changes)
    {
        var admin = changes.Where(c => handlers.Get(c.Kind).RequiresAdmin(c.Target)).Select(c => $"{c.Kind}:{c.Target}").ToList();
        return new PermissionCheck(admin.Count > 0, privileges.IsElevated, admin);
    }

    public PermissionCheck Check(IEnumerable<PlannedChange> changes) => Check(changes.Select(c => (c.Kind, c.Target)));
}
