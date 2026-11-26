; Инсталатор на офисната програма DaryCard PC.
; Билд:  1) pyinstaller --noconfirm nfc-bridge\DARY-NFC-Chetec.spec   (от папка nfc-bridge)
;        2) ISCC.exe scripts\installer.iss
; Пътищата са спрямо този файл, не към D:\.
#define AppVer "3.1.0"
#define Root SourcePath + "..\"

[Setup]
AppName=DaryCard PC
AppVersion={#AppVer}
AppPublisher=Dary Commerce
DefaultDirName={commonpf}\DaryCard PC
DefaultGroupName=DaryCard PC
UninstallDisplayIcon={app}\DARY-NFC-Chetec.exe
Compression=lzma2
SolidCompression=yes
OutputDir={#Root}DARY PROGRAM EXE
OutputBaseFilename=DaryCard-PC-Setup-3.1
SetupIconFile={#Root}nfc-bridge\true_icon.ico
WizardStyle=modern
DisableWelcomePage=no
DisableFinishedPage=no

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"
Name: "bulgarian"; MessagesFile: "compiler:Languages\Bulgarian.isl"

[InstallDelete]
; Файловете на предишната версия се махат, за да не останат стари библиотеки.
Type: filesandordirs; Name: "{app}\_internal"

[Files]
Source: "{#Root}nfc-bridge\dist\DARY-NFC-Chetec\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion
Source: "{#Root}nfc-bridge\true_icon.ico"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#Root}vc_redist.x64.exe"; DestDir: "{tmp}"; Flags: deleteafterinstall

[Icons]
Name: "{group}\DaryCard PC"; Filename: "{app}\DARY-NFC-Chetec.exe"; IconFilename: "{app}\true_icon.ico"
Name: "{autodesktop}\DaryCard PC"; Filename: "{app}\DARY-NFC-Chetec.exe"; IconFilename: "{app}\true_icon.ico"

[Run]
Filename: "{tmp}\vc_redist.x64.exe"; Parameters: "/install /quiet /norestart"; StatusMsg: "Installing Microsoft Visual C++ 2015-2022 Redistributable (x64)..."; Flags: waituntilterminated
Filename: "{app}\DARY-NFC-Chetec.exe"; Description: "Start DaryCard PC"; Flags: nowait postinstall skipifsilent
