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

describe('artistRepo', () => {
  it('upsertArtist 幂等：同名两次返回同 id', () => {
    current = setup();
    const { db, artistRepo } = current;
    const id1 = artistRepo.upsertArtist('Radiohead');
    const id2 = artistRepo.upsertArtist('Radiohead');
    expect(id1).toBe(id2);
    const count = (db.prepare(`SELECT COUNT(*) c FROM artists WHERE name = 'Radiohead'`).get() as { c: number }).c;
    expect(count).toBe(1);
  });

  it('listArtists 形状：ArtistCard 全字段', () => {
    current = setup();
    const { artistRepo } = current;
    artistRepo.upsertArtist('Beatles');
    artistRepo.upsertArtist('ABBA');
    const artists = artistRepo.listArtists();
    expect(artists.length).toBe(2);
    for (const ar of artists) {
      expect(typeof ar.id).toBe('number');
      expect(typeof ar.name).toBe('string');
      expect(typeof ar.trackCount).toBe('number');
      expect(typeof ar.albumCount).toBe('number');
    }
    // 默认排序 name ASC。
    expect(artists.map((ar) => ar.name)).toEqual(['ABBA', 'Beatles']);
  });

  it('getArtistOverview 返回 artist / albums / tracks 且计数经 recountStats 正确', () => {
    current = setup();
    const { db, albumRepo, artistRepo, trackRepo } = current;
    const a = artistRepo.upsertArtist('Artist A');
    const albumA1 = albumRepo.upsertAlbum('Album A1', a);
    const albumA2 = albumRepo.upsertAlbum('Album A2', a);
    trackRepo.createMany([
      track({ id: 't1', title: 'A1-1', artistId: a, albumId: albumA1, albumArtist: 'Artist A', albumTitle: 'Album A1', discNumber: 1, trackNumber: 1 }),
      track({ id: 't2', title: 'A1-2', artistId: a, albumId: albumA1, albumArtist: 'Artist A', albumTitle: 'Album A1', discNumber: 1, trackNumber: 2 }),
      track({ id: 't3', title: 'A2-1', artistId: a, albumId: albumA2, albumArtist: 'Artist A', albumTitle: 'Album A2', discNumber: null, trackNumber: 1 }),
    ]);
    albumRepo.recountStats();

    const { artist, albums, tracks } = artistRepo.getArtistOverview(a);
    expect(artist).not.toBeNull();
    expect(artist!.name).toBe('Artist A');
    expect(artist!.trackCount).toBe(3);
    expect(artist!.albumCount).toBe(2);
    // 详情字段（预留列）当前为 NULL。
    expect(artist!.sortName).toBeNull();
    expect(artist!.avatar).toBeNull();
    expect(artist!.background).toBeNull();
    expect(artist!.description).toBeNull();

    // albums 为 AlbumCard[]，含两张专辑。
    expect(albums.length).toBe(2);
    expect(albums.every((al) => typeof al.id === 'number' && typeof al.title === 'string' && al.artistName === 'Artist A')).toBe(true);
    expect(new Set(albums.map((al) => al.title))).toEqual(new Set(['Album A1', 'Album A2']));

    // tracks 为 TrackRow[]，共 3 曲。
    expect(tracks.length).toBe(3);
    expect(new Set(tracks.map((t) => t.id))).toEqual(new Set(['t1', 't2', 't3']));
    // 默认排序 album_id ASC（A1 在前、A2 在后）, disc_number, track_number。
    // t3 属 album A2，故排在所有 A1 曲目之后（NULL disc 仅影响同 album_id 内次序）。
    expect(tracks.map((t) => t.id)).toEqual(['t1', 't2', 't3']);
  });

  it('getArtistOverview 不存在 → artist null，albums/tracks 空', () => {
    current = setup();
    const { artistRepo } = current;
    const { artist, albums, tracks } = artistRepo.getArtistOverview(999);
    expect(artist).toBeNull();
    expect(albums).toEqual([]);
    expect(tracks).toEqual([]);
  });

  // T4.11：library:getStats 的 repo 层数据源（轻量 COUNT）。
  it('count → 艺术家总数轻量查询（空库 0，同名 upsert 合并后计唯一行数）', () => {
    current = setup();
    const { artistRepo } = current;
    expect(artistRepo.count()).toBe(0);
    artistRepo.upsertArtist('Artist A');
    artistRepo.upsertArtist('Artist B');
    // 同名再次 upsert → 合并，不重复计数。
    artistRepo.upsertArtist('Artist A');
    expect(artistRepo.count()).toBe(2);
  });
});
