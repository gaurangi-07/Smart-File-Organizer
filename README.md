# Smart File Organizer

A polished Electron desktop application that helps you scan, categorize, organize, search, and manage files in any folder — with duplicate detection, storage statistics, persistent activity logs, and a secure IPC architecture.

---

## Features

| Feature | Description |
|---|---|
| 📁 Folder Selection | Native OS directory picker |
| 🔍 File Scanning | Scans files, reads metadata, categorizes by extension |
| ✨ File Organization | Preview proposed moves, confirm before executing |
| 🔎 Duplicate Detection | MD5 hash-based content comparison, streaming for large files |
| 📊 Storage Stats | File counts and sizes by category, visual bar chart |
| 🔍 Search & Filter | Case-insensitive search, category filter, multi-column sort |
| 📜 Activity Log | Persisted between restarts, clearable with confirmation |
| ⚙️ Settings | Default folder, notifications toggle, preview toggle |
| 🔔 Notifications | Native desktop notifications on scan/organize complete |
| 🪟 Multiple Windows | Detail window shows full file metadata |
| 🔒 Secure IPC | `contextIsolation: true`, `nodeIntegration: false`, named API only |

---

## Installation & Running

### Prerequisites
- Node.js 16+ and npm
- macOS / Windows / Linux

### Steps

```bash
# 1. Clone or navigate to the project
cd file_organizer

# 2. Install dependencies
npm install

# 3. Launch the app
npm start
```

---

## Architecture

```
file_organizer/
├── main.js              # Electron main process
│                        #   - Window lifecycle (main + detail windows)
│                        #   - All IPC handlers
│                        #   - Native dialogs & notifications
│                        #   - Path validation
├── preload.js           # Secure contextBridge API for main window
├── detail-preload.js    # Secure contextBridge API for detail window
│
├── modules/
│   ├── fileScanner.js       # Reads directory, returns file metadata + category
│   ├── duplicateDetector.js # MD5 hashing with streams, groups duplicates
│   ├── fileOrganizer.js     # Builds move plan, handles name collisions, executes
│   └── storage.js           # JSON persistence (settings + activity log)
│
├── index.html           # Main window UI shell
├── styles.css           # Design system: tokens, layout, components
├── renderer.js          # All frontend logic (no Node.js access)
│
└── detail-window.html   # Secondary window for file details
```

### Main Process ↔ Renderer Communication

All IPC uses `ipcMain.handle` / `ipcRenderer.invoke` (async request-response). The preload script exposes only named operations via `contextBridge`:

```
Renderer → window.electronAPI.scanFolder(path)
         → IPC: 'scan-folder'
         → Main: validates path, calls fileScanner.scan()
         → returns { success, files[] }
```

No raw `fs`, `path`, or Node.js APIs are accessible from the renderer.

---

## File Categories

| Category | Extensions |
|---|---|
| Documents | pdf, doc, docx, txt, ppt, pptx, xls, xlsx, md, rtf |
| Images | png, jpg, jpeg, gif, svg, webp, bmp, ico, tiff, heic |
| Videos | mp4, mov, mkv, avi, wmv, flv, webm |
| Audio | mp3, wav, aac, flac, ogg, m4a, wma |
| Archives | zip, rar, 7z, tar, gz, bz2, xz |
| Other | Everything else |

---

## Persistence

Data is stored in Electron's `app.getPath('userData')` directory:
- `settings.json` — user preferences
- `activity-log.json` — last 500 activity entries (newest first)

---

## Security

- `contextIsolation: true` — renderer and Node.js contexts are isolated
- `nodeIntegration: false` — renderer cannot access Node.js APIs directly
- `sandbox: false` — required for preload scripts on Electron 27+
- All IPC inputs (file paths, arrays) are validated in the main process
- Only named, purpose-specific operations are exposed via `contextBridge`
- Shell operations use Electron's safe `shell.openPath` / `shell.showItemInFolder`

---

## Usage Guide

1. **Select a Folder** — Click "Choose Folder" on the Dashboard
2. **Scan** — Click "Scan Files" to read all files and build the file list
3. **Browse** — Use the sidebar to view files by category, or "All Files" with search/sort
4. **Organize** — Click "Organize Files" to preview proposed moves, then confirm
5. **Find Duplicates** — Navigate to "Duplicate Files", click "Scan for Duplicates", select files to delete and confirm
6. **View History** — Check "Activity Log" for a record of all operations
7. **Settings** — Configure default folder, notifications, and preview behavior

---

## Notes

- Organization creates category subfolders **inside the selected folder only**
- Files are never moved or deleted without explicit user confirmation
- Duplicate detection compares **file content** (not filenames) using MD5 hashes
- The app handles permission errors, missing files, and empty folders gracefully
