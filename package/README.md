# Desktop Portable Packaging Guide

This `package` directory contains the reproducible Windows portable EXE packaging flow for `芙提雅 ONLINE NEXT`.

Current target: v1.0.2.

- Default source web app: this repository root, resolved as `package\..`.
- Default build workspace: `..\fritia_online_next_desktop\v1.0.2\win_x64` next to this repository.
- Final EXE: `dist_v1.0.2\Fritia Online NEXT Ver. 1.0.2 Portable.exe` inside the build workspace.
- Main title: `芙提雅 ONLINE NEXT Ver. 1.0.2 | 青尘工作室`.
- Package icon: `package\favicon.ico`, a 512x512 PNG ICO frame used by `rcedit` for the final EXE.
- Runtime titlebar/taskbar icon: `package\favicon_runtime.ico` multi-size ICO.
- Cache: `%LOCALAPPDATA%\FritiaOnlineNextPortable\1.0.2\app`.
- Save data: `%APPDATA%\fritia-online-next-desktop`.
- Signature: unsigned by default.

## Repository Files

```text
package/
  build-win-portable-v1.0.2.ps1
  build-desktop-v0.9.2.ps1        # compatibility entry, delegates to v1.0.2 script
  favicon.ico                     # final EXE icon
  favicon_runtime.ico             # runtime window/taskbar icon
  portableSplash_1280x720.bmp     # loader splash image
  templates/
    electron-main.v0.9.2.js
    loader-v0.9.2/
      Cargo.toml
      Cargo.lock
      build.rs
      loader.rc
      src/main.rs
```

## Required Tools

Install these before building on a fresh Windows machine:

1. Node.js 20 LTS or newer.
2. Rust stable for Windows MSVC via rustup.
3. Visual Studio Build Tools with the C++ desktop workload.
4. Internet access for the first build, unless a complete `node_modules` seed already exists.

Quick checks:

```powershell
node --version
npm --version
rustc --version
cargo --version
```

## One-Command Build

Open PowerShell in the repository root and run:

```powershell
Set-ExecutionPolicy -Scope Process Bypass -Force
.\package\build-win-portable-v1.0.2.ps1
```

You can override paths explicitly:

```powershell
.\package\build-win-portable-v1.0.2.ps1 `
  -SourceDir "D:\Models\vibe_coding\fritia_online_v3 (dev)" `
  -WorkDir "D:\Models\vibe_coding\fritia_online_next_desktop\v1.0.2\win_x64"
```

The old `build-desktop-v0.9.2.ps1` filename is kept only as a compatibility entry and delegates to the v1.0.2 script.

## What The Script Does

1. Creates the external wrapper workspace.
2. Copies packaging assets from `package` into `WORKDIR\build`.
3. Copies the static web app source into `WORKDIR\app`:
   - `css`
   - `js`
   - `src`
   - `ui`
   - `index.html`, `README.md`, `UI_STYLE.md`, `LICENSE`
4. Copies `package\favicon.ico` into `WORKDIR\app\favicon.ico`.
5. Creates an Electron wrapper `package.json`.
6. Reuses a local `node_modules` seed when available, then falls back to `npm install`.
7. Copies local Three.js into `app\vendor\three`.
8. Rewrites the app import map to local Three.js paths.
9. Rewrites the page `<title>` to the v1.0.2 title.
10. Copies and patches `templates\electron-main.v0.9.2.js`.
11. Copies and patches `templates\loader-v0.9.2` into `WORKDIR\loader\v1.0.2`.
12. Runs Electron Builder as a directory build only.
13. Zips `dist_v1.0.2_build\win-unpacked` into `payload-v1.0.2.zip`.
14. Builds the Rust loader with `cargo build --release --locked`.
15. Applies `build\favicon.ico` to the loader EXE with `rcedit.exe`.
16. Concatenates `loader.exe + payload-v1.0.2.zip + 64-byte footer` into the final portable EXE.

Footer layout:

```text
magic: 16 bytes = FRITIA_PAYLOAD_1
payload offset: u64 little-endian
payload length: u64 little-endian
payload sha256: 32 bytes
```

## Important Rules

Do not use Electron Builder's `portable` target. The final single-file app is the Rust loader plus appended ZIP payload.

Do not call `app.setName(PRODUCT_NAME)` in Electron. The long Chinese title previously caused a crash. The title must only be set through:

- `BrowserWindow.title`
- `win.setTitle(PRODUCT_NAME)`
- page `<title>`

The v1.0.2 loader must not embed Electron into a parent Win32 window. These are intentionally forbidden in the generated loader:

- `SetParent`
- `FRITIA_EMBEDDED_CHILD`
- `forward_to_child`
- keyboard message forwarding such as `WM_KEYDOWN` / `WM_KEYUP`
- IME or character forwarding such as `WM_CHAR` / `WM_IME_*`

The loader startup flow is:

- Sets DPI awareness before creating the splash window.
- Shows the splash window.
- Repaints the splash only during fade-in/fade-out animation frames.
- Holds the fully visible splash as a static frame while extracting or validating the appended ZIP payload.
- Launches Electron as its own normal top-level window with `FRITIA_SPLASH_MODE=1`.
- Waits for Electron to write `FRITIA_READY_SIGNAL_FILE`.
- Fades out the splash.
- Writes `FRITIA_SHOW_SIGNAL_FILE` so Electron can show its own window.
- Exits the loader splash process.

This keeps Windows mouse, keyboard, and IME ownership inside Electron/Chromium after native file pickers. It also fixes splash flicker during self-extraction by avoiding continuous 16 ms invalidation in the static hold phase.

## Verification

Verify final EXE signature:

```powershell
Get-AuthenticodeSignature "..\fritia_online_next_desktop\v1.0.2\win_x64\dist_v1.0.2\Fritia Online NEXT Ver. 1.0.2 Portable.exe"
```

Expected default status:

```text
NotSigned
```

Verify footer:

```powershell
$exe = "..\fritia_online_next_desktop\v1.0.2\win_x64\dist_v1.0.2\Fritia Online NEXT Ver. 1.0.2 Portable.exe"
$fs = [System.IO.File]::OpenRead((Resolve-Path $exe))
try {
  $footer = New-Object byte[] 64
  $fs.Seek(-64, [System.IO.SeekOrigin]::End) | Out-Null
  $fs.Read($footer, 0, 64) | Out-Null
  $offset = [BitConverter]::ToUInt64($footer, 16)
  $length = [BitConverter]::ToUInt64($footer, 24)
  [PSCustomObject]@{
    Magic = [System.Text.Encoding]::ASCII.GetString($footer, 0, 16)
    Offset = $offset
    PayloadLength = $length
    Hash = [BitConverter]::ToString($footer[32..63]).Replace('-', '').ToLowerInvariant()
    ArithmeticOk = ($offset + $length + 64 -eq [uint64]$fs.Length)
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

Verify the generated loader did not reintroduce the embedded-window path:

```powershell
Select-String -LiteralPath "..\fritia_online_next_desktop\v1.0.2\win_x64\loader\v1.0.2\src\main.rs" `
  -Pattern 'SetParent|forward_to_child|FRITIA_EMBEDDED_CHILD|WM_CHAR|WM_IME|WM_KEYDOWN|WM_KEYUP'
```

Expected: no matches.

Verify the self-extraction splash remains static outside fade animation frames:

```powershell
Select-String -LiteralPath "..\fritia_online_next_desktop\v1.0.2\win_x64\loader\v1.0.2\src\main.rs" `
  -Pattern 'let mut repaint|if repaint && phase_from'
```

Expected: both patterns are present.

Manual smoke test:

1. Double-click the final EXE.
2. Splash fades in, remains stable during extraction/loading, then fades out to the game window.
3. The game window title is `芙提雅 ONLINE NEXT Ver. 1.0.2 | 青尘工作室`.
4. Window icon and taskbar icon show the complete icon.
5. Enter operation mode and verify WASD works.
6. Press Esc and verify pointer lock releases.
7. Open a native file picker, for example by changing a wall painting.
8. While the file picker is open, verify the mouse cursor is visible and usable.
9. Close the picker, return to operation mode, switch to a Chinese IME, and press movement keys. No composition text should appear outside the game.
10. Open a panel with a text input and verify Chinese IME composition still works under the focused text field.

## Changing Version Later

For a new version, update all of these together:

- Build script filename and default `Version`.
- Default title byte array and `OutputName`.
- Electron Builder artifact name.
- Loader `APP_VERSION`, title, cache version, and window class name through `Patch-Loader`.
- Output directories, for example `dist_v1.0.3_build` and `dist_v1.0.3`.
- Final EXE name.
- README paths and verification commands.

Keep cache version and output version aligned so old payloads are not mixed with new runtime files.