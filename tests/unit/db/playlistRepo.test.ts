import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../../../src/main/database/connection';
import { createPlaylistRepo, type PlaylistRepo } from '../../../src/main/database/repositories/playlistRepo';
import { createTrackRepo, type TrackInsert, type TrackRepo } from '../../../src/main/database/repositories/trackRepo';
import type { Database } from 'better-sqlite3';

interface Ctx {
  db: Database;
  playlistRepo: PlaylistRepo;
  trackRepo: TrackRepo;
}

function setup(): Ctx {
  const db = openDatabase(':memory:');
  const playlistRepo = createPlaylistRepo(db);
  const trackRepo = createTrackRepo(db);
  return { db, playlistRepo, trackRepo };
}

let current: Ctx | null = null;
afterEach(() => {
  if (current) {
    current.db.close();
    current = null;
  }
});

/** 构造最小 TrackInsert（覆盖 playlistRepo 测试所需外键与列）。 */
function track(
  over: Partial<TrackInsert> & Pick<TrackInsert, 'id' | 'title' | 'artistId' | 'albumId' | 'albumArtist' | 'albumTitle'>,
): TrackInsert {
  return {
    ...over,
    artistString: over.artistString ?? null,
    trackNumber: over.trackNumber ?? null,
    discNumber: over.discNumber ?? null,
    year: over.year ?? null,
    genre: over.genre ?? null,
    composer: over.composer ?? null,
    comment: over.comment ?? null,
    duration: over.duration ?? null,
    filePath: over.filePath ?? `/music/${over.id}.flac`,
    fileName: over.fileName ?? `${over.id}.flac`,
    fileSize: over.fileSize ?? 1000,
    fileMtime: over.fileMtime ?? 123456,
    format: over.format ?? 'flac',
    albumArtist: over.albumArtist ?? 'A',
    albumTitle: over.albumTitle ?? 'Al',
    codec: over.codec ?? null,
    bitrate: over.bitrate ?? null,
    sampleRate: over.sampleRate ?? null,
    bitDepth: over.bitDepth ?? null,
    channels: over.channels ?? null,
    playable: over.playable ?? true,
    coverId: over.coverId ?? null,
    metaProvenance: over.metaProvenance ?? null,
  };
}

describe('playlistRepo', () => {
  it('create/list/get/rename/delete 基本生命周期', () => {
    current = setup();
    const { db, playlistRepo, trackRepo } = current;
    const artistA = db.prepare(`INSERT INTO artists (id, name) VALUES (1, 'A')`).run().lastInsertRowid;
    db.prepare(`INSERT INTO albums (id, title, artist_id) VALUES (1, 'Al', 1)`).run();

    const pl = playlistRepo.create('My Mix');
    expect(pl.id).toBeGreaterThan(0);
    expect(pl.name).toBe('My Mix');
    expect(pl.trackCount).toBe(0);

    // list 侧栏形态：id/name/trackCount
    const list = playlistRepo.list();
    expect(list.length).toBe(1);
    expect(list[0].name).toBe('My Mix');
    expect(list[0].trackCount).toBe(0);

    // get 空歌单：playlist 非空，tracks 空
    const empty = playlistRepo.get(pl.id);
    expect(empty.playlist?.name).toBe('My Mix');
    expect(empty.tracks).toEqual([]);

    // 加曲后 rename + trackCount 联动
    trackRepo.createMany([track({ id: 't1', title: 'Song1', artistId: 1, albumId: 1, albumArtist: 'A', albumTitle: 'Al' })]);
    playlistRepo.addTracks(pl.id, ['t1']);
    playlistRepo.rename(pl.id, 'Renamed');
    expect(playlistRepo.get(pl.id).playlist?.name).toBe('Renamed');
    expect(playlistRepo.list()[0].trackCount).toBe(1);

    // delete 级联清 playlist_tracks
    playlistRepo.delete(pl.id);
    expect(playlistRepo.get(pl.id).playlist).toBeNull();
    const childCount = (db.prepare(`SELECT COUNT(*) c FROM playlist_tracks WHERE playlist_id = ?`).get(pl.id) as { c: number }).c;
    expect(childCount).toBe(0);
  });

  it('addTracks 同一曲目可多次入歌单（position 递增，不触发 UNIQUE 冲突）', () => {
    current = setup();
    const { db, playlistRepo, trackRepo } = current;
    db.prepare(`INSERT INTO artists (id, name) VALUES (1, 'A')`).run();
    db.prepare(`INSERT INTO albums (id, title, artist_id) VALUES (1, 'Al', 1)`).run();
    trackRepo.createMany([track({ id: 't1', title: 'Song1', artistId: 1, albumId: 1, albumArtist: 'A', albumTitle: 'Al' })]);

    const pl = playlistRepo.create('Dup');
    playlistRepo.addTracks(pl.id, ['t1', 't1', 't1']); // 同一曲目三次

    // 三条 playlist_tracks，position 2,3,4（base 0 + i+1）
    const rows = db.prepare(`SELECT track_id, position FROM playlist_tracks WHERE playlist_id = ? ORDER BY position`).all(pl.id) as Array<{ track_id: string; position: number }>;
    expect(rows.length).toBe(3);
    expect(rows.map((r) => r.position)).toEqual([1, 2, 3]);
    expect(rows.every((r) => r.track_id === 't1')).toBe(true);
    expect(playlistRepo.get(pl.id).tracks.length).toBe(3);
    expect(playlistRepo.list()[0].trackCount).toBe(3);
  });

  it('removeTrack 仅移除该曲目最小 position 的一次出现（留坑不影响其余）', () => {
    current = setup();
    const { db, playlistRepo, trackRepo } = current;
    db.prepare(`INSERT INTO artists (id, name) VALUES (1, 'A')`).run();
    db.prepare(`INSERT INTO albums (id, title, artist_id) VALUES (1, 'Al', 1)`).run();
    trackRepo.createMany([track({ id: 't1', title: 'Song1', artistId: 1, albumId: 1, albumArtist: 'A', albumTitle: 'Al' })]);

    const pl = playlistRepo.create('Dup');
    playlistRepo.addTracks(pl.id, ['t1', 't1']); // position 1,2
    playlistRepo.removeTrack(pl.id, 't1'); // 移除最小 position（=1）

    const rows = db.prepare(`SELECT position FROM playlist_tracks WHERE playlist_id = ? ORDER BY position`).all(pl.id) as Array<{ position: number }>;
    expect(rows.map((r) => r.position)).toEqual([2]); // 仅剩 position 2，留下空洞（可接受——派发决定留痕）
    expect(playlistRepo.get(pl.id).tracks.length).toBe(1);
  });

  it('reorder 后 position 1..n 连续无冲突，且含重复曲目场景', () => {
    current = setup();
    const { db, playlistRepo, trackRepo } = current;
    db.prepare(`INSERT INTO artists (id, name) VALUES (1, 'A')`).run();
    db.prepare(`INSERT INTO albums (id, title, artist_id) VALUES (1, 'Al', 1)`).run();
    trackRepo.createMany([
      track({ id: 't1', title: 'Song1', artistId: 1, albumId: 1, albumArtist: 'A', albumTitle: 'Al' }),
      track({ id: 't2', title: 'Song2', artistId: 1, albumId: 1, artistString: 'A', albumTitle: 'Al' }),
    ]);

    const pl = playlistRepo.create('Order');
    // 初始顺序 t1, t2, t1（含重复）
    playlistRepo.addTracks(pl.id, ['t1', 't2', 't1']);

    // 重排：t2, t1, t1（重复曲目 t1 出现两次）
    playlistRepo.reorder(pl.id, ['t2', 't1', 't1']);

    const rows = db.prepare(`SELECT track_id, position FROM playlist_tracks WHERE playlist_id = ? ORDER BY position`).all(pl.id) as Array<{ track_id: string; position: number }>;
    // position 1..n 连续无冲突（UNIQUE 仅 (playlist_id, position)），允许 track_id 重复
    expect(rows.map((r) => r.position)).toEqual([1, 2, 3]);
    expect(rows.map((r) => r.track_id)).toEqual(['t2', 't1', 't1']);
    const detail = playlistRepo.get(pl.id);
    expect(detail.tracks.map((t) => t.id)).toEqual(['t2', 't1', 't1']);
    expect(detail.tracks.length).toBe(3);
  });
});
