namespace Nexus.Contracts;

/// <summary>A profile is only a named collection of settings; the engine applies it through the normal pipeline.</summary>
public sealed record ProfileDefinition(
    string Name,
    ProfileKind Kind,
    string Description,
    IReadOnlyDictionary<string, string> Settings,
    bool BuiltIn = false);

public sealed record ProfileSettingDescriptor(string Key, string Description, IReadOnlyList<string> AllowedValues);
