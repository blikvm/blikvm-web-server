import FormData from 'form-data';
import fs from 'fs';
import path from 'path';
import { ApiCode } from '../src/common/api.js';
import { MSD_MOUNT_DIR } from '../src/common/constants.js';
import { api } from './_helpers/apiClient.js';

const TEST_IMAGE_NAME = 'dummy.iso';
const TEST_IMAGE_SOURCE = 'test/data/dummy.iso';
const TARGET_UPLOADED_FILE = path.join(MSD_MOUNT_DIR, TEST_IMAGE_NAME);

function ensureMountDir() {
  if (!fs.existsSync(MSD_MOUNT_DIR)) {
    fs.mkdirSync(MSD_MOUNT_DIR, { recursive: true });
  }
}

function removeResidualTestFile() {
  ensureMountDir();
  if (fs.existsSync(TARGET_UPLOADED_FILE)) {
    fs.rmSync(TARGET_UPLOADED_FILE, { force: true });
  }
}

describe('MSD API', () => {
  beforeEach(() => {
    removeResidualTestFile();
  });

  afterEach(() => {
    removeResidualTestFile();
  });

  test('POST /api/msd/upload rejects when file missing', async () => {
    const { status, json } = await api('POST', '/api/msd/upload');
    expect(status).toBe(400);
    expect(json?.code).toBe(ApiCode.INVALID_INPUT_PARAM);
  });

  test('POST /api/msd/upload accepts ISO payload', async () => {
    const form = new FormData();
    expect(fs.existsSync(TARGET_UPLOADED_FILE)).toBe(false);

    form.append('image', fs.createReadStream(TEST_IMAGE_SOURCE), TEST_IMAGE_NAME);

    const { status, json } = await api('POST', '/api/msd/upload', form);
    expect([200, 201]).toContain(status);
    expect(json?.code).toBe(ApiCode.OK);

    expect(fs.existsSync(TARGET_UPLOADED_FILE)).toBe(true);
    const stats = fs.statSync(TARGET_UPLOADED_FILE);
    expect(stats.size).toBeGreaterThan(0);

    fs.rmSync(TARGET_UPLOADED_FILE);
  });
});