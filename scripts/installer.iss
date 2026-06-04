[Setup]
AppName=DaryCard PC
AppVersion=3.0.0
DefaultDirName={commonpf}\DaryCard PC
DefaultGroupName=DaryCard PC
UninstallDisplayIcon={app}\DARY-NFC-Chetec.exe
Compression=lzma2
SolidCompression=yes
OutputDir=D:\DARY\DARY PROGRAM EXE
OutputBaseFilename=DaryCard-PC-Setup
SetupIconFile=D:\DARY\nfc-bridge\true_icon.ico
WizardStyle=modern
DisableWelcomePage=no
DisableFinishedPage=no

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"
Name: "bulgarian"; MessagesFile: "compiler:Languages\Bulgarian.isl"

[Files]
Source: "D:\DARY\DARY PROGRAM EXE\DaryCard PC\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs
Source: "D:\DARY\nfc-bridge\true_icon.ico"; DestDir: "{app}"
Source: "D:\DARY\vc_redist.x64.exe"; DestDir: "{tmp}"; Flags: deleteafterinstall

[Icons]
Name: "{group}\DaryCard PC"; Filename: "{app}\DARY-NFC-Chetec.exe"; IconFilename: "{app}\true_icon.ico"
Name: "{autodesktop}\DaryCard PC"; Filename: "{app}\DARY-NFC-Chetec.exe"; IconFilename: "{app}\true_icon.ico"

[Run]
Filename: "{tmp}\vc_redist.x64.exe"; Parameters: "/install /quiet /norestart"; StatusMsg: "Installing Microsoft Visual C++ 2015-2022 Redistributable (x64)..."; Flags: waituntilterminated
Filename: "{app}\DARY-NFC-Chetec.exe"; Description: "Start DaryCard PC"; Flags: nowait postinstall skipifsilent
