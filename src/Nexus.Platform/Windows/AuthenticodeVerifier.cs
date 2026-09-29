using System.Collections.Concurrent;
using System.Runtime.InteropServices;
using System.Runtime.Versioning;
using System.Security.Cryptography.X509Certificates;
using Nexus.Platform.Abstractions;

namespace Nexus.Platform.Windows;

/// <summary>
/// Verifies Authenticode signatures, including catalog-signed Windows binaries (most of System32).
/// Revocation is not checked online (no network access from the engine); results are cached per file version.
/// </summary>
[SupportedOSPlatform("windows")]
public sealed class AuthenticodeVerifier : ISignatureVerifier
{
    private readonly ConcurrentDictionary<string, (DateTime Stamp, SignatureInfo Info)> _cache = new(StringComparer.OrdinalIgnoreCase);

    public SignatureInfo Verify(string path)
    {
        if (!File.Exists(path)) return new SignatureInfo(null, null, null);
        var stamp = File.GetLastWriteTimeUtc(path);
        if (_cache.TryGetValue(path, out var c) && c.Stamp == stamp) return c.Info;
        var info = VerifyCore(path);
        _cache[path] = (stamp, info);
        return info;
    }

    private static SignatureInfo VerifyCore(string path)
    {
        var embedded = VerifyEmbedded(path);
        if (embedded == 0) return new SignatureInfo(true, true, Publisher(path));

        const int TRUST_E_NOSIGNATURE = unchecked((int)0x800B0100);
        if (embedded == TRUST_E_NOSIGNATURE)
        {
            var catalog = VerifyCatalog(path, out var catalogFile);
            if (catalog == 0) return new SignatureInfo(true, true, catalogFile is null ? "Microsoft Windows (catalog)" : Publisher(catalogFile) ?? "Catalog signed");
            return new SignatureInfo(false, false, null);
        }
        // Signed but untrusted / tampered / expired chain.
        return new SignatureInfo(true, false, Publisher(path));
    }

    private static string? Publisher(string path)
    {
        try
        {
#pragma warning disable SYSLIB0057
            using var cert = new X509Certificate2(X509Certificate.CreateFromSignedFile(path));
#pragma warning restore SYSLIB0057
            return cert.GetNameInfo(X509NameType.SimpleName, false);
        }
        catch { return null; }
    }

    private static int VerifyEmbedded(string path)
    {
        var fileInfo = new NativeMethods.WINTRUST_FILE_INFO
        {
            cbStruct = (uint)Marshal.SizeOf<NativeMethods.WINTRUST_FILE_INFO>(),
            pcwszFilePath = path,
        };
        var pFile = Marshal.AllocHGlobal(Marshal.SizeOf(fileInfo));
        Marshal.StructureToPtr(fileInfo, pFile, false);
        try
        {
            return Run(NativeMethods.WTD_CHOICE_FILE, pFile);
        }
        finally
        {
            Marshal.DestroyStructure<NativeMethods.WINTRUST_FILE_INFO>(pFile);
            Marshal.FreeHGlobal(pFile);
        }
    }

    private static int Run(uint choice, IntPtr info)
    {
        var data = new NativeMethods.WINTRUST_DATA
        {
            cbStruct = (uint)Marshal.SizeOf<NativeMethods.WINTRUST_DATA>(),
            dwUIChoice = NativeMethods.WTD_UI_NONE,
            fdwRevocationChecks = NativeMethods.WTD_REVOKE_NONE,
            dwUnionChoice = choice,
            pInfo = info,
            dwStateAction = NativeMethods.WTD_STATEACTION_VERIFY,
            dwProvFlags = NativeMethods.WTD_CACHE_ONLY_URL_RETRIEVAL,
        };
        var action = NativeMethods.WINTRUST_ACTION_GENERIC_VERIFY_V2;
        var result = NativeMethods.WinVerifyTrust(IntPtr.Zero, ref action, ref data);
        data.dwStateAction = NativeMethods.WTD_STATEACTION_CLOSE;
        NativeMethods.WinVerifyTrust(IntPtr.Zero, ref action, ref data);
        return result;
    }

    private static int VerifyCatalog(string path, out string? catalogFile)
    {
        catalogFile = null;
        if (!NativeMethods.CryptCATAdminAcquireContext2(out var admin, IntPtr.Zero, "SHA256", IntPtr.Zero, 0)) return -1;
        try
        {
            using var fs = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
            var handle = fs.SafeFileHandle.DangerousGetHandle();
            uint size = 0;
            NativeMethods.CryptCATAdminCalcHashFromFileHandle2(admin, handle, ref size, null, 0);
            if (size == 0) return -1;
            var hash = new byte[size];
            if (!NativeMethods.CryptCATAdminCalcHashFromFileHandle2(admin, handle, ref size, hash, 0)) return -1;

            var catInfo = NativeMethods.CryptCATAdminEnumCatalogFromHash(admin, hash, size, 0, IntPtr.Zero);
            if (catInfo == IntPtr.Zero) return -1;
            try
            {
                var ci = new NativeMethods.CATALOG_INFO { cbStruct = (uint)Marshal.SizeOf<NativeMethods.CATALOG_INFO>() };
                if (!NativeMethods.CryptCATCatalogInfoFromContext(catInfo, ref ci, 0)) return -1;
                catalogFile = ci.wszCatalogFile;

                var hashPtr = Marshal.AllocHGlobal(hash.Length);
                Marshal.Copy(hash, 0, hashPtr, hash.Length);
                var cat = new NativeMethods.WINTRUST_CATALOG_INFO
                {
                    cbStruct = (uint)Marshal.SizeOf<NativeMethods.WINTRUST_CATALOG_INFO>(),
                    pcwszCatalogFilePath = ci.wszCatalogFile,
                    pcwszMemberFilePath = path,
                    pcwszMemberTag = Convert.ToHexString(hash),
                    pbCalculatedFileHash = hashPtr,
                    cbCalculatedFileHash = size,
                    hCatAdmin = admin,
                };
                var pCat = Marshal.AllocHGlobal(Marshal.SizeOf(cat));
                Marshal.StructureToPtr(cat, pCat, false);
                try { return Run(NativeMethods.WTD_CHOICE_CATALOG, pCat); }
                finally
                {
                    Marshal.DestroyStructure<NativeMethods.WINTRUST_CATALOG_INFO>(pCat);
                    Marshal.FreeHGlobal(pCat);
                    Marshal.FreeHGlobal(hashPtr);
                }
            }
            finally { NativeMethods.CryptCATAdminReleaseCatalogContext(admin, catInfo, 0); }
        }
        catch (IOException) { return -1; }
        catch (UnauthorizedAccessException) { return -1; }
        finally { NativeMethods.CryptCATAdminReleaseContext(admin, 0); }
    }
}
