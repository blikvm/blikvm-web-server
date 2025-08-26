import fs from 'fs';
import path from 'path';
import { getShortcuts, createShortcut, updateShortcut, deleteShortcut, resetShortcuts } from '../src/server/api/shortcuts.route.js';
import ShortcutsConfigUpdate from '../src/modules/update/shortcuts_update.js';

// Avoid import.meta in Jest by using process.cwd() (tests run from web_server/)
const CONFIG_FILE = path.resolve(process.cwd(), 'config/shortcuts.json');

function readJSON(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }
function writeJSON(p, obj) { fs.writeFileSync(p, JSON.stringify(obj, null, 2), 'utf8'); }

function mockRes() {
  const res = {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(obj) { this.body = obj; return this; },
    send(obj) { this.body = obj; return this; },
  };
  return res;
}

function mockNext(err) { if (err) throw err; }

let backup;

beforeAll(() => {
  backup = readJSON(CONFIG_FILE);
});

beforeEach(() => {
  // Reset to original backup before each test
  writeJSON(CONFIG_FILE, backup);
});

afterAll(() => {
  // Restore original file
  writeJSON(CONFIG_FILE, backup);
});

function expectNoWarning(items) {
  for (const it of items) {
    expect(it).not.toHaveProperty('warning');
  }
}

function toItemArrayFromMap(mapObj) {
  return Object.entries(mapObj || {}).map(([name, keys]) => ({ name, keys }));
}

function sortItems(items) {
  return [...items].sort((a, b) => a.name.localeCompare(b.name));
}

test('GET /api/shortcuts/:targetOS returns items without warning', () => {
  const req = { params: { targetOS: 'windows' } };
  const res = mockRes();
  getShortcuts(req, res, mockNext);
  expect(res.statusCode).toBe(200);
  expect(res.body?.data?.items).toBeDefined();
  expectNoWarning(res.body.data.items);
  // sanity: contains known default
  const names = res.body.data.items.map(x => x.name);
  expect(names.length).toBeGreaterThan(0);
});

test('POST createShortcut then GET shows new item and no warning', () => {
  const reqCreate = { params: { targetOS: 'windows' }, body: { name: 'MyTest', keys: ['ControlLeft','AltLeft','KeyM'] } };
  const resCreate = mockRes();
  createShortcut(reqCreate, resCreate, mockNext);
  expect(resCreate.statusCode).toBe(201);
  expect(resCreate.body?.data?.name).toBe('MyTest');
  expect(resCreate.body?.data?.keys).toEqual(['ControlLeft','AltLeft','KeyM']);

  const reqGet = { params: { targetOS: 'windows' } };
  const resGet = mockRes();
  getShortcuts(reqGet, resGet, mockNext);
  const items = resGet.body.data.items;
  expect(items.some(x => x.name === 'MyTest')).toBe(true);
  expectNoWarning(items);
});

test('POST duplicate shortcut returns 400', () => {
  const name = 'DupTest';
  // create once
  createShortcut({ params: { targetOS: 'windows' }, body: { name, keys: ['KeyA'] } }, mockRes(), mockNext);
  // create again
  const resDup = mockRes();
  createShortcut({ params: { targetOS: 'windows' }, body: { name, keys: ['KeyB'] } }, resDup, mockNext);
  expect(resDup.statusCode).toBe(400);
});

test('PATCH updateShortcut can rename and change keys', () => {
  // seed
  createShortcut({ params: { targetOS: 'windows' }, body: { name: 'OldName', keys: ['KeyX'] } }, mockRes(), mockNext);

  const resUpdate = mockRes();
  updateShortcut({ params: { targetOS: 'windows', name: 'OldName' }, body: { newName: 'NewName', keys: ['ControlLeft','KeyN'] } }, resUpdate, mockNext);
  expect(resUpdate.statusCode).toBe(200);
  expect(resUpdate.body?.data?.name).toBe('NewName');
  expect(resUpdate.body?.data?.keys).toEqual(['ControlLeft','KeyN']);

  const resGet = mockRes();
  getShortcuts({ params: { targetOS: 'windows' } }, resGet, mockNext);
  const items = resGet.body.data.items;
  expect(items.some(x => x.name === 'NewName')).toBe(true);
  expect(items.some(x => x.name === 'OldName')).toBe(false);
  expectNoWarning(items);
});

test('DELETE deleteShortcut removes item', () => {
  createShortcut({ params: { targetOS: 'windows' }, body: { name: 'ToDelete', keys: ['KeyD'] } }, mockRes(), mockNext);
  const resDel = mockRes();
  deleteShortcut({ params: { targetOS: 'windows', name: 'ToDelete' } }, resDel, mockNext);
  expect(resDel.statusCode).toBe(200);

  const resGet = mockRes();
  getShortcuts({ params: { targetOS: 'windows' } }, resGet, mockNext);
  const names = resGet.body.data.items.map(x => x.name);
  expect(names.includes('ToDelete')).toBe(false);
});

test('POST resetShortcuts returns factory defaults from ShortcutsConfigUpdate after modifications', () => {
  // 1) Load factory defaults via updater
  const updater = new ShortcutsConfigUpdate();
  const defaults = updater._defaultConfig;
  expect(defaults).toBeDefined();
  const expectedItems = toItemArrayFromMap(defaults.shortcuts.windows);

  // 2) Add a temporary custom shortcut to windows
  const tempName = 'TmpCustom';
  const tempKeys = ['ControlLeft', 'AltLeft', 'KeyZ'];
  const resCreate = mockRes();
  createShortcut({ params: { targetOS: 'windows' }, body: { name: tempName, keys: tempKeys } }, resCreate, mockNext);
  expect(resCreate.statusCode).toBe(201);

  // Sanity: it appears in GET
  const resGet = mockRes();
  getShortcuts({ params: { targetOS: 'windows' } }, resGet, mockNext);
  const hasTmp = resGet.body.data.items.some(x => x.name === tempName);
  expect(hasTmp).toBe(true);

  // 3) Reset and compare with factory defaults (order-insensitive)
  const resReset = mockRes();
  resetShortcuts({ params: { targetOS: 'windows' } }, resReset, mockNext);
  expect(resReset.statusCode).toBe(200);
  const resetItems = resReset.body?.data?.items || [];
  expect(resetItems.length).toBeGreaterThan(0);
  expectNoWarning(resetItems);

  const a = sortItems(resetItems);
  const b = sortItems(expectedItems);
  expect(a).toEqual(b);
});
