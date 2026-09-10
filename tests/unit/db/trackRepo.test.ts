import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../../../src/main/database/connection';
import { createTrackRepo, type TrackInsert, type TrackRepo } from '../../../src/main/database/repositories/trackRepo';
import type { Database } from 'better-sqlite3';

interface Ctx {
  db: Database;
  repo: TrackRepo;
}

function setup(): Ctx {
  const db = openDatabase(':memory:');
  // 手工种子：满足 tracks 表 artist_id / album_id 外键约束。
  db.prepare(`INSERT INTO artists (id, name) VALUES (1, 'Artist One')`).run();
  db.prepare(`INSERT INTO artists (id, name) VALUES (2, 'Artist Two')`).run();
  db.prepare(`INSERT INTO albums (id, title, artist_id) VALUES (1, 'Album A', 1)`).run();
  db.prepare(`INSERT INTO albums (id, title, artist_id) VALUES (2, 'Album B', 2)`).run();
  const repo = createTrackRepo(db);
  return { db, repo };
}

let current: Ctx | null = null;
afterEach(() => {
  if (current) {
    current.db.close();
    current = null;
  }
});

function track(over: Partial<TrackInsert> & Pick<TrackInsert, 'id' | 'title'>): TrackInsert {
  return {
    id: over.id,
    title: over.title,
    artistId: over.artistId ?? 1,
    albumId: over.albumId ?? 1,
    albumArtist: over.albumArtist ?? 'Artist One',
    albumTitle: over.albumTitle ?? 'Album A',
    filePath: over.filePath ?? `/music/${over.id}.flac`,
    fileName: over.fileName ?? `${over.id}.flac`,
    fileSize: over.fileSize ?? 1000,
    fileMtime: over.fileMtime ?? 123456,
    format: over.format ?? 'flac',
    playable: over.playable ?? true,
  };
}

describe('trackRepo', () => {
  it('createMany + findById 行映射（camelCase / artistName JOIN）', () => {
    current = setup();
    const { repo } = current;
    repo.createMany([
      track({ id: 't1', title: 'Song A', artistId: 2, albumId: 2, albumArtist: 'Artist Two', albumTitle: 'Album B' }),
    ]);
    const row = repo.findById('t1');
    expect(row).not.toBeNull();
    expect(row!.id).toBe('t1');
    expect(row!.title).toBe('Song A');
    expect(row!.artistId).toBe(2);
    expect(row!.artistName).toBe('Artist Two'); // JOIN artists.name
    expect(row!.albumId).toBe(2);
    expect(row!.albumTitle).toBe('Album B');
    expect(row!.albumArtist).toBe('Artist Two');
    expect(row!.playable).toBe(true);
    expect(row!.favorite).toBe(false);
    expect(row!.playCount).toBe(0);
    expect(typeof row!.dateAdded).toBe('string');
  });

  it('listSongs 白名单排序：title asc', () => {
    current = setup();
    const { repo } = current;
    repo.createMany([
      track({ id: 'b', title: 'Beta' }),
      track({ id: 'a', title: 'Alpha' }),
      track({ id: 'c', title: 'Charlie' }),
    ]);
    const rows = repo.listSongs({ sortBy: 'title', order: 'asc' });
    expect(rows.map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });

  it('listSongs 白名单排序：playCount desc', () => {
    current = setup();
    const { repo } = current;
    repo.createMany([
      track({ id: 'low', title: 'Low', playable: true }),
      track({ id: 'high', title: 'High' }),
      track({ id: 'mid', title: 'Mid' }),
    ]);
    repo.incrementPlay('low'); // 1
    repo.incrementPlay('mid');
    repo.incrementPlay('mid'); // 2
    repo.incrementPlay('high');
    repo.incrementPlay('high');
    repo.incrementPlay('high'); // 3
    const rows = repo.listSongs({ sortBy: 'playCount', order: 'desc' });
    expect(rows.map((r) => r.id)).toEqual(['high', 'mid', 'low']);
  });

  it('listSongs 非法 sortBy 抛错', () => {
    current = setup();
    const { repo } = current;
    repo.createMany([track({ id: 'x', title: 'X' })]);
    // 绕过类型系统的运行时守卫测试：直接调用内部白名单解析不可能，故用 cast。
    expect(() => repo.listSongs({ sortBy: 'title' as any })).not.toThrow();
    expect(() => repo.listSongs({ sortBy: 'bogus' as any })).toThrow(/未命中白名单/);
  });

  it('setFavorite true 写 favorited_at，false 清除', () => {
    current = setup();
    const { repo, db } = current;
    repo.createMany([track({ id: 'f', title: 'Fav' })]);

    repo.setFavorite('f', true);
    let r = repo.findById('f')!;
    expect(r.favorite).toBe(true);
    expect(r.favoritedAt).not.toBeNull();
    expect(typeof r.favoritedAt).toBe('string');

    repo.setFavorite('f', false);
    r = repo.findById('f')!;
    expect(r.favorite).toBe(false);
    expect(r.favoritedAt).toBeNull();
  });

  it('incrementPlay 计数 + last_played_at', () => {
    current = setup();
    const { repo } = current;
    repo.createMany([track({ id: 'p', title: 'Play' })]);
    expect(repo.findById('p')!.playCount).toBe(0);
    expect(repo.findById('p')!.lastPlayedAt).toBeNull();

    repo.incrementPlay('p');
    repo.incrementPlay('p');
    const r = repo.findById('p')!;
    expect(r.playCount).toBe(2);
    expect(r.lastPlayedAt).not.toBeNull();
  });

  it('markMissing 只命中 except 之外的 available 曲目', () => {
    current = setup();
    const { repo, db } = current;
    repo.createMany([
      track({ id: 'keep', title: 'Keep', filePath: '/m/keep.flac', fileName: 'keep.flac' }),
      track({ id: 'drop1', title: 'Drop1', filePath: '/m/drop1.flac', fileName: 'drop1.flac' }),
      track({ id: 'drop2', title: 'Drop2', filePath: '/m/drop2.flac', fileName: 'drop2.flac' }),
    ]);
    // 先造一个 already-missing，确保它不被重复改写逻辑影响（仍 missing）。
    repo.setStatus(['drop2'], 'missing');

    repo.markMissing(['/m/keep.flac']);
    const statusOf = (id: string) =>
      (db.prepare(`SELECT status FROM tracks WHERE id = ?`).get(id) as { status: string }).status;
    expect(statusOf('keep')).toBe('available');
    expect(statusOf('drop1')).toBe('missing');
    expect(statusOf('drop2')).toBe('missing');
  });

  it('setStatus 批量切换', () => {
    current = setup();
    const { repo, db } = current;
    repo.createMany([
      track({ id: 's1', title: 'S1' }),
      track({ id: 's2', title: 'S2' }),
      track({ id: 's3', title: 'S3' }),
    ]);
    repo.setStatus(['s1', 's2'], 'ignored');
    const statusOf = (id: string) =>
      (db.prepare(`SELECT status FROM tracks WHERE id = ?`).get(id) as { status: string }).status;
    expect(statusOf('s1')).toBe('ignored');
    expect(statusOf('s2')).toBe('ignored');
    expect(statusOf('s3')).toBe('available');
    expect(() => repo.setStatus(['s1'], 'bogus' as any)).toThrow(/非法 status/);
  });

  it('findByFileIdentity 命中；status 参数化过滤（move 检测）', () => {
    current = setup();
    const { repo } = current;
    repo.createMany([
      track({ id: 'm', title: 'M', filePath: '/m/m.flac', fileName: 'm.flac', fileSize: 999, fileMtime: 42 }),
    ]);
    const found = repo.findByFileIdentity('m.flac', 999, 42);
    expect(found?.id).toBe('m');

    // available 曲目在 status='missing' 过滤下不返回。
    const noMissing = repo.findByFileIdentity('m.flac', 999, 42, { status: 'missing' });
    expect(noMissing).toBeNull();

    // 置为 missing 后，附加 status='missing' 可命中（move 检测路径）。
    repo.markMissing([]); // 无 except → 全部 available 变 missing
    const missingHit = repo.findByFileIdentity('m.flac', 999, 42, { status: 'missing' });
    expect(missingHit?.id).toBe('m');
  });

  it('updateAfterParse 更新指定列（非触发器列）且未更新列保持原值', () => {
    current = setup();
    const { repo, db } = current;
    repo.createMany([
      track({ id: 'u', title: 'Alpha Old', artistString: 'Feat X', albumTitle: 'Album A' }),
    ]);
    // 仅更新 year / composer（不在触发器 AFTER UPDATE OF 列清单内，避免触发损坏的 FTS 触发器）。
    repo.updateAfterParse('u', { year: 2024, composer: 'Composer Z' });

    const r = repo.findById('u')!;
    expect(r.year).toBe(2024);
    expect(r.title).toBe('Alpha Old'); // 未更新列保持原值
    expect(r.albumTitle).toBe('Album A');
    const composer = (db.prepare(`SELECT composer FROM tracks WHERE id='u'`).get() as { composer: string }).composer;
    expect(composer).toBe('Composer Z');
  });

  // 被 T1.1 触发器缺陷阻断（见 PR 备注）：tracks_fts_au / tracks_fts_ad 对「普通 fts5 表」
  // 误用了 contentless 表的 'delete' 特殊 INSERT 命令（INSERT INTO tracks_fts(tracks_fts, rowid, ...)
  // VALUES('delete', ...)），运行时抛 "SQL logic error"。普通 fts5 表删除应改用
  // `DELETE FROM tracks_fts WHERE rowid = old.rowid`。migrations/** 在本任务冻结，故跳过，待 T1.1 修复触发器。
  it.skip('updateAfterParse 更新 title 应同步 FTS（被 T1.1 触发器缺陷阻断）', () => {
    current = setup();
    const { repo, db } = current;
    repo.createMany([track({ id: 'u', title: 'Alpha Old', albumTitle: 'Album A' })]);
    repo.updateAfterParse('u', { title: 'Zephyr New' });
    const matchNew = db
      .prepare(`SELECT count(*) c FROM tracks_fts WHERE tracks_fts MATCH 'Zephyr'`)
      .get() as { c: number };
    expect(matchNew.c).toBe(1);
  });

  it('updateAfterParse 传入空对象零改动', () => {
    current = setup();
    const { repo, db } = current;
    repo.createMany([track({ id: 'e', title: 'Stay' })]);
    repo.updateAfterParse('e', {});
    const r = repo.findById('e')!;
    expect(r.title).toBe('Stay');
  });

  it('listByIds 返回对应曲目', () => {
    current = setup();
    const { repo } = current;
    repo.createMany([
      track({ id: 'l1', title: 'L1' }),
      track({ id: 'l2', title: 'L2' }),
      track({ id: 'l3', title: 'L3' }),
    ]);
    const rows = repo.listByIds(['l2', 'l1']);
    expect(rows.map((r) => r.id).sort()).toEqual(['l1', 'l2']);
  });

  it('updateFileIdentity 更新 file_path', () => {
    current = setup();
    const { repo, db } = current;
    repo.createMany([track({ id: 'fp', title: 'FP', filePath: '/old/fp.flac', fileName: 'fp.flac' })]);
    repo.updateFileIdentity('fp', { filePath: '/new/fp.flac' });
    const p = (db.prepare(`SELECT file_path FROM tracks WHERE id = ?`).get('fp') as { file_path: string })
      .file_path;
    expect(p).toBe('/new/fp.flac');
  });
});
