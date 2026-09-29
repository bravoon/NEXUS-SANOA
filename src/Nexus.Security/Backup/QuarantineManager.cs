using Nexus.Data.Logging;

namespace Nexus.Security.Backup;

public sealed record QuarantineStatus(int Files, long Bytes, DateTimeOffset? Oldest);

/// <summary>
/// Owns the quarantine folder (Nexus' own data, never system files). Purging is the only step that actually frees space
/// and it makes the corresponding cleanup transactions irreversible, so it is always an explicit user action.
/// </summary>
public sealed class QuarantineManager(string quarantineDirectory, INexusLogger log)
{
    public QuarantineStatus Status()
    {
        if (!Directory.Exists(quarantineDirectory)) return new QuarantineStatus(0, 0, null);
        var files = new DirectoryInfo(quarantineDirectory).EnumerateFiles("*", SearchOption.AllDirectories).ToList();
        return new QuarantineStatus(files.Count, files.Sum(f => f.Length),
            files.Count == 0 ? null : new DateTimeOffset(files.Min(f => f.CreationTimeUtc), TimeSpan.Zero));
    }

    /// <summary>Deletes quarantine batches older than <paramref name="olderThan"/>. Returns the number of bytes freed.</summary>
    public long Purge(TimeSpan olderThan)
    {
        if (!Directory.Exists(quarantineDirectory)) return 0;
        long freed = 0;
        var cutoff = DateTime.UtcNow - olderThan;
        foreach (var batch in new DirectoryInfo(quarantineDirectory).EnumerateDirectories())
        {
            if (batch.CreationTimeUtc > cutoff) continue;
            var size = batch.EnumerateFiles("*", SearchOption.AllDirectories).Sum(f => f.Length);
            try
            {
                batch.Delete(recursive: true);
                freed += size;
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
            {
                log.Warning("Quarantine", $"Could not purge {batch.Name}: {ex.Message}");
            }
        }
        log.Info("Quarantine", $"Purged {freed / 1024 / 1024} MB from quarantine (irreversible).");
        return freed;
    }
}
