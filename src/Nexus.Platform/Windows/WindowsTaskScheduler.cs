using System.Runtime.InteropServices;
using System.Runtime.Versioning;
using Nexus.Platform.Abstractions;

namespace Nexus.Platform.Windows;

/// <summary>Task Scheduler 2.0 through its COM API (Schedule.Service). Read-only except for Enable/Disable.</summary>
[SupportedOSPlatform("windows")]
public sealed class WindowsTaskScheduler : ITaskSchedulerAccessor
{
    private const int TASK_TRIGGER_BOOT = 8;
    private const int TASK_TRIGGER_LOGON = 9;
    private const int TASK_ACTION_EXEC = 0;
    private const int TASK_ENUM_HIDDEN = 1;

    private static dynamic Connect()
    {
        var type = Type.GetTypeFromProgID("Schedule.Service") ?? throw new PlatformNotSupportedException("Task Scheduler COM API not available.");
        dynamic svc = Activator.CreateInstance(type)!;
        svc.Connect();
        return svc;
    }

    public IReadOnlyList<ScheduledTaskFacts> GetTasks()
    {
        var list = new List<ScheduledTaskFacts>();
        dynamic svc = Connect();
        try { Walk(svc.GetFolder("\\"), list); }
        finally { Marshal.FinalReleaseComObject(svc); }
        return list;
    }

    private static void Walk(dynamic folder, List<ScheduledTaskFacts> list)
    {
        try
        {
            foreach (dynamic task in folder.GetTasks(TASK_ENUM_HIDDEN))
            {
                try { list.Add(ToFacts(task)); } catch (COMException) { }
            }
            foreach (dynamic sub in folder.GetFolders(0)) Walk(sub, list);
        }
        catch (COMException) { /* access denied on protected folders */ }
        catch (UnauthorizedAccessException) { }
    }

    private static ScheduledTaskFacts ToFacts(dynamic task)
    {
        dynamic def = task.Definition;
        string? command = null;
        foreach (dynamic action in def.Actions)
        {
            if ((int)action.Type == TASK_ACTION_EXEC)
            {
                command = $"{action.Path} {action.Arguments}".Trim();
                break;
            }
        }
        bool logon = false, boot = false;
        foreach (dynamic trigger in def.Triggers)
        {
            var t = (int)trigger.Type;
            logon |= t == TASK_TRIGGER_LOGON;
            boot |= t == TASK_TRIGGER_BOOT;
        }
        return new ScheduledTaskFacts((string)task.Path, (string)task.Name, (bool)task.Enabled, command,
            (string?)def.RegistrationInfo.Author, logon, boot);
    }

    public ScheduledTaskFacts? GetTask(string path)
    {
        dynamic svc = Connect();
        try
        {
            var idx = path.LastIndexOf('\\');
            dynamic folder = svc.GetFolder(idx <= 0 ? "\\" : path[..idx]);
            return ToFacts(folder.GetTask(path[(idx + 1)..]));
        }
        catch (COMException) { return null; }
        catch (FileNotFoundException) { return null; }
        finally { Marshal.FinalReleaseComObject(svc); }
    }

    public void SetEnabled(string path, bool enabled)
    {
        dynamic svc = Connect();
        try
        {
            var idx = path.LastIndexOf('\\');
            dynamic folder = svc.GetFolder(idx <= 0 ? "\\" : path[..idx]);
            dynamic task = folder.GetTask(path[(idx + 1)..]);
            task.Enabled = enabled;
        }
        finally { Marshal.FinalReleaseComObject(svc); }
    }
}
