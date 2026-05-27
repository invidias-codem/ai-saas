import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electron', {
  getRemoteConfig: () => ipcRenderer.invoke('get-remote-config'),
});
