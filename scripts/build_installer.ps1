# PowerShell script to automate building the DaryCard PC installer with Inno Setup

$workDir = "D:\DARY"
$installerDir = "$workDir\DARY PROGRAM EXE"
$innoUrl = "https://files.jrsoftware.org/is/6/innosetup-6.3.3.exe"
$vcRedistUrl = "https://aka.ms/vs/17/release/vc_redist.x64.exe"

$innoLocal = "$workDir\innosetup-setup.exe"
$vcLocal = "$workDir\vc_redist.x64.exe"
$issPath = "$workDir\scripts\installer.iss"

Write-Host "=========================================" -ForegroundColor Green
Write-Host "   DaryCard PC: Building Setup Installer" -ForegroundColor Green
Write-Host "=========================================" -ForegroundColor Green

# 1. Download Visual C++ Redistributable (to bundle in setup)
if (-not (Test-Path $vcLocal)) {
    Write-Host "[1/4] Downloading Visual C++ 2015-2022 Redistributable (x64)..." -ForegroundColor Yellow
    Invoke-WebRequest -Uri $vcRedistUrl -OutFile $vcLocal
    Write-Host "Download complete: $vcLocal" -ForegroundColor Green
} else {
    Write-Host "[1/4] Visual C++ Redistributable already exists locally." -ForegroundColor Green
}

# 2. Check and locate Inno Setup Compiler
$isccPath = "C:\Program Files (x86)\Inno Setup 6\ISCC.exe"
if (-not (Test-Path $isccPath)) {
    $isccPath = "$env:USERPROFILE\AppData\Local\Programs\Inno Setup 6\ISCC.exe"
}

if (-not (Test-Path $isccPath)) {
    Write-Host "[2/4] Inno Setup compiler not found. Installing..." -ForegroundColor Yellow
    if (-not (Test-Path $innoLocal)) {
        Write-Host "Downloading Inno Setup compiler..." -ForegroundColor Yellow
        Invoke-WebRequest -Uri $innoUrl -OutFile $innoLocal
    }
    Write-Host "Installing Inno Setup silently..." -ForegroundColor Yellow
    Start-Process -FilePath $innoLocal -ArgumentList "/VERYSILENT /SUPPRESSMSGBOXES /NORESTART" -Wait
    Write-Host "Inno Setup installation complete." -ForegroundColor Green
    
    # Re-verify path after installation
    $isccPath = "C:\Program Files (x86)\Inno Setup 6\ISCC.exe"
    if (-not (Test-Path $isccPath)) {
        $isccPath = "$env:USERPROFILE\AppData\Local\Programs\Inno Setup 6\ISCC.exe"
    }
} else {
    Write-Host "[2/4] Inno Setup compiler is already installed at: $isccPath" -ForegroundColor Green
}

# 3. Create Inno Setup script (installer.iss)
Write-Host "[3/4] Creating installer.iss script..." -ForegroundColor Yellow
$issContent = @"
[Setup]
AppName=DaryCard PC
AppVersion=3.0.0
DefaultDirName={commonpf}\DaryCard PC
DefaultGroupName=DaryCard PC
UninstallDisplayIcon={app}\DARY-NFC-Chetec.exe
Compression=lzma2
SolidCompression=yes
OutputDir=$installerDir
OutputBaseFilename=DaryCard-PC-Setup
SetupIconFile=$workDir\nfc-bridge\true_icon.ico
WizardStyle=modern
DisableWelcomePage=no
DisableFinishedPage=no

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"
Name: "bulgarian"; MessagesFile: "compiler:Languages\Bulgarian.isl"

[Files]
Source: "$installerDir\DaryCard PC\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs
Source: "$workDir\vc_redist.x64.exe"; DestDir: "{tmp}"; Flags: deleteafterinstall

[Icons]
Name: "{group}\DaryCard PC"; Filename: "{app}\DARY-NFC-Chetec.exe"
Name: "{autodesktop}\DaryCard PC"; Filename: "{app}\DARY-NFC-Chetec.exe"; IconFilename: "{app}\true_icon.ico"

[Run]
Filename: "{tmp}\vc_redist.x64.exe"; Parameters: "/install /quiet /norestart"; StatusMsg: "Installing Microsoft Visual C++ 2015-2022 Redistributable (x64)..."; Flags: waituntilterminated
Filename: "{app}\DARY-NFC-Chetec.exe"; Description: "Start DaryCard PC"; Flags: nowait postinstall skipifsilent
"@

Set-Content -Path $issPath -Value $issContent -Encoding UTF8
Write-Host "Script created at $issPath" -ForegroundColor Green

# 4. Compile Installer
Write-Host "[4/4] Compiling setup package using ISCC..." -ForegroundColor Yellow
& $isccPath $issPath

# Check result
$finalSetup = "$installerDir\DaryCard-PC-Setup.exe"
if (Test-Path $finalSetup) {
    Write-Host "=========================================" -ForegroundColor Green
    Write-Host " SUCCESS: Setup created successfully!" -ForegroundColor Green
    Write-Host " File: $finalSetup" -ForegroundColor Green
    Write-Host "=========================================" -ForegroundColor Green
    
    # Optional cleanup of downloaded setup
    if (Test-Path $innoLocal) { Remove-Item $innoLocal }
} else {
    Write-Error "Failed to build setup package."
}
