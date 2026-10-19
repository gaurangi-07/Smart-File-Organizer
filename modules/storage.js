const { app } = require('electron');
const fs = require('fs');
const path = require('path');

const MAX_LOGS = 500;

function getSettingsPath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function getLogsPath() {
  return path.join(app.getPath('userData'), 'activity-log.json');
}

// ─── Settings ────────────────────────────────────────────────────────────────

const defaultSettings = {
  defaultFolder: '',
  notifications: true,
  previewBeforeOrganize: true,
};

function getSettings() {
  try {
    const raw = fs.readFileSync(getSettingsPath(), 'utf8');
    return { ...defaultSettings, ...JSON.parse(raw) };
  } catch {
    return { ...defaultSettings };
  }
}

function saveSettings(settings) {
  const merged = { ...defaultSettings, ...settings };
  fs.writeFileSync(getSettingsPath(), JSON.stringify(merged, null, 2), 'utf8');
}

// ─── Activity Log ─────────────────────────────────────────────────────────────

function getLogs() {
  try {
    const raw = fs.readFileSync(getLogsPath(), 'utf8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function appendLog(entry) {
  const logs = getLogs();
  logs.unshift({
    ...entry,
    timestamp: new Date().toISOString(),
    id: Date.now() + Math.random().toString(36).slice(2),
  });

  // Trim to max
  const trimmed = logs.slice(0, MAX_LOGS);
  fs.writeFileSync(getLogsPath(), JSON.stringify(trimmed, null, 2), 'utf8');
}

function clearLogs() {
  fs.writeFileSync(getLogsPath(), JSON.stringify([], null, 2), 'utf8');
}

module.exports = { getSettings, saveSettings, getLogs, appendLog, clearLogs };
