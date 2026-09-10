import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../../../src/main/database/connection';
import { createFolderRepo, type FolderRepo } from '../../../src/main/database/repositories/folderRepo';
import type { Database } from 'better-sqlite3';

interface Ctx {
  db: Database;
  folderRepo: FolderRepo;
}

function setup(): Ctx {
  const db = openDatabase(':memory:');
  const folderRepo = createFolderRepo(db);
  return { db, folderRepo };
}

let current: Ctx | null = null;
afterEach(() => {
  if (current) {
    current.db.close();
    current = null;
  }
});

describe('folderRepo', () => {
  it('add 路径规范化：小写盘符 + 去尾部分隔符（"D:\\Music\\" → "d:\\Music"）', () => {
    current = setup();
    const { db, folderRepo } = current;
    const f = folderRepo.add('D:\\Music\\'); // 原始 Windows 路径（字符串转义为单反斜杠）
    expect(f.path).toBe('d:\\Music'); // 盘符小写，尾部 \ 去除
    expect(f.enabled).toBe(true);
    expect(f.recursive).toBe(true);

    // 校验实际落库形态
    const row = db.prepare(`SELECT path FROM library_folders WHERE id = ?`).get(f.id) as { path: string };
    expect(row.path).toBe('d:\\Music');

    // 多斜杠尾部与正斜杠尾部同样规范化
    const f2 = folderRepo.add('C:/Users/Music///');
    expect(f2.path).toBe('c:/Users/Music');
  });

  it('setEnabled 切换 enabled', () => {
    current = setup();
    const { db, folderRepo } = current;
    const f = folderRepo.add('d:\\Music');
    expect(f.enabled).toBe(true);

    folderRepo.setEnabled(f.id, false);
    const row = db.prepare(`SELECT enabled FROM library_folders WHERE id = ?`).get(f.id) as { enabled: number };
    expect(row.enabled).toBe(0);

    folderRepo.setEnabled(f.id, true);
    const row2 = db.prepare(`SELECT enabled FROM library_folders WHERE id = ?`).get(f.id) as { enabled: number };
    expect(row2.enabled).toBe(1);
  });

  it('remove 删除目录行', () => {
    current = setup();
    const { db, folderRepo } = current;
    const f = folderRepo.add('d:\\Music');
    expect(folderRepo.list().length).toBe(1);

    folderRepo.remove(f.id);
    expect(folderRepo.list().length).toBe(0);
    const row = db.prepare(`SELECT COUNT(*) c FROM library_folders WHERE id = ?`).get(f.id) as { c: number };
    expect(row.c).toBe(0);
  });

  it('list 返回全部目录行（按 path 升序）', () => {
    current = setup();
    const { folderRepo } = current;
    folderRepo.add('d:\\B');
    folderRepo.add('d:\\A');
    const list = folderRepo.list();
    expect(list.map((f) => f.path)).toEqual(['d:\\A', 'd:\\B']);
    for (const f of list) {
      expect(typeof f.id).toBe('number');
      expect(typeof f.path).toBe('string');
      expect(typeof f.enabled).toBe('boolean');
      expect(typeof f.recursive).toBe('boolean');
    }
  });
});
