; NEXUS OPTIMIZER - Inno Setup 6 script.
; Per-user installation: the installer itself does NOT require administrator rights (least privilege).
; Build first with: pwsh installer\publish.ps1

#define AppName "NEXUS OPTIMIZER"
#define AppVersion "1.0.0"
#define Source "..\publish\NexusOptimizer"

[Setup]
AppId={{6C3E2A4F-9B1D-4E8A-A7C2-5D0F1B2E9A11}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher=Nexus Optimizer
DefaultDirName={localappdata}\Programs\NexusOptimizer
DefaultGroupName={#AppName}
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir=..\publish
OutputBaseFilename=NexusOptimizer-Setup-{#AppVersion}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
UninstallDisplayIcon={app}\NexusOptimizer.exe

[Files]
Source: "{#Source}\*"; DestDir: "{app}"; Flags: recursesubdirs ignoreversion

[Icons]
Name: "{group}\{#AppName}"; Filename: "{app}\NexusOptimizer.exe"
Name: "{group}\{#AppName} (simulation mode)"; Filename: "{app}\NexusOptimizer.exe"; Parameters: "--simulate"
Name: "{group}\Uninstall {#AppName}"; Filename: "{uninstallexe}"

[Run]
Filename: "{app}\NexusOptimizer.exe"; Description: "Launch {#AppName}"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
; User data (database, backups, quarantine) lives in %LOCALAPPDATA%\NexusOptimizer and is intentionally kept:
; it contains the rollback history. Remove it manually if you no longer need it.
Type: filesandordirs; Name: "{app}\tools"
