using System.ComponentModel;
using System.Diagnostics;
using System.Text;
using System.Text.Json;
using Nexus.Contracts;
using Nexus.Contracts.Api;
using Nexus.Data.Repositories;
using Nexus.Security.Permissions;

namespace Nexus.Application.Hosting;

/// <summary>
/// Least-privilege elevation: launches "nexus elevated-apply" through UAC for ONE transaction and waits for it to exit.
/// The request travels as base64url JSON in the arguments (no temp files); the result is read back from the shared database.
/// The main process never becomes administrator.
/// </summary>
public sealed class ProcessElevationBroker(string executable, string dataDirectory, string configDirectory, NexusStore store) : IElevationBroker
{
    public async Task<ExecutionResult?> ExecuteElevatedAsync(ExecuteOptimizationRequest request, CancellationToken ct)
    {
        var ok = await RunElevated("elevated-apply", request, ct).ConfigureAwait(false);
        if (!ok || request.TransactionId is null) return null;
        var tx = store.Transactions.Get(request.TransactionId);
        return tx is null ? null : new ExecutionResult(tx.TransactionId, tx.Status, tx, tx.Messages, false, false);
    }

    public async Task<RollbackResult?> RollbackElevatedAsync(RollbackRequest request, CancellationToken ct)
    {
        var ok = await RunElevated("elevated-rollback", request, ct).ConfigureAwait(false);
        if (!ok) return null;
        var tx = store.Transactions.Get(request.TransactionId);
        return tx is null ? null : new RollbackResult(tx.TransactionId, tx.Status, [], ["Rollback executed with administrator rights."], false);
    }

    public static string Encode<T>(T value) =>
        Convert.ToBase64String(JsonSerializer.SerializeToUtf8Bytes(value, NexusJson.Options)).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    public static T? Decode<T>(string value)
    {
        var s = value.Replace('-', '+').Replace('_', '/');
        s = s.PadRight(s.Length + (4 - s.Length % 4) % 4, '=');
        return JsonSerializer.Deserialize<T>(Convert.FromBase64String(s), NexusJson.Options);
    }

    private async Task<bool> RunElevated(string verb, object request, CancellationToken ct)
    {
        var psi = new ProcessStartInfo(executable)
        {
            UseShellExecute = true, // required for the "runas" verb (UAC prompt)
            Verb = "runas",
            WindowStyle = ProcessWindowStyle.Hidden,
        };
        var args = new StringBuilder();
        args.Append(verb).Append(" --data-dir \"").Append(dataDirectory).Append("\" --config-dir \"").Append(configDirectory)
            .Append("\" --request ").Append(Encode(request));
        psi.Arguments = args.ToString();
        try
        {
            using var p = Process.Start(psi);
            if (p is null) return false;
            await p.WaitForExitAsync(ct).ConfigureAwait(false);
            return p.ExitCode == 0;
        }
        catch (Win32Exception ex) when (ex.NativeErrorCode == 1223) // ERROR_CANCELLED: user declined UAC
        {
            return false;
        }
    }
}
