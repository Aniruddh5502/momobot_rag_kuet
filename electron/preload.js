const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    getApiUrl: () => ipcRenderer.invoke('get-api-url'),
    saveToken: (token) => ipcRenderer.invoke('store-token', token),
    getToken: () => ipcRenderer.invoke('get-token'),
    clearToken: () => ipcRenderer.invoke('clear-token'),
});
