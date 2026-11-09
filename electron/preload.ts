import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  captureScreen: () => ipcRenderer.invoke('capture-screen'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  isDesktop: true,
});
