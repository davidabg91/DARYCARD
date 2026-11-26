# -*- mode: python ; coding: utf-8 -*-
# Билд:  pyinstaller --noconfirm nfc-bridge/DARY-NFC-Chetec.spec
# Пътищата са спрямо папката на този файл (SPECPATH), не към D:\.
import os

HERE = SPECPATH

a = Analysis(
    [os.path.join(HERE, 'bridge.py')],
    pathex=[],
    binaries=[],
    # cards.txt — отпечатаните номера на първите 1000 карти. Преди не влизаше
    # в инсталатора и програмата показваше „Заредени: 0 бр.“.
    datas=[
        (os.path.join(HERE, 'true_icon.ico'), '.'),
        (os.path.join(HERE, 'cards.txt'), '.'),
    ],
    hiddenimports=[],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='DARY-NFC-Chetec',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=[os.path.join(HERE, 'true_icon.ico')],
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='DARY-NFC-Chetec',
)
