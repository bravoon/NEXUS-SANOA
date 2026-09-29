namespace Nexus.CLI;

/// <summary>Tiny, dependency-free argument parser: positional args, --flags and --key value options (repeatable).</summary>
public sealed class CommandLine
{
    private readonly Dictionary<string, List<string>> _options = new(StringComparer.OrdinalIgnoreCase);
    private readonly HashSet<string> _flags = new(StringComparer.OrdinalIgnoreCase);
    public List<string> Positional { get; } = [];

    private static readonly HashSet<string> KnownFlags = new(StringComparer.OrdinalIgnoreCase)
    {
        "json", "simulate", "verbose", "yes", "dry-run", "force", "recommended", "all", "restore-point", "confirm", "auto", "include-system", "monitor-games", "help",
    };

    public CommandLine(IEnumerable<string> args)
    {
        var list = args.ToList();
        for (var i = 0; i < list.Count; i++)
        {
            var a = list[i];
            if (a.StartsWith("--", StringComparison.Ordinal))
            {
                var name = a[2..];
                var eq = name.IndexOf('=');
                if (eq > 0) { Add(name[..eq], name[(eq + 1)..]); continue; }
                if (KnownFlags.Contains(name) || i + 1 >= list.Count || list[i + 1].StartsWith("--", StringComparison.Ordinal)) _flags.Add(name);
                else Add(name, list[++i]);
            }
            else if (a is "-y") _flags.Add("yes");
            else if (a is "-h" or "/?") _flags.Add("help");
            else Positional.Add(a);
        }
    }

    private void Add(string k, string v)
    {
        if (!_options.TryGetValue(k, out var l)) _options[k] = l = [];
        l.Add(v);
    }

    public bool Flag(string name) => _flags.Contains(name);
    public string? Option(string name) => _options.TryGetValue(name, out var l) ? l[^1] : null;
    public IReadOnlyList<string> Options(string name) => _options.TryGetValue(name, out var l) ? l : [];
    public int Int(string name, int fallback) => int.TryParse(Option(name), out var v) ? v : fallback;
    public string? Arg(int index) => index < Positional.Count ? Positional[index] : null;
}
