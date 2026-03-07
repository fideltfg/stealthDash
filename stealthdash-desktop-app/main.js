'use strict';

const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  nativeImage,
  ipcMain,
  screen,
  dialog,
  shell,
} = require('electron');
const path = require('path');
const fs = require('fs');
const { execFile, exec } = require('child_process');

// ─── Settings persistence ────────────────────────────────────────────────────

const SETTINGS_PATH = path.join(app.getPath('userData'), 'settings.json');

function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_PATH)) {
      return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
    }
  } catch (_) {}
  return null;
}

function saveSettings(settings) {
  fs.mkdirSync(path.dirname(SETTINGS_PATH), { recursive: true });
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2), 'utf8');
}

// ─── State ───────────────────────────────────────────────────────────────────

let mainWindow = null;
let settingsWindow = null;
let tray = null;
let bottomTimer = null; // Windows: interval to keep window at back

// ─── "Always at the back" helpers ────────────────────────────────────────────

/**
 * On Windows we write a tiny PowerShell script to userData once,
 * then call it with the HWND value to:
 *   1. Set WS_EX_NOACTIVATE so clicks never bring the window to front.
 *   2. Call SetWindowPos(HWND_BOTTOM) to push it behind all others.
 */
const PS_SCRIPT_PATH = path.join(app.getPath('userData'), 'set_bottom.ps1');

const PS_SCRIPT = `
param([long]$hwnd)
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class Win32 {
    public const int  GWL_EXSTYLE        = -20;
    public const int  WS_EX_NOACTIVATE   = 0x08000000;
    public const uint SWP_NOMOVE         = 0x0002;
    public const uint SWP_NOSIZE         = 0x0001;
    public const uint SWP_NOACTIVATE     = 0x0010;
    public static readonly IntPtr HWND_BOTTOM = new IntPtr(1);

    [DllImport("user32.dll")] public static extern int  GetWindowLong(IntPtr hWnd, int nIndex);
    [DllImport("user32.dll")] public static extern int  SetWindowLong(IntPtr hWnd, int nIndex, int dwNewLong);
    [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
}
'@
$h = [IntPtr]$hwnd
$ex = [Win32]::GetWindowLong($h, [Win32]::GWL_EXSTYLE)
[Win32]::SetWindowLong($h, [Win32]::GWL_EXSTYLE, $ex -bor [Win32]::WS_EX_NOACTIVATE) | Out-Null
[Win32]::SetWindowPos($h, [Win32]::HWND_BOTTOM, 0, 0, 0, 0, [Win32]::SWP_NOMOVE -bor [Win32]::SWP_NOSIZE -bor [Win32]::SWP_NOACTIVATE) | Out-Null
`.trim();

function ensurePsScript() {
  fs.mkdirSync(path.dirname(PS_SCRIPT_PATH), { recursive: true });
  fs.writeFileSync(PS_SCRIPT_PATH, PS_SCRIPT, 'utf8');
}

function winSendToBottom(win) {
  if (!win || win.isDestroyed()) return;
  const hwndBuf = win.getNativeWindowHandle();
  // Buffer is little-endian; 64-bit builds store a 64-bit handle
  const hwndValue =
    process.arch === 'x64'
      ? hwndBuf.readBigInt64LE(0).toString()
      : hwndBuf.readInt32LE(0).toString();

  execFile('powershell', [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy', 'Bypass',
    '-File', PS_SCRIPT_PATH,
    '-hwnd', hwndValue,
  ], { windowsHide: true }, (err) => {
    if (err) console.warn('[StealthDash] SetWindowPos failed:', err.message);
  });
}

// ─── Main window ─────────────────────────────────────────────────────────────

function createMainWindow(settings) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.close();
  }

  const { bounds } = screen.getPrimaryDisplay();

  /** @type {Electron.BrowserWindowConstructorOptions} */
  const opts = {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    frame: false,
    transparent: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      // Allow loading the remote dashboard URL
      webSecurity: true,
    },
  };

  // Linux (X11): type 'desktop' puts the window at the desktop layer,
  // naturally behind every other window.
  if (process.platform === 'linux') {
    opts.type = 'desktop';
  }

  mainWindow = new BrowserWindow(opts);

  const url = `http://${settings.host}:${settings.port}`;
  mainWindow.loadURL(url).catch(() => showErrorPage(settings));

  // Show once content is ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();

    if (process.platform === 'win32') {
      ensurePsScript();
      // Push to back immediately, then repeat to survive any Z-order disruptions
      winSendToBottom(mainWindow);
      bottomTimer = setInterval(() => winSendToBottom(mainWindow), 2000);
    }
  });

  // Windows: if anything forces us to the front, go back immediately
  mainWindow.on('focus', () => {
    if (process.platform === 'win32') {
      winSendToBottom(mainWindow);
    }
  });

  // Handle failed page load
  mainWindow.webContents.on('did-fail-load', (_e, code, desc) => {
    console.warn(`[StealthDash] Page load failed (${code}: ${desc})`);
    showErrorPage(settings);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    if (bottomTimer) { clearInterval(bottomTimer); bottomTimer = null; }
  });
}

function showErrorPage(settings) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const url = `http://${settings.host}:${settings.port}`;
  mainWindow.loadURL(`data:text/html,${encodeURIComponent(buildErrorHtml(url))}`);
}

function buildErrorHtml(url) {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  body {
    margin: 0; display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    height: 100vh;
    background: #0d0d1a;
    color: #cdd6f4;
    font-family: system-ui, sans-serif;
    text-align: center;
  }
  h1 { font-size: 1.6rem; color: #f38ba8; margin-bottom: .5rem; }
  p  { color: #a6adc8; margin: .25rem 0; }
  .url { color: #89b4fa; font-family: monospace; margin: 1rem 0; }
  button {
    margin-top: 1.5rem; padding: .6rem 1.4rem;
    background: #313244; color: #cdd6f4;
    border: 1px solid #45475a; border-radius: 6px;
    cursor: pointer; font-size: 1rem;
  }
  button:hover { background: #45475a; }
</style>
</head>
<body>
  <h1>⚠ Could not connect</h1>
  <p>StealthDash server is not reachable at</p>
  <p class="url">${url}</p>
  <p>Make sure the server is running, then click Retry.</p>
  <button onclick="location.reload()">Retry</button>
  <button onclick="window.stealthDash && window.stealthDash.openSettings()" style="margin-left:.5rem">Settings</button>
</body>
</html>`;
}

// ─── Settings window ──────────────────────────────────────────────────────────

function openSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 440,
    height: 340,
    resizable: false,
    center: true,
    title: 'StealthDash — Settings',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  settingsWindow.loadFile(path.join(__dirname, 'settings.html'));
  settingsWindow.setMenu(null);

  settingsWindow.on('closed', () => { settingsWindow = null; });
}

// ─── System tray ─────────────────────────────────────────────────────────────

function createTray() {
  const iconPath = path.join(__dirname, 'assets', 'tray-icon.png');
  const icon = fs.existsSync(iconPath)
    ? nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })
    : nativeImage.createEmpty();

  tray = new Tray(icon);
  tray.setToolTip('StealthDash');

  const menu = Menu.buildFromTemplate([
    {
      label: 'Settings…',
      click: openSettingsWindow,
    },
    {
      label: 'Reload Dashboard',
      click: () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.reload();
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Quit StealthDash',
      click: () => app.quit(),
    },
  ]);

  tray.setContextMenu(menu);
  tray.on('double-click', openSettingsWindow);
}

// ─── IPC handlers ─────────────────────────────────────────────────────────────

ipcMain.handle('get-settings', () => loadSettings());

ipcMain.handle('save-settings', (_event, settings) => {
  saveSettings(settings);
  // Reload / create the main window with the new settings
  createMainWindow(settings);
  // Notify settings window that save succeeded
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.webContents.send('settings-saved', settings);
  }
  return { ok: true };
});

ipcMain.on('open-settings', openSettingsWindow);

ipcMain.on('reload-dashboard', () => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.reload();
});

ipcMain.on('quit-app', () => app.quit());

// ─── App lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  createTray();

  const settings = loadSettings();
  if (settings) {
    createMainWindow(settings);
  } else {
    // No settings yet — open the settings dialog first
    openSettingsWindow();
  }
});

// Prevent the app from quitting when all windows are closed (tray-only mode)
app.on('window-all-closed', (e) => {
  // On macOS this is conventional; on Windows/Linux we keep the tray alive
  e.preventDefault();
});

app.on('before-quit', () => {
  if (bottomTimer) { clearInterval(bottomTimer); bottomTimer = null; }
});
