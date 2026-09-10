// T1.3 artistRepo —— 艺术家持久化收口点（§4.3-4：repo 是唯一 SQL 收口点）。
// 类型仅从相对路径 import shared（main 侧无 @shared 别名）。
import type { Database } from 'better-sqlite3';
import type { AlbumCard, ArtistCard, TrackRow } from '../../../shared/types';
// T1.3：TrackRow 列基底与映射单一收口于 rowMapper（不 import trackRepo 私有符号）。
import { TRACK_SELECT_FROM, mapTrackRow, type RawTrackRow } from './rowMapper';

// ---------------------------------------------------------------------------
// 类型
// ---------------------------------------------------------------------------

/** getArtistOverview 返回的艺术家详情：ArtistCard + 详情字段。
 *  sortName / avatar / background / description 均为 artists 表预留列（0001_init），当前多为 NULL。 */
export interface ArtistDetail extends ArtistCard {
  sortName: string | null;
  avatar: string | null;
  background: string | null;
  description: string | null;
}

// ---------------------------------------------------------------------------
// 工厂
// ---------------------------------------------------------------------------

export interface ArtistRepo {
  upsertArtist(name: string): number;
  listArtists(): ArtistCard[];
  getArtistOverview(id: number): {
    artist: ArtistDetail | null;
    albums: AlbumCard[];
    tracks: TrackRow[];
  };
  // T3.1：艺术家搜索——name LIKE（§3.5d）；LIMIT 10。
  search(q: string): ArtistCard[];
}

export function createArtistRepo(db: Database): ArtistRepo {
  // 固定 arity 的 prepared statements 在工厂内创建一次（形态对齐 trackRepo）。
  const stmtUpsert = db.prepare(`
    INSERT INTO artists (name) VALUES (?)
    ON CONFLICT(name) DO NOTHING
  `);
  const stmtSelectId = db.prepare(`SELECT id FROM artists WHERE name = ?`);

  // ArtistCard 收口映射点（直接读 artists.track_count/album_count 列）。
  const ARTIST_SELECT = `
    artists.id          AS id,
    artists.name        AS name,
    artists.track_count AS trackCount,
    artists.album_count AS albumCount,
    artists.sort_name   AS sortName,
    artists.avatar      AS avatar,
    artists.background  AS background,
    artists.description AS description
  `;

  const stmtListArtists = db.prepare(`
    SELECT id, name, track_count AS trackCount, album_count AS albumCount
    FROM artists
    ORDER BY name ASC
  `);
  // 艺术家搜索：name LIKE（§3.5d）；上限 10。
  const stmtSearchArtists = db.prepare(`
    SELECT id, name, track_count AS trackCount, album_count AS albumCount
    FROM artists
    WHERE name LIKE ?
    ORDER BY name ASC
    LIMIT 10
  `);
  const stmtGetArtist = db.prepare(`
    SELECT ${ARTIST_SELECT}
    FROM artists
    WHERE artists.id = ?
  `);
  // 艺术家专辑列表：AlbumCard（JOIN 同表 artists 取 artistName；此处 artistName 必等于该艺术家 name）。
  const ALBUM_SELECT = `
    albums.id          AS id,
    albums.title       AS title,
    artists.name       AS artistName,
    albums.year        AS year,
    albums.cover_id    AS coverId,
    albums.track_count AS trackCount
  `;
  const stmtArtistAlbums = db.prepare(`
    SELECT ${ALBUM_SELECT}
    FROM albums
    JOIN artists ON artists.id = albums.artist_id
    WHERE albums.artist_id = ?
    ORDER BY (albums.year IS NULL) ASC, albums.year DESC, albums.title ASC
  `);
  // 艺术家曲目：按专辑归组后再 disc/track 排序（确定性默认——派发决定留痕）。
  const stmtArtistTracks = db.prepare(`
    ${TRACK_SELECT_FROM}
    WHERE tracks.artist_id = ?
    ORDER BY tracks.album_id ASC, tracks.disc_number, tracks.track_number
  `);

  // -------------------------------------------------------------------------
  // 方法实现
  // -------------------------------------------------------------------------

  function upsertArtist(name: string): number {
    stmtUpsert.run(name); // 冲突则 DO NOTHING
    const row = stmtSelectId.get(name) as { id: number } | undefined;
    if (!row) {
      // 理论不可达（DO NOTHING 后仍 SELECT 命中刚插入或已存在行）；守卫以防并发异常。
      throw new Error('artistRepo.upsertArtist: 无法解析 artist id');
    }
    return row.id;
  }

  function mapArtistCard(raw: Record<string, unknown>): ArtistCard {
    return {
      id: raw.id as number,
      name: raw.name as string,
      trackCount: raw.trackCount as number,
      albumCount: raw.albumCount as number,
    };
  }

  function mapArtistDetail(raw: Record<string, unknown>): ArtistDetail {
    return {
      ...mapArtistCard(raw),
      sortName: (raw.sortName as string | null) ?? null,
      avatar: (raw.avatar as string | null) ?? null,
      background: (raw.background as string | null) ?? null,
      description: (raw.description as string | null) ?? null,
    };
  }

  function listArtists(): ArtistCard[] {
    const rows = stmtListArtists.all() as Record<string, unknown>[];
    return rows.map(mapArtistCard);
  }

  function getArtistOverview(id: number): {
    artist: ArtistDetail | null;
    albums: AlbumCard[];
    tracks: TrackRow[];
  } {
    const artistRow = stmtGetArtist.get(id) as Record<string, unknown> | undefined;
    const artist = artistRow ? mapArtistDetail(artistRow) : null;
    const albumRows = stmtArtistAlbums.all(id) as Record<string, unknown>[];
    const albums = albumRows.map((raw) => ({
      id: raw.id as number,
      title: raw.title as string,
      artistName: (raw.artistName as string) ?? '',
      year: (raw.year as number | null) ?? null,
      coverId: (raw.coverId as string | null) ?? null,
      trackCount: raw.trackCount as number,
    }));
    const trackRows = stmtArtistTracks.all(id) as RawTrackRow[];
    const tracks = trackRows.map(mapTrackRow);
    return { artist, albums, tracks };
  }

  function search(q: string): ArtistCard[] {
    const rows = stmtSearchArtists.all(`%${q.trim()}%`) as Record<string, unknown>[];
    return rows.map(mapArtistCard);
  }

  return {
    upsertArtist,
    listArtists,
    getArtistOverview,
    search,
  };
}
