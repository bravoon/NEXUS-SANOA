using System.Globalization;
using Nexus.Application.Hosting;
using Nexus.Application.Services;
using Nexus.CLI;
using Nexus.Contracts;
using Nexus.Contracts.Api;
using Nexus.Ipc;

Console.OutputEncoding = System.Text.Encoding.UTF8;
CultureInfo.DefaultThreadCurrentCulture = CultureInfo.InvariantCulture;
var cl = new CommandLine(args);
var command = cl.Arg(0)?.ToLowerInvariant();
if (command is null || cl.Flag("help") || command is "help") { Commands.Usage(); return command is null ? 2 : 0; }

var options = new RuntimeOptions
{
    Simulate = cl.Flag("simulate"),
    DataDirectory = cl.Option("data-dir"),
    ConfigDirectory = cl.Option("config-dir"),
    ToolsDirectory = cl.Option("tools-dir"),
    ConsoleLog = cl.Flag("verbose") ? Console.Error : null,
    ConsoleLogLevel = cl.Flag("verbose") ? NexusLogLevel.Debug : NexusLogLevel.Warning,
    // The elevated worker must never try to elevate again.
    EnableElevationBroker = command is not ("elevated-apply" or "elevated-rollback"),
};

if (NexusRuntime.WillSimulate(options) && !cl.Flag("json"))
    Output.Warn(OperatingSystem.IsWindows()
        ? "SIMULATION MODE — a virtual machine is analysed; your computer is not modified."
        : "Not running on Windows — using the SIMULATED machine. Nothing on this computer is modified.");

using var cts = new CancellationTokenSource();
Console.CancelKeyPress += (_, e) => { e.Cancel = true; cts.Cancel(); };

using var app = NexusRuntime.Create(options);
var cmd = new Commands(app, cl, cts.Token);
try
{
    return command switch
    {
        "scan" => await cmd.Scan(),
        "analyze" or "diagnose" => await cmd.Analyze(),
        "recommendations" or "recs" => await cmd.Recommendations(),
        "preview" => await cmd.Preview(),
        "optimize" or "apply" => await cmd.Optimize(),
        "rollback" or "undo" => await cmd.Rollback(),
        "history" => cmd.History(),
        "quarantine" => cmd.Quarantine(),
        "processes" or "ps" => cmd.Processes(),
        "priority" => await cmd.Priority(),
        "kill" => await cmd.Kill(),
        "startup" => await cmd.Startup(),
        "games" => cmd.Games(),
        "game-profile" => cmd.GameProfile(),
        "game-apply" => await cmd.GameApply(),
        "profile" or "profiles" => await cmd.Profile(),
        "benchmark" or "bench" => await cmd.Benchmark(),
        "status" => await cmd.Status(),
        "rules" => cmd.Rules(),
        "logs" => cmd.Logs(),
        "serve" => await cmd.Serve(NexusRuntime.WillSimulate(options)),
        "elevated-apply" => await cmd.ElevatedApply(),
        "elevated-rollback" => await cmd.ElevatedRollback(),
        _ => Commands.Unknown(command),
    };
}
catch (OperationCanceledException)
{
    Output.Warn("Cancelled.");
    return 130;
}
catch (Exception ex) when (ex is ArgumentException or KeyNotFoundException or InvalidOperationException or FormatException)
{
    Output.Error(ex.Message);
    return 1;
}
