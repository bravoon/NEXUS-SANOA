using Microsoft.Data.Sqlite;

namespace Nexus.Data.Storage;

/// <summary>
/// SQLite database with versioned schema migrations (PRAGMA user_version).
/// Every entity lives in its own table; structured payloads are stored as JSON next to indexed columns.
/// </summary>
public sealed class NexusDatabase
{
    private readonly string _connectionString;

    public NexusDatabase(string path)
    {
        Path = path;
        var dir = System.IO.Path.GetDirectoryName(path);
        if (!string.IsNullOrEmpty(dir)) Directory.CreateDirectory(dir);
        _connectionString = new SqliteConnectionStringBuilder { DataSource = path, Mode = SqliteOpenMode.ReadWriteCreate, Cache = SqliteCacheMode.Shared, Pooling = true }.ToString();
        Migrate();
    }

    /// <summary>In-memory database for tests. The keep-alive connection holds the shared memory DB open.</summary>
    public static NexusDatabase InMemory() => new($"file:nexus-{Guid.NewGuid():N}?mode=memory&cache=shared", inMemory: true);

    private readonly SqliteConnection? _keepAlive;

    private NexusDatabase(string dataSource, bool inMemory)
    {
        Path = ":memory:";
        _connectionString = $"Data Source={dataSource}";
        _keepAlive = new SqliteConnection(_connectionString);
        _keepAlive.Open();
        Migrate();
    }

    public string Path { get; }

    public SqliteConnection Open()
    {
        var c = new SqliteConnection(_connectionString);
        c.Open();
        using var pragma = c.CreateCommand();
        pragma.CommandText = "PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;";
        pragma.ExecuteNonQuery();
        return c;
    }

    private static readonly string[] Migrations =
    [
        // v1
        """
        CREATE TABLE IF NOT EXISTS SystemSnapshots (
            Id TEXT PRIMARY KEY, CapturedAt TEXT NOT NULL, IsSimulated INTEGER NOT NULL, Json TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS IX_Snapshots_CapturedAt ON SystemSnapshots(CapturedAt);

        CREATE TABLE IF NOT EXISTS OptimizationRules (
            Id TEXT PRIMARY KEY, Name TEXT NOT NULL, Category TEXT NOT NULL, Source TEXT NOT NULL,
            Enabled INTEGER NOT NULL DEFAULT 1, Json TEXT NOT NULL, UpdatedAt TEXT NOT NULL);

        CREATE TABLE IF NOT EXISTS OptimizationTransactions (
            Id TEXT PRIMARY KEY, CreatedAt TEXT NOT NULL, CompletedAt TEXT, Status TEXT NOT NULL,
            Description TEXT NOT NULL, Json TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS IX_Tx_CreatedAt ON OptimizationTransactions(CreatedAt);

        CREATE TABLE IF NOT EXISTS Backups (
            Id TEXT PRIMARY KEY, TransactionId TEXT NOT NULL, CreatedAt TEXT NOT NULL,
            Kind TEXT NOT NULL, Target TEXT NOT NULL, Json TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS IX_Backups_Tx ON Backups(TransactionId);

        CREATE TABLE IF NOT EXISTS Profiles (
            Name TEXT PRIMARY KEY COLLATE NOCASE, Kind TEXT NOT NULL, BuiltIn INTEGER NOT NULL, Json TEXT NOT NULL, UpdatedAt TEXT NOT NULL);

        CREATE TABLE IF NOT EXISTS GameProfiles (
            GameId TEXT PRIMARY KEY, Json TEXT NOT NULL, UpdatedAt TEXT NOT NULL);

        CREATE TABLE IF NOT EXISTS Benchmarks (
            Id TEXT PRIMARY KEY, Name TEXT NOT NULL, GameId TEXT, StartedAt TEXT NOT NULL, Json TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS IX_Benchmarks_StartedAt ON Benchmarks(StartedAt);

        CREATE TABLE IF NOT EXISTS Logs (
            Id INTEGER PRIMARY KEY AUTOINCREMENT, Timestamp TEXT NOT NULL, Level INTEGER NOT NULL,
            Category TEXT NOT NULL, Message TEXT NOT NULL, CorrelationId TEXT);
        CREATE INDEX IF NOT EXISTS IX_Logs_Timestamp ON Logs(Timestamp);

        CREATE TABLE IF NOT EXISTS Settings (Key TEXT PRIMARY KEY, Value TEXT NOT NULL);
        """,
    ];

    private void Migrate()
    {
        using var c = Open();
        using var get = c.CreateCommand();
        get.CommandText = "PRAGMA user_version;";
        var version = Convert.ToInt32(get.ExecuteScalar());
        if (Path != ":memory:")
        {
            using var wal = c.CreateCommand();
            wal.CommandText = "PRAGMA journal_mode = WAL;";
            wal.ExecuteNonQuery();
        }
        for (var v = version; v < Migrations.Length; v++)
        {
            using var tx = c.BeginTransaction();
            using var cmd = c.CreateCommand();
            cmd.Transaction = tx;
            cmd.CommandText = Migrations[v] + $"\nPRAGMA user_version = {v + 1};";
            cmd.ExecuteNonQuery();
            tx.Commit();
        }
    }

    public int SchemaVersion
    {
        get
        {
            using var c = Open();
            using var cmd = c.CreateCommand();
            cmd.CommandText = "PRAGMA user_version;";
            return Convert.ToInt32(cmd.ExecuteScalar());
        }
    }
}
