/**
 * T1.6 数据层查询行为单测（收口文件，与既有 repo 测试互补、不重复造用例）。
 *
 * 本文件聚焦「查询语义本身」的底层行为：FTS5 trigram 同步 / trigram 子串与大小写折叠 /
 * 短查询 LIKE 回退路径语义 / 专辑唯一约束本身。全部使用 openDatabase(':memory:') + 手工 INSERT 造数。
 *
 * 既有 repo 测试已覆盖（本报告映射表亦列出，本文件不再重复）：
 *   - listRecent 去重（historyRepo.test.ts 'listRecent 同曲两次播放只返回最新一条'）
 *   - reorder position 连续无冲突（playlistRepo.test.ts 'reorder 后 position 1..n 连续无冲突'）
 *   - setFavorite 写 favorited_at（trackRepo.test.ts 'setFavorite true 写 favorited_at，false 清除'）
 *   - 专辑复合冲突 upsert 合并（albumRepo.test.ts 'upsertAlbum 复合冲突'）
 *   - FTS AFTER UPDATE 同步（trackRepo.test.ts 'updateAfterParse 更新 title 应同步 FTS'）
 *
 * 以下 trigram / LIKE 行为均经实测（SQLite 3.53.4 + better-sqlite3，trigram 分词器）：
 *   - trigram 最短匹配长度为 3 字符：2 字符中文子串（如「七里」）MATCH 返回 0 行，
 *     这正是 service 层对 <3 字符短查询回退到 LIKE 的底层依据（详见 trigram 用例留痕）。
 *   - 英文 trigram 大小写折叠：'beat' / 'Beat' / 'THE BEAT' / 'beatles' 均命中 'The Beatles'。
 *   - SQLite LIKE 默认对 ASCII 大小写不敏感；中文按字符子串匹配。
 */
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../../../src/main/database/connection';
import type { Database } from 'better-sqlite3';

interface Ctx {
  db: Database;
}

function setup(): Ctx {
  const db = openDatabase(':memory:');
  // 手工种子：满足 tracks / albums 表外键约束。
  db.prepare(`INSERT INTO artists (id, name) VALUES (1, 'Artist A')`).run();
  db.prepare(`INSERT INTO artists (id, name) VALUES (2, 'Artist B')`).run();
  db.prepare(`INSERT INTO albums (id, title, artist_id) VALUES (1, 'Album A', 1)`).run();
  db.prepare(`INSERT INTO albums (id, title, artist_id) VALUES (2, 'Album B', 2)`).run();
  return { db };
}

let current: Ctx | null = null;
afterEach(() => {
  if (current) {
    current.db.close();
    current = null;
  }
});

/** 直插 tracks 行（触发 tracks_fts_* 触发器，自动同步 FTS 索引）。 */
function insertTrack(
  db: Database,
  rowid: number,
  id: string,
  title: string,
  artistString: string | null,
  albumTitle: string,
): void {
  db.prepare(
    `INSERT INTO tracks (rowid, id, title, artist_id, album_id, artist_string, album_artist, album_title, file_path, file_name, file_size, file_mtime, format)
     VALUES (?, ?, ?, 1, 1, ?, 'Artist A', ?, ?, ?, 1000, 123456, 'flac')`,
  ).run(rowid, id, title, artistString, albumTitle, `/m/${id}.flac`, `${id}.flac`);
}

/** 转 MATCH 结果为 rowid 列表。 */
function matchRowids(db: Database, query: string): number[] {
  return (db.prepare(`SELECT rowid FROM tracks_fts WHERE tracks_fts MATCH ?`).all(query) as Array<{ rowid: number }>).map(
    (r) => r.rowid,
  );
}

describe('query-behavior: FTS 触发器同步', () => {
  it('AFTER INSERT → tracks_fts 同步且 artist 列来自 COALESCE(artist_string, "")', () => {
    current = setup();
    const { db } = current;
    // 有 artist_string：artist 列 = 原始串。
    insertTrack(db, 1, 't1', '七里香', '周杰伦', '专辑A');
    // 无 artist_string（NULL）：artist 列应落为 ''（COALESCE 行为）。
    insertTrack(db, 2, 't2', 'Song X', null, 'Album');

    // INSERT 后 MATCH 命中。
    expect(matchRowids(db, '七里香')).toEqual([1]);
    expect(matchRowids(db, 'Song')).toEqual([2]);

    // artist 列内容断言：有值取原串；NULL 取空串（而非 NULL）。
    const a1 = db.prepare(`SELECT artist, album FROM tracks_fts WHERE rowid = 1`).get() as {
      artist: string;
      album: string;
    };
    expect(a1.artist).toBe('周杰伦');
    expect(a1.album).toBe('专辑A');
    const a2 = db.prepare(`SELECT artist, album FROM tracks_fts WHERE rowid = 2`).get() as {
      artist: string;
      album: string;
    };
    // 留痕：artist_string 为 NULL 时，触发器 COALESCE(new.artist_string,'') 写入空串。
    expect(a2.artist).toBe('');
    expect(a2.album).toBe('Album');
  });

  it('AFTER DELETE → 被删 rowid 从 tracks_fts 消失（MATCH 旧值 0 行），其余行不受影响', () => {
    current = setup();
    const { db } = current;
    insertTrack(db, 1, 't1', '七里香', '周杰伦', '专辑A');
    insertTrack(db, 2, 't2', '晴天', '周杰伦', '专辑B');
    insertTrack(db, 3, 't3', 'Song X', 'The Beatles', 'Album');
    expect((db.prepare(`SELECT count(*) c FROM tracks_fts`).get() as { c: number }).c).toBe(3);

    // 删除 rowid=1（七里香）。
    db.prepare(`DELETE FROM tracks WHERE rowid = 1`).run();

    // 旧值 MATCH → 0 行（rowid 1 已消失）。
    expect(matchRowids(db, '七里香')).toEqual([]);
    // 其余行不受影响：rowid 3（Song X，4 字符）仍可命中。
    expect(matchRowids(db, 'Song')).toEqual([3]);
    // rowid 2（晴天，2 字符）受 trigram <3 限制同样 0 行，确证其未被误删、仅是不满足 MATCH 下限。
    expect(matchRowids(db, '晴天')).toEqual([]);
    // tracks_fts 总行数减为 2。
    expect((db.prepare(`SELECT count(*) c FROM tracks_fts`).get() as { c: number }).c).toBe(2);
    // 被删行确已从基表移除，其余两行仍在（tracks 表行数 = 2）。
    expect((db.prepare(`SELECT COUNT(*) c FROM tracks`).get() as { c: number }).c).toBe(2);
  });
});

describe('query-behavior: trigram 子串与大小写折叠', () => {
  it('中文 3 字符子串命中、2 字符不命中、且不命中无关曲', () => {
    current = setup();
    const { db } = current;
    insertTrack(db, 1, 't1', '七里香', '周杰伦', '专辑A');
    insertTrack(db, 2, 't2', '晴天', '周杰伦', '专辑B');

    // 3 字符「七里香」命中（trigram 长度下限）。
    expect(matchRowids(db, '七里香')).toEqual([1]);
    // 留痕：trigram 分词器要求查询 ≥3 字符；2 字符「七里」返回 0 行，
    // 这正是 service 层对 <3 字符短查询回退 LIKE 的底层原因（Phase 3 短查询回退路径）。
    expect(matchRowids(db, '七里')).toEqual([]);
    // 无关曲「晴天」本身仅 2 字符，MATCH 同样 0 行（与「七里」同属 <3 限制，非命中）。
    expect(matchRowids(db, '晴天')).toEqual([]);
    // 「七里香」查询不命中无关曲（结果仅含 rowid 1，绝不出现 rowid 2）。
    expect(matchRowids(db, '七里香').includes(2)).toBe(false);
  });

  it('英文大小写不敏感：beat / Beat / THE BEAT / beatles 均命中 The Beatles', () => {
    current = setup();
    const { db } = current;
    insertTrack(db, 3, 't3', 'Song X', 'The Beatles', 'Album');

    // trigram 对 ASCII 做大小写折叠（实测事实）。
    expect(matchRowids(db, 'beat')).toEqual([3]);
    expect(matchRowids(db, 'Beat')).toEqual([3]);
    expect(matchRowids(db, 'THE BEAT')).toEqual([3]);
    expect(matchRowids(db, 'beatles')).toEqual([3]);
  });
});

describe('query-behavior: 短查询 LIKE 回退路径语义（数据层背书）', () => {
  // 留痕：完整回退逻辑属 Phase 3 search handler；此处仅验证 SQLite LIKE 行为本身可用。
  it('title LIKE 单中文字符命中', () => {
    current = setup();
    const { db } = current;
    insertTrack(db, 1, 't1', '七里香', '周杰伦', '专辑A');
    insertTrack(db, 2, 't2', '晴天', '周杰伦', '专辑B');
    const rows = db.prepare(`SELECT id FROM tracks WHERE title LIKE ?`).all('%七%') as Array<{ id: string }>;
    expect(rows.map((r) => r.id)).toEqual(['t1']);
  });

  it('LIKE 对 ASCII 大小写不敏感：%beat% / %BEAT% 均命中 The Beatles 行', () => {
    current = setup();
    const { db } = current;
    insertTrack(db, 3, 't3', 'Song X', 'The Beatles', 'Album');
    const lower = db
      .prepare(`SELECT id FROM tracks WHERE artist_string LIKE ?`)
      .all('%beat%') as Array<{ id: string }>;
    const upper = db
      .prepare(`SELECT id FROM tracks WHERE artist_string LIKE ?`)
      .all('%BEAT%') as Array<{ id: string }>;
    expect(lower.map((r) => r.id)).toEqual(['t3']);
    expect(upper.map((r) => r.id)).toEqual(['t3']);
  });
});

describe('query-behavior: 专辑唯一约束本身', () => {
  it('raw SQL 重复 (title, artist_id) 抛 UNIQUE 约束错误', () => {
    current = setup();
    const { db } = current;
    // 先成功插入一条（artist_id=1）。
    db.prepare(`INSERT INTO albums (title, artist_id) VALUES ('Same Title', 1)`).run();
    // 同 (title, artist_id) 再插 → 应抛 UNIQUE 约束错误（与 upsertAlbum 测试互补：验证约束本身）。
    expect(() => db.prepare(`INSERT INTO albums (title, artist_id) VALUES ('Same Title', 1)`).run()).toThrow(
      /UNIQUE constraint failed/,
    );
    // 约束保证表中仍仅一行（未因重试而多插）。
    const count = (db.prepare(`SELECT COUNT(*) c FROM albums WHERE title = 'Same Title'`).get() as { c: number }).c;
    expect(count).toBe(1);
  });

  it('不同 artist_id 同名 album 不冲突（约束按 (title, artist_id) 复合）', () => {
    current = setup();
    const { db } = current;
    db.prepare(`INSERT INTO albums (title, artist_id) VALUES ('Same Title', 1)`).run();
    db.prepare(`INSERT INTO albums (title, artist_id) VALUES ('Same Title', 2)`).run();
    const count = (db.prepare(`SELECT COUNT(*) c FROM albums WHERE title = 'Same Title'`).get() as { c: number }).c;
    expect(count).toBe(2);
  });
});
