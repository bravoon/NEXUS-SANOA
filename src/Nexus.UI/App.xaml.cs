using System.Windows;
using Nexus.UI.Services;
using Nexus.UI.ViewModels;
using Nexus.UI.Views;

namespace Nexus.UI;

/// <summary>
/// Composition of the desktop client: connection to the engine API + view models + window.
/// No engine type is referenced here — only the API client.
/// </summary>
public partial class App : Application
{
    private EngineConnection? _connection;

    protected override async void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);
        var simulate = e.Args.Contains("--simulate", StringComparer.OrdinalIgnoreCase);
        _connection = new EngineConnection(simulate);
        var vm = new MainViewModel(_connection);
        var window = new MainWindow { DataContext = vm };
        MainWindow = window;
        window.Show();
        await vm.StartAsync();
    }

    protected override async void OnExit(ExitEventArgs e)
    {
        if (_connection is not null) await _connection.DisposeAsync();
        base.OnExit(e);
    }
}
