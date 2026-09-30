import { describe, expect, it, afterAll } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { LocalFileStorage } from './storage.js';

const tmpRoot = path.join(os.tmpdir(), `ai-zone-storage-test-${Date.now()}`);
const storage = new LocalFileStorage(tmpRoot);

afterAll(async () => {
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

describe('LocalFileStorage', () => {
  it('roundtrips bytes through put/get', async () => {
    const data = Buffer.from('document body \u2713');
    const key = await storage.put(data);
    expect(key).toMatch(/^[a-f0-9]{2}\/[a-f0-9]{32}$/);
    const readBack = await storage.get(key);
    expect(readBack.equals(data)).toBe(true);
  });

  it('generates unique keys', async () => {
    const a = await storage.put(Buffer.from('a'));
    const b = await storage.put(Buffer.from('b'));
    expect(a).not.toBe(b);
  });

  it('leaves no temp files behind', async () => {
    await storage.put(Buffer.from('clean'));
    const entries = await fs.readdir(tmpRoot, { recursive: true });
    expect(entries.every((e) => !String(e).endsWith('.tmp'))).toBe(true);
  });

  it('refuses path-traversal keys on get', async () => {
    await expect(storage.get('../../etc/passwd')).rejects.toThrowError(/Invalid storage key/);
    await expect(storage.get('..\\..\\secret')).rejects.toThrowError(/Invalid storage key/);
    await expect(storage.get('/absolute/path')).rejects.toThrowError(/Invalid storage key/);
  });

  it('refuses malformed keys on delete too', async () => {
    await expect(storage.delete('zz/not-a-key')).rejects.toThrowError(/Invalid storage key/);
  });

  it('deletes stored objects', async () => {
    const key = await storage.put(Buffer.from('to delete'));
    await storage.delete(key);
    await expect(storage.get(key)).rejects.toThrowError();
  });
});
