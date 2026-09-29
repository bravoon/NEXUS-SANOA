using Nexus.Contracts;

namespace Nexus.Platform.Abstractions;

public sealed record ServiceFacts(string Name, string DisplayName, ServiceStartMode StartMode, ServiceRunState State, string? ImagePath);

public interface IServiceManager
{
    IReadOnlyList<ServiceFacts> GetServices();
    ServiceFacts? GetService(string name);
    void SetStartMode(string name, ServiceStartMode mode);
}
