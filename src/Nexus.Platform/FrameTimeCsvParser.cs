using System.Globalization;

namespace Nexus.Platform;

/// <summary>
/// Parses frame-time CSV files from PresentMon 1.x/2.x, OCAT and CapFrameX exports.
/// Recognised columns (first match wins): MsBetweenPresents, FrameTime, msBetweenDisplayChange, MsBetweenDisplayChange.
/// </summary>
public static class FrameTimeCsvParser
{
    private static readonly string[] Columns = ["MsBetweenPresents", "FrameTime", "msBetweenPresents", "MsBetweenDisplayChange", "msBetweenDisplayChange"];

    public static IReadOnlyList<double> Parse(TextReader reader)
    {
        var header = reader.ReadLine();
        while (header is not null && (header.StartsWith("//") || string.IsNullOrWhiteSpace(header))) header = reader.ReadLine();
        if (header is null) return [];
        var cols = header.Split(',').Select(c => c.Trim().Trim('"')).ToList();
        var idx = -1;
        foreach (var name in Columns)
        {
            idx = cols.FindIndex(c => string.Equals(c, name, StringComparison.OrdinalIgnoreCase));
            if (idx >= 0) break;
        }
        if (idx < 0) throw new FormatException("No frame-time column found (expected MsBetweenPresents or FrameTime).");

        var frames = new List<double>();
        string? line;
        while ((line = reader.ReadLine()) is not null)
        {
            var f = line.Split(',');
            if (f.Length <= idx) continue;
            if (double.TryParse(f[idx].Trim().Trim('"'), NumberStyles.Float, CultureInfo.InvariantCulture, out var ms) && ms > 0 && ms < 10_000)
                frames.Add(ms);
        }
        return frames;
    }
}
