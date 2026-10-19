const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CHUNK_SIZE = 64 * 1024; // 64 KB chunks

/**
 * Hash a file using MD5, reading in chunks to support large files.
 * @param {string} filePath
 * @returns {Promise<string>} hex hash
 */
function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('md5');
    const stream = fs.createReadStream(filePath, { highWaterMark: CHUNK_SIZE });

    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', (err) => reject(err));
  });
}

/**
 * Detect duplicate files in a folder by content hash.
 * Returns only groups with 2+ files (actual duplicates).
 * @param {string} folderPath
 * @returns {Promise<Array>} array of groups: [{hash, size, files: [{name, path, size}]}]
 */
async function detect(folderPath) {
  const stat = await fs.promises.stat(folderPath);
  if (!stat.isDirectory()) throw new Error('Path is not a directory.');

  const entries = await fs.promises.readdir(folderPath, { withFileTypes: true });

  const hashMap = new Map(); // hash -> [{name, path, size}]

  for (const entry of entries) {
    if (!entry.isFile()) continue;

    const filePath = path.join(folderPath, entry.name);
    try {
      const fileStat = await fs.promises.stat(filePath);
      // Skip empty files (zero bytes) — not meaningful duplicates
      if (fileStat.size === 0) continue;

      const hash = await hashFile(filePath);

      if (!hashMap.has(hash)) {
        hashMap.set(hash, { hash, size: fileStat.size, files: [] });
      }
      hashMap.get(hash).files.push({
        name: entry.name,
        path: filePath,
        size: fileStat.size,
      });
    } catch (err) {
      // Skip unreadable files
    }
  }

  // Return only groups with duplicates
  const groups = [];
  for (const group of hashMap.values()) {
    if (group.files.length >= 2) {
      groups.push(group);
    }
  }

  // Sort by wasted space (size * (count-1)) descending
  groups.sort((a, b) => {
    const wasteA = a.size * (a.files.length - 1);
    const wasteB = b.size * (b.files.length - 1);
    return wasteB - wasteA;
  });

  return groups;
}

module.exports = { detect, hashFile };
