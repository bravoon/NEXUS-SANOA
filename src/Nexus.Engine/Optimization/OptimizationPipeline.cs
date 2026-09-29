using Nexus.Contracts;
using Nexus.Data.Logging;
using Nexus.Data.Repositories;
using Nexus.Engine.Core;
using Nexus.Engine.Rules;
using Nexus.Platform.Abstractions;
using Nexus.Platform.Changes;
using Nexus.Security.Backup;
using Nexus.Security.Permissions;

namespace Nexus.Engine.Optimization;

/// <summary>One unit of work in a transaction: usually one rule candidate, or an ad-hoc action (startup toggle, profile setting).</summary>
public sealed record PlannedAction(
    string OptimizationId,
    string RuleId,
    string Name,
    IReadOnlyList<ChangeOperation> Operations,
    RiskLevel Risk = RiskLevel.Low,
    bool RequiresReboot = false,
    IOptimizationRule? Rule = null,
    RuleCandidate? Candidate = null);

public sealed record ExecutionOptions(
    bool DryRun = false,
    bool CreateRestorePoint = false,
    string? TransactionId = null,
    string Description = "Optimization");

/// <summary>
/// SAFE OPTIMIZATION PIPELINE
///   Preview → Permission → Backup → Apply → Verify → Validate → Commit
///   any failure → Rollback of everything applied in the transaction.
/// Transactions are serialised: only one can run at a time.
/// </summary>
public sealed class OptimizationPipeline(
    ChangeHandlerRegistry handlers,
    BackupManager backups,
    PermissionManager permissions,
    TransactionRepository transactions,
    SafetyPolicy safety,
    IRestorePointProvider restorePoints,
    ISystemReader reader,
    EngineEventBus events,
    INexusLogger log)
{
    private const string Cat = "Pipeline";
    private readonly SemaphoreSlim _lock = new(1, 1);

    public OptimizationPreview Preview(PlannedAction action)
    {
        var changes = new List<PlannedChange>();
        var blocking = new List<string>();
        var warnings = new List<string>();
        foreach (var op in action.Operations)
        {
            if (!handlers.Has(op.Kind)) { blocking.Add($"Unknown change kind '{op.Kind}'."); continue; }
            var h = handlers.Get(op.Kind);
            blocking.AddRange(safety.Check(op));
            StateValue before;
            try { before = h.Capture(op.Target); }
            catch (Exception ex) { blocking.Add($"Cannot read current state of {op.Target}: {ex.Message}"); continue; }
            if (h.Matches(before, op.Desired)) warnings.Add($"{op.Description}: already in the desired state (no-op).");
            if (!h.Reversible) warnings.Add($"{op.Description}: this action cannot be undone.");
            changes.Add(new PlannedChange(op.Kind, op.Target, op.Description, before, op.Desired, h.RequiresAdmin(op.Target)));
        }
        if (action.Operations.Count == 0) blocking.Add("Nothing to change.");
        var perm = permissions.Check(changes);
        if (perm.RequiresAdmin && !perm.IsElevated)
            warnings.Add(permissions.CanElevate
                ? "Administrator rights are required; Windows will ask for confirmation (UAC)."
                : "Administrator rights are required; run Nexus elevated to apply this.");
        if (action.RequiresReboot) warnings.Add("A restart is required for this change to take effect.");
        var reversible = action.Operations.All(o => !handlers.Has(o.Kind) || handlers.Get(o.Kind).Reversible);
        return new OptimizationPreview(action.OptimizationId, action.Name, changes, perm.RequiresAdmin, action.RequiresReboot,
            reversible, blocking.Count == 0, blocking, warnings);
    }

    public async Task<ExecutionResult> ExecuteAsync(IReadOnlyList<PlannedAction> actions, ExecutionOptions options, CancellationToken ct = default)
    {
        // 1. Preview & safety gate for the whole batch before touching anything.
        var previews = actions.Select(Preview).ToList();
        var blocked = previews.Where(p => !p.CanProceed).ToList();
        if (blocked.Count > 0)
        {
            var msgs = blocked.SelectMany(b => b.BlockingReasons.Select(r => $"{b.Name}: {r}")).ToList();
            log.Warning(Cat, "Execution refused by safety checks: " + string.Join("; ", msgs));
            return new ExecutionResult(options.TransactionId ?? "", TransactionStatus.Failed, null, msgs, false, false);
        }
        var requiresReboot = actions.Any(a => a.RequiresReboot);
        if (options.DryRun)
        {
            var msgs = previews.SelectMany(p => p.Changes.Select(c => $"{p.Name}: {c.Description} [{c.Before} → {c.After}]")).ToList();
            return new ExecutionResult("DRY-RUN", TransactionStatus.DryRun, null, msgs, previews.Any(p => p.RequiresAdmin && !permissions.IsElevated), requiresReboot);
        }

        // 2. Permission gate: least privilege — elevation is handled by the caller through the broker.
        var perm = permissions.Check(previews.SelectMany(p => p.Changes));
        if (!perm.Allowed)
            return new ExecutionResult(options.TransactionId ?? "", TransactionStatus.ElevationRequired, null,
                ["Administrator rights are required for: " + string.Join(", ", perm.AdminTargets)], true, requiresReboot);

        await _lock.WaitAsync(ct).ConfigureAwait(false);
        try
        {
            return await Task.Run(() => ExecuteCore(actions, options, requiresReboot), ct).ConfigureAwait(false);
        }
        finally { _lock.Release(); }
    }

    private ExecutionResult ExecuteCore(IReadOnlyList<PlannedAction> actions, ExecutionOptions options, bool requiresReboot)
    {
        var now = DateTimeOffset.UtcNow;
        var txId = options.TransactionId ?? transactions.NextId(now);
        var messages = new List<string>();
        var items = new List<TransactionItem>();
        string? restorePoint = null;

        var tx = new OptimizationTransaction(txId, now, null, options.Description, TransactionStatus.Pending, [], null, []);
        transactions.Save(tx);
        events.Publish(EngineEventType.OptimizationStarted, $"Transaction {txId} started ({actions.Count} optimization(s))", txId, 0,
            new { transactionId = txId, optimizations = actions.Select(a => a.OptimizationId) });

        if (options.CreateRestorePoint || actions.Any(a => a.Risk == RiskLevel.High))
        {
            if (permissions.IsElevated)
            {
                var rp = restorePoints.TryCreate($"Nexus {txId}");
                restorePoint = rp.Created ? rp.Id : null;
                messages.Add(rp.Message);
            }
            else messages.Add("System restore point skipped: requires administrator rights. Per-change backups are still created.");
        }

        var failed = false;
        for (var i = 0; i < actions.Count; i++)
        {
            var action = actions[i];
            var itemId = $"{txId}#{i + 1}";
            var executor = new TransactionExecutor(txId, handlers, backups, safety, log);
            events.Publish(EngineEventType.OptimizationProgress, $"Applying {action.Name}", txId, (double)i / actions.Count,
                new { transactionId = txId, optimizationId = action.OptimizationId });
            try
            {
                // Backup → Apply → Verify happen inside the executor for every change.
                if (action.Rule is not null && action.Candidate is not null) action.Rule.Apply(action.Candidate, executor);
                else foreach (var op in action.Operations) executor.Apply(op);

                // Validate: rule-level semantic validation.
                var valid = action.Rule is null || action.Candidate is null || action.Rule.Validate(action.Candidate, reader);
                if (!valid) throw new InvalidOperationException("Post-apply validation failed.");

                items.Add(new TransactionItem(itemId, action.OptimizationId, action.RuleId, action.Name, TransactionItemStatus.Applied, executor.Records, null));
            }
            catch (Exception ex)
            {
                log.Error(Cat, $"{action.Name} failed; rolling back transaction {txId}", ex, txId);
                messages.Add($"{action.Name} failed: {ex.Message}");
                var reverted = Revert(executor.Records, messages);
                items.Add(new TransactionItem(itemId, action.OptimizationId, action.RuleId, action.Name,
                    reverted ? TransactionItemStatus.Failed : TransactionItemStatus.RollbackFailed, executor.Records, ex.Message));
                failed = true;
                break;
            }
        }

        TransactionStatus status;
        if (failed)
        {
            // Atomicity: undo every item that had been applied before the failure.
            var rollbackOk = true;
            for (var i = items.Count - 1; i >= 0; i--)
            {
                if (items[i].Status != TransactionItemStatus.Applied) continue;
                var ok = Revert(items[i].Changes, messages);
                items[i] = items[i] with { Status = ok ? TransactionItemStatus.RolledBack : TransactionItemStatus.RollbackFailed };
                rollbackOk &= ok;
            }
            rollbackOk &= items.All(i => i.Status != TransactionItemStatus.RollbackFailed);
            status = rollbackOk ? TransactionStatus.Failed : TransactionStatus.RollbackFailed;
            messages.Add(rollbackOk ? "All changes of this transaction were rolled back." : "Some changes could not be rolled back — see details.");
        }
        else status = TransactionStatus.Committed;

        tx = tx with { Items = items, Status = status, CompletedAt = DateTimeOffset.UtcNow, RestorePointId = restorePoint, Messages = messages };
        transactions.Save(tx); // Commit
        log.Info(Cat, $"Transaction {txId} finished: {status}", txId);
        events.Publish(status == TransactionStatus.Committed ? EngineEventType.OptimizationCompleted : EngineEventType.OptimizationFailed,
            $"Transaction {txId}: {status}", txId, 1, new { transactionId = txId, status });
        return new ExecutionResult(txId, status, tx, messages, false, requiresReboot && status == TransactionStatus.Committed);
    }

    private bool Revert(IReadOnlyList<ChangeRecord> records, List<string> messages)
    {
        var ok = true;
        foreach (var r in records.Where(r => r.Applied).Reverse())
        {
            var h = handlers.Get(r.Kind);
            if (!h.Reversible) { messages.Add($"{r.Description}: cannot be reverted."); ok = false; continue; }
            try
            {
                h.Apply(r.Target, r.Before, r.After);
                if (!h.Matches(h.Capture(r.Target), r.Before)) { ok = false; messages.Add($"{r.Description}: revert not verified."); }
            }
            catch (Exception ex)
            {
                ok = false;
                messages.Add($"{r.Description}: revert failed — {ex.Message}");
                log.Critical(Cat, $"Revert failed for {r.Kind} {r.Target}", ex);
            }
        }
        return ok;
    }

    /// <summary>Backup → Apply → Verify for a single change, recording it before verification so it can always be reverted.</summary>
    private sealed class TransactionExecutor(string txId, ChangeHandlerRegistry handlers, BackupManager backups, SafetyPolicy safety, INexusLogger log) : IChangeExecutor
    {
        private readonly List<ChangeRecord> _records = [];
        private readonly HashSet<string> _keysBackedUp = new(StringComparer.OrdinalIgnoreCase);
        public IReadOnlyList<ChangeRecord> Records => _records;

        public void Apply(ChangeOperation op)
        {
            var problems = safety.Check(op);
            if (problems.Count > 0) throw new InvalidOperationException(string.Join(" ", problems));

            var h = handlers.Get(op.Kind);
            if (op.Kind == ChangeKinds.RegistryValue)
            {
                var key = RegistryPaths.ParseTarget(op.Target).Key;
                if (_keysBackedUp.Add(key)) backups.CaptureRegistryKey(txId, key);
            }
            var backup = backups.Capture(txId, op.Kind, op.Target);
            var before = backup.State;
            if (h.Matches(before, op.Desired))
            {
                _records.Add(new ChangeRecord(op.Kind, op.Target, op.Description, before, op.Desired, backup.Id, Applied: false, Verified: true));
                return;
            }
            try
            {
                h.Apply(op.Target, op.Desired, before);
            }
            catch
            {
                // If the element is untouched nothing needs reverting; otherwise record it so the backup is restored.
                bool untouched;
                try { untouched = h.Matches(h.Capture(op.Target), before); } catch { untouched = false; }
                _records.Add(new ChangeRecord(op.Kind, op.Target, op.Description, before, op.Desired, backup.Id, Applied: !untouched, Verified: false));
                throw;
            }
            _records.Add(new ChangeRecord(op.Kind, op.Target, op.Description, before, op.Desired, backup.Id, Applied: true, Verified: false));
            var after = h.Capture(op.Target);
            var verified = h.Matches(after, op.Desired);
            _records[^1] = _records[^1] with { Verified = verified };
            if (!verified) throw new InvalidOperationException($"Verification failed for {op.Description}: expected {op.Desired}, found {after}.");
            log.Info("Pipeline", $"Applied {op.Kind} {op.Target}: {before} → {op.Desired}", txId);
        }
    }
}
