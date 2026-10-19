const fs = require('fs');
const path = require('path');

// ─── Category Map ────────────────────────────────────────────────────────────

const CATEGORY_MAP = {
  documents: ['pdf', 'doc', 'docx', 'txt', 'ppt', 'pptx', 'xls', 'xlsx', 'odt', 'odp', 'ods', 'rtf', 'md'],
  images: ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico', 'tiff', 'tif', 'heic', 'avif'],
  videos: ['mp4', 'mov', 'mkv', 'avi', 'wmv', 'flv', 'webm', 'm4v', '3gp'],
  audio: ['mp3', 'wav', 'aac', 'flac', 'ogg', 'm4a', 'wma', 'aiff'],
  archives: ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'tgz'],
};

// Reverse lookup: extension -> category
const EXT_TO_CATEGORY = {};
for (const [cat, exts] of Object.entries(CATEGORY_MAP)) {
  for (const ext of exts) {
    EXT_TO_CATEGORY[ext] = cat;
  }
}

function getCategory(filename) {
  const ext = path.extname(filename).toLowerCase().replace('.', '');
  return EXT_TO_CATEGORY[ext] || 'other';
}

// ─── Scanner ─────────────────────────────────────────────────────────────────

/**
 * Scan a single directory (non-recursive) and return an array of file objects.
 * @param {string} folderPath
 * @returns {Promise<Array>}
 */
async function scan(folderPath) {
  // Verify folder exists and is accessible
  const stat = await fs.promises.stat(folderPath);
  if (!stat.isDirectory()) throw new Error('Path is not a directory.');

  const entries = await fs.promises.readdir(folderPath, { withFileTypes: true });
  const files = [];

  // Category folder names to skip (so we don't re-organize already-organized files)
  const categoryFolders = new Set(['Documents', 'Images', 'Videos', 'Audio', 'Archives', 'Other']);

  for (const entry of entries) {
    if (!entry.isFile()) continue; // skip directories, symlinks

    const filePath = path.join(folderPath, entry.name);
    try {
      const fileStat = await fs.promises.stat(filePath);
      const category = getCategory(entry.name);
      const ext = path.extname(entry.name).toLowerCase().replace('.', '') || 'none';

      files.push({
        name: entry.name,
        path: filePath,
        size: fileStat.size,
        modified: fileStat.mtime.toISOString(),
        created: fileStat.birthtime.toISOString(),
        category,
        ext,
        dir: folderPath,
      });
    } catch (err) {
      // Skip files we can't read (permissions, race condition, etc.)
      files.push({
        name: entry.name,
        path: filePath,
        size: 0,
        modified: null,
        created: null,
        category: 'other',
        ext: path.extname(entry.name).toLowerCase().replace('.', '') || 'none',
        dir: folderPath,
        error: err.message,
      });
    }
  }

  return files;
}

module.exports = { scan, getCategory, CATEGORY_MAP, EXT_TO_CATEGORY };
