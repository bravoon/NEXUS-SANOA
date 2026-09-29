using System.Globalization;
using System.Text.Json;
using Nexus.Contracts;
using Nexus.Contracts.Api;

namespace Nexus.CLI;

/// <summary>Console rendering. Presentation only — every value comes from structured engine results.</summary>
public static class Output
{
    public static bool Color { get; set; } = !Console.IsOutputRedirected && Environment.GetEnvironmentVariable("NO_COLOR") is null;

    public static void Json(object? value) => Console.WriteLine(JsonSerializer.Serialize(value, NexusJson.Indented));

    public static void Header(string text)
    {
        Console.WriteLine();
        Write(text, ConsoleColor.Cyan);
        Console.WriteLine();
        Console.WriteLine(new string('─', Math.Min(Math.Max(text.Length, 20), 100)));
    }

    public static void Write(string text, ConsoleColor color)
    {
        if (!Color) { Console.Write(text); return; }
        var old = Console.ForegroundColor;
        Console.ForegroundColor = color;
        Console.Write(text);
        Console.ForegroundColor = old;
    }

    public static void Line(string text, ConsoleColor color) { Write(text, color); Console.WriteLine(); }
    public static void Warn(string text) => Line("! " + text, ConsoleColor.Yellow);
    public static void Error(string text) => Line("✗ " + text, ConsoleColor.Red);
    public static void Ok(string text) => Line("✓ " + text, ConsoleColor.Green);
    public static void Info(string text) => Console.WriteLine("  " + text);

    public static ConsoleColor ColorOf(Confidence c) => c switch
    {
        Confidence.Confirmed => ConsoleColor.Green,
        Confidence.Likely => ConsoleColor.Cyan,
        Confidence.Possible => ConsoleColor.Yellow,
        _ => ConsoleColor.DarkGray,
    };

    public static ConsoleColor ColorOf(Severity s) => s switch
    {
        Severity.Critical or Severity.High => ConsoleColor.Red,
        Severity.Medium => ConsoleColor.Yellow,
        Severity.Low => ConsoleColor.Cyan,
        _ => ConsoleColor.Gray,
    };

    public static void Table(IReadOnlyList<string> headers, IEnumerable<IReadOnlyList<string>> rows)
    {
        var data = rows.ToList();
        var width = Console.IsOutputRedirected ? 200 : Math.Max(80, SafeWidth());
        var widths = headers.Select((h, i) => Math.Max(h.Length, data.Count == 0 ? 0 : data.Max(r => i < r.Count ? r[i].Length : 0))).ToArray();
        var total = widths.Sum() + widths.Length * 2;
        if (total > width) widths[^1] = Math.Max(10, widths[^1] - (total - width));
        string Fmt(IReadOnlyList<string> cells) => string.Join("  ", cells.Select((c, i) => Fit(c, widths[i]).PadRight(widths[i])));
        Line(Fmt(headers), ConsoleColor.DarkCyan);
        foreach (var r in data) Console.WriteLine(Fmt(r));
    }

    private static int SafeWidth() { try { return Console.WindowWidth; } catch { return 120; } }
    private static string Fit(string s, int w) => s.Length <= w ? s : w <= 1 ? s[..w] : s[..(w - 1)] + "…";

    public static string Bytes(double? b) => b switch
    {
        null => "n/a",
        >= 1L << 30 => $"{b / (1L << 30):F1} GB",
        >= 1L << 20 => $"{b / (1L << 20):F0} MB",
        >= 1L << 10 => $"{b / (1L << 10):F0} KB",
        _ => $"{b:F0} B",
    };

    public static string Reading(SensorReading r) =>
        r.HasValue
            ? r.Unit switch
            {
                "B" => Bytes(r.Value),
                "B/s" => Bytes(r.Value) + "/s",
                "%" => $"{r.Value:F0}%",
                _ => $"{r.Value!.Value.ToString("F0", CultureInfo.InvariantCulture)} {r.Unit}",
            }
            : $"unavailable ({r.Availability})";

    public static string Metric(MetricValue? m, string format = "F1") =>
        m is null ? "n/a" : m.Availability == SensorAvailability.Available && m.Value is { } v ? $"{v.ToString(format, CultureInfo.InvariantCulture)} {m.Unit}" : $"n/a ({m.Note})";
}
