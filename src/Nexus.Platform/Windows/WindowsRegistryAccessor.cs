using System.Globalization;
using System.Runtime.Versioning;
using Microsoft.Win32;
using Nexus.Platform.Abstractions;

namespace Nexus.Platform.Windows;

[SupportedOSPlatform("windows")]
public sealed class WindowsRegistryAccessor : IRegistryAccessor
{
    private static (RegistryKey Root, string SubKey) Split(string keyPath)
    {
        var idx = keyPath.IndexOf('\\');
        var hive = idx < 0 ? keyPath : keyPath[..idx];
        var sub = idx < 0 ? string.Empty : keyPath[(idx + 1)..];
        var root = hive.ToUpperInvariant() switch
        {
            "HKCU" or "HKEY_CURRENT_USER" => RegistryKey.OpenBaseKey(RegistryHive.CurrentUser, RegistryView.Registry64),
            "HKLM" or "HKEY_LOCAL_MACHINE" => RegistryKey.OpenBaseKey(RegistryHive.LocalMachine, RegistryView.Registry64),
            "HKU" or "HKEY_USERS" => RegistryKey.OpenBaseKey(RegistryHive.Users, RegistryView.Registry64),
            "HKCR" or "HKEY_CLASSES_ROOT" => RegistryKey.OpenBaseKey(RegistryHive.ClassesRoot, RegistryView.Registry64),
            _ => throw new ArgumentException($"Unsupported registry hive in '{keyPath}'."),
        };
        return (root, sub);
    }

    private static RegistryKey? Open(string keyPath, bool writable = false)
    {
        var (root, sub) = Split(keyPath);
        using (root)
            return sub.Length == 0 ? root : root.OpenSubKey(sub, writable);
    }

    public RegValue? GetValue(string keyPath, string name)
    {
        using var key = Open(keyPath);
        if (key is null) return null;
        var raw = key.GetValue(name, null, RegistryValueOptions.DoNotExpandEnvironmentNames);
        if (raw is null) return null;
        var kind = key.GetValueKind(name);
        return kind switch
        {
            RegistryValueKind.DWord => new RegValue(RegValueKind.DWord, unchecked((uint)(int)raw).ToString(CultureInfo.InvariantCulture)),
            RegistryValueKind.QWord => new RegValue(RegValueKind.QWord, unchecked((ulong)(long)raw).ToString(CultureInfo.InvariantCulture)),
            RegistryValueKind.Binary => RegValue.Binary((byte[])raw),
            RegistryValueKind.MultiString => new RegValue(RegValueKind.MultiString, string.Join('\n', (string[])raw)),
            RegistryValueKind.ExpandString => new RegValue(RegValueKind.ExpandString, (string)raw),
            _ => new RegValue(RegValueKind.String, Convert.ToString(raw, CultureInfo.InvariantCulture) ?? string.Empty),
        };
    }

    public IReadOnlyList<string> GetValueNames(string keyPath)
    {
        using var key = Open(keyPath);
        return key?.GetValueNames() ?? [];
    }

    public IReadOnlyList<string> GetSubKeyNames(string keyPath)
    {
        using var key = Open(keyPath);
        return key?.GetSubKeyNames() ?? [];
    }

    public bool KeyExists(string keyPath)
    {
        using var key = Open(keyPath);
        return key is not null;
    }

    public void SetValue(string keyPath, string name, RegValue value)
    {
        var (root, sub) = Split(keyPath);
        using (root)
        using (var key = root.CreateSubKey(sub, writable: true))
        {
            switch (value.Kind)
            {
                case RegValueKind.DWord:
                    key.SetValue(name, unchecked((int)uint.Parse(value.Text, CultureInfo.InvariantCulture)), RegistryValueKind.DWord); break;
                case RegValueKind.QWord:
                    key.SetValue(name, unchecked((long)ulong.Parse(value.Text, CultureInfo.InvariantCulture)), RegistryValueKind.QWord); break;
                case RegValueKind.Binary:
                    key.SetValue(name, Convert.FromHexString(value.Text), RegistryValueKind.Binary); break;
                case RegValueKind.MultiString:
                    key.SetValue(name, value.Text.Split('\n'), RegistryValueKind.MultiString); break;
                case RegValueKind.ExpandString:
                    key.SetValue(name, value.Text, RegistryValueKind.ExpandString); break;
                default:
                    key.SetValue(name, value.Text, RegistryValueKind.String); break;
            }
        }
    }

    public void DeleteValue(string keyPath, string name)
    {
        using var key = Open(keyPath, writable: true);
        key?.DeleteValue(name, throwOnMissingValue: false);
    }
}
