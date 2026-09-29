using System.Globalization;
using Nexus.Contracts;
using Nexus.Platform.Abstractions;

namespace Nexus.Platform.Changes;

public sealed class RegistryValueChangeHandler(IRegistryAccessor registry) : ISystemChangeHandler
{
    public string Kind => ChangeKinds.RegistryValue;

    public bool RequiresAdmin(string target) => RegistryPaths.IsMachineWide(RegistryPaths.ParseTarget(target).Key);

    public StateValue Capture(string target)
    {
        var (key, name) = RegistryPaths.ParseTarget(target);
        var v = registry.GetValue(key, name);
        return v is null ? StateValue.Absent : StateValue.Of(v.Text, v.Kind.ToString());
    }

    public void Apply(string target, StateValue desired, StateValue current)
    {
        var (key, name) = RegistryPaths.ParseTarget(target);
        if (!desired.Exists)
        {
            registry.DeleteValue(key, name);
            return;
        }
        var kind = Enum.Parse<RegValueKind>(desired.ValueKind ?? nameof(RegValueKind.String));
        registry.SetValue(key, name, new RegValue(kind, desired.Value ?? string.Empty));
    }
}

public sealed class ServiceStartModeChangeHandler(IServiceManager services) : ISystemChangeHandler
{
    public string Kind => ChangeKinds.ServiceStartMode;
    public bool RequiresAdmin(string target) => true;

    public StateValue Capture(string target)
    {
        var s = services.GetService(target);
        return s is null ? StateValue.Absent : StateValue.Of(s.StartMode.ToString());
    }

    public void Apply(string target, StateValue desired, StateValue current)
    {
        if (!desired.Exists) throw new InvalidOperationException("Services cannot be created or deleted by the optimizer.");
        var mode = Enum.Parse<ServiceStartMode>(desired.Value!);
        if (mode is ServiceStartMode.Boot or ServiceStartMode.System or ServiceStartMode.Unknown)
            throw new InvalidOperationException($"Refusing to set driver-level start mode '{mode}'.");
        services.SetStartMode(target, mode);
    }
}

public sealed class PowerSchemeChangeHandler(IPowerManager power) : ISystemChangeHandler
{
    public string Kind => ChangeKinds.PowerScheme;
    public bool RequiresAdmin(string target) => false;
    public StateValue Capture(string target) => StateValue.Of(power.GetActiveScheme().ToString("D"));

    public void Apply(string target, StateValue desired, StateValue current)
    {
        var id = Guid.Parse(desired.Value!);
        if (power.GetSchemes().All(s => s.Id != id))
            throw new InvalidOperationException($"Power scheme {id} does not exist on this system.");
        power.SetActiveScheme(id);
    }

    public bool Matches(StateValue actual, StateValue expected) =>
        Guid.TryParse(actual.Value, out var a) && Guid.TryParse(expected.Value, out var e) && a == e;
}

public sealed class ScheduledTaskChangeHandler(ITaskSchedulerAccessor tasks) : ISystemChangeHandler
{
    public string Kind => ChangeKinds.ScheduledTask;
    public bool RequiresAdmin(string target) => true;

    public StateValue Capture(string target)
    {
        var t = tasks.GetTask(target);
        return t is null ? StateValue.Absent : StateValue.Of(t.Enabled ? "enabled" : "disabled");
    }

    public void Apply(string target, StateValue desired, StateValue current)
    {
        if (!desired.Exists) throw new InvalidOperationException("Scheduled tasks are never deleted by the optimizer.");
        tasks.SetEnabled(target, desired.Value == "enabled");
    }
}

/// <summary>
/// Target is "pid:startTimeTicks" so that a recycled PID is never mistaken for the original process.
/// Priority changes are session-scoped: they vanish when the process exits.
/// </summary>
public sealed class ProcessPriorityChangeHandler(IProcessManager processes) : ISystemChangeHandler
{
    public string Kind => ChangeKinds.ProcessPriority;
    public bool RequiresAdmin(string target) => false;

    public static string TargetFor(ProcessFacts p) =>
        $"{p.Pid}:{(p.StartTime?.UtcTicks ?? 0).ToString(CultureInfo.InvariantCulture)}";

    internal static ProcessFacts? Resolve(IProcessManager processes, string target)
    {
        var parts = target.Split(':');
        var pid = int.Parse(parts[0], CultureInfo.InvariantCulture);
        var ticks = parts.Length > 1 ? long.Parse(parts[1], CultureInfo.InvariantCulture) : 0;
        var p = processes.GetProcess(pid);
        if (p is null) return null;
        if (ticks != 0 && p.StartTime is { } st && st.UtcTicks != ticks) return null; // PID reused
        return p;
    }

    public StateValue Capture(string target)
    {
        var p = Resolve(processes, target);
        return p?.Priority is { } pr ? StateValue.Of(pr.ToString()) : StateValue.Absent;
    }

    public void Apply(string target, StateValue desired, StateValue current)
    {
        var p = Resolve(processes, target);
        if (p is null) return; // process exited: nothing to apply or restore
        var prio = Enum.Parse<ProcessPriority>(desired.Value!);
        if (prio == ProcessPriority.RealTime)
            throw new InvalidOperationException("RealTime priority can starve the OS and is never applied.");
        processes.SetPriority(p.Pid, prio);
    }

    // A process that exited counts as "restored": its priority no longer exists.
    public bool Matches(StateValue actual, StateValue expected) => !actual.Exists || actual == expected;
}

public sealed class ProcessAffinityChangeHandler(IProcessManager processes) : ISystemChangeHandler
{
    public string Kind => ChangeKinds.ProcessAffinity;
    public bool RequiresAdmin(string target) => false;

    public StateValue Capture(string target)
    {
        var p = ProcessPriorityChangeHandler.Resolve(processes, target);
        return p?.Affinity is { } a ? StateValue.Of(a.ToString(CultureInfo.InvariantCulture)) : StateValue.Absent;
    }

    public void Apply(string target, StateValue desired, StateValue current)
    {
        var p = ProcessPriorityChangeHandler.Resolve(processes, target);
        if (p is null) return;
        var mask = long.Parse(desired.Value!, CultureInfo.InvariantCulture);
        if (mask == 0) throw new InvalidOperationException("Affinity mask cannot be empty.");
        processes.SetAffinity(p.Pid, mask);
    }

    public bool Matches(StateValue actual, StateValue expected) => !actual.Exists || actual == expected;
}

/// <summary>
/// Files are never deleted: they are moved to a quarantine folder (desired.Value) and can be moved back.
/// </summary>
public sealed class FileQuarantineChangeHandler(IFileSystem files) : ISystemChangeHandler
{
    public string Kind => ChangeKinds.FileQuarantine;
    public bool RequiresAdmin(string target) => false;

    public StateValue Capture(string target) => files.FileExists(target) ? StateValue.Of("present") : StateValue.Absent;

    public void Apply(string target, StateValue desired, StateValue current)
    {
        if (!desired.Exists)
        {
            var quarantinePath = desired.Value ?? throw new InvalidOperationException("Quarantine destination missing.");
            files.CreateDirectory(PathUtil.GetDirectory(quarantinePath)!);
            files.MoveFile(target, quarantinePath);
        }
        else
        {
            var quarantinePath = current.Value ?? throw new InvalidOperationException("Quarantine source missing.");
            files.CreateDirectory(PathUtil.GetDirectory(target)!);
            files.MoveFile(quarantinePath, target);
        }
    }

    public bool Matches(StateValue actual, StateValue expected) => actual.Exists == expected.Exists;
}

/// <summary>Terminating a process is one-way. It still goes through the pipeline so it is safety-checked and recorded.</summary>
public sealed class ProcessTerminateChangeHandler(IProcessManager processes) : ISystemChangeHandler
{
    public string Kind => ChangeKinds.ProcessTerminate;
    public bool RequiresAdmin(string target) => false;
    public bool Reversible => false;

    public StateValue Capture(string target) =>
        ProcessPriorityChangeHandler.Resolve(processes, target) is null ? StateValue.Absent : StateValue.Of("running");

    public void Apply(string target, StateValue desired, StateValue current)
    {
        if (desired.Exists) throw new InvalidOperationException("A terminated process cannot be restarted by rollback.");
        var p = ProcessPriorityChangeHandler.Resolve(processes, target);
        if (p is not null) processes.Terminate(p.Pid);
    }
}
