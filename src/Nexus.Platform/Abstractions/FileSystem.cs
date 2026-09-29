namespace Nexus.Platform.Abstractions;

public enum KnownFolder { UserStartup, CommonStartup, Temp, LocalAppData, ProgramData, ProgramFiles, ProgramFilesX86, System32, Windows, UserProfile, Downloads }

public sealed record FileFacts(string Path, long Length, DateTimeOffset LastWriteTime);

public interface IFileSystem
{
    bool FileExists(string path);
    bool DirectoryExists(string path);
    IEnumerable<FileFacts> EnumerateFiles(string directory, string pattern, bool recursive);
    IEnumerable<string> EnumerateDirectories(string directory);
    FileFacts? GetFile(string path);
    string ReadAllText(string path);
    void MoveFile(string source, string destination);
    void CreateDirectory(string path);
    string? GetKnownFolder(KnownFolder folder);

    /// <summary>Returns the command line a shortcut (.lnk) points to, or null.</summary>
    string? ResolveShortcut(string path);
}
