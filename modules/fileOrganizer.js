const fs = require('fs');
const path = require('path');
const fileScanner = require('./fileScanner');

// Display names for categories
const CATEGORY_DISPLAY = {
  documents: 'Documents',
  images: 'Images',
  videos: 'Videos',
  audio: 'Audio',
  archives: 'Archives',
  other: 'Other',
};

/**
 * Generate a safe filename if destination already exists.
 * Appends (1), (2), ... until a free slot is found.
 */
function getSafeDestPath(destDir, filename) {
  let destPath = path.join(destDir, filename);
  if (!fs.existsSync(destPath)) return destPath;

  const ext = path.extname(filename);
  const base = path.basename(filename, ext);
  let counter = 1;
  while (fs.existsSync(destPath)) {
    destPath = path.join(destDir, `${base} (${counter})${ext}`);
    counter++;
  }
  return destPath;
}

/**
 * Build a preview plan of moves — does not move any files.
 * @param {string} folderPath
 * @returns {Promise<Array>} [{from, to, category, filename}]
 */
async function buildPlan(folderPath) {
  const files = await fileScanner.scan(folderPath);
  const plan = [];
  const categoryFolders = new Set(Object.values(CATEGORY_DISPLAY));

  for (const file of files) {
    if (file.error) continue; // skip unreadable files

    // Don't move files that are already in a category folder inside this scan root
    // (The scanner only returns top-level files, so this is a safeguard)
    const categoryDir = CATEGORY_DISPLAY[file.category];
    const destDir = path.join(folderPath, categoryDir);
    const destPath = getSafeDestPath(destDir, file.name);

    plan.push({
      filename: file.name,
      from: file.path,
      to: destPath,
      category: file.category,
      categoryDir,
      size: file.size,
      renamed: path.basename(destPath) !== file.name,
    });
  }

  return plan;
}

/**
 * Execute the organization plan — creates category folders and moves files.
 * @param {string} folderPath
 * @returns {Promise<{moved, skipped, errors}>}
 */
async function execute(folderPath) {
  const plan = await buildPlan(folderPath);
  const result = { moved: 0, skipped: 0, errors: [] };

  // Collect unique destination dirs and create them
  const destDirs = new Set(plan.map((p) => path.dirname(p.to)));
  for (const dir of destDirs) {
    await fs.promises.mkdir(dir, { recursive: true });
  }

  for (const item of plan) {
    try {
      // Re-check source still exists
      await fs.promises.access(item.from, fs.constants.R_OK);

      // Re-compute safe destination in case something changed
      const finalDest = getSafeDestPath(path.dirname(item.to), path.basename(item.to));
      await fs.promises.rename(item.from, finalDest);
      result.moved++;
    } catch (err) {
      result.errors.push({ file: item.filename, error: err.message });
      result.skipped++;
    }
  }

  return result;
}

module.exports = { buildPlan, execute, CATEGORY_DISPLAY };
