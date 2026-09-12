# -*- mode: python ; coding: utf-8 -*-


a = Analysis(
    ['backend/api.py'],
    pathex=[],
    binaries=[],
    datas=[],
    hiddenimports=[
        'fastapi',
        'uvicorn',
        'uvicorn.logging',
        'uvicorn.lifespan.on',
        'pydantic',
        'pydantic_core',
        'starlette',
        'starlette.routing',
        'httpx',
        'tenacity',
        'supabase',
        'mammoth',
        'markdownify',
        'dotenv',
        'multipart',           # if used
        'email',               # sometimes needed
        'yaml',                # if used
        'asyncio',
        'typing',
    ],
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
    a.binaries,
    a.datas,
    [],
    name='momobot_backend',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
