'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// Expose a minimal, safe API to the renderer process
contextBridge.exposeInMainWorld('stealthDash', {
  // Settings operations
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),

  // Window / app operations
  openSettings: () => ipcRenderer.send('open-settings'),
  reloadDashboard: () => ipcRenderer.send('reload-dashboard'),
  quit: () => ipcRenderer.send('quit-app'),

  // Listen for events from main process
  onSettingsSaved: (callback) => ipcRenderer.on('settings-saved', (_event, settings) => callback(settings)),
});
