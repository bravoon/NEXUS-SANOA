namespace Nexus.Platform.Abstractions;

public sealed record ScheduledTaskFacts(
    string Path,
    string Name,
    bool Enabled,
    string? Command,
    string? Author,
    bool RunsAtLogon,
    bool RunsAtBoot);

public interface ITaskSchedulerAccessor
{
    IReadOnlyList<ScheduledTaskFacts> GetTasks();
    ScheduledTaskFacts? GetTask(string path);
    void SetEnabled(string path, bool enabled);
}
