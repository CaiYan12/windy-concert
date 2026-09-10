// T1.4 playlistRepo —— 歌单持久化收口点（§4.3-4：repo 是唯一 SQL 收口点）。
// 类型仅从相对路径 import shared（main 侧无 @shared 别名）。
import type { Database } from 'better-sqlite3';
import type { TrackRow } from '../../../shared/types';
// T1.3：TrackRow 列基底与映射单一收口于 rowMapper（不 import trackRepo 私有符号）。
import {
  TRACK_SELECT_COLUMNS,
  mapTrackRow,
  type RawTrackRow,
} from './rowMapper';

// ---------------------------------------------------------------------------
// 类型
// ---------------------------------------------------------------------------

/** 侧栏 / 列表所需歌单行形态：自定留痕（PlayistRow 由本 repo 收口定义）。
 *  trackCount 经聚合子查询派生，非 playlists 表原列。 */
export interface PlaylistRow {
  id: number;
  name: string;
  description: string | null;
  trackCount: number;
  createdAt: string;
  updatedAt: string;
}

/** get 返回：歌单元信息 + 按 position 排序的曲目。 */
export interface PlaylistDetail {
  playlist: PlaylistRow | null;
  tracks: TrackRow[];
}

// ---------------------------------------------------------------------------
// 工厂
// ---------------------------------------------------------------------------

export interface PlaylistRepo {
  create(name: string): PlaylistRow;
  rename(id: number, name: string): void;
  delete(id: number): void;
  list(): PlaylistRow[];
  get(id: number): PlaylistDetail;
  addTracks(id: number, trackIds: string[]): void;
  removeTrack(id: number, trackId: string): void;
  /** §3.4 注释原文语义：事务内 DELETE 全部 + 按 1..n 重插（position 连续、允许重复曲目）。 */
  reorder(id: number, trackIds: string[]): void;
}

export function createPlaylistRepo(db: Database): PlaylistRepo {
  // 固定 arity 的 prepared statements 在工厂内创建一次（形态对齐 trackRepo）。
  const stmtInsert = db.prepare(`
    INSERT INTO playlists (name) VALUES (?)
  `);
  const stmtRename = db.prepare(`
    UPDATE playlists SET name = ?, updated_at = datetime('now') WHERE id = ?
  `);
  // delete 依赖 playlists(id) → playlist_tracks(playlist_id) ON DELETE CASCADE 清子表（DDL 锚点）。
  const stmtDelete = db.prepare(`
    DELETE FROM playlists WHERE id = ?
  `);

  // 歌单行映射收口点（含 playlist_tracks 聚合 trackCount）。
  const PLAYLIST_SELECT = `
    playlists.id                                  AS id,
    playlists.name                                AS name,
    playlists.description                         AS description,
    playlists.created_at                          AS createdAt,
    playlists.updated_at                          AS updatedAt,
    (SELECT COUNT(*) FROM playlist_tracks
       WHERE playlist_tracks.playlist_id = playlists.id) AS trackCount
  `;
  const stmtGet = db.prepare(`
    SELECT ${PLAYLIST_SELECT} FROM playlists WHERE playlists.id = ?
  `);
  const stmtList = db.prepare(`
    SELECT ${PLAYLIST_SELECT} FROM playlists ORDER BY playlists.name ASC
  `);

  // get(id) 曲目：复用 rowMapper 的 TRACK_SELECT_COLUMNS 基底 + 自有 FROM/JOIN/ORDER。
  const stmtGetTracks = db.prepare(`
    SELECT ${TRACK_SELECT_COLUMNS}
    FROM playlist_tracks
    JOIN tracks ON tracks.id = playlist_tracks.track_id
    JOIN artists ON artists.id = tracks.artist_id
    WHERE playlist_tracks.playlist_id = ?
    ORDER BY playlist_tracks.position ASC
  `);

  // addTracks 用：当前 max(position) 作为递增基准（无则 0）。
  const stmtMaxPos = db.prepare(`
    SELECT COALESCE(MAX(position), 0) AS maxPos
    FROM playlist_tracks WHERE playlist_id = ?
  `);
  const stmtInsertTrack = db.prepare(`
    INSERT INTO playlist_tracks (playlist_id, track_id, position)
    VALUES (?, ?, ?)
  `);

  // removeTrack 用：删除该曲目最小 position 的一次出现（§3.4 派发决定留痕——
  // 仅移除最小 position，留下 position 空洞可接受，reorder/addTracks 语义不受影响）。
  const stmtRemoveTrack = db.prepare(`
    DELETE FROM playlist_tracks
    WHERE playlist_id = ? AND track_id = ?
      AND position = (
        SELECT MIN(position) FROM playlist_tracks
        WHERE playlist_id = ? AND track_id = ?
      )
  `);

  // reorder 用：整批清空歌单后按 1..n 重插（§3.4 注释原文语义）。
  const stmtClearTracks = db.prepare(`
    DELETE FROM playlist_tracks WHERE playlist_id = ?
  `);

  // -------------------------------------------------------------------------
  // 映射收口
  // -------------------------------------------------------------------------

  function mapPlaylistRow(raw: Record<string, unknown>): PlaylistRow {
    return {
      id: raw.id as number,
      name: raw.name as string,
      description: (raw.description as string | null) ?? null,
      trackCount: (raw.trackCount as number) ?? 0,
      createdAt: raw.createdAt as string,
      updatedAt: raw.updatedAt as string,
    };
  }

  // -------------------------------------------------------------------------
  // 方法实现
  // -------------------------------------------------------------------------

  function create(name: string): PlaylistRow {
    const info = stmtInsert.run(name);
    const id = info.lastInsertRowid as number;
    const row = stmtGet.get(id) as Record<string, unknown>;
    return mapPlaylistRow(row);
  }

  function rename(id: number, name: string): void {
    stmtRename.run(name, id);
  }

  function deletePlaylist(id: number): void {
    // ON DELETE CASCADE 清 playlist_tracks（DDL 锚点）；不手动清子表以最小 diff。
    stmtDelete.run(id);
  }

  function list(): PlaylistRow[] {
    const rows = stmtList.all() as Record<string, unknown>[];
    return rows.map(mapPlaylistRow);
  }

  function get(id: number): PlaylistDetail {
    const row = stmtGet.get(id) as Record<string, unknown> | undefined;
    const playlist = row ? mapPlaylistRow(row) : null;
    const trackRows = stmtGetTracks.all(id) as RawTrackRow[];
    const tracks = trackRows.map(mapTrackRow);
    return { playlist, tracks };
  }

  function addTracks(id: number, trackIds: string[]): void {
    if (trackIds.length === 0) return;
    // 事务内：position = 当前 max+1 递增；同一曲目可多次入歌单
    // （§3.4 UNIQUE 只在 (playlist_id, position)，与 track_id 无关）。
    const tx = db.transaction((pid: number, tids: string[]) => {
      const base = (stmtMaxPos.get(pid) as { maxPos: number }).maxPos;
      for (let i = 0; i < tids.length; i++) {
        stmtInsertTrack.run(pid, tids[i], base + i + 1);
      }
    });
    tx(id, trackIds);
  }

  function removeTrack(id: number, trackId: string): void {
    // 仅移除该曲目最小 position 的一次出现（派发决定留痕，详见 stmtRemoveTrack 注释）。
    stmtRemoveTrack.run(id, trackId, id, trackId);
  }

  function reorder(id: number, trackIds: string[]): void {
    // §3.4 注释原文语义：事务内 DELETE 全部 + 按 1..n 重插。
    // 允许 trackIds 含重复曲目（position 1..n 连续无冲突，UNIQUE 仅约束 (playlist_id, position)）。
    const tx = db.transaction((pid: number, tids: string[]) => {
      stmtClearTracks.run(pid);
      for (let i = 0; i < tids.length; i++) {
        stmtInsertTrack.run(pid, tids[i], i + 1);
      }
    });
    tx(id, trackIds);
  }

  return {
    create,
    rename,
    delete: deletePlaylist,
    list,
    get,
    addTracks,
    removeTrack,
    reorder,
  };
}
