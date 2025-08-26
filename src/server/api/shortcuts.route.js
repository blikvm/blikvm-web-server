import fs from 'fs';
import { createApiObj, ApiCode } from '../../common/api.js';
import ShortcutsConfigUpdate from '../../modules/update/shortcuts_update.js';
import { UTF8, SHORTCUTS_PATH } from '../../common/constants.js';
// Compute config path relative to project root (web_server/)
// Avoid import.meta for Jest compatibility

const TargetOS = {
  WINDOWS: 'windows',
  MACOS: 'macos',
  LINUX: 'linux',
  ANDROID: 'android',
  IOS: 'ios',
};

function loadData() {
  const text = fs.readFileSync(SHORTCUTS_PATH, UTF8);
  return JSON.parse(text);
}

function saveData(obj) {
  fs.writeFileSync(SHORTCUTS_PATH, JSON.stringify(obj, null, 2), UTF8);
}

function normalizeOS(os) {
  const v = String(os || '').toLowerCase();
  if (v in TargetOS) return v;
  // allow direct 'windows'/'macos'/...
  if (Object.values(TargetOS).includes(v)) return v;
  return null;
}

// GET /api/shortcuts/:targetOS
function getShortcuts(req, res, next) {
  try {
    const os = normalizeOS(req.params.targetOS);
    if (!os) return res.status(400).json({ success: false, error: 'Invalid targetOS', code: 'INVALID_OS' });
  const db = loadData();
  const items = Object.entries(db.shortcuts[os] || {}).map(([name, keys]) => ({ name, keys }));
    const ret = createApiObj();
    ret.code = ApiCode.OK;
    ret.data = { items, targetOS: os };
    res.json(ret);
  } catch (e) { next(e); }
}

// POST /api/shortcuts/:targetOS
function createShortcut(req, res, next) {
  try {
    const os = normalizeOS(req.params.targetOS);
    if (!os) return res.status(400).json({ success: false, error: 'Invalid targetOS', code: 'INVALID_OS' });
    const { name, keys } = req.body || {};
    if (!name || !Array.isArray(keys) || !keys.length) {
      return res.status(400).json({ success: false, error: 'Invalid payload', code: 'BAD_REQUEST' });
    }
    const db = loadData();
    db.shortcuts[os] = db.shortcuts[os] || {};
    if (db.shortcuts[os][name]) {
      return res.status(400).json({ success: false, error: `Shortcut "${name}" already exists`, code: 'DUPLICATE_NAME' });
    }
    db.shortcuts[os][name] = keys;
    saveData(db);
    const ret = createApiObj();
    ret.code = ApiCode.CREATED || 201;
    ret.data = { name, keys };
    res.status(201).json(ret);
  } catch (e) { next(e); }
}

// PATCH /api/shortcuts/:targetOS/:name
function updateShortcut(req, res, next) {
  try {
    const os = normalizeOS(req.params.targetOS);
    const name = req.params.name;
    if (!os || !name) return res.status(400).json({ success: false, error: 'Invalid params', code: 'BAD_REQUEST' });
    const { newName, keys } = req.body || {};
    const db = loadData();
    const bucket = db.shortcuts[os] || {};
    if (!bucket[name]) {
      return res.status(404).json({ success: false, error: `Shortcut "${name}" not found`, code: 'NOT_FOUND' });
    }
    let finalName = name;
    if (newName && newName !== name) {
      if (bucket[newName]) {
        return res.status(400).json({ success: false, error: `Shortcut "${newName}" already exists`, code: 'DUPLICATE_NAME' });
      }
      bucket[newName] = bucket[name];
      delete bucket[name];
      finalName = newName;
    }
    if (Array.isArray(keys) && keys.length) {
      bucket[finalName] = keys;
    }
    db.shortcuts[os] = bucket;
    saveData(db);
    const ret = createApiObj();
    ret.code = ApiCode.OK;
    ret.data = { name: finalName, keys: bucket[finalName] };
    res.json(ret);
  } catch (e) { next(e); }
}

// DELETE /api/shortcuts/:targetOS/:name
function deleteShortcut(req, res, next) {
  try {
    const os = normalizeOS(req.params.targetOS);
    const name = req.params.name;
    if (!os || !name) return res.status(400).json({ success: false, error: 'Invalid params', code: 'BAD_REQUEST' });
    const db = loadData();
    const bucket = db.shortcuts[os] || {};
    if (!bucket[name]) {
      return res.status(404).json({ success: false, error: `Shortcut "${name}" not found`, code: 'NOT_FOUND' });
    }
    delete bucket[name];
    db.shortcuts[os] = bucket;
    saveData(db);
    res.json({ success: true, data: { message: 'Shortcut deleted successfully' } });
  } catch (e) { next(e); }
}

// POST /api/shortcuts/:targetOS/reset
function resetShortcuts(req, res, next) {
  try {
    const os = normalizeOS(req.params.targetOS);
    if (!os) return res.status(400).json({ success: false, error: 'Invalid targetOS', code: 'INVALID_OS' });
  // Source defaults from ShortcutsConfigUpdate to ensure a single truth
  const updater = new ShortcutsConfigUpdate();
  const defaults = updater._defaultConfig || { shortcuts: {} };
  const base = defaults.shortcuts && defaults.shortcuts[os] ? defaults.shortcuts[os] : {};
  const items = Object.entries(base).map(([name, keys]) => ({ name, keys }));
    const ret = createApiObj();
    ret.code = ApiCode.OK;
    ret.data = { message: 'Reset to default shortcuts', items };
    res.json(ret);
  } catch (e) { next(e); }
}

export { getShortcuts, createShortcut, updateShortcut, deleteShortcut, resetShortcuts, TargetOS };
