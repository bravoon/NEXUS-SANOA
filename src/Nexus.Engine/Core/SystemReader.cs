using Nexus.Contracts;
using Nexus.Platform.Abstractions;
using Nexus.Platform.Changes;

namespace Nexus.Engine.Core;

/// <summary>
/// Read-only view of the system handed to rules and analyzers. It deliberately exposes no write operation:
/// the only way to change the system is to return <see cref="ChangeOperation"/>s to the pipeline.
/// </summary>
public interface ISystemReader
{
    StateValue Read(string kind, string target);
    RegValue? ReadRegistry(string keyPath, string name);
    IEnumerable<FileFacts> EnumerateFiles(string directory, string pattern, bool recursive);
    string? KnownFolder(KnownFolder folder);
    bool FileExists(string path);

    /// <summary>True when the element is already in the expected state (kind-aware comparison).</summary>
    bool IsInState(string kind, string target, StateValue expected);
}

internal sealed class SystemReader(IPlatform platform, ChangeHandlerRegistry handlers) : ISystemReader
{
    public StateValue Read(string kind, string target) => handlers.Get(kind).Capture(target);
    public RegValue? ReadRegistry(string keyPath, string name) => platform.Registry.GetValue(keyPath, name);
    public IEnumerable<FileFacts> EnumerateFiles(string directory, string pattern, bool recursive) => platform.Files.EnumerateFiles(directory, pattern, recursive);
    public string? KnownFolder(KnownFolder folder) => platform.Files.GetKnownFolder(folder);
    public bool FileExists(string path) => platform.Files.FileExists(path);

    public bool IsInState(string kind, string target, StateValue expected)
    {
        var h = handlers.Get(kind);
        return h.Matches(h.Capture(target), expected);
    }
}

/// <summary>A desired end-state for one system element. The unit of work of the optimization pipeline.</summary>
public sealed record ChangeOperation(string Kind, string Target, StateValue Desired, string Description);
