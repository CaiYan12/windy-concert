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

  // ---- T7.3 normalizePath 边界加固（承接项）----

  it('normalizePath 加固：空串/纯空白拒收（throw，不落库）', () => {
    current = setup();
    const { folderRepo } = current;
    expect(() => folderRepo.add('')).toThrow(/非法 path/);
    expect(() => folderRepo.add('   ')).toThrow(/非法 path/);
    // 拒收后无残留行
    expect(folderRepo.list()).toHaveLength(0);
  });

  it('normalizePath 加固：盘符根保持根语义（"C:\\" → "c:\\"，补回分隔符不缩为 "c:"）', () => {
    // Windows 语义中 'c:' 指「该驱动器当前目录」而非根——加固前 'C:\' 会被归一成
    // 'c:'（语义偏移）；加固后补回分隔符，根路径收敛为 'c:\'。
    current = setup();
    const { folderRepo } = current;
    const f = folderRepo.add('C:\\');
    expect(f.path).toBe('c:\\');
    const f2 = folderRepo.add('d:/');
    expect(f2.path).toBe('d:\\');
  });

  it('normalizePath 加固：UNC 主机段小写归一（"\\\\SERVER\\Share" → "\\\\server\\Share"）', () => {
    // 主机名大小写不敏感 → 归一稳定去重；共享名大小写保留（部分设备敏感，最小面不动）。
    current = setup();
    const { folderRepo } = current;
    const f = folderRepo.add('\\\\SERVER\\Share\\Music');
    expect(f.path).toBe('\\\\server\\Share\\Music');
    const f2 = folderRepo.add('//NAS-2/Share');
    expect(f2.path).toBe('\\\\nas-2/Share');
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
