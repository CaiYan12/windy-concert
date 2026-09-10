// T1.4 historyRepo —— 播放历史持久化收口点（§4.3-4：repo 是唯一 SQL 收口点）。
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

/** recordPlay 的更新结果：仅回传 historyId，tracks 侧计数变动由 repo 内部事务完成。 */
export interface RecordPlayResult {
  historyId: number;
}

/** updateOutcome 的输入：播放结果指标（秒 / 是否自然播完）。 */
export interface PlayOutcome {
  playedDuration?: number | null;
  completed?: boolean;
}

// ---------------------------------------------------------------------------
// 工厂
// ---------------------------------------------------------------------------

export interface HistoryRepo {
  /** 记录一次播放：play_history INSERT + tracks 侧 play_count/last_played_at 同事务 UPDATE → 回传 historyId。 */
  recordPlay(trackId: string): RecordPlayResult;
  updateOutcome(historyId: number, outcome: PlayOutcome): void;
  /** §2 口径去重：每曲仅取最近一次播放；返回 TrackRow[]（按最近播放降序）。 */
  listRecent(limit: number): TrackRow[];
}

export function createHistoryRepo(db: Database): HistoryRepo {
  // 固定 arity 的 prepared statements 在工厂内创建一次（形态对齐 trackRepo）。
  // INSERT play_history（仅 track_id，played_at 走 DDL 默认 datetime('now')）。
  const stmtInsert = db.prepare(`
    INSERT INTO play_history (track_id) VALUES (?)
  `);
  // tracks 侧 UPDATE 的 SQL 收口在 historyRepo 自身 prepared stmt，不跨 repo 调用（派发决定留痕——
  // repo 是唯一 SQL 收口点，tracks 更新语句也须在调用方所在 repo 内完成，避免 trackRepo 私有符号外泄）。
  const stmtBumpTrack = db.prepare(`
    UPDATE tracks
    SET play_count = play_count + 1, last_played_at = datetime('now')
    WHERE id = ?
  `);
  const stmtUpdateOutcome = db.prepare(`
    UPDATE play_history
    SET played_duration = ?, completed = ?
    WHERE id = ?
  `);

  // listRecent（§2 口径去重 SQL，V1.3 升格项已修复）：
  // 子查询 SELECT track_id, MAX(id) FROM play_history GROUP BY track_id——自增 id 与插入顺序一致，
  // MAX(id) 即每曲最新一条，不再依赖 played_at 判重。
  // 修复留痕：旧实现用 MAX(played_at) JOIN，datetime('now') 秒级粒度下同曲同秒两次播放
  // 会产生并列 MAX(played_at)，JOIN 吐出重复行；改用 MAX(id) 后不受秒级并列影响，
  // 外层 ORDER BY played_at DESC / LIMIT 语义不变。
  const stmtListRecent = db.prepare(`
    SELECT ${TRACK_SELECT_COLUMNS}
    FROM play_history ph
    JOIN (
      SELECT track_id, MAX(id) AS max_id
      FROM play_history
      GROUP BY track_id
    ) latest ON latest.max_id = ph.id
    JOIN tracks ON tracks.id = ph.track_id
    JOIN artists ON artists.id = tracks.artist_id
    ORDER BY ph.played_at DESC, ph.id DESC
    LIMIT ?
  `);

  // -------------------------------------------------------------------------
  // 方法实现
  // -------------------------------------------------------------------------

  function recordPlay(trackId: string): RecordPlayResult {
    // 同事务：插历史 + 增计数（play_count + last_played_at）。两语句均收口于本 repo 的 prepared。
    const tx = db.transaction((tid: string) => {
      const info = stmtInsert.run(tid);
      stmtBumpTrack.run(tid);
      return info.lastInsertRowid as number;
    });
    const historyId = tx(trackId);
    return { historyId };
  }

  function updateOutcome(historyId: number, outcome: PlayOutcome): void {
    stmtUpdateOutcome.run(
      outcome.playedDuration ?? null,
      outcome.completed ? 1 : 0,
      historyId,
    );
  }

  function listRecent(limit: number): TrackRow[] {
    const rows = stmtListRecent.all(limit) as RawTrackRow[];
    return rows.map(mapTrackRow);
  }

  return {
    recordPlay,
    updateOutcome,
    listRecent,
  };
}
