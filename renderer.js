// ═══════════════════════════════════════════════════════════════════
//  Smart File Organizer — renderer.js
//  Handles all frontend logic: navigation, file table, search/sort,
//  organize modal, duplicate detection, activity log, settings.
// ═══════════════════════════════════════════════════════════════════

'use strict';

// ─── State ───────────────────────────────────────────────────────────────────
const state = {
  currentFolder: null,
  files: [],             // All scanned files
  scanned: false,
  scanning: false,
  organizing: false,
  duplicatesScanning: false,
  duplicateGroups: [],
  filesOrganized: 0,
  settings: {},
  currentView: 'dashboard',
  fileListFilter: 'all', // for all-files view
  fileListSort: 'name-asc',
  categoryFilter: 'all',
};

// ─── DOM Refs ─────────────────────────────────────────────────────────────────

const $ = (id) => document.getElementById(id);

const els = {
  topbarTitle:       $('topbar-title'),
  folderBadge:       $('folder-badge-text'),
  btnChooseFolder:   $('btn-choose-folder'),
  btnScanHero:       $('btn-scan-hero'),
  btnOrganizeHero:   $('btn-organize-hero'),
  statTotalFiles:    $('stat-total-files'),
  statTotalSize:     $('stat-total-size'),
  statDuplicates:    $('stat-duplicates'),
  statOrganized:     $('stat-organized'),
  storageChart:      $('storage-chart'),
  recentActivity:    $('recent-activity-list'),
  fileTableWrap:     $('file-table-wrap'),
  searchInput:       $('search-input-files'),
  sortSelect:        $('sort-select-files'),
  btnRefreshFiles:   $('btn-refresh-files'),
  btnScanDuplicates: $('btn-scan-duplicates'),
  btnDeleteSelected: $('btn-delete-selected'),
  dupContent:        $('dup-content'),
  logContent:        $('log-content'),
  btnClearLogs:      $('btn-clear-logs'),
  // Settings
  settingsDefaultFolder:   $('settings-default-folder'),
  btnSettingsChooseFolder: $('btn-settings-choose-folder'),
  btnSettingsClearFolder:  $('btn-settings-clear-folder'),
  settingNotifications:    $('setting-notifications'),
  settingPreview:          $('setting-preview'),
  btnSaveSettings:         $('btn-save-settings'),
  btnSettingsClearHistory: $('btn-settings-clear-history'),
  // Modals
  modalOrganize:       $('modal-organize'),
  previewList:         $('preview-list'),
  btnCancelOrganize:   $('btn-cancel-organize'),
  btnConfirmOrganize:  $('btn-confirm-organize'),
  modalDelete:         $('modal-delete'),
  deleteList:          $('delete-list'),
  btnCancelDelete:     $('btn-cancel-delete'),
  btnConfirmDelete:    $('btn-confirm-delete'),
  modalConfirm:        $('modal-confirm'),
  modalConfirmTitle:   $('modal-confirm-title'),
  modalConfirmSubtitle:$('modal-confirm-subtitle'),
  btnConfirmNo:        $('btn-confirm-no'),
  btnConfirmYes:       $('btn-confirm-yes'),
  // Toast
  toastContainer:      $('toast-container'),
};

// ─── Utilities ────────────────────────────────────────────────────────────────

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

function getFileIcon(category, ext) {
  const icons = {
    documents: '📋', images: '🖼️', videos: '🎬',
    audio: '🎵', archives: '🗜️', other: '📦'
  };
  return icons[category] || '📄';
}

function getCategoryTagClass(category) {
  const map = {
    documents: 'tag-documents', images: 'tag-images',
    videos: 'tag-videos', audio: 'tag-audio',
    archives: 'tag-archives', other: 'tag-other'
  };
  return map[category] || 'tag-other';
}

function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(str || ''));
  return div.innerHTML;
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function showToast(message, type = 'info', duration = 3500) {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  toast.innerHTML = `<span>${icons[type] || 'ℹ️'}</span><span>${escapeHtml(message)}</span>`;
  els.toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'toastOut 0.3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ─── Modal Helpers ────────────────────────────────────────────────────────────

function showModal(el) {
  el.classList.add('visible');
}

function hideModal(el) {
  el.classList.remove('visible');
}

function showConfirm(title, subtitle) {
  return new Promise((resolve) => {
    els.modalConfirmTitle.textContent = title;
    els.modalConfirmSubtitle.textContent = subtitle;
    showModal(els.modalConfirm);
    const onYes = () => { hideModal(els.modalConfirm); cleanup(); resolve(true); };
    const onNo  = () => { hideModal(els.modalConfirm); cleanup(); resolve(false); };
    function cleanup() {
      els.btnConfirmYes.removeEventListener('click', onYes);
      els.btnConfirmNo.removeEventListener('click', onNo);
    }
    els.btnConfirmYes.addEventListener('click', onYes);
    els.btnConfirmNo.addEventListener('click', onNo);
  });
}

// ─── Navigation ───────────────────────────────────────────────────────────────

const VIEW_TITLES = {
  dashboard: 'Dashboard',
  'all-files': 'All Files',
  documents: 'Documents',
  images: 'Images',
  videos: 'Videos',
  audio: 'Audio',
  archives: 'Archives',
  other: 'Other Files',
  duplicates: 'Duplicate Files',
  'activity-log': 'Activity Log',
  settings: 'Settings',
};

function navigateTo(viewName) {
  // Hide all views
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));

  // Show target view
  const viewEl = document.getElementById('view-' + viewName);
  if (viewEl) viewEl.classList.add('active');

  // Update nav items
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.view === viewName);
  });

  // Update topbar title
  els.topbarTitle.textContent = VIEW_TITLES[viewName] || capitalize(viewName);
  state.currentView = viewName;

  // Render view-specific content
  if (viewName === 'all-files') {
    state.fileListFilter = 'all';
    document.getElementById('category-chips').style.display = 'flex';
    // Reset chip selection
    document.querySelectorAll('.category-chip').forEach(c => {
      c.classList.toggle('active', c.dataset.category === 'all');
    });
    renderFileTable('all-files', state.files, 'all');
  } else if (['documents','images','videos','audio','archives','other'].includes(viewName)) {
    renderCategoryView(viewName);
  } else if (viewName === 'activity-log') {
    renderActivityLog();
  } else if (viewName === 'settings') {
    renderSettings();
  } else if (viewName === 'duplicates') {
    updateDuplicateButtons();
  } else if (viewName === 'dashboard') {
    refreshDashboard();
  }
}

// ─── Navigation Listeners ─────────────────────────────────────────────────────

document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => navigateTo(item.dataset.view));
});

// ─── Folder Selection ─────────────────────────────────────────────────────────

async function chooseFolder() {
  const result = await window.electronAPI.selectFolder();
  if (result.canceled) return;

  state.currentFolder = result.folderPath;
  state.files = [];
  state.scanned = false;
  state.filesOrganized = 0;

  // Update UI
  els.folderBadge.textContent = result.folderPath;
  els.btnScanHero.disabled = false;
  els.btnOrganizeHero.disabled = true;
  els.btnScanDuplicates.disabled = false;

  // Update settings if auto-save default folder
  if (state.settings.defaultFolder !== state.currentFolder) {
    // Don't auto-save, just reflect
  }

  updateBadges({});
  updateStats({});
  resetStorageChart();
  showToast(`Folder selected: ${result.folderPath.split('/').pop() || result.folderPath}`, 'info');
}

els.btnChooseFolder.addEventListener('click', chooseFolder);
els.btnSettingsChooseFolder.addEventListener('click', async () => {
  const result = await window.electronAPI.selectFolder();
  if (!result.canceled) {
    state.settings.defaultFolder = result.folderPath;
    els.settingsDefaultFolder.textContent = result.folderPath;
  }
});
els.btnSettingsClearFolder.addEventListener('click', () => {
  state.settings.defaultFolder = '';
  els.settingsDefaultFolder.textContent = 'Not set';
});

// ─── Scan Files ───────────────────────────────────────────────────────────────

async function scanFiles() {
  if (!state.currentFolder) { showToast('Please select a folder first.', 'error'); return; }
  if (state.scanning) return;

  state.scanning = true;
  setHeroLoading(true);

  const result = await window.electronAPI.scanFolder(state.currentFolder);

  state.scanning = false;
  setHeroLoading(false);

  if (!result.success) {
    showToast('Scan failed: ' + result.error, 'error');
    return;
  }

  state.files = result.files;
  state.scanned = true;
  state.duplicateGroups = [];

  // Compute category counts
  const counts = computeCategoryCounts(state.files);
  const totalSize = state.files.reduce((s, f) => s + (f.size || 0), 0);

  updateBadges(counts);
  updateStats({ totalFiles: state.files.length, totalSize, counts });
  renderStorageChart(counts);
  refreshDashboard();

  // Enable organize button
  els.btnOrganizeHero.disabled = state.files.length === 0;

  showToast(`Scan complete! Found ${state.files.length} files.`, 'success');

  // Notify
  await window.electronAPI.notify('Smart File Organizer', `Scan complete — ${state.files.length} files found.`);

  // If currently on a file view, refresh it
  if (['all-files','documents','images','videos','audio','archives','other'].includes(state.currentView)) {
    navigateTo(state.currentView);
  }
}

els.btnScanHero.addEventListener('click', scanFiles);

function setHeroLoading(loading) {
  els.btnScanHero.disabled = loading;
  els.btnOrganizeHero.disabled = loading;
  els.btnChooseFolder.disabled = loading;
  if (loading) {
    els.btnScanHero.innerHTML = '<span class="spinner" style="width:14px;height:14px;border-width:2px"></span> Scanning…';
  } else {
    els.btnScanHero.innerHTML = '🔍 Scan Files';
  }
}

// ─── Category Counts ──────────────────────────────────────────────────────────

function computeCategoryCounts(files) {
  const counts = { documents:0, images:0, videos:0, audio:0, archives:0, other:0 };
  const sizes  = { documents:0, images:0, videos:0, audio:0, archives:0, other:0 };
  for (const f of files) {
    const cat = f.category || 'other';
    counts[cat] = (counts[cat] || 0) + 1;
    sizes[cat]  = (sizes[cat]  || 0) + (f.size || 0);
  }
  return { counts, sizes };
}

// ─── Badges ───────────────────────────────────────────────────────────────────

function updateBadges({ counts } = {}) {
  const c = counts || {};
  $('badge-all').textContent       = state.files.length;
  $('badge-documents').textContent = c.documents || 0;
  $('badge-images').textContent    = c.images    || 0;
  $('badge-videos').textContent    = c.videos    || 0;
  $('badge-audio').textContent     = c.audio     || 0;
  $('badge-archives').textContent  = c.archives  || 0;
  $('badge-other').textContent     = c.other     || 0;
}

// ─── Stats Cards ──────────────────────────────────────────────────────────────

function updateStats({ totalFiles = 0, totalSize = 0 } = {}) {
  els.statTotalFiles.textContent  = totalFiles;
  els.statTotalSize.textContent   = formatBytes(totalSize);
  els.statOrganized.textContent   = state.filesOrganized;
}

// ─── Storage Chart ────────────────────────────────────────────────────────────

const CATEGORIES = ['documents','images','videos','audio','archives','other'];
const CAT_LABELS = {
  documents:'Documents', images:'Images', videos:'Videos',
  audio:'Audio', archives:'Archives', other:'Other'
};

function renderStorageChart({ counts } = {}) {
  if (!counts) { resetStorageChart(); return; }
  const total = Object.values(counts).reduce((a,b) => a+b, 0) || 1;

  els.storageChart.innerHTML = CATEGORIES.map(cat => {
    const count = counts[cat] || 0;
    const pct   = Math.round((count / total) * 100);
    return `
      <div class="chart-bar-row">
        <div class="chart-label">${CAT_LABELS[cat]}</div>
        <div class="chart-bar-bg">
          <div class="chart-bar-fill ${cat}" style="width:${pct}%"></div>
        </div>
        <div class="chart-count">${count}</div>
      </div>
    `;
  }).join('');
}

function resetStorageChart() {
  els.storageChart.innerHTML = `
    <div class="empty-state" style="padding:20px 0">
      <div class="empty-icon">📂</div>
      <div class="empty-title">No data yet</div>
      <div class="empty-desc">Select and scan a folder to see breakdown</div>
    </div>`;
}

// ─── Dashboard: Recent Activity ───────────────────────────────────────────────

async function refreshDashboard() {
  const logs = await window.electronAPI.getLogs();
  const recent = logs.slice(0, 5);

  if (recent.length === 0) {
    els.recentActivity.innerHTML = `
      <div class="empty-state" style="padding:20px 0">
        <div class="empty-icon">📜</div>
        <div class="empty-desc">No recent activity</div>
      </div>`;
    return;
  }

  const icons = { scan:'🔍', organize:'✨', delete:'🗑️', error:'⚠️', info:'ℹ️' };
  els.recentActivity.innerHTML = recent.map(log => `
    <div class="recent-item">
      <div class="recent-item-icon">${icons[log.type] || 'ℹ️'}</div>
      <div class="recent-item-text">
        <div class="recent-item-msg">${escapeHtml(log.message)}</div>
        <div class="recent-item-time">${formatDate(log.timestamp)}</div>
      </div>
    </div>
  `).join('');
}

// ─── File Table ───────────────────────────────────────────────────────────────

function sortFiles(files, sortKey) {
  const sorted = [...files];
  switch (sortKey) {
    case 'name-asc':  sorted.sort((a,b) => a.name.localeCompare(b.name)); break;
    case 'name-desc': sorted.sort((a,b) => b.name.localeCompare(a.name)); break;
    case 'size-asc':  sorted.sort((a,b) => (a.size||0) - (b.size||0)); break;
    case 'size-desc': sorted.sort((a,b) => (b.size||0) - (a.size||0)); break;
    case 'modified-asc':  sorted.sort((a,b) => new Date(a.modified||0) - new Date(b.modified||0)); break;
    case 'modified-desc': sorted.sort((a,b) => new Date(b.modified||0) - new Date(a.modified||0)); break;
  }
  return sorted;
}

function filterFiles(files, category, query) {
  let f = files;
  if (category && category !== 'all') f = f.filter(file => file.category === category);
  if (query) {
    const q = query.toLowerCase();
    f = f.filter(file => file.name.toLowerCase().includes(q));
  }
  return f;
}

function renderFileTable(viewId, allFiles, categoryFilter) {
  const container = viewId === 'all-files' ? els.fileTableWrap : document.querySelector(`#view-${viewId}`);
  if (!container) return;

  const query = els.searchInput ? els.searchInput.value.trim() : '';
  const sortKey = els.sortSelect ? els.sortSelect.value : 'name-asc';

  let files = filterFiles(allFiles, categoryFilter, query);
  files = sortFiles(files, sortKey);

  if (!state.scanned) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📂</div>
        <div class="empty-title">No folder scanned yet</div>
        <div class="empty-desc">Go to Dashboard, select a folder, and click "Scan Files".</div>
      </div>`;
    return;
  }

  if (files.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🔍</div>
        <div class="empty-title">No files found</div>
        <div class="empty-desc">Try a different search term or category filter.</div>
      </div>`;
    return;
  }

  const rows = files.map(file => {
    const icon    = getFileIcon(file.category, file.ext);
    const tagCls  = getCategoryTagClass(file.category);
    const catLabel= CAT_LABELS[file.category] || 'Other';
    return `
      <tr>
        <td>
          <div class="file-name-cell">
            <span class="file-icon">${icon}</span>
            <div>
              <div class="file-name" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</div>
              <div class="file-path" title="${escapeHtml(file.path)}">${escapeHtml(file.dir)}</div>
            </div>
          </div>
        </td>
        <td><span class="category-tag ${tagCls}">${catLabel}</span></td>
        <td>${formatBytes(file.size)}</td>
        <td>${formatDate(file.modified)}</td>
        <td>
          <div class="action-cell">
            <button class="btn btn-ghost btn-icon" title="Open file" data-action="open" data-path="${escapeHtml(file.path)}">🚀</button>
            <button class="btn btn-ghost btn-icon" title="Reveal in Finder" data-action="reveal" data-path="${escapeHtml(file.path)}">📂</button>
            <button class="btn btn-ghost btn-icon" title="File details" data-action="details" data-path="${escapeHtml(file.path)}" data-file='${JSON.stringify({name:file.name,path:file.path,size:file.size,modified:file.modified,created:file.created,category:file.category,ext:file.ext}).replace(/'/g,"&#39;")}'>ℹ️</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  // Wrap in file-table-wrap if it's the all-files view
  const tableHtml = `
    <div class="file-table-wrap">
      <table class="file-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Category</th>
            <th>Size</th>
            <th>Modified</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;

  if (viewId === 'all-files') {
    container.innerHTML = tableHtml;
  } else {
    // For category views, wrap in search row too
    container.innerHTML = `
      <div class="search-row">
        <div class="search-wrap">
          <span class="search-icon">🔎</span>
          <input type="text" class="search-input" id="search-${viewId}" placeholder="Search ${CAT_LABELS[categoryFilter] || ''} files…" />
        </div>
        <select class="sort-select" id="sort-${viewId}">
          <option value="name-asc">Name A→Z</option>
          <option value="name-desc">Name Z→A</option>
          <option value="size-desc">Largest First</option>
          <option value="size-asc">Smallest First</option>
          <option value="modified-desc">Newest First</option>
          <option value="modified-asc">Oldest First</option>
        </select>
      </div>
      ${tableHtml}
    `;

    // Category view search/sort listeners
    const catSearch = $('search-' + viewId);
    const catSort   = $('sort-' + viewId);
    if (catSearch) {
      catSearch.addEventListener('input', () => renderCategoryFiltered(viewId, categoryFilter, catSearch.value, catSort.value));
    }
    if (catSort) {
      catSort.addEventListener('change', () => renderCategoryFiltered(viewId, categoryFilter, catSearch.value, catSort.value));
    }
  }

  // Bind action buttons
  container.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', handleFileAction);
  });
}

function renderCategoryFiltered(viewId, category, query, sortKey) {
  const container = document.querySelector(`#view-${viewId}`);
  if (!container) return;

  let files = filterFiles(state.files, category, query);
  files = sortFiles(files, sortKey);

  const tableWrap = container.querySelector('.file-table-wrap');
  if (!tableWrap) return;

  if (files.length === 0) {
    tableWrap.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🔍</div>
        <div class="empty-title">No files found</div>
        <div class="empty-desc">Try a different search term.</div>
      </div>`;
    return;
  }

  const rows = files.map(file => {
    const icon = getFileIcon(file.category, file.ext);
    return `
      <tr>
        <td>
          <div class="file-name-cell">
            <span class="file-icon">${icon}</span>
            <div>
              <div class="file-name" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</div>
              <div class="file-path" title="${escapeHtml(file.path)}">${escapeHtml(file.dir)}</div>
            </div>
          </div>
        </td>
        <td>${formatBytes(file.size)}</td>
        <td>${formatDate(file.modified)}</td>
        <td>
          <div class="action-cell">
            <button class="btn btn-ghost btn-icon" data-action="open" data-path="${escapeHtml(file.path)}">🚀</button>
            <button class="btn btn-ghost btn-icon" data-action="reveal" data-path="${escapeHtml(file.path)}">📂</button>
            <button class="btn btn-ghost btn-icon" data-action="details" data-path="${escapeHtml(file.path)}" data-file='${JSON.stringify({name:file.name,path:file.path,size:file.size,modified:file.modified,created:file.created,category:file.category,ext:file.ext}).replace(/'/g,"&#39;")}'>ℹ️</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  tableWrap.innerHTML = `
    <table class="file-table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Size</th>
          <th>Modified</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  tableWrap.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', handleFileAction);
  });
}

function renderCategoryView(viewId) {
  const category = viewId; // viewId matches category name
  renderFileTable(viewId, state.files, category);
}

// ─── File Actions ─────────────────────────────────────────────────────────────

async function handleFileAction(e) {
  const btn = e.currentTarget;
  const action = btn.dataset.action;
  const filePath = btn.dataset.path;

  switch (action) {
    case 'open':
      await window.electronAPI.openFile(filePath);
      break;
    case 'reveal':
      await window.electronAPI.revealFile(filePath);
      break;
    case 'details': {
      try {
        const fileData = JSON.parse(btn.dataset.file.replace(/&#39;/g, "'"));
        await window.electronAPI.openDetailWindow(fileData);
      } catch (err) {
        showToast('Could not open file details.', 'error');
      }
      break;
    }
  }
}

// ─── Search/Filter (All Files view) ──────────────────────────────────────────

els.searchInput.addEventListener('input', () => {
  if (state.currentView === 'all-files') {
    renderFileTable('all-files', state.files, state.fileListFilter);
  }
});

els.sortSelect.addEventListener('change', () => {
  if (state.currentView === 'all-files') {
    renderFileTable('all-files', state.files, state.fileListFilter);
  }
});

els.btnRefreshFiles.addEventListener('click', async () => {
  if (!state.currentFolder) { showToast('No folder selected.', 'error'); return; }
  await scanFiles();
});

// Category chips
document.querySelectorAll('.category-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('.category-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    state.fileListFilter = chip.dataset.category;
    renderFileTable('all-files', state.files, state.fileListFilter);
  });
});

// ─── Organize Files ───────────────────────────────────────────────────────────

els.btnOrganizeHero.addEventListener('click', organizeFiles);

async function organizeFiles() {
  if (!state.currentFolder) { showToast('Please select a folder first.', 'error'); return; }
  if (!state.scanned) { showToast('Please scan the folder first.', 'error'); return; }
  if (state.organizing) return;

  // Check settings: preview before organizing
  const settings = await window.electronAPI.getSettings();

  if (settings.previewBeforeOrganize !== false) {
    // Show preview modal
    state.organizing = true;
    els.btnOrganizeHero.disabled = true;
    els.btnOrganizeHero.textContent = 'Building preview…';

    const preview = await window.electronAPI.previewOrganize(state.currentFolder);

    els.btnOrganizeHero.disabled = false;
    els.btnOrganizeHero.textContent = '✨ Organize Files';
    state.organizing = false;

    if (!preview.success) {
      showToast('Preview failed: ' + preview.error, 'error');
      return;
    }

    if (preview.plan.length === 0) {
      showToast('No files to organize — all files may already be categorized.', 'info');
      return;
    }

    renderOrganizePreview(preview.plan);
    showModal(els.modalOrganize);
  } else {
    // Directly confirm with simple modal
    const confirmed = await showConfirm(
      'Organize Files?',
      `This will move ${state.files.length} file(s) into category subfolders. This action cannot be undone easily.`
    );
    if (!confirmed) return;
    await executeOrganize();
  }
}

function renderOrganizePreview(plan) {
  const items = plan.slice(0, 200); // cap at 200 for rendering performance
  els.previewList.innerHTML = items.map(item => `
    <div class="preview-item">
      <span class="preview-file" title="${escapeHtml(item.from)}">${escapeHtml(item.filename)}${item.renamed ? ' <span style="color:var(--color-orange);font-size:11px">(renamed)</span>' : ''}</span>
      <span class="preview-arrow">→</span>
      <span class="preview-dest" title="${escapeHtml(item.to)}">${escapeHtml(item.categoryDir + '/' + (item.renamed ? item.to.split('/').pop() : item.filename))}</span>
    </div>
  `).join('');

  if (plan.length > 200) {
    els.previewList.innerHTML += `<div style="padding:10px 14px;color:var(--color-text-muted);font-size:12.5px;">… and ${plan.length - 200} more files</div>`;
  }
}

async function executeOrganize() {
  state.organizing = true;
  els.btnConfirmOrganize.disabled = true;
  els.btnConfirmOrganize.textContent = 'Moving files…';

  const result = await window.electronAPI.executeOrganize(state.currentFolder);

  els.btnConfirmOrganize.disabled = false;
  els.btnConfirmOrganize.textContent = '✅ Confirm & Move Files';
  state.organizing = false;
  hideModal(els.modalOrganize);

  if (!result.success) {
    showToast('Organization failed: ' + result.error, 'error');
    return;
  }

  state.filesOrganized += result.result.moved;
  els.statOrganized.textContent = state.filesOrganized;

  showToast(`Done! ${result.result.moved} files moved, ${result.result.skipped} skipped.`, 'success');

  // Re-scan to update file list
  await scanFiles();
}

els.btnCancelOrganize.addEventListener('click', () => hideModal(els.modalOrganize));
els.btnConfirmOrganize.addEventListener('click', executeOrganize);

// ─── Duplicate Detection ──────────────────────────────────────────────────────

function updateDuplicateButtons() {
  els.btnScanDuplicates.disabled = !state.currentFolder;
  els.btnDeleteSelected.disabled = true;
}

els.btnScanDuplicates.addEventListener('click', scanDuplicates);

async function scanDuplicates() {
  if (!state.currentFolder) { showToast('Please select a folder first.', 'error'); return; }
  if (state.duplicatesScanning) return;

  state.duplicatesScanning = true;
  els.btnScanDuplicates.disabled = true;
  els.btnScanDuplicates.innerHTML = '<span class="spinner" style="width:14px;height:14px;border-width:2px"></span> Scanning…';
  els.dupContent.innerHTML = `
    <div class="loading-state">
      <div class="spinner"></div>
      <div class="loading-text">Computing file hashes… this may take a moment for large folders.</div>
    </div>`;

  const result = await window.electronAPI.detectDuplicates(state.currentFolder);

  state.duplicatesScanning = false;
  els.btnScanDuplicates.disabled = false;
  els.btnScanDuplicates.textContent = '🔍 Scan for Duplicates';

  if (!result.success) {
    showToast('Duplicate scan failed: ' + result.error, 'error');
    els.dupContent.innerHTML = `<div class="empty-state"><div class="empty-icon">❌</div><div class="empty-title">Scan failed</div><div class="empty-desc">${escapeHtml(result.error)}</div></div>`;
    return;
  }

  state.duplicateGroups = result.groups;
  els.statDuplicates.textContent = result.groups.length;
  renderDuplicates(result.groups);
}

function renderDuplicates(groups) {
  if (groups.length === 0) {
    els.dupContent.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">✅</div>
        <div class="empty-title">No duplicates found!</div>
        <div class="empty-desc">All files in the selected folder have unique content.</div>
      </div>`;
    els.btnDeleteSelected.disabled = true;
    return;
  }

  els.dupContent.innerHTML = `
    <div style="margin-bottom:14px;display:flex;align-items:center;gap:10px">
      <span style="font-size:13.5px;color:var(--color-text-secondary)">
        Found <strong>${groups.length}</strong> duplicate groups.
        Select files to delete (keep at least one copy).
      </span>
    </div>
    ${groups.map((group, gi) => {
      const wastedBytes = group.size * (group.files.length - 1);
      return `
        <div class="dup-group">
          <div class="dup-group-header">
            <div>
              <div class="dup-group-title">Duplicate Group ${gi + 1}</div>
              <div class="dup-group-meta">${group.files.length} files · ${formatBytes(group.size)} each</div>
            </div>
            <div class="dup-waste-badge">Wastes ${formatBytes(wastedBytes)}</div>
          </div>
          ${group.files.map((file, fi) => `
            <div class="dup-file-row">
              <input type="checkbox" class="dup-checkbox" data-group="${gi}" data-file="${fi}"
                     data-path="${escapeHtml(file.path)}"
                     ${fi === 0 ? '' : ''}
                     id="dup-${gi}-${fi}" />
              <label for="dup-${gi}-${fi}" style="flex:1;display:flex;gap:12px;align-items:center;cursor:pointer">
                <div class="dup-file-name" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</div>
                <div class="dup-file-path" title="${escapeHtml(file.path)}">${escapeHtml(file.path)}</div>
              </label>
              <div style="display:flex;gap:6px">
                <button class="btn btn-ghost btn-icon btn-sm" data-action="reveal" data-path="${escapeHtml(file.path)}">📂</button>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    }).join('')}
  `;

  // Checkbox change handler
  els.dupContent.querySelectorAll('.dup-checkbox').forEach(cb => {
    cb.addEventListener('change', updateDeleteButton);
  });

  // Reveal buttons
  els.dupContent.querySelectorAll('[data-action="reveal"]').forEach(btn => {
    btn.addEventListener('click', () => window.electronAPI.revealFile(btn.dataset.path));
  });

  els.btnDeleteSelected.disabled = true;
}

function updateDeleteButton() {
  const anyChecked = els.dupContent.querySelectorAll('.dup-checkbox:checked').length > 0;
  els.btnDeleteSelected.disabled = !anyChecked;
}

els.btnDeleteSelected.addEventListener('click', async () => {
  const checked = [...els.dupContent.querySelectorAll('.dup-checkbox:checked')];
  const paths = checked.map(cb => cb.dataset.path);

  if (paths.length === 0) { showToast('No files selected.', 'error'); return; }

  // Show delete confirmation modal
  els.deleteList.innerHTML = paths.map(p => `
    <div class="preview-item">
      <span class="preview-file" title="${escapeHtml(p)}">${escapeHtml(p.split('/').pop())}</span>
      <span style="color:var(--color-text-muted);font-size:11.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(p)}</span>
    </div>
  `).join('');

  $('modal-delete-subtitle').textContent = `You are about to permanently delete ${paths.length} file(s). This cannot be undone.`;
  showModal(els.modalDelete);

  // Store paths for confirm handler
  els.btnConfirmDelete.dataset.pendingPaths = JSON.stringify(paths);
});

els.btnCancelDelete.addEventListener('click', () => hideModal(els.modalDelete));

els.btnConfirmDelete.addEventListener('click', async () => {
  const paths = JSON.parse(els.btnConfirmDelete.dataset.pendingPaths || '[]');
  hideModal(els.modalDelete);

  els.btnConfirmDelete.disabled = true;
  const result = await window.electronAPI.deleteFiles(paths);
  els.btnConfirmDelete.disabled = false;

  if (result.success) {
    showToast(`Deleted ${result.results.deleted.length} file(s).`, 'success');
    if (result.results.errors.length > 0) {
      showToast(`${result.results.errors.length} file(s) could not be deleted.`, 'error');
    }
    // Re-scan duplicates
    await scanDuplicates();
    // Re-scan main files
    if (state.scanned) await scanFiles();
  } else {
    showToast('Delete operation failed: ' + result.error, 'error');
  }
});

// ─── Activity Log ─────────────────────────────────────────────────────────────

async function renderActivityLog() {
  const logs = await window.electronAPI.getLogs();

  if (logs.length === 0) {
    els.logContent.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📜</div>
        <div class="empty-title">No activity yet</div>
        <div class="empty-desc">Activity is recorded automatically when you scan, organize, or delete files.</div>
      </div>`;
    return;
  }

  const typeLabels = { scan:'Scan', organize:'Organize', delete:'Delete', error:'Error', info:'Info' };
  const icons = { scan:'🔍', organize:'✨', delete:'🗑️', error:'⚠️', info:'ℹ️' };

  els.logContent.innerHTML = `
    <div class="log-list">
      ${logs.map(log => `
        <div class="log-item">
          <div class="log-dot ${log.type || 'info'}"></div>
          <div class="log-content">
            <div class="log-message">${icons[log.type] || 'ℹ️'} ${escapeHtml(log.message)}</div>
            <div class="log-time">${formatDate(log.timestamp)}</div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

els.btnClearLogs.addEventListener('click', async () => {
  const confirmed = await showConfirm('Clear Activity Log?', 'All activity history will be permanently removed.');
  if (!confirmed) return;
  await window.electronAPI.clearLogs();
  showToast('Activity log cleared.', 'success');
  renderActivityLog();
  refreshDashboard();
});

// ─── Settings ─────────────────────────────────────────────────────────────────

async function renderSettings() {
  const settings = await window.electronAPI.getSettings();
  state.settings = settings;

  els.settingsDefaultFolder.textContent = settings.defaultFolder || 'Not set';
  els.settingNotifications.checked      = settings.notifications !== false;
  els.settingPreview.checked            = settings.previewBeforeOrganize !== false;
}

els.btnSaveSettings.addEventListener('click', async () => {
  const settings = {
    defaultFolder:         state.settings.defaultFolder || '',
    notifications:         els.settingNotifications.checked,
    previewBeforeOrganize: els.settingPreview.checked,
  };
  const result = await window.electronAPI.saveSettings(settings);
  if (result.success) {
    state.settings = settings;
    showToast('Settings saved.', 'success');
  } else {
    showToast('Failed to save settings.', 'error');
  }
});

els.btnSettingsClearHistory.addEventListener('click', async () => {
  const confirmed = await showConfirm('Clear Activity History?', 'All activity logs will be permanently removed.');
  if (!confirmed) return;
  await window.electronAPI.clearLogs();
  showToast('Activity history cleared.', 'success');
});

// ─── Init ─────────────────────────────────────────────────────────────────────

async function init() {
  // Load settings
  state.settings = await window.electronAPI.getSettings();

  // Apply default folder from settings
  if (state.settings.defaultFolder) {
    state.currentFolder = state.settings.defaultFolder;
    els.folderBadge.textContent = state.settings.defaultFolder;
    els.btnScanHero.disabled = false;
    els.btnScanDuplicates.disabled = false;
  }

  // Refresh dashboard
  await refreshDashboard();
}

init();
