using System.Buffers.Binary;
using System.Text.Json;
using Nexus.Contracts.Api;

namespace Nexus.Ipc;

/// <summary>Frame = 4-byte little-endian length + UTF-8 JSON <see cref="ApiEnvelope"/>. Frames above 16 MB are rejected.</summary>
public static class MessageFraming
{
    public const int MaxFrameBytes = 16 * 1024 * 1024;

    public static async Task WriteAsync(Stream stream, ApiEnvelope message, CancellationToken ct)
    {
        var body = JsonSerializer.SerializeToUtf8Bytes(message, NexusJson.Options);
        if (body.Length > MaxFrameBytes) throw new InvalidDataException("Message too large.");
        var header = new byte[4];
        BinaryPrimitives.WriteInt32LittleEndian(header, body.Length);
        await stream.WriteAsync(header, ct).ConfigureAwait(false);
        await stream.WriteAsync(body, ct).ConfigureAwait(false);
        await stream.FlushAsync(ct).ConfigureAwait(false);
    }

    public static async Task<ApiEnvelope?> ReadAsync(Stream stream, CancellationToken ct)
    {
        var header = new byte[4];
        if (!await ReadExactlyAsync(stream, header, ct).ConfigureAwait(false)) return null;
        var length = BinaryPrimitives.ReadInt32LittleEndian(header);
        if (length <= 0 || length > MaxFrameBytes) throw new InvalidDataException($"Invalid frame length {length}.");
        var body = new byte[length];
        if (!await ReadExactlyAsync(stream, body, ct).ConfigureAwait(false)) return null;
        return JsonSerializer.Deserialize<ApiEnvelope>(body, NexusJson.Options);
    }

    private static async Task<bool> ReadExactlyAsync(Stream s, byte[] buffer, CancellationToken ct)
    {
        var read = 0;
        while (read < buffer.Length)
        {
            var n = await s.ReadAsync(buffer.AsMemory(read), ct).ConfigureAwait(false);
            if (n == 0) return false;
            read += n;
        }
        return true;
    }
}

public static class PipeNames
{
    /// <summary>Per-user pipe name, so two users on one machine never share an engine.</summary>
    public static string ForCurrentUser(bool simulated = false)
    {
        var user = Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(
            Environment.UserDomainName + "\\" + Environment.UserName)))[..16].ToLowerInvariant();
        return $"nexus-optimizer-{(simulated ? "sim-" : "")}{user}";
    }
}
