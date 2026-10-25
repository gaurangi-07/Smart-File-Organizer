const { contextBridge, ipcRenderer } = require('electron');

// Expose a restricted, named API to the renderer process.
// No raw fs, ipcRenderer, or Node.js APIs are exposed.
contextBridge.exposeInMainWorld('electronAPI', {
  // Folder operations
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  scanFolder: (folderPath) => ipcRenderer.invoke('scan-folder', folderPath),

  // Organization
  previewOrganize: (folderPath) => ipcRenderer.invoke('preview-organize', folderPath),
  executeOrganize: (folderPath) => ipcRenderer.invoke('execute-organize', folderPath),

  // Duplicates
  detectDuplicates: (folderPath) => ipcRenderer.invoke('detect-duplicates', folderPath),
  deleteFiles: (filePaths) => ipcRenderer.invoke('delete-files', filePaths),

  // File actions
  openFile: (filePath) => ipcRenderer.invoke('open-file', filePath),
  revealFile: (filePath) => ipcRenderer.invoke('reveal-file', filePath),
  openDetailWindow: (fileData) => ipcRenderer.invoke('open-detail-window', fileData),

  // Settings
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),

  // Activity log
  getLogs: () => ipcRenderer.invoke('get-logs'),
  clearLogs: () => ipcRenderer.invoke('clear-logs'),

  // Notifications
  notify: (title, body) => ipcRenderer.invoke('notify', { title, body }),

  // Camera capture
  saveCapturedImage: (data) => ipcRenderer.invoke('save-captured-image', data),

  // Storage Analyzer (read-only)
  storageSelectFolder: () => ipcRenderer.invoke('storage-select-folder'),
  storageAnalyze: (folderPath) => ipcRenderer.invoke('storage-analyze', folderPath),
  storageRevealFile: (filePath) => ipcRenderer.invoke('storage-reveal-file', filePath),
  // Progress updates while scanning. Returns a function that removes the listener.
  onStorageProgress: (callback) => {
    const listener = (event, info) => callback(info);
    ipcRenderer.on('storage-progress', listener);
    return () => ipcRenderer.removeListener('storage-progress', listener);
  },
});
