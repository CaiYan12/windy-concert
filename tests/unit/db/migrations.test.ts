import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from '../../../src/main/database/connection';

let tmp: string | null = null;

afterEach(() => {
  if (tmp) {
    rmSync(tmp, { recursive: true, force: true });
    tmp = null;
  }
});

describe('database migrations', () => {
  it('opens :memory: with user_version = 1', () => {
    const db = openDatabase(':memory:');
    const version = db.pragma('user_version', { simple: true }) as number;
    expect(version).toBe(1);
    db.close();
  });

  it('is idempotent across repeated openDatabase calls on the same file', () => {
    tmp = mkdtempSync(join(tmpdir(), 'windy-test-'));
    const file = join(tmp, 'library.db');

    const first = openDatabase(file);
    expect(first.pragma('user_version', { simple: true })).toBe(1);
    first.close();

    const second = openDatabase(file);
    expect(second.pragma('user_version', { simple: true })).toBe(1);
    second.close();
  });

  it('ships SQLite >= 3.34 (trigram tokenizer guard)', () => {
    const db = openDatabase(':memory:');
    const row = db.prepare('SELECT sqlite_version() v').get() as { v: string };
    const [major, minor] = row.v.split('.').map(Number);
    const meets = major > 3 || (major === 3 && minor >= 34);
    expect(meets).toBe(true);
    db.close();
  });
});
