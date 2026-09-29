using System.Globalization;
using System.Windows;
using System.Windows.Data;
using System.Windows.Media;
using Nexus.Contracts;

namespace Nexus.UI.Infrastructure;

/// <summary>Presentation-only formatting of engine values.</summary>
public static class Format
{
    public static string Bytes(double? b) => b switch
    {
        null => "n/a",
        >= 1L << 30 => $"{b / (1L << 30):F1} GB",
        >= 1L << 20 => $"{b / (1L << 20):F0} MB",
        >= 1L << 10 => $"{b / (1L << 10):F0} KB",
        _ => $"{b:F0} B",
    };

    public static string Reading(SensorReading? r) => r switch
    {
        null => "n/a",
        { HasValue: false } => r.Availability == SensorAvailability.RequiresAdmin ? "needs admin" : "unavailable",
        { Unit: "B" } => Bytes(r.Value),
        { Unit: "B/s" } => Bytes(r.Value) + "/s",
        { Unit: "%" } => $"{r.Value:F0}%",
        _ => $"{r.Value:F0} {r.Unit}",
    };

    public static string Metric(MetricValue? m, string f = "F1") =>
        m is { Availability: SensorAvailability.Available, Value: { } v } ? $"{v.ToString(f, CultureInfo.CurrentCulture)} {m.Unit}" : "n/a";
}

public sealed class ReadingConverter : IValueConverter
{
    public object Convert(object? value, Type t, object? p, CultureInfo c) => value switch
    {
        SensorReading r => Format.Reading(r),
        MetricValue m => Format.Metric(m),
        long l => Format.Bytes(l),
        double d when p as string == "bytes" => Format.Bytes(d),
        _ => value?.ToString() ?? "",
    };
    public object ConvertBack(object? value, Type t, object? p, CultureInfo c) => throw new NotSupportedException();
}

/// <summary>Maps confidence / severity / status enums to theme brushes.</summary>
public sealed class ToneBrushConverter : IValueConverter
{
    private static Brush B(string key) => (Brush)Application.Current.Resources[key];

    public object Convert(object? value, Type t, object? p, CultureInfo c) => value switch
    {
        Confidence.Confirmed => B("GreenBrush"),
        Confidence.Likely => B("CyanBrush"),
        Confidence.Possible => B("YellowBrush"),
        Confidence.Unknown => B("MutedBrush"),
        Severity.Critical or Severity.High => B("RedBrush"),
        Severity.Medium => B("YellowBrush"),
        Severity.Low => B("CyanBrush"),
        Severity.Info => B("MutedBrush"),
        RecommendationStatus.Recommended => B("GreenBrush"),
        RecommendationStatus.Optional => B("YellowBrush"),
        RecommendationStatus.AlreadyApplied or RecommendationStatus.NotApplicable => B("MutedBrush"),
        RecommendationStatus.Blocked => B("RedBrush"),
        ProcessClassification.Suspicious => B("RedBrush"),
        ProcessClassification.Unknown => B("YellowBrush"),
        ProcessClassification.System => B("CyanBrush"),
        ProcessClassification.Trusted => B("GreenBrush"),
        TransactionStatus.Committed or TransactionStatus.RolledBack => B("GreenBrush"),
        TransactionStatus.Failed or TransactionStatus.RollbackFailed => B("RedBrush"),
        TransactionStatus.PartiallyRolledBack or TransactionStatus.ElevationRequired => B("YellowBrush"),
        ComparisonVerdict.Improved => B("GreenBrush"),
        ComparisonVerdict.Regressed => B("RedBrush"),
        true => B("GreenBrush"),
        false => B("MutedBrush"),
        _ => B("TextBrush"),
    };
    public object ConvertBack(object? value, Type t, object? p, CultureInfo c) => throw new NotSupportedException();
}

public sealed class UpperConverter : IValueConverter
{
    public object Convert(object? value, Type t, object? p, CultureInfo c) => value switch
    {
        true => "ON",
        false => "OFF",
        _ => value?.ToString()?.ToUpperInvariant() ?? "",
    };
    public object ConvertBack(object? value, Type t, object? p, CultureInfo c) => throw new NotSupportedException();
}

public sealed class JoinConverter : IValueConverter
{
    public object Convert(object? value, Type t, object? p, CultureInfo c) =>
        value is IEnumerable<string> s ? string.Join(Environment.NewLine, s) : value?.ToString() ?? "";
    public object ConvertBack(object? value, Type t, object? p, CultureInfo c) => throw new NotSupportedException();
}

public sealed class NullToCollapsedConverter : IValueConverter
{
    public object Convert(object? value, Type t, object? p, CultureInfo c) =>
        value is null || (value is string s && s.Length == 0) || (value is bool b && !b) ? Visibility.Collapsed : Visibility.Visible;
    public object ConvertBack(object? value, Type t, object? p, CultureInfo c) => throw new NotSupportedException();
}
