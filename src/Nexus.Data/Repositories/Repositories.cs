using System.Globalization;
using System.Text.Json;
using Microsoft.Data.Sqlite;
using Nexus.Contracts;
using Nexus.Contracts.Api;
using Nexus.Data.Storage;

namespace Nexus.Data.Repositories;

internal static class Db
{
    public static string Iso(DateTimeOffset d) => d.UtcDateTime.ToString("O", CultureInfo.InvariantCulture);
    public static string Json<T>(T v) => JsonSerializer.Serialize(v, NexusJson.Options);
    public static T? From<T>(string json) => JsonSerializer.Deserialize<T>(json, NexusJson.Options);

    public static int Exec(NexusDatabase db, string sql, params (string, object?)[] args)
    {
        using var c = db.Open();
        using var cmd = c.CreateCommand();
        cmd.CommandText = sql;
        foreach (var (n, v) in args) cmd.Parameters.AddWithValue(n, v ?? DBNull.Value);
        return cmd.ExecuteNonQuery();
    }

    public static List<T> Query<T>(NexusDatabase db, string sql, Func<SqliteDataReader, T> map, params (string, object?)[] args)
    {
        using var c = db.Open();
        using var cmd = c.CreateCommand();
        cmd.CommandText = sql;
        foreach (var (n, v) in args) cmd.Parameters.AddWithValue(n, v ?? DBNull.Value);
        using var r = cmd.ExecuteReader();
        var list = new List<T>();
        while (r.Read()) list.Add(map(r));
        return list;
    }
}

public sealed class SnapshotRepository(NexusDatabase db)
{
    public void Save(SystemSnapshot s) =>
        Db.Exec(db, "INSERT OR REPLACE INTO SystemSnapshots(Id, CapturedAt, IsSimulated, Json) VALUES ($id,$at,$sim,$json)",
            ("$id", s.Id), ("$at", Db.Iso(s.CapturedAt)), ("$sim", s.IsSimulated ? 1 : 0), ("$json", Db.Json(s)));

    public SystemSnapshot? GetLatest() =>
        Db.Query(db, "SELECT Json FROM SystemSnapshots ORDER BY CapturedAt DESC LIMIT 1", r => Db.From<SystemSnapshot>(r.GetString(0))).FirstOrDefault();

    public SystemSnapshot? Get(string id) =>
        Db.Query(db, "SELECT Json FROM SystemSnapshots WHERE Id=$id", r => Db.From<SystemSnapshot>(r.GetString(0)), ("$id", id)).FirstOrDefault();

    /// <summary>Keeps the most recent <paramref name="keep"/> snapshots (they contain process lists).</summary>
    public int Prune(int keep) =>
        Db.Exec(db, "DELETE FROM SystemSnapshots WHERE Id NOT IN (SELECT Id FROM SystemSnapshots ORDER BY CapturedAt DESC LIMIT $k)", ("$k", keep));
}

public sealed class RuleRepository(NexusDatabase db)
{
    public void Upsert(RuleDescriptor d) =>
        Db.Exec(db, """
            INSERT INTO OptimizationRules(Id, Name, Category, Source, Enabled, Json, UpdatedAt) VALUES ($id,$n,$c,$s,1,$j,$u)
            ON CONFLICT(Id) DO UPDATE SET Name=$n, Category=$c, Source=$s, Json=$j, UpdatedAt=$u
            """,
            ("$id", d.Id), ("$n", d.Name), ("$c", d.Category.ToString()), ("$s", d.Source), ("$j", Db.Json(d)), ("$u", Db.Iso(DateTimeOffset.UtcNow)));

    public void SetEnabled(string id, bool enabled) =>
        Db.Exec(db, "UPDATE OptimizationRules SET Enabled=$e WHERE Id=$id", ("$e", enabled ? 1 : 0), ("$id", id));

    public IReadOnlySet<string> GetDisabled() =>
        Db.Query(db, "SELECT Id FROM OptimizationRules WHERE Enabled=0", r => r.GetString(0)).ToHashSet(StringComparer.Ordinal);
}

public sealed class TransactionRepository(NexusDatabase db)
{
    public void Save(OptimizationTransaction t) =>
        Db.Exec(db, """
            INSERT INTO OptimizationTransactions(Id, CreatedAt, CompletedAt, Status, Description, Json) VALUES ($id,$c,$d,$s,$desc,$j)
            ON CONFLICT(Id) DO UPDATE SET CompletedAt=$d, Status=$s, Description=$desc, Json=$j
            """,
            ("$id", t.TransactionId), ("$c", Db.Iso(t.CreatedAt)), ("$d", t.CompletedAt is { } d ? Db.Iso(d) : null),
            ("$s", t.Status.ToString()), ("$desc", t.Description), ("$j", Db.Json(t)));

    public OptimizationTransaction? Get(string id) =>
        Db.Query(db, "SELECT Json FROM OptimizationTransactions WHERE Id=$id", r => Db.From<OptimizationTransaction>(r.GetString(0)), ("$id", id)).FirstOrDefault();

    public IReadOnlyList<OptimizationTransaction> List(int take = 100) =>
        Db.Query(db, "SELECT Json FROM OptimizationTransactions ORDER BY CreatedAt DESC LIMIT $t", r => Db.From<OptimizationTransaction>(r.GetString(0))!, ("$t", take));

    public int CountByStatus(TransactionStatus status) =>
        Db.Query(db, "SELECT COUNT(*) FROM OptimizationTransactions WHERE Status=$s", r => r.GetInt32(0), ("$s", status.ToString())).First();

    /// <summary>Allocates ids of the form TX-yyyyMMdd-NNN.</summary>
    public string NextId(DateTimeOffset now)
    {
        var prefix = $"TX-{now.UtcDateTime:yyyyMMdd}-";
        var existing = Db.Query(db, "SELECT Id FROM OptimizationTransactions WHERE Id LIKE $p", r => r.GetString(0), ("$p", prefix + "%"));
        var max = existing.Select(id => int.TryParse(id[prefix.Length..], out var n) ? n : 0).DefaultIfEmpty(0).Max();
        return $"{prefix}{max + 1:000}";
    }
}

public sealed record BackupRecord(string Id, string TransactionId, DateTimeOffset CreatedAt, string Kind, string Target, StateValue State, JsonElement? Extra);

public sealed class BackupRepository(NexusDatabase db)
{
    public void Save(BackupRecord b) =>
        Db.Exec(db, "INSERT OR REPLACE INTO Backups(Id, TransactionId, CreatedAt, Kind, Target, Json) VALUES ($id,$tx,$c,$k,$t,$j)",
            ("$id", b.Id), ("$tx", b.TransactionId), ("$c", Db.Iso(b.CreatedAt)), ("$k", b.Kind), ("$t", b.Target), ("$j", Db.Json(b)));

    public BackupRecord? Get(string id) =>
        Db.Query(db, "SELECT Json FROM Backups WHERE Id=$id", r => Db.From<BackupRecord>(r.GetString(0)), ("$id", id)).FirstOrDefault();

    public IReadOnlyList<BackupRecord> ForTransaction(string txId) =>
        Db.Query(db, "SELECT Json FROM Backups WHERE TransactionId=$tx ORDER BY CreatedAt", r => Db.From<BackupRecord>(r.GetString(0))!, ("$tx", txId));
}

public sealed class ProfileRepository(NexusDatabase db)
{
    public void Save(ProfileDefinition p) =>
        Db.Exec(db, """
            INSERT INTO Profiles(Name, Kind, BuiltIn, Json, UpdatedAt) VALUES ($n,$k,$b,$j,$u)
            ON CONFLICT(Name) DO UPDATE SET Kind=$k, BuiltIn=$b, Json=$j, UpdatedAt=$u
            """,
            ("$n", p.Name), ("$k", p.Kind.ToString()), ("$b", p.BuiltIn ? 1 : 0), ("$j", Db.Json(p)), ("$u", Db.Iso(DateTimeOffset.UtcNow)));

    public ProfileDefinition? Get(string name) =>
        Db.Query(db, "SELECT Json FROM Profiles WHERE Name=$n", r => Db.From<ProfileDefinition>(r.GetString(0)), ("$n", name)).FirstOrDefault();

    public IReadOnlyList<ProfileDefinition> List() =>
        Db.Query(db, "SELECT Json FROM Profiles ORDER BY BuiltIn DESC, Name", r => Db.From<ProfileDefinition>(r.GetString(0))!);

    public void SaveGameProfile(GameProfile g) =>
        Db.Exec(db, "INSERT OR REPLACE INTO GameProfiles(GameId, Json, UpdatedAt) VALUES ($g,$j,$u)",
            ("$g", g.GameId), ("$j", Db.Json(g)), ("$u", Db.Iso(DateTimeOffset.UtcNow)));

    public IReadOnlyList<GameProfile> ListGameProfiles() =>
        Db.Query(db, "SELECT Json FROM GameProfiles ORDER BY GameId", r => Db.From<GameProfile>(r.GetString(0))!);

    public GameProfile? GetGameProfile(string gameId) =>
        Db.Query(db, "SELECT Json FROM GameProfiles WHERE GameId=$g", r => Db.From<GameProfile>(r.GetString(0)), ("$g", gameId)).FirstOrDefault();
}

public sealed class BenchmarkRepository(NexusDatabase db)
{
    public void Save(BenchmarkResult b) =>
        Db.Exec(db, "INSERT OR REPLACE INTO Benchmarks(Id, Name, GameId, StartedAt, Json) VALUES ($id,$n,$g,$s,$j)",
            ("$id", b.BenchmarkId), ("$n", b.Name), ("$g", b.GameId), ("$s", Db.Iso(b.StartedAt)), ("$j", Db.Json(b)));

    public BenchmarkResult? Get(string id) =>
        Db.Query(db, "SELECT Json FROM Benchmarks WHERE Id=$id", r => Db.From<BenchmarkResult>(r.GetString(0)), ("$id", id)).FirstOrDefault();

    public IReadOnlyList<BenchmarkResult> List(int take = 50) =>
        Db.Query(db, "SELECT Json FROM Benchmarks ORDER BY StartedAt DESC LIMIT $t", r => Db.From<BenchmarkResult>(r.GetString(0))!, ("$t", take));
}

public sealed class LogRepository(NexusDatabase db)
{
    public void Append(DateTimeOffset ts, NexusLogLevel level, string category, string message, string? correlationId) =>
        Db.Exec(db, "INSERT INTO Logs(Timestamp, Level, Category, Message, CorrelationId) VALUES ($t,$l,$c,$m,$x)",
            ("$t", Db.Iso(ts)), ("$l", (int)level), ("$c", category), ("$m", message), ("$x", correlationId));

    public IReadOnlyList<LogEntry> Recent(int take, NexusLogLevel minLevel) =>
        Db.Query(db, "SELECT Id, Timestamp, Level, Category, Message, CorrelationId FROM Logs WHERE Level >= $l ORDER BY Id DESC LIMIT $t",
            r => new LogEntry(r.GetInt64(0), DateTimeOffset.Parse(r.GetString(1), CultureInfo.InvariantCulture), (NexusLogLevel)r.GetInt32(2),
                r.GetString(3), r.GetString(4), r.IsDBNull(5) ? null : r.GetString(5)),
            ("$l", (int)minLevel), ("$t", take));

    public int PruneOlderThan(DateTimeOffset cutoff) =>
        Db.Exec(db, "DELETE FROM Logs WHERE Timestamp < $c", ("$c", Db.Iso(cutoff)));
}

public sealed class SettingsRepository(NexusDatabase db)
{
    public string? Get(string key) =>
        Db.Query(db, "SELECT Value FROM Settings WHERE Key=$k", r => r.GetString(0), ("$k", key)).FirstOrDefault();

    public void Set(string key, string value) =>
        Db.Exec(db, "INSERT INTO Settings(Key, Value) VALUES ($k,$v) ON CONFLICT(Key) DO UPDATE SET Value=$v", ("$k", key), ("$v", value));
}

/// <summary>Single access point to every repository.</summary>
public sealed class NexusStore(NexusDatabase db)
{
    public NexusDatabase Database { get; } = db;
    public SnapshotRepository Snapshots { get; } = new(db);
    public RuleRepository Rules { get; } = new(db);
    public TransactionRepository Transactions { get; } = new(db);
    public BackupRepository Backups { get; } = new(db);
    public ProfileRepository Profiles { get; } = new(db);
    public BenchmarkRepository Benchmarks { get; } = new(db);
    public LogRepository Logs { get; } = new(db);
    public SettingsRepository Settings { get; } = new(db);
}
