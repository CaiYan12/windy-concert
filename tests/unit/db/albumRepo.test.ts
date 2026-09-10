import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../../../src/main/database/connection';
import {
  createAlbumRepo,
  type AlbumRepo,
} from '../../../src/main/database/repositories/albumRepo';
import {
  createArtistRepo,
  type ArtistRepo,
} from '../../../src/main/database/repositories/artistRepo';
import {
  createTrackRepo,
  type TrackInsert,
  type TrackRepo,
} from '../../../src/main/database/repositories/trackRepo';
import type { Database } from 'better-sqlite3';

interface Ctx {
  db: Database;
  albumRepo: AlbumRepo;
  artistRepo: ArtistRepo;
  trackRepo: TrackRepo;
}

function setup(): Ctx {
  const db = openDatabase(':memory:');
  const albumRepo = createAlbumRepo(db);
  const artistRepo = createArtistRepo(db);
  const trackRepo = createTrackRepo(db);
  return { db, albumRepo, artistRepo, trackRepo };
}

let current: Ctx | null = null;
afterEach(() => {
  if (current) {
    current.db.close();
    current = null;
  }
});

/** 构造最小 TrackInsert（覆盖 albumRepo/artistRepo 测试所需外键与列）。 */
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

describe('albumRepo', () => {
  it('upsertAlbum 复合冲突：同 title 不同 artistId → 两行；同对 → 合并', () => {
    current = setup();
    const { db, albumRepo, artistRepo } = current;
    const a1 = artistRepo.upsertArtist('Artist A');
    const a2 = artistRepo.upsertArtist('Artist B');
    // 同 title 不同 artistId → 两行（复合唯一键各自成立）。
    const albA = albumRepo.upsertAlbum('Same Title', a1);
    const albB = albumRepo.upsertAlbum('Same Title', a2);
    expect(albA).not.toBe(albB);
    // 同对 (title, artistId) 再次 upsert → 合并（返回同一 id）。
    const albAgain = albumRepo.upsertAlbum('Same Title', a1);
    expect(albAgain).toBe(albA);
    // 表中确为两行。
    const count = (db.prepare(`SELECT COUNT(*) c FROM albums WHERE title = 'Same Title'`).get() as { c: number }).c;
    expect(count).toBe(2);
  });

  it('upsertAlbum + recountStats 计数正确（含 disc_number NULL 的 DISTINCT 语义）', () => {
    current = setup();
    const { db, albumRepo, artistRepo, trackRepo } = current;
    const artistA = artistRepo.upsertArtist('Artist A');
    const artistB = artistRepo.upsertArtist('Artist B');
    const albumA1 = albumRepo.upsertAlbum('Album A1', artistA);
    const albumA2 = albumRepo.upsertAlbum('Album A2', artistA);
    const albumB1 = albumRepo.upsertAlbum('Album B1', artistB);

    trackRepo.createMany([
      track({ id: 't1', title: 'A1-1', artistId: artistA, albumId: albumA1, albumArtist: 'Artist A', albumTitle: 'Album A1', discNumber: 1, trackNumber: 1 }),
      track({ id: 't2', title: 'A1-2', artistId: artistA, albumId: albumA1, albumArtist: 'Artist A', albumTitle: 'Album A1', discNumber: 1, trackNumber: 2 }),
      track({ id: 't3', title: 'A2-1', artistId: artistA, albumId: albumA2, albumArtist: 'Artist A', albumTitle: 'Album A2', discNumber: null, trackNumber: 1 }),
      track({ id: 't4', title: 'B1-1', artistId: artistB, albumId: albumB1, albumArtist: 'Artist B', albumTitle: 'Album B1', discNumber: 1, trackNumber: 1 }),
      track({ id: 't5', title: 'B1-2', artistId: artistB, albumId: albumB1, albumArtist: 'Artist B', albumTitle: 'Album B1', discNumber: 2, trackNumber: 1 }),
    ]);

    albumRepo.recountStats();

    const albumRow = (id: number) =>
      db.prepare(`SELECT track_count, disc_count FROM albums WHERE id = ?`).get(id) as {
        track_count: number;
        disc_count: number | null;
      };
    expect(albumRow(albumA1).track_count).toBe(2);
    expect(albumRow(albumA1).disc_count).toBe(1); // 两曲 disc 均为 1 → DISTINCT = 1
    expect(albumRow(albumA2).track_count).toBe(1);
    expect(albumRow(albumA2).disc_count).toBe(0); // disc_number 全 NULL → DISTINCT(NULL 排除) = 0（派发决定留痕）
    expect(albumRow(albumB1).track_count).toBe(2);
    expect(albumRow(albumB1).disc_count).toBe(2); // disc {1,2} → DISTINCT = 2

    const artistRow = (id: number) =>
      db.prepare(`SELECT track_count, album_count FROM artists WHERE id = ?`).get(id) as {
        track_count: number;
        album_count: number;
      };
    expect(artistRow(artistA).track_count).toBe(3);
    expect(artistRow(artistA).album_count).toBe(2); // 两个不同 album_id
    expect(artistRow(artistB).track_count).toBe(2);
    expect(artistRow(artistB).album_count).toBe(1); // 单一 album_id
  });

  it('recountStats 不影响未关联曲目计数的其他列（仅重算 count 列）', () => {
    current = setup();
    const { db, albumRepo, artistRepo, trackRepo } = current;
    const artistA = artistRepo.upsertArtist('Artist A');
    const albumA1 = albumRepo.upsertAlbum('Album A1', artistA);
    trackRepo.createMany([
      track({ id: 't1', title: 'X', artistId: artistA, albumId: albumA1, albumArtist: 'Artist A', albumTitle: 'Album A1', year: 1999 }),
    ]);
    albumRepo.recountStats();
    // cover_id 等详情列未被 recountStats 改动（仅 track_count/disc_count）。
    const cover = db.prepare(`SELECT cover_id FROM albums WHERE id = ?`).get(albumA1) as {
      cover_id: string | null;
    };
    expect(cover.cover_id).toBeNull();
  });

  it('getAlbumWithTracks 排序 disc → track_number，NULL disc 在前（NULLS FIRST）', () => {
    current = setup();
    const { albumRepo, artistRepo, trackRepo } = current;
    const artistA = artistRepo.upsertArtist('Artist A');
    const albumA1 = albumRepo.upsertAlbum('Album A1', artistA);
    // 乱序插入，验证 ORDER BY disc_number, track_number。
    trackRepo.createMany([
      track({ id: 'd2t1', title: 'D2T1', artistId: artistA, albumId: albumA1, albumArtist: 'Artist A', albumTitle: 'Album A1', discNumber: 2, trackNumber: 1 }),
      track({ id: 'null', title: 'NULLDISC', artistId: artistA, albumId: albumA1, albumArtist: 'Artist A', albumTitle: 'Album A1', discNumber: null, trackNumber: 1 }),
      track({ id: 'd1t1', title: 'D1T1', artistId: artistA, albumId: albumA1, albumArtist: 'Artist A', albumTitle: 'Album A1', discNumber: 1, trackNumber: 1 }),
      track({ id: 'd2t2', title: 'D2T2', artistId: artistA, albumId: albumA1, albumArtist: 'Artist A', albumTitle: 'Album A1', discNumber: 2, trackNumber: 2 }),
    ]);
    const { album, tracks } = albumRepo.getAlbumWithTracks(albumA1);
    expect(album).not.toBeNull();
    expect(album!.title).toBe('Album A1');
    expect(album!.artistName).toBe('Artist A');
    expect(tracks.map((t) => t.id)).toEqual(['null', 'd1t1', 'd2t1', 'd2t2']);
  });

  it('getAlbumWithTracks 不存在 → album null，tracks 空', () => {
    current = setup();
    const { albumRepo } = current;
    const { album, tracks } = albumRepo.getAlbumWithTracks(999);
    expect(album).toBeNull();
    expect(tracks).toEqual([]);
  });

  it('listAlbums 形状：AlbumCard 全字段 + 默认排序（year DESC NULL 最后, title ASC）', () => {
    current = setup();
    const { db, albumRepo, artistRepo, trackRepo } = current;
    const a = artistRepo.upsertArtist('Artist A');
    const b = artistRepo.upsertArtist('Artist B');
    const a2000 = albumRepo.upsertAlbum('A Year', a);
    const bNull = albumRepo.upsertAlbum('B Null', b);
    const a1999 = albumRepo.upsertAlbum('A Old', a);
    trackRepo.createMany([
      track({ id: 't1', title: 'X', artistId: a, albumId: a2000, albumArtist: 'Artist A', albumTitle: 'A Year', year: 2000 }),
      track({ id: 't2', title: 'Y', artistId: b, albumId: bNull, albumArtist: 'Artist B', albumTitle: 'B Null', year: null }),
      track({ id: 't3', title: 'Z', artistId: a, albumId: a1999, albumArtist: 'Artist A', albumTitle: 'A Old', year: 1999 }),
    ]);
    albumRepo.recountStats();
    // albums.year 是独立列（不经 upsertAlbum 填充），直接写入以校验排序语义。
    db.prepare(`UPDATE albums SET year = 2000 WHERE id = ?`).run(a2000);
    db.prepare(`UPDATE albums SET year = 1999 WHERE id = ?`).run(a1999);
    // bNull 保持 NULL year
    const albums = albumRepo.listAlbums();
    // 形状断言：每条均为完整 AlbumCard。
    for (const al of albums) {
      expect(typeof al.id).toBe('number');
      expect(typeof al.title).toBe('string');
      expect(typeof al.artistName).toBe('string');
      expect(al.year === null || typeof al.year === 'number').toBe(true);
      expect(al.coverId === null || typeof al.coverId === 'string').toBe(true);
      expect(typeof al.trackCount).toBe('number');
    }
    // 排序：year DESC（NULL 最后）+ title ASC 同 year。
    expect(albums.map((al) => al.title)).toEqual(['A Year', 'A Old', 'B Null']);
    const aYear = albums.find((al) => al.title === 'A Year')!;
    expect(aYear.year).toBe(2000);
    expect(aYear.trackCount).toBe(1);
  });
});
