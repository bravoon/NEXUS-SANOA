namespace Nexus.Platform;

/// <summary>
/// Windows-style path helpers that behave identically on every host OS
/// (the simulator and the test-suite run on Linux CI with Windows paths).
/// </summary>
public static class PathUtil
{
    public static string? GetDirectory(string path)
    {
        var i = path.LastIndexOfAny(['\\', '/']);
        return i <= 0 ? null : path[..i];
    }

    public static string GetFileName(string path)
    {
        var i = path.LastIndexOfAny(['\\', '/']);
        return i < 0 ? path : path[(i + 1)..];
    }

    public static string Combine(string root, params string[] parts)
    {
        var sep = root.Contains('\\') ? '\\' : Path.DirectorySeparatorChar;
        var result = root.TrimEnd('\\', '/');
        foreach (var p in parts) result += sep + p.Trim('\\', '/');
        return result;
    }

    public static bool IsUnder(string? path, string? directory)
    {
        if (string.IsNullOrEmpty(path) || string.IsNullOrEmpty(directory)) return false;
        var d = Normalize(directory).TrimEnd('\\') + "\\";
        return Normalize(path).StartsWith(d, StringComparison.OrdinalIgnoreCase);
    }

    public static string Normalize(string path) => path.Replace('/', '\\');

    public static bool EqualsPath(string? a, string? b) =>
        a is not null && b is not null && string.Equals(Normalize(a), Normalize(b), StringComparison.OrdinalIgnoreCase);

    /// <summary>Extracts the executable from a command line such as "\"C:\a b\x.exe\" --flag".</summary>
    public static string? ExtractExecutable(string? commandLine)
    {
        if (string.IsNullOrWhiteSpace(commandLine)) return null;
        var c = commandLine.Trim();
        if (c.StartsWith('"'))
        {
            var end = c.IndexOf('"', 1);
            return end > 1 ? c[1..end] : null;
        }
        var exe = c.IndexOf(".exe", StringComparison.OrdinalIgnoreCase);
        if (exe > 0) return c[..(exe + 4)];
        var space = c.IndexOf(' ');
        return space > 0 ? c[..space] : c;
    }
}
