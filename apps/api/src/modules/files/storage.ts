import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * File storage abstraction (spec §10.3: file contents live outside relational
 * rows). The local driver keeps a level-1 sharded layout under a data root;
 * swapping in S3 later only requires implementing this interface.
 */
export interface FileStorage {
  /** Persist bytes; returns the storage key to store in the DB. */
  put(data: Buffer): Promise<string>;
  get(storageKey: string): Promise<Buffer>;
  delete(storageKey: string): Promise<void>;
}

const SHARD_PATTERN = /^[a-f0-9]{2}\/[a-f0-9]{32}$/;

function assertSafeKey(storageKey: string): void {
  // Defends against traversal (../, absolute paths, backslashes) even though
  // keys are generated internally — belt and suspenders (spec §11.2).
  if (!SHARD_PATTERN.test(storageKey)) {
    throw new Error('Invalid storage key');
  }
}

export class LocalFileStorage implements FileStorage {
  private readonly root: string;

  constructor(rootDir: string) {
    this.root = path.resolve(rootDir);
  }

  async put(data: Buffer): Promise<string> {
    const shard = crypto.randomBytes(1).toString('hex');
    const name = crypto.randomBytes(16).toString('hex');
    const key = `${shard}/${name}`;
    const dir = path.join(this.root, shard);
    await fs.mkdir(dir, { recursive: true });
    // Write-then-rename keeps partial files from ever being visible.
    const tmp = path.join(dir, `${name}.tmp`);
    await fs.writeFile(tmp, data);
    await fs.rename(tmp, path.join(dir, name));
    return key;
  }

  async get(storageKey: string): Promise<Buffer> {
    assertSafeKey(storageKey);
    return fs.readFile(path.join(this.root, storageKey));
  }

  async delete(storageKey: string): Promise<void> {
    assertSafeKey(storageKey);
    await fs.rm(path.join(this.root, storageKey), { force: true });
  }
}

let defaultStorage: FileStorage | null = null;

/** Lazily constructed default storage rooted at STORAGE_DIR (or ./data/uploads). */
export function getStorage(): FileStorage {
  if (!defaultStorage) {
    defaultStorage = new LocalFileStorage(envStorageRoot());
  }
  return defaultStorage;
}

function envStorageRoot(): string {
  // Imported lazily to keep this module loadable in unit tests without env setup.
  return process.env.STORAGE_DIR ?? path.join(process.cwd(), 'data', 'uploads');
}
