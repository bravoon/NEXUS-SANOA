using System.Text.Json;
using System.Text.RegularExpressions;
using Nexus.Contracts;
using Nexus.Platform;
using Nexus.Platform.Abstractions;

namespace Nexus.Engine.Gaming;

/// <summary>Finds installed games from launcher metadata (Steam, Epic Games, GOG). Read-only.</summary>
public sealed partial class GameDetector(IPlatform platform)
{
    private static readonly string[] IgnoredExecutables =
        ["unins", "crashhandler", "crashreport", "vc_redist", "vcredist", "dxsetup", "dotnet", "setup", "launcherpatcher", "easyanticheat", "be_service", "uninstall"];

    public IReadOnlyList<GameInfo> DetectGames()
    {
        var games = new List<GameInfo>();
        Safe(() => games.AddRange(DetectSteam()));
        Safe(() => games.AddRange(DetectEpic()));
        Safe(() => games.AddRange(DetectGog()));
        return games.GroupBy(g => g.GameId).Select(g => g.First()).OrderBy(g => g.Name, StringComparer.OrdinalIgnoreCase).ToList();
    }

    private static void Safe(Action a) { try { a(); } catch { /* one launcher failing must not hide the others */ } }

    public IReadOnlyList<LauncherInfo> DetectLaunchers()
    {
        var pf86 = platform.Files.GetKnownFolder(KnownFolder.ProgramFilesX86) ?? @"C:\Program Files (x86)";
        var pf = platform.Files.GetKnownFolder(KnownFolder.ProgramFiles) ?? @"C:\Program Files";
        var candidates = new (string Name, string Exe, string[] Paths)[]
        {
            ("Steam", "steam.exe", [SteamRoot() is { } s ? PathUtil.Combine(s, "steam.exe") : PathUtil.Combine(pf86, "Steam", "steam.exe")]),
            ("Epic Games Launcher", "EpicGamesLauncher.exe", [PathUtil.Combine(pf86, "Epic Games", "Launcher", "Portal", "Binaries", "Win64", "EpicGamesLauncher.exe")]),
            ("Battle.net", "Battle.net.exe", [PathUtil.Combine(pf86, "Battle.net", "Battle.net.exe")]),
            ("EA app", "EADesktop.exe", [PathUtil.Combine(pf, "Electronic Arts", "EA Desktop", "EA Desktop", "EADesktop.exe")]),
            ("Ubisoft Connect", "UbisoftConnect.exe", [PathUtil.Combine(pf86, "Ubisoft", "Ubisoft Game Launcher", "UbisoftConnect.exe")]),
            ("GOG Galaxy", "GalaxyClient.exe", [PathUtil.Combine(pf86, "GOG Galaxy", "GalaxyClient.exe")]),
        };
        var running = platform.Processes.GetProcesses().Select(p => p.Name).ToHashSet(StringComparer.OrdinalIgnoreCase);
        return candidates.Select(c =>
        {
            var path = c.Paths.FirstOrDefault(platform.Files.FileExists);
            return new LauncherInfo(c.Name, path is not null, running.Contains(c.Exe), path);
        }).ToList();
    }

    private string? SteamRoot()
    {
        var reg = platform.Registry.GetValue(@"HKCU\Software\Valve\Steam", "SteamPath")?.Text?.Replace('/', '\\');
        if (reg is not null && platform.Files.DirectoryExists(reg)) return reg;
        var def = PathUtil.Combine(platform.Files.GetKnownFolder(KnownFolder.ProgramFilesX86) ?? @"C:\Program Files (x86)", "Steam");
        return platform.Files.DirectoryExists(def) ? def : null;
    }

    [GeneratedRegex("\"(?<k>[^\"]+)\"\\s+\"(?<v>(?:[^\"\\\\]|\\\\.)*)\"")]
    private static partial Regex VdfPair();

    /// <summary>Minimal KeyValues (VDF/ACF) reader: returns every "key" "value" pair in document order.</summary>
    public static IReadOnlyList<(string Key, string Value)> ParseVdfPairs(string text) =>
        VdfPair().Matches(text).Select(m => (m.Groups["k"].Value, m.Groups["v"].Value.Replace(@"\\", @"\"))).ToList();

    private IEnumerable<GameInfo> DetectSteam()
    {
        var root = SteamRoot();
        if (root is null) yield break;
        var libraries = new List<string> { root };
        var vdf = PathUtil.Combine(root, "steamapps", "libraryfolders.vdf");
        if (platform.Files.FileExists(vdf))
            libraries.AddRange(ParseVdfPairs(platform.Files.ReadAllText(vdf)).Where(p => p.Key == "path").Select(p => p.Value));

        foreach (var lib in libraries.Distinct(StringComparer.OrdinalIgnoreCase))
        {
            var apps = PathUtil.Combine(lib, "steamapps");
            foreach (var manifest in platform.Files.EnumerateFiles(apps, "*.acf", false))
            {
                var pairs = ParseVdfPairs(platform.Files.ReadAllText(manifest.Path)).ToDictionary(p => p.Key, p => p.Value, StringComparer.OrdinalIgnoreCase);
                if (!pairs.TryGetValue("appid", out var appId) || !pairs.TryGetValue("name", out var name)) continue;
                if (name.StartsWith("Steamworks", StringComparison.OrdinalIgnoreCase) || name.Contains("Redistributable", StringComparison.OrdinalIgnoreCase)) continue;
                var dir = pairs.TryGetValue("installdir", out var d) ? PathUtil.Combine(apps, "common", d) : null;
                yield return new GameInfo($"steam:{appId}", name, "Steam", dir, dir is null ? null : GuessExecutable(dir));
            }
        }
    }

    private IEnumerable<GameInfo> DetectEpic()
    {
        var dir = PathUtil.Combine(platform.Files.GetKnownFolder(KnownFolder.ProgramData) ?? @"C:\ProgramData", "Epic", "EpicGamesLauncher", "Data", "Manifests");
        foreach (var item in platform.Files.EnumerateFiles(dir, "*.item", false))
        {
            using var doc = JsonDocument.Parse(platform.Files.ReadAllText(item.Path));
            var r = doc.RootElement;
            string? S(string p) => r.TryGetProperty(p, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;
            var name = S("DisplayName");
            var app = S("AppName") ?? S("CatalogItemId");
            if (name is null || app is null) continue;
            var loc = S("InstallLocation");
            var launch = S("LaunchExecutable");
            var exe = loc is not null && launch is not null ? PathUtil.Combine(loc, launch.Replace('/', '\\')) : null;
            yield return new GameInfo($"epic:{app}", name, "Epic Games", loc, exe);
        }
    }

    private IEnumerable<GameInfo> DetectGog()
    {
        const string key = @"HKLM\SOFTWARE\WOW6432Node\GOG.com\Games";
        foreach (var id in platform.Registry.GetSubKeyNames(key))
        {
            var k = $@"{key}\{id}";
            var name = platform.Registry.GetValue(k, "gameName")?.Text;
            if (name is null) continue;
            yield return new GameInfo($"gog:{id}", name, "GOG", platform.Registry.GetValue(k, "path")?.Text, platform.Registry.GetValue(k, "exe")?.Text);
        }
    }

    /// <summary>Largest executable in the install folder, ignoring installers, crash handlers and anti-cheat services.</summary>
    internal string? GuessExecutable(string installDir) =>
        platform.Files.EnumerateFiles(installDir, "*.exe", true)
            .Where(f => !IgnoredExecutables.Any(i => PathUtil.GetFileName(f.Path).Contains(i, StringComparison.OrdinalIgnoreCase)))
            .OrderByDescending(f => f.Length)
            .FirstOrDefault()?.Path;
}
