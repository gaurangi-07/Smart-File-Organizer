const fs = require('fs');
const path = require('path');
const { getCategory } = require('./fileScanner');

// ─── Storage Analyzer ────────────────────────────────────────────────────────
// Read-only: this module only calls readdir / lstat. It never writes, moves
// or deletes anything.

const CATEGORIES = ['documents', 'images', 'videos', 'audio', 'archives', 'other'];
const TOP_FILES_LIMIT = 10;
const TOP_FOLDERS_LIMIT = 10;
const MAX_ERROR_SAMPLES = 5;

// Safe percentage (avoids divide-by-zero when the folder is empty)
function percentOf(part, total) {
  if (!total || total <= 0) return 0;
  return (part / total) * 100;
}

/**
 * Recursively analyze a folder and summarize its storage usage.
 *
 * @param {string} rootPath  Absolute path of the folder to analyze.
 * @param {(info: {files: number, folders: number, currentDir: string}) => void} [onProgress]
 * @returns {Promise<object>} Summary with only the data the UI needs.
 */
async function analyze(rootPath, onProgress) {
  const rootStat = await fs.promises.stat(rootPath);
  if (!rootStat.isDirectory()) throw new Error('Path is not a directory.');

  const categoryTotals = {};
  for (const cat of CATEGORIES) categoryTotals[cat] = { size: 0, count: 0 };

  const folderTotals = new Map(); // dir path -> { files, size } (files directly inside)
  const topFiles = [];            // bounded list, largest first
  const seenFiles = new Set();    // avoids counting the same file twice (hard links)

  let totalSize = 0;
  let totalFiles = 0;
  let totalFolders = 0;           // sub-folders only (the selected folder is not counted)
  let skipped = 0;
  const errorSamples = [];
  let lastProgress = 0;

  function recordError(targetPath, err) {
    skipped++;
    if (errorSamples.length < MAX_ERROR_SAMPLES) {
      errorSamples.push({ path: targetPath, error: err.code || err.message });
    }
  }

  function addTopFile(file) {
    // Keep only the N largest files so memory stays small on huge folders.
    topFiles.push(file);
    topFiles.sort((a, b) => b.size - a.size);
    if (topFiles.length > TOP_FILES_LIMIT) topFiles.pop();
  }

  // Throttle progress updates (max ~10 per second)
  function reportProgress(currentDir, force) {
    if (!onProgress) return;
    const now = Date.now();
    if (!force && now - lastProgress < 100) return;
    lastProgress = now;
    onProgress({ files: totalFiles, folders: totalFolders, currentDir });
  }

  // Iterative walk (a stack instead of recursion avoids stack overflow on deep trees)
  const stack = [rootPath];
  folderTotals.set(rootPath, { files: 0, size: 0 });

  while (stack.length > 0) {
    const dir = stack.pop();
    let entries;
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch (err) {
      recordError(dir, err); // permission denied, folder removed mid-scan, ...
      continue;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      // Ignore symbolic links completely (prevents loops and double counting)
      if (entry.isSymbolicLink()) continue;

      if (entry.isDirectory()) {
        totalFolders++;
        folderTotals.set(fullPath, { files: 0, size: 0 });
        stack.push(fullPath);
        continue;
      }

      if (!entry.isFile()) continue; // sockets, devices, etc.

      let st;
      try {
        st = await fs.promises.lstat(fullPath);
      } catch (err) {
        recordError(fullPath, err); // file vanished or unreadable
        continue;
      }
      if (!st.isFile()) continue;

      // Same physical file reached twice (hard link)? Count it once.
      if (st.ino && st.nlink > 1) {
        const key = `${st.dev}:${st.ino}`;
        if (seenFiles.has(key)) continue;
        seenFiles.add(key);
      }

      const size = st.size;
      const category = getCategory(entry.name);
      const ext = path.extname(entry.name).replace('.', '').toLowerCase();

      totalSize += size;
      totalFiles++;
      categoryTotals[category].size += size;
      categoryTotals[category].count++;

      const folder = folderTotals.get(dir);
      folder.files++;
      folder.size += size;

      // Only consider a file for the top list if it could make it in
      if (topFiles.length < TOP_FILES_LIMIT || size > topFiles[topFiles.length - 1].size) {
        addTopFile({ name: entry.name, path: fullPath, dir, ext: ext || 'none', category, size });
      }
    }

    reportProgress(dir, false);
  }

  reportProgress(rootPath, true);

  // ── Build the result ──────────────────────────────────────────────────────

  const categories = CATEGORIES.map((cat) => ({
    category: cat,
    size: categoryTotals[cat].size,
    count: categoryTotals[cat].count,
    percent: percentOf(categoryTotals[cat].size, totalSize),
  }));

  const rootName = path.basename(rootPath) || rootPath;
  const folders = [...folderTotals.entries()]
    .filter(([, f]) => f.files > 0) // folders with no direct files use no space themselves
    .map(([dirPath, f]) => ({
      name: dirPath === rootPath ? `${rootName} (selected folder)` : path.relative(rootPath, dirPath),
      path: dirPath,
      files: f.files,
      size: f.size,
      percent: percentOf(f.size, totalSize),
    }))
    .sort((a, b) => b.size - a.size)
    .slice(0, TOP_FOLDERS_LIMIT);

  const largestFiles = topFiles.map((f) => ({
    ...f,
    folder: path.relative(rootPath, f.dir) || rootName,
    percent: percentOf(f.size, totalSize),
  }));

  return {
    rootPath,
    totalSize,
    totalFiles,
    totalFolders,
    largestFile: largestFiles.length > 0 ? largestFiles[0] : null,
    categories,
    folders,
    largestFiles,
    skipped,
    errorSamples,
  };
}

module.exports = { analyze, percentOf, CATEGORIES };
