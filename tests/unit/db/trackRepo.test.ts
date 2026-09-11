import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../../../src/main/database/connection';
import { createTrackRepo, type TrackInsert, type TrackRepo } from '../../../src/main/database/repositories/trackRepo';
import { createCoverRepo } from '../../../src/main/database/repositories/coverRepo';
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

  // T4.4 前置修复①（用户裁定「渲染层走专辑封面」）的语义锚定：tracks 表自身的 cover_id
  // 全仓无写入点（coverRepo.setAlbumCover 是封面归属专辑的唯一落点），TrackRow.coverId 必须
  // 等于所属专辑的 albums.cover_id。评审 M1 变异实证：把 SELECT 列改回 tracks.cover_id 后
  // 原测试仍全绿（静默语义回退）——本用例使该变异变红。
  it('曲目封面回填所属专辑：coverId = albums.cover_id（无封面专辑 → null）', () => {
    current = setup();
    const { db, repo } = current;
    // 经生产写入通道落封面（insertCover + setAlbumCover），不走裸 UPDATE。
    const coverRepo = createCoverRepo(db);
    const coverId = coverRepo.insertCover({ source: 'embedded' });
    coverRepo.setAlbumCover(1, coverId); // Album A 有封面；Album B 不落封面

    repo.createMany([
      track({ id: 't1', title: 'In A', albumId: 1 }),
      track({
        id: 't2',
        title: 'In B',
        artistId: 2,
        albumId: 2,
        albumArtist: 'Artist Two',
        albumTitle: 'Album B',
      }),
    ]);

    // 点查路径（findById）与列表路径（listSongs）都走 TRACK_SELECT 基底，语义必须一致。
    expect(repo.findById('t1')!.coverId).toBe(coverId);
    expect(repo.findById('t2')!.coverId).toBeNull();
    const songs = repo.listSongs({ sortBy: 'title', order: 'asc' });
    expect(songs.map((r) => r.coverId)).toEqual([coverId, null]); // title asc：In A < In B
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
    expect(found.length).toBe(1);
    expect(found[0]?.id).toBe('m');

    // available 曲目在 status='missing' 过滤下不返回（空数组）。
    const noMissing = repo.findByFileIdentity('m.flac', 999, 42, { status: 'missing' });
    expect(noMissing).toEqual([]);

    // 置为 missing 后，附加 status='missing' 可命中（move 检测路径）。
    repo.markMissing([]); // 无 except → 全部 available 变 missing
    const missingHit = repo.findByFileIdentity('m.flac', 999, 42, { status: 'missing' });
    expect(missingHit.length).toBe(1);
    expect(missingHit[0]?.id).toBe('m');
  });

  it('findByFileIdentity 零命中返回空数组（V1.3 多命中语义）', () => {
    current = setup();
    const { repo } = current;
    expect(repo.findByFileIdentity('none.flac', 1, 2)).toEqual([]);
  });

  it('findByFileIdentity 多命中返回全部行（相同三元组不同 file_path）', () => {
    current = setup();
    const { repo } = current;
    repo.createMany([
      track({ id: 'd1', title: 'D1', filePath: '/a/dup.flac', fileName: 'dup.flac', fileSize: 777, fileMtime: 7 }),
      track({ id: 'd2', title: 'D2', filePath: '/b/dup.flac', fileName: 'dup.flac', fileSize: 777, fileMtime: 7 }),
    ]);
    const rows = repo.findByFileIdentity('dup.flac', 777, 7);
    expect(rows.length).toBe(2);
    expect(rows.map((r) => r.id).sort()).toEqual(['d1', 'd2']);

    // status 过滤在多命中下仍生效。
    repo.setStatus(['d1'], 'missing');
    const avail = repo.findByFileIdentity('dup.flac', 777, 7, { status: 'available' });
    expect(avail.map((r) => r.id)).toEqual(['d2']);
    const missing = repo.findByFileIdentity('dup.flac', 777, 7, { status: 'missing' });
    expect(missing.map((r) => r.id)).toEqual(['d1']);
  });

  it('listSongs 分页 tiebreaker：重复键下逐页拉取无重复无丢失', () => {
    current = setup();
    const { repo } = current;
    const n = 12;
    const ids = Array.from({ length: n }, (_, i) => `pg-${String(i).padStart(2, '0')}`);
    // 全部曲目 playCount 相同（0），主排序键并列 → tiebreaker id ASC 决定全序。
    repo.createMany(ids.map((id, i) => track({ id, title: `T${i}` })));

    const collected: string[] = [];
    const limit = 5;
    for (let offset = 0; ; offset += limit) {
      const page = repo.listSongs({ sortBy: 'playCount', order: 'desc', limit, offset });
      collected.push(...page.map((r) => r.id));
      if (page.length < limit) break;
    }
    expect(collected.length).toBe(n); // 恰好全集：无跨页重复、无丢失
    expect(new Set(collected).size).toBe(n);
    // tiebreaker 方向固定 ASC：跨页拼接后 id 全序递增。
    const sorted = [...collected].sort();
    expect(collected).toEqual(sorted);
  });

  it('updateAfterParse 更新指定列（非触发器列）且未更新列保持原值', () => {
    current = setup();
    const { repo, db } = current;
    repo.createMany([
      track({ id: 'u', title: 'Alpha Old', artistString: 'Feat X', albumTitle: 'Album A' }),
    ]);
    // 仅更新 year / composer（不在触发器 AFTER UPDATE OF 列清单内，避免触发 FTS AFTER UPDATE 触发器）。
    repo.updateAfterParse('u', { year: 2024, composer: 'Composer Z' });

    const r = repo.findById('u')!;
    expect(r.year).toBe(2024);
    expect(r.title).toBe('Alpha Old'); // 未更新列保持原值
    expect(r.albumTitle).toBe('Album A');
    const composer = (db.prepare(`SELECT composer FROM tracks WHERE id='u'`).get() as { composer: string }).composer;
    expect(composer).toBe('Composer Z');
  });

  it('updateAfterParse 更新 title 应同步 FTS（新值命中、旧值消失）', () => {
    current = setup();
    const { repo, db } = current;
    repo.createMany([track({ id: 'u', title: 'Alpha Old', albumTitle: 'Album A' })]);
    repo.updateAfterParse('u', { title: 'Zephyr New' });
    const matchNew = db
      .prepare(`SELECT count(*) c FROM tracks_fts WHERE tracks_fts MATCH 'Zephyr'`)
      .get() as { c: number };
    expect(matchNew.c).toBe(1);
    const matchOld = db
      .prepare(`SELECT count(*) c FROM tracks_fts WHERE tracks_fts MATCH 'Alpha'`)
      .get() as { c: number };
    expect(matchOld.c).toBe(0);
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

  it('listByIds 在 >1000 ids（2000）下分批不抛 too many SQL variables 且条数一致', () => {
    current = setup();
    const { repo } = current;
    const ids = Array.from({ length: 2000 }, (_, i) => `lb-${i}`);
    repo.createMany(ids.map((id, i) => track({ id, title: `T${i}` })));
    const rows = repo.listByIds(ids);
    expect(rows.length).toBe(2000);
    expect(new Set(rows.map((r) => r.id)).size).toBe(2000); // 无重复、无遗漏
  });

  it('setStatus 在 >1000 ids（2000）下分批不抛 too many SQL variables 且生效', () => {
    current = setup();
    const { repo, db } = current;
    const ids = Array.from({ length: 2000 }, (_, i) => `st-${i}`);
    repo.createMany(ids.map((id, i) => track({ id, title: `T${i}` })));
    repo.setStatus(ids, 'ignored');
    const statusOf = (id: string) =>
      (db.prepare(`SELECT status FROM tracks WHERE id = ?`).get(id) as { status: string }).status;
    expect(statusOf('st-0')).toBe('ignored');
    expect(statusOf('st-1000')).toBe('ignored'); // 跨批抽查
    expect(statusOf('st-1999')).toBe('ignored');
  });

  it('markMissing 在 >32766 except 路径（33000）下用临时表不抛 too many SQL variables', () => {
    current = setup();
    const { repo, db } = current;
    // 4 条真实曲目：2 条放入 except（保持 available），2 条不放入（应被置 missing）。
    const keep = ['mk-keep1', 'mk-keep2'];
    const drop = ['mk-drop1', 'mk-drop2'];
    const seeds: TrackInsert[] = [
      ...keep.map((id) => track({ id, title: id, filePath: `/mk/${id}.flac`, fileName: `${id}.flac` })),
      ...drop.map((id) => track({ id, title: id, filePath: `/mk/${id}.flac`, fileName: `${id}.flac` })),
    ];
    repo.createMany(seeds);
    // except 集合：33000 条（含真实 keep 路径 + 大量不存在路径），混合大小写也走 lower()。
    const bogus = Array.from({ length: 33000 - keep.length }, (_, i) => `/nonexistent/${i}.flac`);
    const exceptPathsLower = [
      ...keep.map((id) => `/mk/${id}.flac`.toLowerCase()),
      ...bogus.map((p) => p.toLowerCase()),
    ];
    repo.markMissing(exceptPathsLower);
    const statusOf = (id: string) =>
      (db.prepare(`SELECT status FROM tracks WHERE id = ?`).get(id) as { status: string }).status;
    expect(statusOf('mk-keep1')).toBe('available'); // 在 except 内
    expect(statusOf('mk-keep2')).toBe('available'); // 在 except 内
    expect(statusOf('mk-drop1')).toBe('missing'); // 在 except 外
    expect(statusOf('mk-drop2')).toBe('missing'); // 在 except 外
  });

});
