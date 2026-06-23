#![windows_subsystem = "windows"]

use sha2::{Digest, Sha256};
use std::ffi::{c_void, OsStr};
use std::fs::{self, File};
use std::io::{self, Cursor, Read, Seek, SeekFrom, Write};
use std::mem::size_of;
use std::os::windows::ffi::OsStrExt;
use std::path::{Path, PathBuf};
use std::process::{Child, Command};
use std::sync::atomic::{AtomicBool, AtomicI64, AtomicU32, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::thread;
use std::time::{Duration, Instant};
use windows::core::PCWSTR;
use windows::Win32::Foundation::{COLORREF, HINSTANCE, HWND, LPARAM, LRESULT, RECT, WPARAM};
use windows::Win32::Graphics::Gdi::{
    AlphaBlend, BeginPaint, CreateCompatibleDC, CreateDIBSection, CreateSolidBrush,
    DeleteDC, DeleteObject, EndPaint, FillRect, InvalidateRect, SelectObject, StretchDIBits,
    AC_SRC_OVER, BITMAPINFO, BI_RGB, BLENDFUNCTION, DIB_RGB_COLORS, HBITMAP, HBRUSH, HDC,
    PAINTSTRUCT, RGBQUAD, SRCCOPY,
};
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::System::Threading::{AttachThreadInput, GetCurrentThreadId};
use windows::Win32::UI::HiDpi::{
    AdjustWindowRectExForDpi, DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2, GetDpiForSystem,
    GetDpiForWindow, GetSystemMetricsForDpi, SetProcessDpiAwarenessContext,
};
use windows::Win32::UI::Input::KeyboardAndMouse::SetFocus;
use windows::Win32::UI::WindowsAndMessaging::{
    AdjustWindowRectEx, BringWindowToTop, CreateWindowExW, DefWindowProcW, DestroyWindow,
    DispatchMessageW, GetClientRect, GetMessageW, GetSystemMetrics, GetWindowLongPtrW,
    GetWindowThreadProcessId, HICON, LoadCursorW, LoadImageW, MA_ACTIVATE,
    MessageBoxW, PostMessageW, PostQuitMessage, RegisterClassW, SendMessageW,
    SetForegroundWindow, SetParent, SetProcessDPIAware, SetTimer, SetWindowLongPtrW,
    SetWindowPos, ShowWindow, TranslateMessage, GWL_STYLE, IDC_ARROW, ICON_BIG, ICON_SMALL,
    IMAGE_ICON, LR_LOADFROMFILE, MB_ICONERROR, MB_OK, MSG, SM_CXSCREEN, SM_CXSMICON,
    SM_CYSCREEN, SM_CYSMICON, SW_HIDE, SW_SHOW, SWP_FRAMECHANGED, SWP_NOMOVE,
    SWP_NOSIZE, SWP_NOACTIVATE, SWP_NOZORDER, WM_CLOSE, WM_DESTROY,
    WM_DPICHANGED, WM_ERASEBKGND, WM_KEYDOWN, WM_KEYUP, WM_LBUTTONDOWN,
    WM_MOUSEACTIVATE, WM_PAINT, WM_SETFOCUS, WM_SETICON, WM_SIZE, WM_SYSKEYDOWN,
    WM_SYSKEYUP, WM_TIMER, WNDCLASSW, WS_CHILD, WS_CLIPCHILDREN, WS_CLIPSIBLINGS,
    WS_EX_APPWINDOW, WS_EX_WINDOWEDGE, WS_OVERLAPPEDWINDOW,
};

const APP_VERSION: &str = "0.9.2";
const APP_EXE: &str = "芙提雅 ONLINE NEXT.exe";
const TITLE: &str = "芙提雅 ONLINE NEXT Ver. 0.9.2 (Preview Version) | 青尘工作室";
const FOOTER_MAGIC: &[u8; 16] = b"FRITIA_PAYLOAD_1";
const FOOTER_SIZE: usize = 16 + 8 + 8 + 32;
const WINDOW_W: i32 = 1920;
const WINDOW_H: i32 = 1080;
const FADE_IN_MS: u32 = 900;
const FADE_OUT_MS: u32 = 650;
const WM_READY_TO_FADE: u32 = 0x0400 + 1;
const WM_ERROR: u32 = 0x0400 + 2;
const SPLASH_BMP: &[u8] = include_bytes!("../../../build/portableSplash_1280x720.bmp");
const RUNTIME_ICON_ICO: &[u8] = include_bytes!("../../../build/favicon_runtime.ico");

#[derive(Clone)]
struct UiState {
    phase: Arc<AtomicU32>,
    fade_start_ms: Arc<AtomicU32>,
    electron_hwnd: Arc<AtomicI64>,
    child_pid: Arc<AtomicU32>,
    show_signal_file: Arc<Mutex<Option<PathBuf>>>,
    error: Arc<Mutex<Option<String>>>,
    keep_loader: Arc<AtomicBool>,
}

struct AppUi {
    state: UiState,
    splash: Mutex<Option<SplashBitmap>>,
    start: Instant,
}

struct SplashBitmap {
    mem_dc: HDC,
    bitmap: HBITMAP,
    old_bitmap: windows::Win32::Graphics::Gdi::HGDIOBJ,
    width: i32,
    height: i32,
}

unsafe impl Send for SplashBitmap {}
unsafe impl Sync for SplashBitmap {}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Phase {
    FadeIn = 0,
    Hold = 1,
    FadeOut = 2,
    Embedded = 3,
    Error = 4,
}

static UI: OnceLock<AppUi> = OnceLock::new();

fn wide_nul(value: &str) -> Vec<u16> {
    OsStr::new(value).encode_wide().chain(Some(0)).collect()
}

fn color(r: u8, g: u8, b: u8) -> COLORREF {
    COLORREF(r as u32 | ((g as u32) << 8) | ((b as u32) << 16))
}

fn phase_from(value: u32) -> Phase {
    match value {
        0 => Phase::FadeIn,
        1 => Phase::Hold,
        2 => Phase::FadeOut,
        3 => Phase::Embedded,
        4 => Phase::Error,
        _ => Phase::Error,
    }
}

fn ease_in_out(t: f32) -> f32 {
    let t = t.clamp(0.0, 1.0);
    t * t * (3.0 - 2.0 * t)
}

fn set_phase(state: &UiState, phase: Phase, elapsed_ms: u32) {
    state.phase.store(phase as u32, Ordering::Relaxed);
    state.fade_start_ms.store(elapsed_ms, Ordering::Relaxed);
}

unsafe fn configure_dpi_awareness() {
    if SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2).is_err() {
        let _ = SetProcessDPIAware();
    }
}

unsafe fn current_dpi(hwnd: Option<HWND>) -> u32 {
    let dpi = match hwnd {
        Some(value) => GetDpiForWindow(value),
        None => GetDpiForSystem(),
    };
    if dpi == 0 { 96 } else { dpi }
}

fn scaled_icon_size(base: i32, dpi: u32) -> i32 {
    ((base as u32 * dpi + 48) / 96).max(1) as i32
}
fn local_app_data() -> PathBuf {
    std::env::var_os("LOCALAPPDATA").map(PathBuf::from).unwrap_or_else(std::env::temp_dir)
}

fn cache_root() -> PathBuf {
    local_app_data().join("FritiaOnlineNextPortable").join(APP_VERSION)
}

fn app_dir() -> PathBuf {
    cache_root().join("app")
}

fn manifest_path() -> PathBuf {
    cache_root().join("manifest.json")
}

fn current_exe() -> io::Result<PathBuf> {
    std::env::current_exe()
}

fn find_payload() -> io::Result<(u64, u64, [u8; 32])> {
    let mut file = File::open(current_exe()?)?;
    let len = file.metadata()?.len();
    if len < FOOTER_SIZE as u64 {
        return Err(io::Error::new(io::ErrorKind::InvalidData, "portable payload footer missing"));
    }
    file.seek(SeekFrom::End(-(FOOTER_SIZE as i64)))?;
    let mut footer = [0u8; FOOTER_SIZE];
    file.read_exact(&mut footer)?;
    if &footer[0..16] != FOOTER_MAGIC {
        return Err(io::Error::new(io::ErrorKind::InvalidData, "portable payload magic mismatch"));
    }
    let offset = u64::from_le_bytes(footer[16..24].try_into().unwrap());
    let size = u64::from_le_bytes(footer[24..32].try_into().unwrap());
    let mut hash = [0u8; 32];
    hash.copy_from_slice(&footer[32..64]);
    if offset.checked_add(size).unwrap_or(0) + FOOTER_SIZE as u64 != len {
        return Err(io::Error::new(io::ErrorKind::InvalidData, "portable payload size mismatch"));
    }
    Ok((offset, size, hash))
}

fn read_payload(offset: u64, size: u64, expected_hash: &[u8; 32]) -> io::Result<Vec<u8>> {
    let mut file = File::open(current_exe()?)?;
    file.seek(SeekFrom::Start(offset))?;
    let mut remaining = size;
    let mut data = Vec::with_capacity(size as usize);
    let mut hasher = Sha256::new();
    let mut buf = vec![0u8; 1024 * 1024];
    while remaining > 0 {
        let read_len = buf.len().min(remaining as usize);
        file.read_exact(&mut buf[..read_len])?;
        hasher.update(&buf[..read_len]);
        data.extend_from_slice(&buf[..read_len]);
        remaining -= read_len as u64;
    }
    let actual = hasher.finalize();
    if actual.as_slice() != expected_hash {
        return Err(io::Error::new(io::ErrorKind::InvalidData, "portable payload hash mismatch"));
    }
    Ok(data)
}

fn manifest_matches(expected_hash: &[u8; 32]) -> bool {
    let manifest = match fs::read_to_string(manifest_path()) {
        Ok(value) => value,
        Err(_) => return false,
    };
    let hash_hex = hex::encode(expected_hash);
    manifest.contains(&format!("\"version\":\"{}\"", APP_VERSION))
        && manifest.contains(&format!("\"payloadHash\":\"{}\"", hash_hex))
        && app_dir().join(APP_EXE).is_file()
}

fn write_manifest(expected_hash: &[u8; 32]) -> io::Result<()> {
    fs::create_dir_all(cache_root())?;
    let manifest = format!(
        "{{\"version\":\"{}\",\"payloadHash\":\"{}\",\"mainExecutable\":\"{}\"}}",
        APP_VERSION,
        hex::encode(expected_hash),
        APP_EXE
    );
    fs::write(manifest_path(), manifest)
}

fn clear_cache() -> io::Result<()> {
    let root = cache_root();
    if root.exists() {
        fs::remove_dir_all(root)?;
    }
    Ok(())
}

fn safe_zip_path(name: &str) -> Option<PathBuf> {
    let path = Path::new(name);
    if path.is_absolute() {
        return None;
    }
    let mut out = PathBuf::new();
    for comp in path.components() {
        match comp {
            std::path::Component::Normal(part) => out.push(part),
            _ => return None,
        }
    }
    Some(out)
}

fn extract_payload(data: Vec<u8>, expected_hash: &[u8; 32]) -> io::Result<()> {
    if cache_root().exists() {
        fs::remove_dir_all(cache_root())?;
    }
    fs::create_dir_all(app_dir())?;
    let cursor = Cursor::new(data);
    let mut archive = zip::ZipArchive::new(cursor).map_err(zip_err)?;
    let mut buffer = vec![0u8; 256 * 1024];
    for i in 0..archive.len() {
        let mut file = archive.by_index(i).map_err(zip_err)?;
        let Some(rel) = safe_zip_path(file.name()) else { continue; };
        let out = app_dir().join(rel);
        if file.is_dir() {
            fs::create_dir_all(&out)?;
            continue;
        }
        if let Some(parent) = out.parent() {
            fs::create_dir_all(parent)?;
        }
        let mut writer = File::create(&out)?;
        loop {
            let n = file.read(&mut buffer)?;
            if n == 0 {
                break;
            }
            writer.write_all(&buffer[..n])?;
        }
    }
    write_manifest(expected_hash)
}

fn zip_err(error: zip::result::ZipError) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, error.to_string())
}

fn temp_embed_dir() -> io::Result<PathBuf> {
    let mut dir = std::env::temp_dir();
    dir.push(format!("fritia_embed_{}_{}", std::process::id(), APP_VERSION.replace('.', "_")));
    fs::create_dir_all(&dir)?;
    Ok(dir)
}

fn launch_app(hwnd_raw: isize, state: &UiState) -> io::Result<Child> {
    let exe = app_dir().join(APP_EXE);
    let portable_file = current_exe()?;
    let portable_dir = portable_file.parent().unwrap_or(Path::new("")).to_path_buf();
    let embed_dir = temp_embed_dir()?;
    let hwnd_file = embed_dir.join("electron.hwnd");
    let signal_file = embed_dir.join("show.signal");
    let _ = fs::remove_file(&hwnd_file);
    let _ = fs::remove_file(&signal_file);
    if let Ok(mut guard) = state.show_signal_file.lock() {
        *guard = Some(signal_file.clone());
    }

    let mut command = Command::new(&exe);
    command.current_dir(app_dir());
    command.env("PORTABLE_EXECUTABLE_DIR", portable_dir);
    command.env("PORTABLE_EXECUTABLE_FILE", portable_file);
    command.env("PORTABLE_EXECUTABLE_APP_FILENAME", APP_EXE);
    command.env("FRITIA_EMBEDDED_CHILD", "1");
    command.env("FRITIA_PARENT_HWND", hwnd_raw.to_string());
    command.env("FRITIA_HWND_FILE", hwnd_file.as_os_str());
    command.env("FRITIA_SHOW_SIGNAL_FILE", signal_file.as_os_str());
    command.env_remove("ELECTRON_RUN_AS_NODE");
    let child = command.spawn()?;
    state.child_pid.store(child.id(), Ordering::Relaxed);
    Ok(child)
}

fn wait_for_hwnd_file(state: &UiState) -> io::Result<isize> {
    let signal_file = state.show_signal_file.lock().ok().and_then(|guard| guard.clone())
        .ok_or_else(|| io::Error::new(io::ErrorKind::NotFound, "embedded signal file not configured"))?;
    let hwnd_file = signal_file.with_file_name("electron.hwnd");
    let start = Instant::now();
    loop {
        if hwnd_file.is_file() {
            let raw = fs::read_to_string(&hwnd_file)?;
            let trimmed = raw.trim();
            let parsed = trimmed.parse::<u64>()
                .map_err(|_| io::Error::new(io::ErrorKind::InvalidData, "invalid electron hwnd"))?;
            return Ok(parsed as isize);
        }
        if start.elapsed() > Duration::from_secs(30) {
            return Err(io::Error::new(io::ErrorKind::TimedOut, "timed out waiting for electron hwnd"));
        }
        thread::sleep(Duration::from_millis(25));
    }
}

fn prepare_cache_and_launch(state: UiState, hwnd_raw: isize, clear: bool) {
    let result = (|| -> io::Result<()> {
        if clear {
            clear_cache()?;
        }
        let (offset, size, hash) = find_payload()?;
        if !manifest_matches(&hash) {
            let data = read_payload(offset, size, &hash)?;
            extract_payload(data, &hash)?;
        }
        let _child = launch_app(hwnd_raw, &state)?;
        let electron = wait_for_hwnd_file(&state)?;
        state.electron_hwnd.store(electron as i64, Ordering::Relaxed);
        unsafe { let _ = PostMessageW(Some(HWND(hwnd_raw as *mut c_void)), WM_READY_TO_FADE, WPARAM(0), LPARAM(0)); }
        Ok(())
    })();

    if let Err(error) = result {
        if let Ok(mut guard) = state.error.lock() {
            *guard = Some(error.to_string());
        }
        state.keep_loader.store(true, Ordering::Relaxed);
        unsafe { let _ = PostMessageW(Some(HWND(hwnd_raw as *mut c_void)), WM_ERROR, WPARAM(0), LPARAM(0)); }
    }
}

fn parse_bmp() -> Option<(i32, i32, usize, usize)> {
    if SPLASH_BMP.len() < 54 || &SPLASH_BMP[0..2] != b"BM" {
        return None;
    }
    let offset = u32::from_le_bytes(SPLASH_BMP[10..14].try_into().ok()?) as usize;
    let width = i32::from_le_bytes(SPLASH_BMP[18..22].try_into().ok()?);
    let height = i32::from_le_bytes(SPLASH_BMP[22..26].try_into().ok()?);
    let planes = u16::from_le_bytes(SPLASH_BMP[26..28].try_into().ok()?);
    let bits = u16::from_le_bytes(SPLASH_BMP[28..30].try_into().ok()?);
    let compression = u32::from_le_bytes(SPLASH_BMP[30..34].try_into().ok()?);
    if width <= 0 || height == 0 || planes != 1 || bits != 24 || compression != 0 || offset >= SPLASH_BMP.len() {
        return None;
    }
    let row_stride = (((width as usize * 3) + 3) / 4) * 4;
    Some((width, height.abs(), offset, row_stride))
}

unsafe fn create_splash_bitmap() -> Option<SplashBitmap> {
    let (width, height, offset, src_stride) = parse_bmp()?;
    let mut bmi = BITMAPINFO::default();
    bmi.bmiHeader.biSize = size_of::<windows::Win32::Graphics::Gdi::BITMAPINFOHEADER>() as u32;
    bmi.bmiHeader.biWidth = width;
    bmi.bmiHeader.biHeight = -height;
    bmi.bmiHeader.biPlanes = 1;
    bmi.bmiHeader.biBitCount = 32;
    bmi.bmiHeader.biCompression = BI_RGB.0;
    bmi.bmiColors = [RGBQUAD::default(); 1];

    let mut bits: *mut c_void = std::ptr::null_mut();
    let bitmap = CreateDIBSection(None, &bmi, DIB_RGB_COLORS, &mut bits, None, 0).ok()?;
    if bits.is_null() {
        let _ = DeleteObject(bitmap.into());
        return None;
    }

    let dest = std::slice::from_raw_parts_mut(bits as *mut u8, (width as usize) * (height as usize) * 4);
    for y in 0..height as usize {
        let src_y = height as usize - 1 - y;
        let src = offset + src_y * src_stride;
        for x in 0..width as usize {
            let s = src + x * 3;
            let d = (y * width as usize + x) * 4;
            dest[d] = SPLASH_BMP[s];
            dest[d + 1] = SPLASH_BMP[s + 1];
            dest[d + 2] = SPLASH_BMP[s + 2];
            dest[d + 3] = 255;
        }
    }

    let mem_dc = CreateCompatibleDC(None);
    if mem_dc.is_invalid() {
        let _ = DeleteObject(bitmap.into());
        return None;
    }
    let old_bitmap = SelectObject(mem_dc, bitmap.into());
    Some(SplashBitmap { mem_dc, bitmap, old_bitmap, width, height })
}

unsafe fn destroy_splash_bitmap(splash: &SplashBitmap) {
    let _ = SelectObject(splash.mem_dc, splash.old_bitmap);
    let _ = DeleteObject(splash.bitmap.into());
    let _ = DeleteDC(splash.mem_dc);
}

unsafe fn draw_splash(hdc: HDC, rect: RECT, alpha: u8) {
    let white = CreateSolidBrush(color(255, 255, 255));
    let _ = FillRect(hdc, &rect, white);
    let _ = DeleteObject(white.into());

    if alpha == 0 {
        return;
    }

    if let Some(ui) = UI.get() {
        if let Ok(guard) = ui.splash.lock() {
            if let Some(splash) = guard.as_ref() {
                let blend = BLENDFUNCTION {
                    BlendOp: AC_SRC_OVER as u8,
                    BlendFlags: 0,
                    SourceConstantAlpha: alpha,
                    AlphaFormat: 0,
                };
                let w = (rect.right - rect.left).max(1);
                let h = (rect.bottom - rect.top).max(1);
                let _ = AlphaBlend(hdc, 0, 0, w, h, splash.mem_dc, 0, 0, splash.width, splash.height, blend);
                return;
            }
        }
    }

    if let Some((width, height, offset, _)) = parse_bmp() {
        let mut bmi = BITMAPINFO::default();
        bmi.bmiHeader.biSize = size_of::<windows::Win32::Graphics::Gdi::BITMAPINFOHEADER>() as u32;
        bmi.bmiHeader.biWidth = width;
        bmi.bmiHeader.biHeight = height;
        bmi.bmiHeader.biPlanes = 1;
        bmi.bmiHeader.biBitCount = 24;
        bmi.bmiHeader.biCompression = BI_RGB.0;
        bmi.bmiColors = [RGBQUAD::default(); 1];
        let bits = SPLASH_BMP.as_ptr().add(offset) as *const c_void;
        StretchDIBits(hdc, 0, 0, rect.right - rect.left, rect.bottom - rect.top, 0, 0, width, height, Some(bits), &bmi, DIB_RGB_COLORS, SRCCOPY);
    }
}

unsafe fn electron_child_hwnd() -> Option<HWND> {
    let ui = UI.get()?;
    let child = ui.state.electron_hwnd.load(Ordering::Relaxed);
    if child == 0 {
        None
    } else {
        Some(HWND(child as isize as *mut c_void))
    }
}

unsafe fn resize_child(hwnd: HWND) {
    let Some(child_hwnd) = electron_child_hwnd() else { return; };
    let mut rect = RECT::default();
    if GetClientRect(hwnd, &mut rect).is_ok() {
        let width = (rect.right - rect.left).max(1);
        let height = (rect.bottom - rect.top).max(1);
        let _ = SetWindowPos(
            child_hwnd,
            None,
            0,
            0,
            width,
            height,
            SWP_NOZORDER | SWP_NOACTIVATE,
        );
    }
}

unsafe fn focus_child(parent: HWND) {
    let Some(child_hwnd) = electron_child_hwnd() else { return; };
    let _ = SetForegroundWindow(parent);

    let current_thread = GetCurrentThreadId();
    let child_thread = GetWindowThreadProcessId(child_hwnd, None);
    let attached = child_thread != 0
        && child_thread != current_thread
        && AttachThreadInput(current_thread, child_thread, true).as_bool();

    let _ = BringWindowToTop(child_hwnd);
    let _ = SetFocus(Some(child_hwnd));

    if attached {
        let _ = AttachThreadInput(current_thread, child_thread, false);
    }
}

unsafe fn forward_to_child(msg: u32, wparam: WPARAM, lparam: LPARAM) -> bool {
    let Some(child_hwnd) = electron_child_hwnd() else { return false; };
    PostMessageW(Some(child_hwnd), msg, wparam, lparam).is_ok()
}
unsafe fn embed_child(parent: HWND, child_raw: i64) -> io::Result<()> {
    let child = HWND(child_raw as isize as *mut c_void);
    let _ = ShowWindow(child, SW_HIDE);
    let old_style = GetWindowLongPtrW(child, GWL_STYLE) as u32;
    let new_style = ((old_style & !WS_OVERLAPPEDWINDOW.0)
        | WS_CHILD.0
        | WS_CLIPSIBLINGS.0
        | WS_CLIPCHILDREN.0) as isize;
    SetWindowLongPtrW(child, GWL_STYLE, new_style);
    SetParent(child, Some(parent)).map_err(|e| io::Error::new(io::ErrorKind::Other, e.to_string()))?;
    let _ = SetWindowPos(
        child,
        None,
        0,
        0,
        0,
        0,
        SWP_FRAMECHANGED | SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE,
    );
    resize_child(parent);
    Ok(())
}
fn runtime_icon_path() -> Option<PathBuf> {
    let mut hasher = Sha256::new();
    hasher.update(RUNTIME_ICON_ICO);
    let hash = hex::encode(hasher.finalize());
    let dir = local_app_data().join("FritiaOnlineNextPortable").join("icon-cache");
    fs::create_dir_all(&dir).ok()?;

    let file_name = format!("favicon_runtime_{}.ico", &hash[..16]);
    if let Ok(entries) = fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            let Some(name) = path.file_name().and_then(|value| value.to_str()) else { continue; };
            if name.starts_with("favicon_runtime_") && name.ends_with(".ico") && name != file_name {
                let _ = fs::remove_file(path);
            }
        }
    }

    let path = dir.join(file_name);
    let needs_write = match fs::read(&path) {
        Ok(existing) => existing.as_slice() != RUNTIME_ICON_ICO,
        Err(_) => true,
    };
    if needs_write {
        fs::write(&path, RUNTIME_ICON_ICO).ok()?;
    }
    Some(path)
}

unsafe fn load_window_icon(_instance: HINSTANCE, width: i32, height: i32) -> Option<windows::Win32::Foundation::HANDLE> {
    let icon_path = runtime_icon_path()
        .unwrap_or_else(|| PathBuf::from(r"D:\Models\vibe_coding\fritia_online_next_desktop\v1.0.0\build\favicon_runtime.ico"));
    let wide = wide_nul(&icon_path.to_string_lossy());
    LoadImageW(None, PCWSTR(wide.as_ptr()), IMAGE_ICON, width, height, LR_LOADFROMFILE).ok()
}

unsafe fn class_icon(instance: HINSTANCE) -> HICON {
    let dpi = current_dpi(None);
    load_window_icon(instance, scaled_icon_size(32, dpi), scaled_icon_size(32, dpi))
        .map(|handle| HICON(handle.0))
        .unwrap_or_default()
}

unsafe fn apply_window_icons(hwnd: HWND, instance: HINSTANCE) {
    let dpi = current_dpi(Some(hwnd));
    let big = scaled_icon_size(32, dpi);
    let small_w = GetSystemMetricsForDpi(SM_CXSMICON, dpi).max(16);
    let small_h = GetSystemMetricsForDpi(SM_CYSMICON, dpi).max(16);

    if let Some(icon) = load_window_icon(instance, big, big) {
        let _ = SendMessageW(hwnd, WM_SETICON, Some(WPARAM(ICON_BIG as usize)), Some(LPARAM(icon.0 as isize)));
    }
    if let Some(icon) = load_window_icon(instance, small_w, small_h) {
        let _ = SendMessageW(hwnd, WM_SETICON, Some(WPARAM(ICON_SMALL as usize)), Some(LPARAM(icon.0 as isize)));
        let _ = SendMessageW(hwnd, WM_SETICON, Some(WPARAM(2)), Some(LPARAM(icon.0 as isize)));
    }
}unsafe extern "system" fn wnd_proc(hwnd: HWND, msg: u32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    match msg {
        WM_ERASEBKGND => LRESULT(1),
        WM_PAINT => {
            let mut ps = PAINTSTRUCT::default();
            let hdc = BeginPaint(hwnd, &mut ps);
            let mut rect = RECT::default();
            let _ = GetClientRect(hwnd, &mut rect);
            if let Some(ui) = UI.get() {
                let phase = phase_from(ui.state.phase.load(Ordering::Relaxed));
                if phase != Phase::Embedded {
                    let elapsed = ui.start.elapsed().as_millis().min(u128::from(u32::MAX)) as u32;
                    let start = ui.state.fade_start_ms.load(Ordering::Relaxed);
                    let alpha = match phase {
                        Phase::FadeIn => {
                            let t = (elapsed.saturating_sub(start)) as f32 / FADE_IN_MS as f32;
                            (ease_in_out(t) * 255.0).round() as u8
                        }
                        Phase::Hold => 255,
                        Phase::FadeOut => {
                            let t = (elapsed.saturating_sub(start)) as f32 / FADE_OUT_MS as f32;
                            ((1.0 - ease_in_out(t)) * 255.0).round() as u8
                        }
                        Phase::Error => 255,
                        Phase::Embedded => 0,
                    };
                    draw_splash(hdc, rect, alpha);
                }
            }
            let _ = EndPaint(hwnd, &ps);
            LRESULT(0)
        }
        WM_TIMER => {
            if let Some(ui) = UI.get() {
                let elapsed = ui.start.elapsed().as_millis().min(u128::from(u32::MAX)) as u32;
                let phase = phase_from(ui.state.phase.load(Ordering::Relaxed));
                let start = ui.state.fade_start_ms.load(Ordering::Relaxed);
                match phase {
                    Phase::FadeIn if elapsed.saturating_sub(start) >= FADE_IN_MS => {
                        set_phase(&ui.state, Phase::Hold, elapsed);
                    }
                    Phase::FadeOut if elapsed.saturating_sub(start) >= FADE_OUT_MS => {
                        let child = ui.state.electron_hwnd.load(Ordering::Relaxed);
                        if child != 0 {
                            if let Ok(guard) = ui.state.show_signal_file.lock() {
                                if let Some(path) = guard.as_ref() {
                                    let _ = fs::write(path, b"show");
                                }
                            }
                            let child_hwnd = HWND(child as isize as *mut c_void);
                            resize_child(hwnd);
                            let _ = ShowWindow(child_hwnd, SW_SHOW);
                            resize_child(hwnd);
                            focus_child(hwnd);
                            set_phase(&ui.state, Phase::Embedded, elapsed);
                        }
                    }
                    Phase::Embedded if elapsed.saturating_sub(start) < 2_000 => {
                        resize_child(hwnd);
                    }
                    _ => {}
                }
                if phase_from(ui.state.phase.load(Ordering::Relaxed)) != Phase::Embedded {
                    let _ = InvalidateRect(Some(hwnd), None, false);
                }
            }
            LRESULT(0)
        }
        WM_READY_TO_FADE => {
            if let Some(ui) = UI.get() {
                let child = ui.state.electron_hwnd.load(Ordering::Relaxed);
                if child != 0 {
                    if let Err(error) = embed_child(hwnd, child) {
                        if let Ok(mut guard) = ui.state.error.lock() {
                            *guard = Some(error.to_string());
                        }
                        set_phase(&ui.state, Phase::Error, ui.start.elapsed().as_millis().min(u128::from(u32::MAX)) as u32);
                    } else {
                        let elapsed = ui.start.elapsed().as_millis().min(u128::from(u32::MAX)) as u32;
                        set_phase(&ui.state, Phase::FadeOut, elapsed);
                    }
                    let _ = InvalidateRect(Some(hwnd), None, false);
                }
            }
            LRESULT(0)
        }
        WM_ERROR => {
            if let Some(ui) = UI.get() {
                set_phase(&ui.state, Phase::Error, ui.start.elapsed().as_millis().min(u128::from(u32::MAX)) as u32);
                let text = ui.state.error.lock().ok().and_then(|g| g.clone()).unwrap_or_else(|| "启动失败".to_string());
                let title = wide_nul(TITLE);
                let body = wide_nul(&format!("启动失败：{}", text));
                let _ = MessageBoxW(Some(hwnd), PCWSTR(body.as_ptr()), PCWSTR(title.as_ptr()), MB_OK | MB_ICONERROR);
            }
            LRESULT(0)
        }
        WM_SIZE => {
            resize_child(hwnd);
            LRESULT(0)
        }
        WM_DPICHANGED => {
            let suggested = lparam.0 as *const RECT;
            if !suggested.is_null() {
                let rect = *suggested;
                let _ = SetWindowPos(
                    hwnd,
                    None,
                    rect.left,
                    rect.top,
                    rect.right - rect.left,
                    rect.bottom - rect.top,
                    SWP_NOZORDER | SWP_NOACTIVATE,
                );
            }
            resize_child(hwnd);
            if let Ok(module) = GetModuleHandleW(PCWSTR::null()) {
                apply_window_icons(hwnd, HINSTANCE(module.0));
            }
            LRESULT(0)
        }
        WM_MOUSEACTIVATE => {
            focus_child(hwnd);
            LRESULT(MA_ACTIVATE as isize)
        }
        WM_LBUTTONDOWN => {
            focus_child(hwnd);
            if forward_to_child(msg, wparam, lparam) {
                LRESULT(0)
            } else {
                DefWindowProcW(hwnd, msg, wparam, lparam)
            }
        }
        WM_KEYDOWN | WM_KEYUP | WM_SYSKEYDOWN | WM_SYSKEYUP => {
            if forward_to_child(msg, wparam, lparam) {
                LRESULT(0)
            } else {
                DefWindowProcW(hwnd, msg, wparam, lparam)
            }
        }
        WM_SETFOCUS => {
            focus_child(hwnd);
            LRESULT(0)
        }
        WM_CLOSE => {
            if let Some(ui) = UI.get() {
                let child = ui.state.electron_hwnd.load(Ordering::Relaxed);
                if child != 0 {
                    let _ = DestroyWindow(HWND(child as isize as *mut c_void));
                }
            }
            let _ = DestroyWindow(hwnd);
            LRESULT(0)
        }
        WM_DESTROY => {
            if let Some(ui) = UI.get() {
                if let Ok(mut splash) = ui.splash.lock() {
                    if let Some(value) = splash.take() {
                        destroy_splash_bitmap(&value);
                    }
                }
            }
            PostQuitMessage(0);
            LRESULT(0)
        }
        _ => DefWindowProcW(hwnd, msg, wparam, lparam),
    }
}

fn run_window(clear: bool, keep_loader: bool) -> windows::core::Result<()> {
    unsafe { configure_dpi_awareness(); }
    let state = UiState {
        phase: Arc::new(AtomicU32::new(Phase::FadeIn as u32)),
        fade_start_ms: Arc::new(AtomicU32::new(0)),
        electron_hwnd: Arc::new(AtomicI64::new(0)),
        child_pid: Arc::new(AtomicU32::new(0)),
        show_signal_file: Arc::new(Mutex::new(None)),
        error: Arc::new(Mutex::new(None)),
        keep_loader: Arc::new(AtomicBool::new(keep_loader)),
    };

    let splash = unsafe { create_splash_bitmap() };
    let _ = UI.set(AppUi { state: state.clone(), splash: Mutex::new(splash), start: Instant::now() });

    unsafe {
        let class_name = wide_nul("FritiaOnlineNextEmbeddedLoader092");
        let window_title = wide_nul(TITLE);
        let module = GetModuleHandleW(PCWSTR::null())?;
        let instance = HINSTANCE(module.0);
        let cursor = LoadCursorW(None, IDC_ARROW).unwrap_or_default();
        let icon = class_icon(instance);
        let wc = WNDCLASSW {
            hCursor: cursor,
            hIcon: icon,
            hInstance: instance,
            lpszClassName: PCWSTR(class_name.as_ptr()),
            lpfnWndProc: Some(wnd_proc),
            hbrBackground: HBRUSH(std::ptr::null_mut()),
            ..Default::default()
        };
        RegisterClassW(&wc);

        let style = WS_OVERLAPPEDWINDOW | WS_CLIPCHILDREN | WS_CLIPSIBLINGS;
        let ex_style = WS_EX_APPWINDOW | WS_EX_WINDOWEDGE;
        let mut wr = RECT { left: 0, top: 0, right: WINDOW_W, bottom: WINDOW_H };
        if AdjustWindowRectExForDpi(&mut wr, style, false, ex_style, current_dpi(None)).is_err() {
            AdjustWindowRectEx(&mut wr, style, false, ex_style)?;
        }
        let width = wr.right - wr.left;
        let height = wr.bottom - wr.top;
        let screen_w = GetSystemMetrics(SM_CXSCREEN);
        let screen_h = GetSystemMetrics(SM_CYSCREEN);
        let x = ((screen_w - width) / 2).max(0);
        let y = ((screen_h - height) / 2).max(0);
        let hwnd = CreateWindowExW(
            ex_style,
            PCWSTR(class_name.as_ptr()),
            PCWSTR(window_title.as_ptr()),
            style,
            x,
            y,
            width,
            height,
            None,
            None,
            Some(instance),
            None,
        )?;

        apply_window_icons(hwnd, instance);
        let _ = ShowWindow(hwnd, SW_SHOW);
        SetTimer(Some(hwnd), 1, 16, None);
        let worker_state = state.clone();
        let hwnd_raw = hwnd.0 as isize;
        thread::spawn(move || prepare_cache_and_launch(worker_state, hwnd_raw, clear));

        let mut msg = MSG::default();
        while GetMessageW(&mut msg, None, 0, 0).as_bool() {
            let _ = TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }
    }
    Ok(())
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let clear = args.iter().any(|arg| arg == "--clear-cache");
    let keep_loader = args.iter().any(|arg| arg == "--keep-loader");
    let _ = run_window(clear, keep_loader);
}