import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electron', {
    openDirectory: () => ipcRenderer.invoke('dialog:openDirectory'),
    setApiKey: (provider: 'google' | 'anthropic', key: string) => ipcRenderer.invoke('store:setApiKey', provider, key),
    getApiKey: (provider: 'google' | 'anthropic') => ipcRenderer.invoke('store:getApiKey', provider),
    
    // Agent execution
    invokeAgent: (workspacePath: string, query: string) => ipcRenderer.invoke('agent:invoke', workspacePath, query),
    
    // Stream listener
    onAgentStream: (callback: (data: any) => void) => {
        const handler = (_event: any, data: any) => callback(data);
        ipcRenderer.on('agent:stream', handler);
        // Return unsubscribe function
        return () => {
            ipcRenderer.removeListener('agent:stream', handler);
        };
    }
});
