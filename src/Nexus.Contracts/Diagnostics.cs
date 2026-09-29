namespace Nexus.Contracts;

public sealed record Evidence(string Metric, string Observed, string? Threshold = null, string? Source = null);

/// <summary>A diagnostic finding. <see cref="Confidence"/> separates facts from hypotheses.</summary>
public sealed record DiagnosticFinding(
    string Id,
    string Title,
    string Area,
    Severity Severity,
    Confidence Confidence,
    string Explanation,
    IReadOnlyList<Evidence> Evidence,
    IReadOnlyList<string> RelatedOptimizationIds);

public sealed record BottleneckAssessment(
    Bottleneck Primary,
    Confidence Confidence,
    string Explanation,
    IReadOnlyList<Evidence> Evidence,
    int SampleCount,
    bool SystemUnderLoad);

public sealed record AnalysisReport(
    string SnapshotId,
    DateTimeOffset GeneratedAt,
    BottleneckAssessment Bottleneck,
    IReadOnlyList<DiagnosticFinding> Findings);
