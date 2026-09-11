// T1.3 albumRepo —— 专辑持久化收口点（§4.3-4：repo 是唯一 SQL 收口点）。
// 类型仅从相对路径 import shared（main 侧无 @shared 别名）。
import type { Database } from 'better-sqlite3';
import type { AlbumCard, TrackRow } from '../../../shared/types';
// T1.3：TrackRow 列基底与映射单一收口于 rowMapper（不 import trackRepo 私有符号）。
import { TRACK_SELECT_FROM, mapTrackRow, type RawTrackRow } from './rowMapper';

// ---------------------------------------------------------------------------
// 类型
// ---------------------------------------------------------------------------

/** getAlbumWithTracks 返回的专辑详情：AlbumCard + 详情所需字段（genre / discCount）。 */
export interface AlbumDetail {
  id: number;
  title: string;
  artistName: string;
  year: number | null;
  coverId: string | null;
  trackCount: number;
  genre: string | null; // 详情字段（AlbumCard 未含）
  discCount: number | null; // 详情字段（AlbumCard 未含）
}

// ---------------------------------------------------------------------------
// 工厂
// ---------------------------------------------------------------------------

export interface AlbumRepo {
  upsertAlbum(title: string, artistId: number): number;
  recountStats(): void;
  /** T4.11：专辑总数轻量查询（SELECT COUNT(*)）。 */
  count(): number;
  listAlbums(): AlbumCard[];
  getAlbumWithTracks(id: number): { album: AlbumDetail | null; tracks: TrackRow[] };
  // T3.1：专辑搜索——title LIKE（§3.5d，数量级有限不用 FTS）；LIMIT 10。
  search(q: string): AlbumCard[];
}

export function createAlbumRepo(db: Database): AlbumRepo {
  // 固定 arity 的 prepared statements 在工厂内创建一次（形态对齐 trackRepo）。
  const stmtUpsert = db.prepare(`
    INSERT INTO albums (title, artist_id) VALUES (?, ?)
    ON CONFLICT(title, artist_id) DO NOTHING
  `);
  const stmtSelectId = db.prepare(`
    SELECT id FROM albums WHERE title = ? AND artist_id = ?
  `);
  // recountStats 两条 UPDATE（§3.5a 阶段 D 锚点）：仅重算 count 列，不含 updated_at（保持最小——派发决定留痕）。
  const stmtRecountAlbums = db.prepare(`
    UPDATE albums SET
      track_count = (SELECT COUNT(*) FROM tracks WHERE tracks.album_id = albums.id),
      disc_count  = (SELECT COUNT(DISTINCT disc_number) FROM tracks WHERE tracks.album_id = albums.id AND disc_number IS NOT NULL)
  `);
  const stmtRecountArtists = db.prepare(`
    UPDATE artists SET
      track_count = (SELECT COUNT(*) FROM tracks WHERE tracks.artist_id = artists.id),
      album_count = (SELECT COUNT(DISTINCT album_id) FROM tracks WHERE tracks.artist_id = artists.id)
  `);

  // AlbumCard / AlbumDetail 收口映射点（JOIN artists 取 artistName）。
  const ALBUM_SELECT = `
    albums.id          AS id,
    albums.title       AS title,
    artists.name       AS artistName,
    albums.year        AS year,
    albums.cover_id    AS coverId,
    albums.track_count AS trackCount,
    albums.genre       AS genre,
    albums.disc_count  AS discCount
  `;

  const stmtListAlbums = db.prepare(`
    SELECT ${ALBUM_SELECT}
    FROM albums
    JOIN artists ON artists.id = albums.artist_id
    ORDER BY (albums.year IS NULL) ASC, albums.year DESC, albums.title ASC
  `);
  const stmtGetAlbum = db.prepare(`
    SELECT ${ALBUM_SELECT}
    FROM albums
    JOIN artists ON artists.id = albums.artist_id
    WHERE albums.id = ?
  `);
  const stmtGetTracks = db.prepare(`
    ${TRACK_SELECT_FROM}
    WHERE tracks.album_id = ?
    ORDER BY tracks.disc_number, tracks.track_number
  `);
  // 专辑搜索：title LIKE（§3.5d，<3 与专辑/艺术家/歌单统一 LIKE）；上限 10。
  const stmtSearchAlbums = db.prepare(`
    SELECT ${ALBUM_SELECT}
    FROM albums
    JOIN artists ON artists.id = albums.artist_id
    WHERE albums.title LIKE ?
    ORDER BY albums.title ASC
    LIMIT 10
  `);

  // -------------------------------------------------------------------------
  // 方法实现
  // -------------------------------------------------------------------------

  function upsertAlbum(title: string, artistId: number): number {
    stmtUpsert.run(title, artistId); // 冲突则 DO NOTHING
    const row = stmtSelectId.get(title, artistId) as { id: number } | undefined;
    if (!row) {
      // 理论不可达（DO NOTHING 后仍 SELECT 命中刚插入或已存在行）；守卫以防并发异常。
      throw new Error('albumRepo.upsertAlbum: 无法解析 album id');
    }
    return row.id;
  }

  function recountStats(): void {
    const tx = db.transaction(() => {
      stmtRecountAlbums.run();
      stmtRecountArtists.run();
    });
    tx();
  }

  function mapAlbumCard(raw: Record<string, unknown>): AlbumCard {
    return {
      id: raw.id as number,
      title: raw.title as string,
      artistName: (raw.artistName as string) ?? '',
      year: (raw.year as number | null) ?? null,
      coverId: (raw.coverId as string | null) ?? null,
      trackCount: raw.trackCount as number,
    };
  }

  function mapAlbumDetail(raw: Record<string, unknown>): AlbumDetail {
    return {
      ...mapAlbumCard(raw),
      genre: (raw.genre as string | null) ?? null,
      discCount: (raw.discCount as number | null) ?? null,
    };
  }

  function listAlbums(): AlbumCard[] {
    const rows = stmtListAlbums.all() as Record<string, unknown>[];
    return rows.map(mapAlbumCard);
  }

  // T4.11：总数聚合（固定 arity，工厂内 prepare 一次）。
  const stmtCount = db.prepare(`SELECT COUNT(*) AS n FROM albums`);

  function count(): number {
    return (stmtCount.get() as { n: number }).n;
  }

  function getAlbumWithTracks(id: number): { album: AlbumDetail | null; tracks: TrackRow[] } {
    const albumRow = stmtGetAlbum.get(id) as Record<string, unknown> | undefined;
    const album = albumRow ? mapAlbumDetail(albumRow) : null;
    const trackRows = stmtGetTracks.all(id) as RawTrackRow[];
    const tracks = trackRows.map(mapTrackRow);
    return { album, tracks };
  }

  function search(q: string): AlbumCard[] {
    const rows = stmtSearchAlbums.all(`%${q.trim()}%`) as Record<string, unknown>[];
    return rows.map(mapAlbumCard);
  }

  return {
    upsertAlbum,
    recountStats,
    count,
    listAlbums,
    getAlbumWithTracks,
    search,
  };
}
