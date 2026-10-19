const { contextBridge, ipcRenderer } = require('electron');

// Restricted API for the detail window
contextBridge.exposeInMainWorld('detailAPI', {
  onFileData: (callback) => {
    ipcRenderer.on('file-data', (event, data) => callback(data));
  },
  openFile: (filePath) => ipcRenderer.invoke('open-file', filePath),
  revealFile: (filePath) => ipcRenderer.invoke('reveal-file', filePath),
});
