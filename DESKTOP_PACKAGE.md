# Desktop Portable Packaging Guide

This document is the reproducible packaging guide for `芙提雅 ONLINE NEXT` desktop builds. It is written for a fresh Windows machine where Codex has no prior context and only this source project directory is available.

The current verified target is v0.9.2:

- Final EXE: `Fritia Online NEXT Ver. 0.9.2 Preview Portable.exe`
- Main title: `芙提雅 ONLINE NEXT Ver. 0.9.2 (Preview Version) | 青尘工作室`
- User-visible top-level window: one Rust loader window
- Startup animation: white screen -> BMP fade-in -> static BMP while cache/extract/load happens -> BMP fade-out -> Electron game appears inside the same top-level window
- Initial logical resolution: `1920x1080`
- Cache: `%LOCALAPPDATA%\FritiaOnlineNextPortable\0.9.2\app`
- Save data: `%APPDATA%\fritia-online-next-desktop`
- Signature: unsigned by default

## Repository Files

This source project now contains a `package` folder with all packaging-specific files that must travel with the source code:

```text
package/
  favicon.ico
  favicon_runtime.ico
  portableSplash_1280x720.bmp
  build-desktop-v0.9.2.ps1
  templates/
    electron-main.v0.9.2.js
    loader-v0.9.2/
      Cargo.toml
      Cargo.lock
      build.rs
      loader.rc
      src/main.rs
```

Asset roles:

- `favicon.ico`: used as the final EXE package icon through `rcedit`.
- `favicon_runtime.ico`: clean multi-size ICO used by the Rust loader for the runtime window/taskbar icon. This avoids the earlier cropped titlebar/taskbar icon caused by the original single-layer 256px PNG ICO.
- `portableSplash_1280x720.bmp`: BMP embedded by the Rust loader for the startup fade animation.
- `templates/electron-main.v0.9.2.js`: verified Electron main process for embedded-child mode.
- `templates/loader-v0.9.2`: verified Rust native loader template.
- `build-desktop-v0.9.2.ps1`: reproducible build script.

## Required Tools

Install these before building on a fresh machine:

1. Node.js 20 LTS or newer.
2. Rust stable for Windows MSVC via rustup.
3. Visual Studio Build Tools with the C++ desktop workload, because Rust MSVC target needs the Microsoft linker.
4. Git is useful but not required by the packaging script.
5. Internet access for the first build, because `npm install` and `cargo build` download Electron/npm packages and Rust crates.

Quick checks:

```powershell
node --version
npm --version
rustc --version
cargo --version
```


## Script Encoding Rule

Keep `package\build-desktop-v0.9.2.ps1` ASCII-only. Windows PowerShell 5.1 may parse UTF-8 no-BOM `.ps1` files as the system ANSI code page on a fresh machine. Literal Chinese strings in the `param()` block can break parsing. The script intentionally stores the default Chinese title and product name as UTF-8 byte arrays and decodes them at runtime. Do not replace those byte arrays with direct Chinese string literals unless the script is also saved with a BOM or the target shell is guaranteed to be PowerShell 7+.

## One-Command Build

Open PowerShell in the project root and run:

```powershell
Set-ExecutionPolicy -Scope Process Bypass -Force
.\package\build-desktop-v0.9.2.ps1
```

By default the script creates an external packaging workspace next to this project:

```text
..\fritia_online_next_desktop\v1.0.0
```

The final EXE is written to:

```text
..\fritia_online_next_desktop\v1.0.0\dist_v0.9.2\Fritia Online NEXT Ver. 0.9.2 Preview Portable.exe
```

You can override the workspace:

```powershell
.\package\build-desktop-v0.9.2.ps1 -WorkDir "D:\Models\vibe_coding\fritia_online_next_desktop\v1.0.0"
```

## What The Script Does

1. Creates the external wrapper workspace.
2. Copies packaging assets from `package` into `WORKDIR\build`.
3. Copies the web app source folders into `WORKDIR\app`:
   - `css`
   - `js`
   - `src`
   - `ui`
   - selected root files such as `index.html`, `favicon.ico`, `README.md`, `UI_STYLE.md`, `LICENSE`
4. Creates a wrapper `package.json` for Electron.
5. Runs `npm install` in the wrapper workspace.
6. Copies local Three.js from `node_modules\three` into `app\vendor\three`.
7. Rewrites the app import map in `app\index.html` to use local Three.js, not CDN URLs.
8. Rewrites the page `<title>` to the v0.9.2 title.
9. Copies the verified Electron main template to `WORKDIR\electron-main.js`.
10. Copies the verified Rust loader template to `WORKDIR\loader\v0.9.2`.
11. Runs Electron Builder only as a directory build:

```powershell
npx electron-builder --win dir --x64 --config.directories.output=dist_v0.9.2_build
```

12. Zips `dist_v0.9.2_build\win-unpacked` into `payload-v0.9.2.zip`.
13. Builds the Rust loader:

```powershell
cargo build --release
```

14. Applies `build\favicon.ico` to the loader EXE with `rcedit.exe`.
15. Creates the final single-file portable EXE by concatenating:

```text
loader.exe + payload-v0.9.2.zip + 64-byte footer
```

Footer layout:

```text
magic: 16 bytes = FRITIA_PAYLOAD_1
payload offset: u64 little-endian
payload length: u64 little-endian
payload sha256: 32 bytes
```

## Important Implementation Details

Do not use `electron-builder` portable target for this build. The final entry is the Rust loader, not NSIS portable.

Do not call `app.setName(PRODUCT_NAME)` in Electron. The long Chinese title previously caused a crash in this project. The title is set only by:

- `BrowserWindow.title`
- `win.setTitle(PRODUCT_NAME)`
- page `<title>`

The Rust loader does these important things:

- Sets process DPI awareness before creating the window.
- Creates a normal top-level window with a `1920x1080` client target.
- Paints a white first frame.
- Fades in `portableSplash_1280x720.bmp` over 900 ms.
- Extracts or validates the appended ZIP payload in the background.
- Launches Electron with these environment variables:
  - `FRITIA_EMBEDDED_CHILD=1`
  - `FRITIA_PARENT_HWND`
  - `FRITIA_HWND_FILE`
  - `FRITIA_SHOW_SIGNAL_FILE`
  - `PORTABLE_EXECUTABLE_DIR`
  - `PORTABLE_EXECUTABLE_FILE`
  - `PORTABLE_EXECUTABLE_APP_FILENAME`
- Removes `ELECTRON_RUN_AS_NODE` from the child environment.
- Waits for Electron to write its native HWND.
- Calls `SetParent` and converts Electron to a child window.
- Resizes the child HWND to fill the loader client area.
- Fades out the BMP over 650 ms.
- Shows Electron only after fade-out finishes.
- Uses `AttachThreadInput + SetFocus` so WASD and pointer lock work correctly.
- Writes `favicon_runtime.ico` to `%LOCALAPPDATA%\FritiaOnlineNextPortable\icon-cache\favicon_runtime_<hash>.ico` and uses it for `ICON_BIG`, `ICON_SMALL`, and `ICON_SMALL2`.

## Cache Behavior

The loader extracts Electron to:

```text
%LOCALAPPDATA%\FritiaOnlineNextPortable\0.9.2\app
```

It writes:

```text
%LOCALAPPDATA%\FritiaOnlineNextPortable\0.9.2\manifest.json
```

The cache is reused only when version, payload hash, and main executable path match.

To force a clean extraction:

```powershell
& "..\fritia_online_next_desktop\v1.0.0\dist_v0.9.2\Fritia Online NEXT Ver. 0.9.2 Preview Portable.exe" --clear-cache
```

Clearing this cache does not delete user saves. Saves are under:

```text
%APPDATA%\fritia-online-next-desktop
```

## Verification

After building, run these checks.

Signature should be unsigned unless you intentionally sign it:

```powershell
Get-AuthenticodeSignature "..\fritia_online_next_desktop\v1.0.0\dist_v0.9.2\Fritia Online NEXT Ver. 0.9.2 Preview Portable.exe"
```

Expected status:

```text
NotSigned
```

Verify footer:

```powershell
$exe = "..\fritia_online_next_desktop\v1.0.0\dist_v0.9.2\Fritia Online NEXT Ver. 0.9.2 Preview Portable.exe"
$fs = [System.IO.File]::OpenRead((Resolve-Path $exe))
try {
  $footer = New-Object byte[] 64
  $fs.Seek(-64, [System.IO.SeekOrigin]::End) | Out-Null
  $fs.Read($footer, 0, 64) | Out-Null
  [PSCustomObject]@{
    Magic = [System.Text.Encoding]::ASCII.GetString($footer, 0, 16)
    Offset = [BitConverter]::ToUInt64($footer, 16)
    PayloadLength = [BitConverter]::ToUInt64($footer, 24)
    Hash = [BitConverter]::ToString($footer[32..63]).Replace('-', '').ToLowerInvariant()
    ArithmeticOk = ([BitConverter]::ToUInt64($footer, 16) + [BitConverter]::ToUInt64($footer, 24) + 64 -eq $fs.Length)
  }
} finally {
  $fs.Dispose()
}
```

Expected:

```text
Magic = FRITIA_PAYLOAD_1
ArithmeticOk = True
```

Manual smoke test:

1. Double-click the final EXE.
2. A top-level window should appear quickly.
3. The window should start white, fade into the BMP, wait, then fade into the game.
4. No second visible Electron window should appear.
5. The titlebar should show `芙提雅 ONLINE NEXT Ver. 0.9.2 (Preview Version) | 青尘工作室`.
6. The window icon and taskbar icon should show the complete icon, not a cropped upper half.
7. The game should fill the whole window.
8. Click into the game, enter operation mode, and verify WASD works.
9. Press Esc and verify pointer lock releases.

On a 125% Windows display scale, the Win32 physical client area for a `1920x1080` DPI-aware logical window may probe as `1536x864`. That is expected. The important condition is that the Electron child HWND fills the loader client area.

## Common Problems

### Window icon is cropped

Use `package\favicon_runtime.ico` for runtime window icons. Do not rely on the original `favicon.ico` for `WM_SETICON`. The original icon is a single 256px PNG layer and can produce bad small-icon scaling in the titlebar/taskbar.

If Windows keeps showing a stale icon, delete:

```text
%LOCALAPPDATA%\FritiaOnlineNextPortable\icon-cache
```

Then rebuild or relaunch.

### Game is blurry or only in the upper-left area

The Rust loader must set DPI awareness before creating the top-level window, and the Electron child HWND must be resized to the parent client area after `SetParent`. Use the checked-in `loader-v0.9.2` template instead of recreating this logic by memory.

### WASD does not work or mouse cannot be released

The loader must transfer focus to the Electron child with `AttachThreadInput + SetFocus`. It should also forward keyboard messages received by the parent window. Use the checked-in loader template.

### Electron exits immediately

Clear `ELECTRON_RUN_AS_NODE` before tests or rely on the loader template, which removes it for the Electron child process.

```powershell
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
```

### Long Chinese title crashes

Do not call `app.setName(PRODUCT_NAME)`. Only use BrowserWindow title, `win.setTitle`, and HTML `<title>`.

## Changing Version Later

For a new version, update all of these together:

- `Version` parameter in `build-desktop-v0.9.2.ps1`
- output directories, for example `dist_v0.9.3_build` and `dist_v0.9.3`
- loader `APP_VERSION`
- loader temp/cache names if desired
- title string
- final EXE name
- Electron main title
- package artifact name

Keep cache version and output version aligned so old payloads are not mixed with new runtime files.
