const { app, BrowserWindow, protocol, shell } = require('electron');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { Readable } = require('node:stream');

const APP_SCHEME = 'fritia';
const APP_HOST = 'app';
const PRODUCT_NAME = '芙提雅 ONLINE NEXT Ver. 0.9.2 (Preview Version) | 青尘工作室';
const EMBEDDED_MODE = process.env.FRITIA_EMBEDDED_CHILD === '1';

protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true
    }
  }
]);

function appRoot() {
  return path.join(__dirname, 'app');
}

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const types = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8',
    '.md': 'text/markdown; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.bmp': 'image/bmp',
    '.ico': 'image/x-icon',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.m4a': 'audio/mp4',
    '.mp4': 'video/mp4',
    '.pmx': 'application/octet-stream',
    '.pmd': 'application/octet-stream',
    '.vmd': 'application/octet-stream',
    '.spa': 'application/octet-stream',
    '.sph': 'application/octet-stream',
    '.toon': 'application/octet-stream',
    '.tga': 'application/octet-stream',
    '.dds': 'application/octet-stream'
  };
  return types[ext] || 'application/octet-stream';
}

function resolveAppPath(urlString) {
  const url = new URL(urlString);
  if (url.protocol !== `${APP_SCHEME}:` || url.hostname !== APP_HOST) return null;
  let pathname = decodeURIComponent(url.pathname || '/');
  if (!pathname || pathname === '/') pathname = '/index.html';
  pathname = pathname.replace(/^\/+/, '');
  const root = appRoot();
  const filePath = path.normalize(path.join(root, pathname));
  const relative = path.relative(root, filePath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return null;
  return filePath;
}

function parseRange(rangeHeader, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader || '');
  if (!match) return null;
  let start = match[1] ? Number(match[1]) : 0;
  let end = match[2] ? Number(match[2]) : size - 1;
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (match[1] === '' && match[2] !== '') {
    const suffix = Number(match[2]);
    start = Math.max(0, size - suffix);
    end = size - 1;
  }
  start = Math.max(0, Math.min(start, size - 1));
  end = Math.max(start, Math.min(end, size - 1));
  return { start, end };
}

async function handleAppProtocol(request) {
  const filePath = resolveAppPath(request.url);
  if (!filePath) return new Response('Forbidden', { status: 403 });

  try {
    const stat = await fsp.stat(filePath);
    if (!stat.isFile()) return new Response('Not found', { status: 404 });

    const headers = new Headers({
      'Content-Type': contentType(filePath),
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-cache'
    });
    const range = parseRange(request.headers.get('range'), stat.size);
    if (range) {
      headers.set('Content-Length', String(range.end - range.start + 1));
      headers.set('Content-Range', `bytes ${range.start}-${range.end}/${stat.size}`);
      return new Response(Readable.toWeb(fs.createReadStream(filePath, range)), {
        status: 206,
        headers
      });
    }

    headers.set('Content-Length', String(stat.size));
    return new Response(Readable.toWeb(fs.createReadStream(filePath)), { headers });
  } catch (error) {
    if (error && error.code === 'ENOENT') return new Response('Not found', { status: 404 });
    console.error('[FritiaDesktop] Protocol error:', error);
    return new Response('Internal error', { status: 500 });
  }
}

function nativeHandleToDecimalString(win) {
  const buffer = win.getNativeWindowHandle();
  if (buffer.length >= 8) return buffer.readBigUInt64LE(0).toString(10);
  return BigInt(buffer.readUInt32LE(0)).toString(10);
}

async function waitForShowSignal(win) {
  const signal = process.env.FRITIA_SHOW_SIGNAL_FILE;
  if (!EMBEDDED_MODE || !signal) {
    win.show();
    return;
  }

  const start = Date.now();
  while (!win.isDestroyed()) {
    if (fs.existsSync(signal)) {
      win.show();
      win.focus();
      return;
    }
    if (Date.now() - start > 120000) {
      console.error('[FritiaDesktop] Timed out waiting for embedded show signal.');
      app.quit();
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

async function createWindow() {
  const win = new BrowserWindow({
    width: 1920,
    height: 1080,
    minWidth: EMBEDDED_MODE ? 0 : 960,
    minHeight: EMBEDDED_MODE ? 0 : 640,
    show: false,
    frame: !EMBEDDED_MODE,
    transparent: false,
    backgroundColor: '#000000',
    title: PRODUCT_NAME,
    icon: path.join(__dirname, 'build', 'favicon.ico'),
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: false
    }
  });

  win.on('page-title-updated', (event) => {
    event.preventDefault();
    win.setTitle(PRODUCT_NAME);
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(`${APP_SCHEME}://${APP_HOST}/`)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  await win.loadURL(`${APP_SCHEME}://${APP_HOST}/index.html`);
  win.setTitle(PRODUCT_NAME);

  if (process.env.FRITIA_DESKTOP_SMOKE_TEST === '1') {
    const title = await win.webContents.getTitle();
    if (!title) throw new Error('Desktop smoke test failed: empty window title');
    console.log(`Loaded: ${title}`);
    app.quit();
    return;
  }

  if (EMBEDDED_MODE) {
    const hwndFile = process.env.FRITIA_HWND_FILE;
    if (hwndFile) {
      await fsp.mkdir(path.dirname(hwndFile), { recursive: true });
      await fsp.writeFile(hwndFile, nativeHandleToDecimalString(win), 'utf8');
    }
    await waitForShowSignal(win);
  } else {
    win.show();
  }
}

app.whenReady().then(async () => {
  await protocol.handle(APP_SCHEME, handleAppProtocol);
  await createWindow();

  app.on('activate', () => {
    if (!EMBEDDED_MODE && BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
});

app.on('window-all-closed', () => {
  app.quit();
});