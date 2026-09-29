using Nexus.Contracts;

namespace Nexus.Platform.Changes;

/// <summary>
/// A primitive, reversible system mutation. Every optimization is expressed as a list of these so that the
/// pipeline can capture the previous state (backup), apply, verify and — if needed — restore it.
/// Rules never call Windows directly; they only describe changes of known kinds.
/// </summary>
public interface ISystemChangeHandler
{
    string Kind { get; }
    bool RequiresAdmin(string target);
    StateValue Capture(string target);

    /// <param name="desired">State to converge to.</param>
    /// <param name="current">The state recorded before this call (used by handlers that need it, e.g. file quarantine).</param>
    void Apply(string target, StateValue desired, StateValue current);

    bool Matches(StateValue actual, StateValue expected) => actual == expected;

    /// <summary>False for inherently one-way actions (terminating a process). Such changes are logged but cannot be rolled back.</summary>
    bool Reversible => true;
}

public static class ChangeKinds
{
    public const string RegistryValue = "registry.value";
    public const string ServiceStartMode = "service.startMode";
    public const string PowerScheme = "power.activeScheme";
    public const string ScheduledTask = "task.enabled";
    public const string ProcessPriority = "process.priority";
    public const string ProcessAffinity = "process.affinity";
    public const string FileQuarantine = "file.quarantine";
    public const string ProcessTerminate = "process.terminate";
}

public sealed class ChangeHandlerRegistry
{
    private readonly Dictionary<string, ISystemChangeHandler> _handlers = new(StringComparer.Ordinal);

    public ChangeHandlerRegistry(IEnumerable<ISystemChangeHandler> handlers)
    {
        foreach (var h in handlers) _handlers[h.Kind] = h;
    }

    public ISystemChangeHandler Get(string kind) =>
        _handlers.TryGetValue(kind, out var h) ? h : throw new InvalidOperationException($"No change handler registered for kind '{kind}'.");

    public bool Has(string kind) => _handlers.ContainsKey(kind);

    public IReadOnlyCollection<string> Kinds => _handlers.Keys;

    public static ChangeHandlerRegistry CreateDefault(Abstractions.IPlatform p) => new(new ISystemChangeHandler[]
    {
        new RegistryValueChangeHandler(p.Registry),
        new ServiceStartModeChangeHandler(p.Services),
        new PowerSchemeChangeHandler(p.Power),
        new ScheduledTaskChangeHandler(p.Tasks),
        new ProcessPriorityChangeHandler(p.Processes),
        new ProcessAffinityChangeHandler(p.Processes),
        new FileQuarantineChangeHandler(p.Files),
        new ProcessTerminateChangeHandler(p.Processes),
    });
}
