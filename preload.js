const { contextBridge, ipcRenderer } = require('electron');

// Expose the necessary IPC methods for the renderer process
contextBridge.exposeInMainWorld('electron', {
    invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
    send: (channel, ...args) => ipcRenderer.send(channel, ...args),
});
