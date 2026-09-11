// T1.3 共享行映射收口（§4.3-4：repo 是唯一 SQL 收口点）。
// TrackRow 的 SELECT 列基底与行映射被 trackRepo / albumRepo 共用，集中此处单一收口，
// 避免两 repo 各自复制 mapRow 语义导致漂移（派发决定：新建 repositories/rowMapper.ts 供两 repo 共用）。
import type { TrackRow } from '../../../shared/types';

type TrackStatus = TrackRow['status'];

/** TrackRow 收口映射所需的 SELECT 列片段（含 artists JOIN 取 artistName）。 */
export const TRACK_SELECT_COLUMNS = `
  tracks.id            AS id,
  tracks.title         AS title,
  tracks.artist_id     AS artistId,
  artists.name         AS artistName,
  tracks.album_id      AS albumId,
  tracks.album_title   AS albumTitle,
  tracks.album_artist  AS albumArtist,
  tracks.track_number  AS trackNumber,
  tracks.disc_number   AS discNumber,
  tracks.year          AS year,
  tracks.genre         AS genre,
  tracks.duration      AS duration,
  tracks.file_path     AS filePath,
  tracks.format        AS format,
  tracks.bitrate       AS bitrate,
  tracks.sample_rate   AS sampleRate,
  tracks.bit_depth     AS bitDepth,
  tracks.playable      AS playable,
  tracks.status        AS status,
  -- T4.4 前置修复1（用户裁定「渲染层走专辑封面」）：tracks.cover_id 全仓无写入点
  -- （coverService 只写 albums.cover_id），故曲目封面回退取所属专辑封面。此处由
  -- tracks.cover_id 改为 albums.cover_id，并随 TRACK_SELECT_FROM 增 JOIN albums。
  -- 不改扫描管线（coverService/cover.worker 不动）；AlbumCard 自身已走 albums.cover_id，不受影响。
  albums.cover_id     AS coverId,
  tracks.favorite      AS favorite,
  tracks.play_count    AS playCount,
  tracks.date_added    AS dateAdded,
  tracks.last_played_at AS lastPlayedAt,
  tracks.favorited_at  AS favoritedAt
`;

/** TrackRow 收口 SELECT 基底：JOIN artists 取 artistName；JOIN albums 取所属专辑封面
 * （T4.4 前置修复1：曲目封面回填 albums.cover_id，见 TRACK_SELECT_COLUMNS 注释）。 */
export const TRACK_SELECT_FROM = `
SELECT ${TRACK_SELECT_COLUMNS}
FROM tracks
JOIN artists ON artists.id = tracks.artist_id
JOIN albums ON albums.id = tracks.album_id
`;

export type RawTrackRow = Record<string, unknown>;

/** 将 raw 行映射为 TrackRow（camelCase；NULL 安全默认）。单一收口点。 */
export function mapTrackRow(raw: RawTrackRow): TrackRow {
  return {
    id: raw.id as string,
    title: raw.title as string,
    artistId: raw.artistId as number,
    artistName: (raw.artistName as string) ?? '',
    albumId: raw.albumId as number,
    albumTitle: raw.albumTitle as string,
    albumArtist: raw.albumArtist as string,
    trackNumber: (raw.trackNumber as number | null) ?? null,
    discNumber: (raw.discNumber as number | null) ?? null,
    year: (raw.year as number | null) ?? null,
    genre: (raw.genre as string | null) ?? null,
    duration: (raw.duration as number) ?? 0,
    filePath: raw.filePath as string,
    format: raw.format as string,
    bitrate: (raw.bitrate as number | null) ?? null,
    sampleRate: (raw.sampleRate as number | null) ?? null,
    bitDepth: (raw.bitDepth as number | null) ?? null,
    playable: (raw.playable as number) === 1,
    status: raw.status as TrackStatus,
    coverId: (raw.coverId as string | null) ?? null,
    favorite: (raw.favorite as number) === 1,
    playCount: (raw.playCount as number) ?? 0,
    dateAdded: raw.dateAdded as string,
    lastPlayedAt: (raw.lastPlayedAt as string | null) ?? null,
    favoritedAt: (raw.favoritedAt as string | null) ?? null,
  };
}
