// T1.4 playlistRepo —— 歌单持久化收口点（§4.3-4：repo 是唯一 SQL 收口点）。
// 类型仅从相对路径 import shared（main 侧无 @shared 别名）。
import type { Database } from 'better-sqlite3';
import type { PlaylistSummary, TrackRow } from '../../../shared/types';
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
 *  trackCount 经聚合子查询派生，非 playlists 表原列。
 *  T6.4 增补 coverIds（同样为派生值，非表列）：拼贴封面需要列表接口就带上「前 4 首的专辑封面 id」，
 *  否则 Playlists 页只能对每张卡再发一次 playlists:get（N+1，且每次拖回整张曲目表，浪费）。
 *  设计决策 D-1（setting-up-plan:271）只禁止**持久化** cover 列，派生值不属于该禁令；
 *  不足 4 首时数组更短（调用方补占位），无封面时为空数组。 */
export interface PlaylistRow {
  id: number;
  name: string;
  description: string | null;
  trackCount: number;
  /** 前 4 首有封面的曲目的专辑封面 id（按 position 升序，最多 4 个）。 */
  coverIds: string[];
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
  // T3.1：歌单搜索——name LIKE（§3.5d）；LIMIT 10；返回搜索下拉所需 PlaylistSummary。
  search(q: string): PlaylistSummary[];
}

/** 判定 better-sqlite3 外键约束异常（Phase 6 承接守卫）。
 *  兼容两种形态：code 含 FOREIGNKEY，或 message 含 "FOREIGN KEY"。 */
function isForeignKeyError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const code = (err as { code?: unknown }).code;
  if (typeof code === 'string' && code.includes('FOREIGNKEY')) return true;
  const message = (err as { message?: unknown }).message;
  return typeof message === 'string' && /FOREIGN KEY/i.test(message);
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
       WHERE playlist_tracks.playlist_id = playlists.id) AS trackCount,
    (SELECT group_concat(sub.cover_id, ',')
       FROM (
         SELECT albums.cover_id AS cover_id
         FROM playlist_tracks
         JOIN tracks ON tracks.id = playlist_tracks.track_id
         JOIN albums ON albums.id = tracks.album_id
         WHERE playlist_tracks.playlist_id = playlists.id
           AND albums.cover_id IS NOT NULL
         ORDER BY playlist_tracks.position ASC
         LIMIT 4
       ) AS sub) AS coverIds
  `;
  const stmtGet = db.prepare(`
    SELECT ${PLAYLIST_SELECT} FROM playlists WHERE playlists.id = ?
  `);
  const stmtList = db.prepare(`
    SELECT ${PLAYLIST_SELECT} FROM playlists ORDER BY playlists.name ASC
  `);

  // get(id) 曲目：复用 rowMapper 的 TRACK_SELECT_COLUMNS 基底 + 自有 FROM/JOIN/ORDER。
  // T4.4 前置修复1：TRACK_SELECT_COLUMNS 现引用 albums.cover_id，故此处须 JOIN albums
  // （与 TRACK_SELECT_FROM 一致），否则预备语句报 no such column: albums.cover_id。
  const stmtGetTracks = db.prepare(`
    SELECT ${TRACK_SELECT_COLUMNS}
    FROM playlist_tracks
    JOIN tracks ON tracks.id = playlist_tracks.track_id
    JOIN artists ON artists.id = tracks.artist_id
    JOIN albums ON albums.id = tracks.album_id
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

  // 歌单搜索：name LIKE（§3.5d）；聚合 trackCount；上限 10。
  const stmtSearchPlaylists = db.prepare(`
    SELECT
      playlists.id     AS id,
      playlists.name   AS name,
      (SELECT COUNT(*) FROM playlist_tracks
         WHERE playlist_tracks.playlist_id = playlists.id) AS trackCount
    FROM playlists
    WHERE playlists.name LIKE ?
    ORDER BY playlists.name ASC
    LIMIT 10
  `);

  // -------------------------------------------------------------------------
  // 映射收口
  // -------------------------------------------------------------------------

  /** coverIds 由 group_concat 聚合为逗号串（UUID 不含逗号，切分安全）；NULL（无封面/无曲目）→ []。 */
  function toCoverIds(raw: unknown): string[] {
    if (typeof raw !== 'string' || raw.length === 0) return [];
    return raw.split(',');
  }

  function mapPlaylistRow(raw: Record<string, unknown>): PlaylistRow {
    return {
      id: raw.id as number,
      name: raw.name as string,
      description: (raw.description as string | null) ?? null,
      trackCount: (raw.trackCount as number) ?? 0,
      coverIds: toCoverIds(raw.coverIds),
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
    try {
      tx(id, trackIds);
    } catch (err) {
      // T6 承接守卫：trackIds 含不存在曲目（或歌单不存在）→ SQLite 抛 FK 约束。
      // 原始文案 "FOREIGN KEY constraint failed" 对用户无意义，转为语义明确的友好错误。
      if (isForeignKeyError(err)) throw new Error('addTracks: 歌单或曲目不存在');
      throw err;
    }
  }

  function removeTrack(id: number, trackId: string): void {
    // 仅移除该曲目最小 position 的一次出现（派发决定留痕，详见 stmtRemoveTrack 注释）。
    stmtRemoveTrack.run(id, trackId, id, trackId);
  }

  function reorder(id: number, trackIds: string[]): void {
    // T6 承接守卫：空数组视为 no-op，拒绝「整表清空」的意外擦除。
    // 调用方（DnD 重排）始终传完整有序列表；空歌单本无曲目，no-op 与重排结果等价，
    // 故不抛错以免破坏调用方错误路径。
    if (trackIds.length === 0) return;
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

  function search(q: string): PlaylistSummary[] {
    const rows = stmtSearchPlaylists.all(`%${q.trim()}%`) as Record<string, unknown>[];
    return rows.map((raw) => ({
      id: raw.id as number,
      name: raw.name as string,
      trackCount: (raw.trackCount as number) ?? 0,
    }));
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
    search,
  };
}
