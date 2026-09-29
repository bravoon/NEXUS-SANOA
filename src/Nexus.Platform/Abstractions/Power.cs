namespace Nexus.Platform.Abstractions;

public sealed record PowerScheme(Guid Id, string Name);

public sealed record PowerSourceStatus(bool? OnAcPower, bool HasBattery, int? BatteryPercent);

public interface IPowerManager
{
    IReadOnlyList<PowerScheme> GetSchemes();
    Guid GetActiveScheme();
    void SetActiveScheme(Guid id);
    PowerSourceStatus GetPowerSource();
}

public static class WellKnownPowerSchemes
{
    public static readonly Guid PowerSaver = new("a1841308-3541-4fab-bc81-f71556f20b4a");
    public static readonly Guid Balanced = new("381b4222-f694-41f0-9685-ff5bb260df2e");
    public static readonly Guid HighPerformance = new("8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c");
    public static readonly Guid UltimatePerformance = new("e9a42b02-d5df-448d-aa00-03f14749eb61");

    public static string? NameOf(Guid id) =>
        id == PowerSaver ? "power-saver" :
        id == Balanced ? "balanced" :
        id == HighPerformance ? "high-performance" :
        id == UltimatePerformance ? "ultimate" : null;

    public static Guid? FromName(string name) => name.ToLowerInvariant() switch
    {
        "power-saver" or "powersaver" => PowerSaver,
        "balanced" => Balanced,
        "high-performance" or "highperformance" => HighPerformance,
        "ultimate" or "ultimate-performance" => UltimatePerformance,
        _ => null,
    };
}
