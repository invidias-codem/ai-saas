"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld('electron', {
    openDirectory: () => electron_1.ipcRenderer.invoke('dialog:openDirectory'),
    setApiKey: (provider, key) => electron_1.ipcRenderer.invoke('store:setApiKey', provider, key),
    getApiKey: (provider) => electron_1.ipcRenderer.invoke('store:getApiKey', provider),
    // Agent execution
    invokeAgent: (workspacePath, query) => electron_1.ipcRenderer.invoke('agent:invoke', workspacePath, query),
    // Stream listener
    onAgentStream: (callback) => {
        const handler = (_event, data) => callback(data);
        electron_1.ipcRenderer.on('agent:stream', handler);
        // Return unsubscribe function
        return () => {
            electron_1.ipcRenderer.removeListener('agent:stream', handler);
        };
    }
});
