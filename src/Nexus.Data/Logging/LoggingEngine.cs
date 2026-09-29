using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;
using Nexus.Contracts;
using Nexus.Data.Repositories;

namespace Nexus.Data.Logging;

public interface INexusLogger
{
    void Log(NexusLogLevel level, string category, string message, string? correlationId = null, Exception? exception = null);
}

public static class LoggerExtensions
{
    public static void Trace(this INexusLogger l, string cat, string msg, string? cid = null) => l.Log(NexusLogLevel.Trace, cat, msg, cid);
    public static void Debug(this INexusLogger l, string cat, string msg, string? cid = null) => l.Log(NexusLogLevel.Debug, cat, msg, cid);
    public static void Info(this INexusLogger l, string cat, string msg, string? cid = null) => l.Log(NexusLogLevel.Info, cat, msg, cid);
    public static void Warning(this INexusLogger l, string cat, string msg, string? cid = null) => l.Log(NexusLogLevel.Warning, cat, msg, cid);
    public static void Error(this INexusLogger l, string cat, string msg, Exception? ex = null, string? cid = null) => l.Log(NexusLogLevel.Error, cat, msg, cid, ex);
    public static void Critical(this INexusLogger l, string cat, string msg, Exception? ex = null, string? cid = null) => l.Log(NexusLogLevel.Critical, cat, msg, cid, ex);
}

public interface ILogSink
{
    void Write(DateTimeOffset ts, NexusLogLevel level, string category, string message, string? correlationId);
}

/// <summary>
/// Removes personal data that has no diagnostic value: user name, profile path and machine name.
/// Process command lines are never logged by the engine in the first place.
/// </summary>
public sealed class LogRedactor
{
    private readonly List<(Regex Pattern, string Replacement)> _rules = [];

    public LogRedactor(string? userName, string? userProfile, string? machineName)
    {
        if (!string.IsNullOrWhiteSpace(userProfile)) Add(Regex.Escape(userProfile), "%USERPROFILE%");
        // Machine name first: it often contains the user name ("ALICE-PC").
        if (!string.IsNullOrWhiteSpace(machineName) && machineName.Length >= 3) Add($@"\b{Regex.Escape(machineName)}\b", "<machine>");
        if (!string.IsNullOrWhiteSpace(userName) && userName.Length >= 3) Add($@"(?<=[\\/]|\b){Regex.Escape(userName)}\b", "<user>");
    }

    private void Add(string pattern, string replacement) =>
        _rules.Add((new Regex(pattern, RegexOptions.IgnoreCase | RegexOptions.CultureInvariant, TimeSpan.FromMilliseconds(100)), replacement));

    public string Redact(string message)
    {
        foreach (var (p, r) in _rules)
        {
            try { message = p.Replace(message, r); } catch (RegexMatchTimeoutException) { }
        }
        return message;
    }

    public static LogRedactor ForCurrentUser() =>
        new(Environment.UserName, Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), Environment.MachineName);
}

/// <summary>Central logger. Levels: TRACE, DEBUG, INFO, WARNING, ERROR, CRITICAL.</summary>
public sealed class LoggingEngine : INexusLogger
{
    private readonly List<ILogSink> _sinks = [];
    private readonly LogRedactor _redactor;
    public NexusLogLevel MinimumLevel { get; set; }
    public event Action<LogEntry>? Logged;

    public LoggingEngine(NexusLogLevel minimumLevel, LogRedactor redactor)
    {
        MinimumLevel = minimumLevel;
        _redactor = redactor;
    }

    public LoggingEngine AddSink(ILogSink sink)
    {
        lock (_sinks) _sinks.Add(sink);
        return this;
    }

    public void Log(NexusLogLevel level, string category, string message, string? correlationId = null, Exception? exception = null)
    {
        if (level < MinimumLevel) return;
        var ts = DateTimeOffset.UtcNow;
        var text = exception is null ? message : $"{message} | {exception.GetType().Name}: {exception.Message}";
        text = _redactor.Redact(text);
        ILogSink[] sinks;
        lock (_sinks) sinks = _sinks.ToArray();
        foreach (var s in sinks)
        {
            try { s.Write(ts, level, category, text, correlationId); }
            catch { /* a failing sink must never break the engine */ }
        }
        Logged?.Invoke(new LogEntry(0, ts, level, category, text, correlationId));
    }

    public static LoggingEngine Null() => new(NexusLogLevel.Critical + 1, new LogRedactor(null, null, null));
}

public sealed class SqliteLogSink(LogRepository repo) : ILogSink
{
    public void Write(DateTimeOffset ts, NexusLogLevel level, string category, string message, string? correlationId) =>
        repo.Append(ts, level, category, message, correlationId);
}

public sealed class FileLogSink : ILogSink
{
    private readonly string _directory;
    private readonly object _gate = new();

    public FileLogSink(string directory)
    {
        _directory = directory;
        Directory.CreateDirectory(directory);
    }

    public void Write(DateTimeOffset ts, NexusLogLevel level, string category, string message, string? correlationId)
    {
        var file = Path.Combine(_directory, $"nexus-{ts.UtcDateTime:yyyyMMdd}.log");
        var line = string.Create(CultureInfo.InvariantCulture,
            $"{ts.UtcDateTime:yyyy-MM-ddTHH:mm:ss.fffZ} [{LevelName(level)}] {category}{(correlationId is null ? "" : $" ({correlationId})")}: {message}{Environment.NewLine}");
        lock (_gate) File.AppendAllText(file, line, Encoding.UTF8);
    }

    public static string LevelName(NexusLogLevel l) => l switch
    {
        NexusLogLevel.Trace => "TRACE",
        NexusLogLevel.Debug => "DEBUG",
        NexusLogLevel.Info => "INFO",
        NexusLogLevel.Warning => "WARNING",
        NexusLogLevel.Error => "ERROR",
        _ => "CRITICAL",
    };
}

public sealed class TextWriterLogSink(TextWriter writer, NexusLogLevel minLevel) : ILogSink
{
    public void Write(DateTimeOffset ts, NexusLogLevel level, string category, string message, string? correlationId)
    {
        if (level < minLevel) return;
        lock (writer) writer.WriteLine($"[{FileLogSink.LevelName(level)}] {category}: {message}");
    }
}
