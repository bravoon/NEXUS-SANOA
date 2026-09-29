using System.Security.Cryptography;
using System.Text;

namespace Nexus.Engine.Core;

internal static class Ids
{
    public static string Short(string prefix, string seed) =>
        prefix + Convert.ToHexString(SHA1.HashData(Encoding.UTF8.GetBytes(seed.ToLowerInvariant())))[..10].ToLowerInvariant();

    public static string New(string prefix) => $"{prefix}{DateTimeOffset.UtcNow:yyyyMMddHHmmss}-{Guid.NewGuid().ToString("N")[..6]}";
}
