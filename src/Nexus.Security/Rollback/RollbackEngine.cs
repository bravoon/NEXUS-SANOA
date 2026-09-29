using Nexus.Contracts;
using Nexus.Data.Logging;
using Nexus.Data.Repositories;
using Nexus.Platform.Changes;
using Nexus.Security.Permissions;

namespace Nexus.Security.Rollback;

/// <summary>
/// Reverts a committed transaction — or a single item of it — without touching anything else.
/// Each change is restored in reverse order, then re-read to validate that the previous state is back.
/// If the current value differs from what the engine wrote (somebody changed it since), the change is
/// skipped unless <see cref="RollbackRequest.Force"/> is set, so user edits are never silently overwritten.
/// </summary>
public sealed class RollbackEngine(
    ChangeHandlerRegistry handlers,
    RestoreManager restore,
    TransactionRepository transactions,
    PermissionManager permissions,
    INexusLogger log)
{
    private const string Cat = "Rollback";

    public RollbackResult Rollback(RollbackRequest request)
    {
        var tx = transactions.Get(request.TransactionId);
        if (tx is null)
            return new RollbackResult(request.TransactionId, TransactionStatus.Failed, [], [$"Transaction {request.TransactionId} not found."], false);
        if (tx.Status is TransactionStatus.RolledBack)
            return new RollbackResult(tx.TransactionId, tx.Status, [], ["Transaction was already rolled back."], false);

        var items = tx.Items.Where(i => request.ItemId is null || i.ItemId == request.ItemId || i.OptimizationId == request.ItemId).ToList();
        if (items.Count == 0)
            return new RollbackResult(tx.TransactionId, TransactionStatus.Failed, [], [$"Item {request.ItemId} not found in {tx.TransactionId}."], false);

        var toRevert = items.Where(i => i.Status == TransactionItemStatus.Applied).SelectMany(i => i.Changes.Where(c => c.Applied)).ToList();
        var perm = permissions.Check(toRevert.Select(c => (c.Kind, c.Target)));
        if (!perm.Allowed)
            return new RollbackResult(tx.TransactionId, TransactionStatus.ElevationRequired, [], ["Administrator rights are required to revert: " + string.Join(", ", perm.AdminTargets)], true);

        var messages = new List<string>();
        var restored = new List<ChangeRecord>();
        var updatedItems = tx.Items.ToList();
        var anyFailure = false;

        // Reverse item order, and reverse change order within each item.
        foreach (var item in items.AsEnumerable().Reverse())
        {
            if (item.Status != TransactionItemStatus.Applied) continue;
            var itemOk = true;
            var drift = false;
            foreach (var change in item.Changes.Where(c => c.Applied).Reverse())
            {
                var outcome = RevertChange(change, request.Force, messages);
                if (outcome == Outcome.Restored) restored.Add(change);
                else if (outcome == Outcome.Failed) itemOk = false;
                else if (outcome == Outcome.Drift) drift = true;
            }
            var idx = updatedItems.FindIndex(i => i.ItemId == item.ItemId);
            // An item with skipped (drifted) changes stays "Applied" so it can be rolled back later with Force.
            updatedItems[idx] = item with
            {
                Status = !itemOk ? TransactionItemStatus.RollbackFailed : drift ? TransactionItemStatus.Applied : TransactionItemStatus.RolledBack,
            };
            anyFailure |= !itemOk;
        }

        var allRolledBack = updatedItems.All(i => i.Status is TransactionItemStatus.RolledBack or TransactionItemStatus.Skipped or TransactionItemStatus.Failed);
        var status = anyFailure ? TransactionStatus.RollbackFailed : allRolledBack ? TransactionStatus.RolledBack : TransactionStatus.PartiallyRolledBack;
        transactions.Save(tx with { Items = updatedItems, Status = status, Messages = tx.Messages.Concat(messages).ToList() });
        log.Info(Cat, $"Rollback of {tx.TransactionId}{(request.ItemId is null ? "" : $"/{request.ItemId}")}: {status}", tx.TransactionId);
        return new RollbackResult(tx.TransactionId, status, restored, messages, false);
    }

    private enum Outcome { Restored, Irreversible, Drift, Failed }

    private Outcome RevertChange(ChangeRecord change, bool force, List<string> messages)
    {
        var handler = handlers.Get(change.Kind);
        if (!handler.Reversible)
        {
            messages.Add($"{change.Description}: not reversible (recorded for audit only).");
            return Outcome.Irreversible;
        }
        try
        {
            var current = handler.Capture(change.Target);
            if (handler.Matches(current, change.Before))
            {
                messages.Add($"{change.Description}: already at its original value.");
                return Outcome.Restored;
            }
            if (!handler.Matches(current, change.After) && !force)
            {
                messages.Add($"{change.Description}: skipped — value was changed outside Nexus since it was applied (now '{current}'). Use force to override.");
                log.Warning(Cat, $"Drift detected on {change.Kind} {change.Target}: expected {change.After}, found {current}");
                return Outcome.Drift;
            }
            var ok = restore.Restore(change.Kind, change.Target, change.Before, change.After);
            if (!ValidateRollback(change))
            {
                messages.Add($"{change.Description}: restore could not be verified.");
                return Outcome.Failed;
            }
            messages.Add($"{change.Description}: restored to '{change.Before}'.");
            return ok ? Outcome.Restored : Outcome.Failed;
        }
        catch (Exception ex)
        {
            log.Error(Cat, $"Failed to revert {change.Kind} {change.Target}", ex);
            messages.Add($"{change.Description}: rollback failed — {ex.Message}");
            return Outcome.Failed;
        }
    }

    public bool ValidateRollback(ChangeRecord change)
    {
        var handler = handlers.Get(change.Kind);
        return handler.Matches(handler.Capture(change.Target), change.Before);
    }
}
