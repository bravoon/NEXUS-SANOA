using Nexus.Contracts;
using Nexus.Engine.Gaming;
using Nexus.Platform.Abstractions;
using Nexus.Platform.Simulation;

namespace Nexus.Tests;

public class PowerProfileTests
{
    [Fact]
    public void Built_in_profiles_exist()
    {
        using var host = new TestHost();
        var names = host.Engine.Profiles.List().Select(p => p.Name).ToList();
        Assert.Equal(["Balanced", "Battery", "Gaming", "Performance"], names.Order().ToList());
    }

    [Fact]
    public async Task Gaming_profile_goes_through_the_pipeline_and_is_reversible()
    {
        using var host = new TestHost();
        var r = await host.Engine.ApplyProfileAsync("Gaming");
        Assert.Equal(TransactionStatus.Committed, r.Status);
        Assert.Equal(WellKnownPowerSchemes.HighPerformance, host.Platform.Pwr.Active);
        Assert.Equal("1", host.Platform.Reg.GetValue(@"HKCU\Software\Microsoft\GameBar", "AutoGameModeEnabled")!.Text);
        Assert.Equal("Gaming", host.Engine.Profiles.ActiveProfile);

        var rb = await host.Engine.RollbackOptimizationAsync(new RollbackRequest(r.TransactionId));
        Assert.Equal(TransactionStatus.RolledBack, rb.Status);
        Assert.Equal(WellKnownPowerSchemes.Balanced, host.Platform.Pwr.Active);
    }

    [Fact]
    public async Task Battery_profile_switches_to_power_saver()
    {
        using var host = new TestHost();
        await host.Engine.ApplyProfileAsync("Battery");
        Assert.Equal(WellKnownPowerSchemes.PowerSaver, host.Platform.Pwr.Active);
    }

    [Fact]
    public async Task Missing_power_plan_blocks_the_profile_instead_of_guessing()
    {
        var p = SimulatedPlatform.CreateSampleMachine();
        p.Pwr.Schemes.RemoveAll(s => s.Id == WellKnownPowerSchemes.HighPerformance);
        using var host = new TestHost(p);
        var r = await host.Engine.ApplyProfileAsync("Gaming");
        Assert.Equal(TransactionStatus.Failed, r.Status);
        Assert.Equal(WellKnownPowerSchemes.Balanced, p.Pwr.Active);
    }

    [Fact]
    public async Task Custom_profiles_are_validated()
    {
        using var host = new TestHost();
        var ok = await host.Engine.CreateProfileAsync(new ProfileDefinition("Streaming", ProfileKind.Custom, "d",
            new Dictionary<string, string> { ["powerPlan"] = "balanced", ["backgroundRecording"] = "true" }));
        Assert.Equal(ProfileKind.Custom, ok.Kind);
        await Assert.ThrowsAsync<ArgumentException>(() => host.Engine.CreateProfileAsync(new ProfileDefinition("Bad", ProfileKind.Custom, "d",
            new Dictionary<string, string> { ["powerPlan"] = "turbo" })));
        await Assert.ThrowsAsync<ArgumentException>(() => host.Engine.CreateProfileAsync(new ProfileDefinition("Gaming", ProfileKind.Custom, "d",
            new Dictionary<string, string>())));
        var dry = await host.Engine.ApplyProfileAsync("Streaming", dryRun: true);
        Assert.Equal(TransactionStatus.DryRun, dry.Status);
    }
}

public class GamingEngineTests
{
    [Fact]
    public void Steam_vdf_is_parsed()
    {
        var pairs = GameDetector.ParseVdfPairs("\"libraryfolders\"\n{\n \"0\"\n {\n  \"path\"  \"D:\\\\Games\\\\Steam\"\n  \"label\" \"\"\n }\n}");
        Assert.Contains(("path", @"D:\Games\Steam"), pairs);
    }

    [Fact]
    public void Games_are_detected_from_launcher_metadata()
    {
        using var host = new TestHost();
        var games = host.Engine.Gaming.DetectGames();
        Assert.Contains(games, g => g.GameId == "steam:1091500" && g.Name == "Cyberpunk 2077" && g.Executable!.EndsWith("Cyberpunk2077.exe"));
        Assert.Contains(games, g => g.GameId == "epic:Fortnite");
        var launchers = host.Engine.Gaming.DetectLaunchers();
        Assert.Contains(launchers, l => l.Name == "Steam" && l.Installed && l.Running);
    }

    [Fact]
    public void Unsafe_game_profiles_are_rejected()
    {
        using var host = new TestHost();
        Assert.Throws<ArgumentException>(() => host.Engine.Gaming.CreateProfile(new GameProfile("g", "g.exe", ProcessPriority.RealTime)));
        Assert.Throws<ArgumentException>(() => host.Engine.Gaming.CreateProfile(new GameProfile("g", "g.exe", CpuAffinity: 0)));
        Assert.Throws<ArgumentException>(() => host.Engine.Gaming.CreateProfile(new GameProfile("g", "g.exe", CpuAffinity: 1L << 40)));
    }

    [Fact]
    public async Task Session_profile_is_applied_on_game_start_and_restored_on_exit()
    {
        using var host = new TestHost();
        var gpuKey = @"HKCU\Software\Microsoft\DirectX\UserGpuPreferences";
        var exe = @"D:\SteamLibrary\steamapps\common\Cyberpunk 2077\bin\x64\Cyberpunk2077.exe";
        host.Engine.Gaming.CreateProfile(new GameProfile("steam:1091500", exe, ProcessPriority.High,
            GraphicsSettings: new Dictionary<string, string> { ["gpuPreference"] = "highPerformance" },
            BackgroundProcesses: ["chrome.exe"], AutoApply: true));

        await host.Engine.Gaming.PollOnceAsync(); // game is running in the sample machine
        Assert.Equal(ProcessPriority.High, host.Platform.Procs.GetProcess(8800)!.Priority);
        Assert.Equal(ProcessPriority.BelowNormal, host.Platform.Procs.GetProcess(6100)!.Priority); // de-prioritised, not killed
        Assert.Equal("GpuPreference=2;", host.Platform.Reg.GetValue(gpuKey, exe)!.Text);
        Assert.Single(host.Engine.Gaming.ActiveSessions);

        host.Platform.Procs.Items.RemoveAll(p => p.Pid == 8800); // game exits
        await host.Engine.Gaming.PollOnceAsync();
        Assert.Empty(host.Engine.Gaming.ActiveSessions);
        Assert.Equal(ProcessPriority.Normal, host.Platform.Procs.GetProcess(6100)!.Priority);
        Assert.Null(host.Platform.Reg.GetValue(gpuKey, exe));
        Assert.Empty(host.Platform.Procs.Terminated);
    }
}
