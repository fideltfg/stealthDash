# StealthDash Desktop App

A cross-platform Electron wrapper that displays the StealthDash dashboard as a **borderless background window** — always sitting behind every other open window, like an interactive wallpaper.

## Features

- Borderless, full-screen background window (behind all other apps)
- Auto-connects to a configured StealthDash server on startup
- Settings dialog to enter server address and port
- System-tray icon with Settings / Reload / Quit
- Connection error page with Retry and Settings buttons
- Works on **Windows** and **Linux**

## How it works

| Platform | "Stay at back" mechanism |
|----------|--------------------------|
| Linux (X11) | `type: 'desktop'` — registers as a desktop-layer window via `_NET_WM_WINDOW_TYPE_DESKTOP` |
| Windows | PowerShell + Win32 `SetWindowPos(HWND_BOTTOM)` + `WS_EX_NOACTIVATE` — window never activates and is pushed below the Z-order on startup and periodically |

> **Wayland note:** The `type: 'desktop'` hint is X11-specific. On Wayland the window will display normally (not behind other windows). Use XWayland or an X11 session for the background behaviour.

## Prerequisites

- Node.js ≥ 18 and npm
- A running StealthDash server (see the main project README)

## Install dependencies

```bash
cd electron-app
npm install
```

## Run in development

```bash
npm start
```

A settings dialog will open on first launch. Enter your server address (e.g. `192.168.1.10`) and port (e.g. `3000`), then click **Connect**.

Settings are saved to the OS user-data directory and loaded automatically on every subsequent launch.

## Build distributable packages

### Linux (AppImage + .deb)

```bash
npm run build:linux
```

Output is placed in `dist/`.

### Windows (NSIS installer + portable .exe)

```bash
npm run build:win
```

Cross-compiling Windows packages from Linux requires Wine and the `mono` package:

```bash
# Ubuntu / Debian
sudo apt install wine mono-complete
npm run build:win
```

### Both platforms at once

```bash
npm run build
```

## Accessing settings after first run

Right-click the tray icon (system notification area) and choose **Settings…**  
Double-clicking the tray icon also opens the settings dialog.

## Project structure

```
electron-app/
├── main.js          Main process — window management, tray, IPC, always-bottom logic
├── preload.js       Context-bridge — exposes a safe API to renderer pages
├── settings.html    Settings dialog UI
├── assets/
│   ├── icon.ico     Windows application icon
│   ├── icon.png     Linux application icon (256×256)
│   └── tray-icon.png  System-tray icon (32×32)
└── package.json
```
