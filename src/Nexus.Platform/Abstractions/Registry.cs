namespace Nexus.Platform.Abstractions;

public enum RegValueKind { String, ExpandString, DWord, QWord, Binary, MultiString }

/// <summary>
/// Registry value in canonical text form: DWord/QWord as decimal, Binary as lowercase hex,
/// MultiString joined by '\n'. This keeps backups serialisable and comparable.
/// </summary>
public sealed record RegValue(RegValueKind Kind, string Text)
{
    public static RegValue DWord(uint v) => new(RegValueKind.DWord, v.ToString(System.Globalization.CultureInfo.InvariantCulture));
    public static RegValue Str(string v) => new(RegValueKind.String, v);
    public static RegValue Binary(byte[] v) => new(RegValueKind.Binary, Convert.ToHexString(v).ToLowerInvariant());

    public uint? AsDWord() => Kind == RegValueKind.DWord && uint.TryParse(Text, out var v) ? v : null;
    public byte[]? AsBytes() => Kind == RegValueKind.Binary ? Convert.FromHexString(Text) : null;
}

/// <summary>
/// Key paths use the "HKCU\Software\..." / "HKLM\SOFTWARE\..." form.
/// </summary>
public interface IRegistryAccessor
{
    RegValue? GetValue(string keyPath, string name);
    IReadOnlyList<string> GetValueNames(string keyPath);
    IReadOnlyList<string> GetSubKeyNames(string keyPath);
    bool KeyExists(string keyPath);
    void SetValue(string keyPath, string name, RegValue value);
    void DeleteValue(string keyPath, string name);
}

public static class RegistryPaths
{
    public static bool IsMachineWide(string keyPath) =>
        keyPath.StartsWith("HKLM", StringComparison.OrdinalIgnoreCase) ||
        keyPath.StartsWith("HKEY_LOCAL_MACHINE", StringComparison.OrdinalIgnoreCase) ||
        keyPath.StartsWith("HKU", StringComparison.OrdinalIgnoreCase) ||
        keyPath.StartsWith("HKEY_USERS", StringComparison.OrdinalIgnoreCase);

    /// <summary>Target format for registry changes: "&lt;key path&gt;|&lt;value name&gt;".</summary>
    public static string Target(string keyPath, string valueName) => $"{keyPath}|{valueName}";

    public static (string Key, string Name) ParseTarget(string target)
    {
        var idx = target.LastIndexOf('|');
        if (idx <= 0) throw new ArgumentException($"Invalid registry target '{target}'.");
        return (target[..idx], target[(idx + 1)..]);
    }
}
