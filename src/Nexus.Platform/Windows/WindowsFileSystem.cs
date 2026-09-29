using System.Runtime.InteropServices;
using System.Runtime.Versioning;
using Nexus.Platform.Abstractions;

namespace Nexus.Platform.Windows;

[SupportedOSPlatform("windows")]
public sealed class WindowsFileSystem : IFileSystem
{
    public bool FileExists(string path) => File.Exists(path);
    public bool DirectoryExists(string path) => Directory.Exists(path);

    public IEnumerable<FileFacts> EnumerateFiles(string directory, string pattern, bool recursive)
    {
        if (!Directory.Exists(directory)) yield break;
        var opts = new EnumerationOptions { IgnoreInaccessible = true, RecurseSubdirectories = recursive, AttributesToSkip = FileAttributes.ReparsePoint };
        foreach (var f in new DirectoryInfo(directory).EnumerateFiles(pattern, opts))
            yield return new FileFacts(f.FullName, f.Length, f.LastWriteTimeUtc);
    }

    public IEnumerable<string> EnumerateDirectories(string directory) =>
        Directory.Exists(directory)
            ? Directory.EnumerateDirectories(directory, "*", new EnumerationOptions { IgnoreInaccessible = true })
            : [];

    public FileFacts? GetFile(string path)
    {
        var f = new FileInfo(path);
        return f.Exists ? new FileFacts(f.FullName, f.Length, f.LastWriteTimeUtc) : null;
    }

    public string ReadAllText(string path) => File.ReadAllText(path);
    public void MoveFile(string source, string destination) => File.Move(source, destination, overwrite: false);
    public void CreateDirectory(string path) => Directory.CreateDirectory(path);

    public string? GetKnownFolder(KnownFolder folder) => folder switch
    {
        KnownFolder.UserStartup => Environment.GetFolderPath(Environment.SpecialFolder.Startup),
        KnownFolder.CommonStartup => Environment.GetFolderPath(Environment.SpecialFolder.CommonStartup),
        KnownFolder.Temp => Path.GetTempPath().TrimEnd('\\'),
        KnownFolder.LocalAppData => Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        KnownFolder.ProgramData => Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
        KnownFolder.ProgramFiles => Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
        KnownFolder.ProgramFilesX86 => Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86),
        KnownFolder.System32 => Environment.SystemDirectory,
        KnownFolder.Windows => Environment.GetFolderPath(Environment.SpecialFolder.Windows),
        KnownFolder.UserProfile => Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
        KnownFolder.Downloads => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Downloads"),
        _ => null,
    };

    /// <summary>Resolves a .lnk target through the Shell COM object.</summary>
    public string? ResolveShortcut(string lnkPath)
    {
        var type = Type.GetTypeFromProgID("WScript.Shell");
        if (type is null) return null;
        dynamic shell = Activator.CreateInstance(type)!;
        try
        {
            dynamic lnk = shell.CreateShortcut(lnkPath);
            string target = lnk.TargetPath;
            string args = lnk.Arguments;
            return string.IsNullOrWhiteSpace(target) ? null : $"\"{target}\" {args}".Trim();
        }
        catch (COMException) { return null; }
        finally { Marshal.FinalReleaseComObject(shell); }
    }
}
