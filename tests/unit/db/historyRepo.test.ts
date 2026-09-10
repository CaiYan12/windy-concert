import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../../../src/main/database/connection';
import { createHistoryRepo, type HistoryRepo } from '../../../src/main/database/repositories/historyRepo';
import { createTrackRepo, type TrackInsert, type TrackRepo } from '../../../src/main/database/repositories/trackRepo';
import type { Database } from 'better-sqlite3';

interface Ctx {
  db: Database;
  historyRepo: HistoryRepo;
  trackRepo: TrackRepo;
}

function setup(): Ctx {
  const db = openDatabase(':memory:');
  const historyRepo = createHistoryRepo(db);
  const trackRepo = createTrackRepo(db);
  return { db, historyRepo, trackRepo };
}

let current: Ctx | null = null;
afterEach(() => {
  if (current) {
    current.db.close();
    current = null;
  }
});

function track(
  over: Partial<TrackInsert> & Pick<TrackInsert, 'id' | 'title' | 'artistId' | 'albumId' | 'albumArtist' | 'albumTitle'>,
): TrackInsert {
  return {
    ...over,
    filePath: over.filePath ?? `/music/${over.id}.flac`,
    fileName: over.fileName ?? `${over.id}.flac`,
    fileSize: over.fileSize ?? 1000,
    fileMtime: over.fileMtime ?? 123456,
    format: over.format ?? 'flac',
    playable: over.playable ?? true,
    albumArtist: over.albumArtist ?? 'A',
    albumTitle: over.albumTitle ?? 'Al',
  };
}

/** 直接以显式 played_at 插历史，便于 listRecent 去重语义的确定性测试（避免 datetime('now') 秒级并列）。 */
function insertHistory(db: Database, trackId: string, playedAt: string): void {
  db.prepare(`INSERT INTO play_history (track_id, played_at) VALUES (?, ?)`).run(trackId, playedAt);
}

describe('historyRepo', () => {
  it('recordPlay 回传 historyId 且 tracks 侧 play_count/last_played_at 联动', () => {
    current = setup();
    const { db, historyRepo, trackRepo } = current;
    db.prepare(`INSERT INTO artists (id, name) VALUES (1, 'A')`).run();
    db.prepare(`INSERT INTO albums (id, title, artist_id) VALUES (1, 'Al', 1)`).run();
    trackRepo.createMany([track({ id: 't1', title: 'Song1', artistId: 1, albumId: 1, albumArtist: 'A', albumTitle: 'Al' })]);

    const res1 = historyRepo.recordPlay('t1');
    expect(typeof res1.historyId).toBe('number');
    expect(res1.historyId).toBeGreaterThan(0);
    const res2 = historyRepo.recordPlay('t1');
    expect(res2.historyId).toBeGreaterThan(res1.historyId); // 自增

    const t = trackRepo.findById('t1')!;
    expect(t.playCount).toBe(2); // 两次 recordPlay → +2
    expect(t.lastPlayedAt).not.toBeNull();

    const histCount = (db.prepare(`SELECT COUNT(*) c FROM play_history WHERE track_id = 't1'`).get() as { c: number }).c;
    expect(histCount).toBe(2);
  });

  it('updateOutcome 落值（playedDuration / completed）', () => {
    current = setup();
    const { db, historyRepo, trackRepo } = current;
    db.prepare(`INSERT INTO artists (id, name) VALUES (1, 'A')`).run();
    db.prepare(`INSERT INTO albums (id, title, artist_id) VALUES (1, 'Al', 1)`).run();
    trackRepo.createMany([track({ id: 't1', title: 'Song1', artistId: 1, albumId: 1, albumArtist: 'A', albumTitle: 'Al' })]);

    const { historyId } = historyRepo.recordPlay('t1');
    historyRepo.updateOutcome(historyId, { playedDuration: 123.5, completed: true });

    const row = db.prepare(`SELECT played_duration, completed FROM play_history WHERE id = ?`).get(historyId) as {
      played_duration: number | null;
      completed: number;
    };
    expect(row.played_duration).toBe(123.5);
    expect(row.completed).toBe(1);

    // completed=false → 0
    historyRepo.updateOutcome(historyId, { playedDuration: 10, completed: false });
    const row2 = db.prepare(`SELECT completed FROM play_history WHERE id = ?`).get(historyId) as { completed: number };
    expect(row2.completed).toBe(0);
  });

  it('listRecent 同曲两次播放只返回最新一条（§2 口径去重）', () => {
    current = setup();
    const { db, historyRepo, trackRepo } = current;
    db.prepare(`INSERT INTO artists (id, name) VALUES (1, 'A')`).run();
    db.prepare(`INSERT INTO albums (id, title, artist_id) VALUES (1, 'Al', 1)`).run();
    db.prepare(`INSERT INTO albums (id, title, artist_id) VALUES (2, 'Al2', 1)`).run();
    trackRepo.createMany([
      track({ id: 't1', title: 'Song1', artistId: 1, albumId: 1, albumArtist: 'A', albumTitle: 'Al' }),
      track({ id: 't2', title: 'Song2', artistId: 1, albumId: 2, artistString: 'A', albumTitle: 'Al2' }),
    ]);

    // t1 两次（不同秒级 played_at，确定性去重，避开 datetime('now') 同秒并列边界）
    insertHistory(db, 't1', '2020-01-01 00:00:01');
    insertHistory(db, 't1', '2020-01-01 00:00:10'); // 最新
    // t2 一次
    insertHistory(db, 't2', '2020-01-01 00:00:05');

    const recent = historyRepo.listRecent(50);
    const ids = recent.map((t) => t.id);
    // 每曲仅一条（去重）：t1 一条、t2 一条
    expect(ids.filter((id) => id === 't1').length).toBe(1);
    expect(ids.filter((id) => id === 't2').length).toBe(1);
    expect(recent.length).toBe(2);
    // 排序：最近播放降序 → t1（00:00:10）在前，t2（00:00:05）在后
    expect(recent[0].id).toBe('t1');
    expect(recent[1].id).toBe('t2');
  });

  it('listRecent limit 截断', () => {
    current = setup();
    const { db, historyRepo, trackRepo } = current;
    db.prepare(`INSERT INTO artists (id, name) VALUES (1, 'A')`).run();
    db.prepare(`INSERT INTO albums (id, title, artist_id) VALUES (1, 'Al', 1)`).run();
    trackRepo.createMany([track({ id: 't1', title: 'Song1', artistId: 1, albumId: 1, albumArtist: 'A', albumTitle: 'Al' })]);

    insertHistory(db, 't1', '2020-01-01 00:00:01');
    const one = historyRepo.listRecent(0);
    expect(one.length).toBe(0);
    const all = historyRepo.listRecent(1);
    expect(all.length).toBe(1);
  });
});
