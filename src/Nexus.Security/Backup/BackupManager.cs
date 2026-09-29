using System.Text.Json;
using Nexus.Contracts;
using Nexus.Contracts.Api;
using Nexus.Data.Logging;
using Nexus.Data.Repositories;
using Nexus.Platform.Abstractions;
using Nexus.Platform.Changes;

namespace Nexus.Security.Backup;

/// <summary>
/// Captures the state of everything the engine is about to modify — registry values and whole keys,
/// service start modes, startup approvals, scheduled tasks, power plans, profiles — before any change.
/// Backups are written to SQLite and mirrored to a per-transaction JSON file so they survive database loss.
/// </summary>
public sealed class BackupManager(
    ChangeHandlerRegistry handlers,
    IRegistryAccessor registry,
    BackupRepository repository,
    string backupDirectory,
    INexusLogger log)
{
    private const string Cat = "Backup";

    public BackupRecord Capture(string transactionId, string kind, string target)
    {
        var state = handlers.Get(kind).Capture(target);
        var record = new BackupRecord(NewId(), transactionId, DateTimeOffset.UtcNow, kind, target, state, null);
        Persist(record);
        log.Debug(Cat, $"Captured {kind} {target} = {state}", transactionId);
        return record;
    }

    /// <summary>Full snapshot of a registry key's values (not only the value being changed).</summary>
    public BackupRecord CaptureRegistryKey(string transactionId, string keyPath)
    {
        var values = registry.GetValueNames(keyPath)
            .Select(n => (Name: n, Value: registry.GetValue(keyPath, n)))
            .Where(x => x.Value is not null)
            .ToDictionary(x => x.Name, x => new { kind = x.Value!.Kind.ToString(), data = x.Value.Text });
        var record = new BackupRecord(NewId(), transactionId, DateTimeOffset.UtcNow, "registry.key", keyPath,
            new StateValue(registry.KeyExists(keyPath), null), JsonSerializer.SerializeToElement(values, NexusJson.Options));
        Persist(record);
        return record;
    }

    public BackupRecord CaptureProfile(string transactionId, ProfileDefinition profile)
    {
        var record = new BackupRecord(NewId(), transactionId, DateTimeOffset.UtcNow, "profile", profile.Name,
            StateValue.Of(JsonSerializer.Serialize(profile, NexusJson.Options)), null);
        Persist(record);
        return record;
    }

    public IReadOnlyList<BackupRecord> ForTransaction(string transactionId) => repository.ForTransaction(transactionId);
    public BackupRecord? Get(string id) => repository.Get(id);

    private void Persist(BackupRecord record)
    {
        repository.Save(record);
        try
        {
            Directory.CreateDirectory(backupDirectory);
            var file = Path.Combine(backupDirectory, $"{record.TransactionId}.jsonl");
            File.AppendAllText(file, JsonSerializer.Serialize(record, NexusJson.Options) + Environment.NewLine);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            log.Warning(Cat, $"Backup mirror file could not be written: {ex.Message}", record.TransactionId);
        }
    }

    private static string NewId() => $"BK-{Guid.NewGuid():N}"[..19];
}
