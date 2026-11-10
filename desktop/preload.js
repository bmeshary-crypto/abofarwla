// Gives the page its "check for updates" button; the work happens in main.js.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('appUpdate', {
  check: () => ipcRenderer.invoke('update-check'),
  version: () => ipcRenderer.invoke('update-version'),
  onStatus: cb => ipcRenderer.on('update-status', (_, state, detail) => cb(state, detail)),
});
