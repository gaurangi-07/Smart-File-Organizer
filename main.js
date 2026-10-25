const { app, BrowserWindow, ipcMain, dialog, Notification, shell, session } = require('electron');
const path = require('path');
const fs = require('fs');

// Import modules
const fileScanner = require('./modules/fileScanner');
const duplicateDetector = require('./modules/duplicateDetector');
const fileOrganizer = require('./modules/fileOrganizer');
const storage = require('./modules/storage');
const storageAnalyzer = require('./modules/storageAnalyzer');

let mainWindow = null;
let detailWindow = null;

// Storage Analyzer state (kept in the main process, never trusted from the renderer)
let storageScanning = false;
let storageAnalyzedRoot = null; // last folder that was successfully analyzed

// ─── Window Creation ────────────────────────────────────────────────────────

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Smart File Organizer',
    backgroundColor: '#F8FAFC',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    titleBarStyle: 'hiddenInset',
    show: false,
  });

  mainWindow.loadFile('index.html');

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createDetailWindow(fileData) {
  if (detailWindow) {
    detailWindow.focus();
    detailWindow.webContents.send('file-data', fileData);
    return;
  }

  detailWindow = new BrowserWindow({
    width: 560,
    height: 520,
    title: 'File Details',
    parent: mainWindow,
    modal: false,
    backgroundColor: '#F8FAFC',
    webPreferences: {
      preload: path.join(__dirname, 'detail-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    show: false,
    resizable: false,
  });

  detailWindow.loadFile('detail-window.html');

  detailWindow.once('ready-to-show', () => {
    detailWindow.show();
    detailWindow.webContents.send('file-data', fileData);
  });

  detailWindow.on('closed', () => {
    detailWindow = null;
  });
}

// ─── App Lifecycle ───────────────────────────────────────────────────────────

app.whenReady().then(() => {
  // Grant camera permission for getUserMedia in renderer
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === 'media') {
      callback(true);
    } else {
      callback(false);
    }
  });

  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ─── Helper: validate path ──────────────────────────────────────────────────

function isValidPath(p) {
  if (typeof p !== 'string' || p.trim() === '') return false;
  try {
    path.resolve(p);
    return true;
  } catch {
    return false;
  }
}

// ─── IPC Handlers ───────────────────────────────────────────────────────────

// Select folder via native dialog
ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Select Folder to Organize',
  });
  if (result.canceled || result.filePaths.length === 0) return { canceled: true };
  return { canceled: false, folderPath: result.filePaths[0] };
});

// Scan a folder and return file list with metadata
ipcMain.handle('scan-folder', async (event, folderPath) => {
  if (!isValidPath(folderPath)) {
    return { success: false, error: 'Invalid folder path provided.' };
  }
  try {
    const files = await fileScanner.scan(folderPath);
    storage.appendLog({ type: 'scan', message: `Scanned folder: ${folderPath}`, count: files.length });
    return { success: true, files };
  } catch (err) {
    storage.appendLog({ type: 'error', message: `Scan failed: ${err.message}` });
    return { success: false, error: err.message };
  }
});

// Preview organization plan (no moves yet)
ipcMain.handle('preview-organize', async (event, folderPath) => {
  if (!isValidPath(folderPath)) {
    return { success: false, error: 'Invalid folder path.' };
  }
  try {
    const plan = await fileOrganizer.buildPlan(folderPath);
    return { success: true, plan };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Execute organization after user confirmation
ipcMain.handle('execute-organize', async (event, folderPath) => {
  if (!isValidPath(folderPath)) {
    return { success: false, error: 'Invalid folder path.' };
  }
  try {
    const result = await fileOrganizer.execute(folderPath);
    storage.appendLog({
      type: 'organize',
      message: `Organized ${result.moved} files in ${folderPath}`,
      moved: result.moved,
      skipped: result.skipped,
      errors: result.errors.length,
    });

    const settings = storage.getSettings();
    if (settings.notifications !== false) {
      new Notification({
        title: 'Smart File Organizer',
        body: `Organization complete! ${result.moved} files moved.`,
      }).show();
    }

    return { success: true, result };
  } catch (err) {
    storage.appendLog({ type: 'error', message: `Organize failed: ${err.message}` });
    return { success: false, error: err.message };
  }
});

// Detect duplicates in a folder
ipcMain.handle('detect-duplicates', async (event, folderPath) => {
  if (!isValidPath(folderPath)) {
    return { success: false, error: 'Invalid folder path.' };
  }
  try {
    const groups = await duplicateDetector.detect(folderPath);
    storage.appendLog({ type: 'scan', message: `Duplicate scan: ${groups.length} groups found in ${folderPath}` });

    const settings = storage.getSettings();
    if (settings.notifications !== false) {
      new Notification({
        title: 'Smart File Organizer',
        body: `Duplicate scan complete! ${groups.length} duplicate groups found.`,
      }).show();
    }

    return { success: true, groups };
  } catch (err) {
    storage.appendLog({ type: 'error', message: `Duplicate detection failed: ${err.message}` });
    return { success: false, error: err.message };
  }
});

// Delete specific files (with validation — only confirmed by user)
ipcMain.handle('delete-files', async (event, filePaths) => {
  if (!Array.isArray(filePaths)) {
    return { success: false, error: 'Invalid argument: expected array of paths.' };
  }

  const results = { deleted: [], errors: [] };

  for (const fp of filePaths) {
    if (!isValidPath(fp)) {
      results.errors.push({ path: fp, error: 'Invalid path' });
      continue;
    }
    try {
      await fs.promises.unlink(fp);
      results.deleted.push(fp);
      storage.appendLog({ type: 'delete', message: `Deleted file: ${fp}` });
    } catch (err) {
      results.errors.push({ path: fp, error: err.message });
    }
  }

  return { success: true, results };
});

// Open a file with the system's default application
ipcMain.handle('open-file', async (event, filePath) => {
  if (!isValidPath(filePath)) return { success: false, error: 'Invalid path.' };
  try {
    await shell.openPath(filePath);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Reveal a file in Finder/Explorer
ipcMain.handle('reveal-file', async (event, filePath) => {
  if (!isValidPath(filePath)) return { success: false, error: 'Invalid path.' };
  shell.showItemInFolder(filePath);
  return { success: true };
});

// Open the detail window
ipcMain.handle('open-detail-window', async (event, fileData) => {
  createDetailWindow(fileData);
  return { success: true };
});

// Settings
ipcMain.handle('get-settings', () => {
  return storage.getSettings();
});

ipcMain.handle('save-settings', (event, settings) => {
  if (typeof settings !== 'object' || settings === null) {
    return { success: false, error: 'Invalid settings object.' };
  }
  storage.saveSettings(settings);
  return { success: true };
});

// Activity log
ipcMain.handle('get-logs', () => {
  return storage.getLogs();
});

ipcMain.handle('clear-logs', () => {
  storage.clearLogs();
  return { success: true };
});

// Save a captured image (from camera) to a folder
ipcMain.handle('save-captured-image', async (event, { dataUrl, filename, destFolder }) => {
  // Validate inputs
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
    return { success: false, error: 'Invalid image data.' };
  }
  if (!isValidPath(destFolder)) {
    return { success: false, error: 'Invalid destination folder.' };
  }
  if (typeof filename !== 'string' || filename.trim() === '') {
    return { success: false, error: 'Invalid filename.' };
  }

  // Sanitize filename — remove dangerous characters
  const sanitized = filename.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim();
  if (!sanitized) return { success: false, error: 'Filename contains only invalid characters.' };

  try {
    // Ensure destination folder exists
    await fs.promises.mkdir(destFolder, { recursive: true });

    // Generate a unique filename to prevent overwriting
    const ext = path.extname(sanitized) || '.jpg';
    const base = path.basename(sanitized, ext);
    let finalName = sanitized;
    let finalPath = path.join(destFolder, finalName);
    let counter = 1;
    while (fs.existsSync(finalPath)) {
      finalName = `${base} (${counter})${ext}`;
      finalPath = path.join(destFolder, finalName);
      counter++;
    }

    // Extract base64 data and write file
    const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    await fs.promises.writeFile(finalPath, buffer);

    storage.appendLog({
      type: 'scan',
      message: `Camera capture saved: ${finalName} → ${destFolder}`,
    });

    const settings = storage.getSettings();
    if (settings.notifications !== false) {
      new Notification({
        title: 'Smart File Organizer',
        body: `Image saved: ${finalName}`,
      }).show();
    }

    return { success: true, savedPath: finalPath, savedName: finalName };
  } catch (err) {
    storage.appendLog({ type: 'error', message: `Camera save failed: ${err.message}` });
    return { success: false, error: err.message };
  }
});

// ─── Storage Analyzer (read-only) ───────────────────────────────────────────

// Pick the folder to analyze with the native folder dialog
ipcMain.handle('storage-select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Select Folder to Analyze',
  });
  if (result.canceled || result.filePaths.length === 0) return { canceled: true };
  return { canceled: false, folderPath: result.filePaths[0] };
});

// Analyze a folder: totals, categories, top folders, largest files
ipcMain.handle('storage-analyze', async (event, folderPath) => {
  if (typeof folderPath !== 'string' || folderPath.trim() === '' || !path.isAbsolute(folderPath)) {
    return { success: false, error: 'Invalid folder path.' };
  }
  if (storageScanning) {
    return { success: false, error: 'An analysis is already running.' };
  }

  storageScanning = true;
  try {
    const stat = await fs.promises.stat(folderPath);
    if (!stat.isDirectory()) {
      return { success: false, error: 'The selected path is not a folder.' };
    }

    // Send lightweight progress updates back to the window that asked
    const onProgress = (info) => {
      if (!event.sender.isDestroyed()) event.sender.send('storage-progress', info);
    };

    const result = await storageAnalyzer.analyze(path.resolve(folderPath), onProgress);
    storageAnalyzedRoot = result.rootPath;
    storage.appendLog({
      type: 'scan',
      message: `Storage analysis: ${folderPath}`,
      count: result.totalFiles,
    });
    return { success: true, result };
  } catch (err) {
    storage.appendLog({ type: 'error', message: `Storage analysis failed: ${err.message}` });
    return { success: false, error: err.message };
  } finally {
    storageScanning = false;
  }
});

// Reveal a file from the results in Finder/Explorer.
// Only files inside the last analyzed folder are allowed.
ipcMain.handle('storage-reveal-file', async (event, filePath) => {
  if (typeof filePath !== 'string' || !path.isAbsolute(filePath) || !storageAnalyzedRoot) {
    return { success: false, error: 'Invalid path.' };
  }

  const resolved = path.resolve(filePath);
  const relative = path.relative(storageAnalyzedRoot, resolved);
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
    return { success: false, error: 'File is outside the analyzed folder.' };
  }

  try {
    const stat = await fs.promises.lstat(resolved);
    if (!stat.isFile()) return { success: false, error: 'Not a regular file.' };
  } catch {
    return { success: false, error: 'File no longer exists.' };
  }

  shell.showItemInFolder(resolved);
  return { success: true };
});

// Send notification (called from scan complete in renderer)
ipcMain.handle('notify', (event, { title, body }) => {
  const settings = storage.getSettings();
  if (settings.notifications === false) return;
  try {
    new Notification({ title: String(title), body: String(body) }).show();
  } catch {
    // Notifications may not be supported on all platforms
  }
});
