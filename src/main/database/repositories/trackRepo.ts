// T1.2 trackRepo —— 曲目持久化收口点（§4.3-4：repo 是唯一 SQL 收口点）。
// 类型仅从相对路径 import shared（main 侧无 @shared 别名）。
import type { Database, Statement } from 'better-sqlite3';
import type { TrackRow, SortKey, SortOrder } from '../../../shared/types';
// T1.3：TrackRow 收口映射（列基底 + mapRow）提取至 rowMapper 单一收口（最小 diff，行为不变）。
import {
  TRACK_SELECT_FROM as SELECT_FROM,
  mapTrackRow as mapRow,
  type RawTrackRow,
} from './rowMapper';

// ---------------------------------------------------------------------------
// 类型
// ---------------------------------------------------------------------------

export type TrackStatus = TrackRow['status'];

/** createMany 的输入行形态：覆盖 tracks 业务列（以 0001_init DDL 为准裁剪）。 */
export interface TrackInsert {
  id: string;
  title: string;
  artistId: number;
  albumId: number;
  artistString?: string | null;
  albumArtist: string;
  albumTitle: string;
  trackNumber?: number | null;
  discNumber?: number | null;
  year?: number | null;
  genre?: string | null;
  composer?: string | null;
  comment?: string | null;
  duration?: number | null;
  filePath: string;
  fileName: string;
  fileSize: number;
  fileMtime: number;
  format: string;
  codec?: string | null;
  bitrate?: number | null;
  sampleRate?: number | null;
  bitDepth?: number | null;
  channels?: number | null;
  playable: boolean;
  coverId?: string | null;
  metaProvenance?: string | null;
}

/**
 * updateAfterParse 的解析结果驱动更新对象。键为 camelCase，映射到 DDL 列。
 * 只有本接口声明的列可被更新（固定白名单，见 AFTER_PARSE_MAP）。
 */
export interface TrackParseUpdate {
  title?: string;
  artistString?: string | null;
  albumArtist?: string;
  albumTitle?: string;
  trackNumber?: number | null;
  discNumber?: number | null;
  year?: number | null;
  genre?: string | null;
  composer?: string | null;
  comment?: string | null;
  duration?: number | null;
  codec?: string | null;
  bitrate?: number | null;
  sampleRate?: number | null;
  bitDepth?: number | null;
  channels?: number | null;
  playable?: boolean;
  coverId?: string | null;
  metaProvenance?: string | null;
}

export interface ListSongsParams {
  sortBy: SortKey;
  order?: SortOrder;
  offset?: number;
  limit?: number;
}

export interface FindByIdentityOpts {
  /** service 层（Phase 2）决定是否附加 status 过滤（move 检测传 'missing'）。
   *  SQL 收口在 repo，过滤条件经参数传入——同时满足两条计划措辞（执行备注留痕）。 */
  status?: TrackStatus;
}

// ---------------------------------------------------------------------------
// 排序白名单（§3.7）。键命中 Map 才可入 SQL，否则抛错——防注入。
// ---------------------------------------------------------------------------

const SORT_COLUMN_MAP = new Map<SortKey, string>([
  ['title', 'tracks.title'],
  ['artist', 'artists.name'], // JOIN artists
  ['album', 'tracks.album_title'],
  ['dateAdded', 'tracks.date_added'],
  ['year', 'tracks.year'],
  ['duration', 'tracks.duration'],
  ['playCount', 'tracks.play_count'],
]);

function resolveSortColumn(key: SortKey): string {
  const col = SORT_COLUMN_MAP.get(key);
  if (!col) {
    throw new Error(`trackRepo.listSongs: 非法 sortBy 键 "${String(key)}"，未命中白名单`);
  }
  return col;
}

// ---------------------------------------------------------------------------
// updateAfterParse 固定白名单：camelCase 键 → DDL 列。
// 仅本 Map 中的列可被 SET，列名全部为硬编码字面量（非用户输入），
// 值全部走 bind 参数——动态 SET 从固定键生成不算拼 SQL 越界（执行备注留痕）。
// ---------------------------------------------------------------------------

const AFTER_PARSE_MAP: Array<[keyof TrackParseUpdate, string, (v: unknown) => unknown]> = [
  ['title', 'title', (v) => v],
  ['artistString', 'artist_string', (v) => v],
  ['albumArtist', 'album_artist', (v) => v],
  ['albumTitle', 'album_title', (v) => v],
  ['trackNumber', 'track_number', (v) => v],
  ['discNumber', 'disc_number', (v) => v],
  ['year', 'year', (v) => v],
  ['genre', 'genre', (v) => v],
  ['composer', 'composer', (v) => v],
  ['comment', 'comment', (v) => v],
  ['duration', 'duration', (v) => v],
  ['codec', 'codec', (v) => v],
  ['bitrate', 'bitrate', (v) => v],
  ['sampleRate', 'sample_rate', (v) => v],
  ['bitDepth', 'bit_depth', (v) => v],
  ['channels', 'channels', (v) => v],
  ['playable', 'playable', (v) => (v ? 1 : 0)],
  ['coverId', 'cover_id', (v) => v],
  ['metaProvenance', 'meta_provenance', (v) => v],
];

const VALID_STATUSES: ReadonlySet<string> = new Set(['available', 'missing', 'ignored']);

// SQLite 单条语句 IN / NOT IN 的占位符上限实测为 SQLITE_MAX_VARIABLE_NUMBER（32766）。
// 30k 曲库全量重扫时 markMissing 的 except 路径约 30000、setStatus/listByIds 的批量 ids
// 也可能破万，逼近上限（仅 ~9% 余量），超限即抛 "too many SQL variables"。
// 故 IN 列表按批拆分（正向 IN 可分批组合），NOT IN 不可分批——改用临时表（见 markMissing）。
const IN_BATCH = 500;

// T1.3：SELECT_COLUMNS / SELECT_FROM / mapRow 已迁移至 ./rowMapper 单一收口（见文件顶部 import）。
// 此处仅保留 TrackRepo 专属的工厂逻辑。

// ---------------------------------------------------------------------------
// 工厂
// ---------------------------------------------------------------------------

export interface TrackRepo {
  createMany(tracks: TrackInsert[]): void;
  listSongs(params: ListSongsParams): TrackRow[];
  findById(id: string): TrackRow | null;
  updateAfterParse(id: string, parsed: TrackParseUpdate): void;
  updateFileIdentity(id: string, identity: { filePath: string }): void;
  setStatus(ids: string[], status: TrackStatus): void;
  markMissing(exceptPathsLower: string[]): void;
  // V1.3 升格项：返回全部命中（0 命中返回空数组）。唯一性判定交给 service 层（T2.3）——
  // §3.5a 阶段 B：唯一命中才 adopt，0 或 ≥2 命中均按 create 处理（歧义宁可新建）。
  findByFileIdentity(
    fileName: string,
    size: number,
    mtime: number,
    opts?: FindByIdentityOpts,
  ): TrackRow[];
  setFavorite(id: string, favorite: boolean): void;
  incrementPlay(id: string): void;
  listByIds(ids: string[]): TrackRow[];
}

export function createTrackRepo(db: Database): TrackRepo {
  // 固定 arity 的 prepared statements 在工厂内创建一次。
  const stmtInsert = db.prepare(`
    INSERT INTO tracks (
      id, title, artist_id, album_id, artist_string, album_artist, album_title,
      track_number, disc_number, year, genre, composer, comment, duration,
      file_path, file_name, file_size, file_mtime, format, codec, bitrate,
      sample_rate, bit_depth, channels, playable, cover_id, meta_provenance
    ) VALUES (
      @id, @title, @artistId, @albumId, @artistString, @albumArtist, @albumTitle,
      @trackNumber, @discNumber, @year, @genre, @composer, @comment, @duration,
      @filePath, @fileName, @fileSize, @fileMtime, @format, @codec, @bitrate,
      @sampleRate, @bitDepth, @channels, @playable, @coverId, @metaProvenance
    )
  `);

  const stmtFindById = db.prepare(`${SELECT_FROM} WHERE tracks.id = ?`);
  // favorited_at 用 SQL 表达式 datetime('now')/NULL，不能走 bind（bind 会把 SQL 当字符串）。
  const stmtFavOn = db.prepare(`
    UPDATE tracks SET favorite = 1, favorited_at = datetime('now') WHERE id = ?
  `);
  const stmtFavOff = db.prepare(`
    UPDATE tracks SET favorite = 0, favorited_at = NULL WHERE id = ?
  `);
  const stmtIncrementPlay = db.prepare(`
    UPDATE tracks
    SET play_count = play_count + 1, last_played_at = datetime('now')
    WHERE id = ?
  `);
  const stmtUpdateFileIdentity = db.prepare(`
    UPDATE tracks SET file_path = ? WHERE id = ?
  `);
  const stmtUpdateAfterParse = (cols: string[]) =>
    db.prepare(`
      UPDATE tracks SET ${cols.map((c) => `${c} = @${c}`).join(', ')} WHERE id = @id
    `);

  // listSongs 的 SQL 由白名单列 + 方向拼接，按 (sortBy,order) 缓存 prepared。
  // V1.3 升格项：追加次级键 tracks.id ASC（方向固定，与主排序无关）保证全序确定，
  // 消除重复键下分页跨页重复/丢行（§3.7 分页稳定性）。
  const listStmtCache = new Map<string, Statement>();
  function listStatement(sortBy: SortKey, order: SortOrder) {
    const key = `${sortBy}:${order}`;
    let stmt = listStmtCache.get(key);
    if (!stmt) {
      const col = resolveSortColumn(sortBy);
      const dir = order === 'desc' ? 'DESC' : 'ASC';
      stmt = db.prepare(
        `${SELECT_FROM} ORDER BY ${col} ${dir}, tracks.id ASC LIMIT ? OFFSET ?`,
      );
      listStmtCache.set(key, stmt);
    }
    return stmt;
  }

  // 可变 arity 的 IN / 可选过滤用 prepared（better-sqlite3 编译开销低，按需 prepare）。
  function inPlaceholders(n: number): string {
    return new Array(Math.max(n, 1)).fill('?').join(', ');
  }

  // -------------------------------------------------------------------------
  // 方法实现
  // -------------------------------------------------------------------------

  function createMany(tracks: TrackInsert[]): void {
    if (tracks.length === 0) return;
    const insertTx = db.transaction((rows: TrackInsert[]) => {
      for (const t of rows) {
        stmtInsert.run({
          id: t.id,
          title: t.title,
          artistId: t.artistId,
          albumId: t.albumId,
          artistString: t.artistString ?? null,
          albumArtist: t.albumArtist,
          albumTitle: t.albumTitle,
          trackNumber: t.trackNumber ?? null,
          discNumber: t.discNumber ?? null,
          year: t.year ?? null,
          genre: t.genre ?? null,
          composer: t.composer ?? null,
          comment: t.comment ?? null,
          duration: t.duration ?? null,
          filePath: t.filePath,
          fileName: t.fileName,
          fileSize: t.fileSize,
          fileMtime: t.fileMtime,
          format: t.format,
          codec: t.codec ?? null,
          bitrate: t.bitrate ?? null,
          sampleRate: t.sampleRate ?? null,
          bitDepth: t.bitDepth ?? null,
          channels: t.channels ?? null,
          playable: t.playable ? 1 : 0,
          coverId: t.coverId ?? null,
          metaProvenance: t.metaProvenance ?? null,
        });
      }
    });
    insertTx(tracks);
  }

  function listSongs(params: ListSongsParams): TrackRow[] {
    // 防注入：resolveSortColumn 内部白名单校验。
    const order: SortOrder = params.order === 'desc' ? 'desc' : 'asc';
    const offset = params.offset ?? 0;
    const limit = params.limit ?? 50;
    const stmt = listStatement(params.sortBy, order);
    const rows = stmt.all(limit, offset) as RawTrackRow[];
    return rows.map(mapRow);
  }

  function findById(id: string): TrackRow | null {
    const row = stmtFindById.get(id) as RawTrackRow | undefined;
    return row ? mapRow(row) : null;
  }

  function updateAfterParse(id: string, parsed: TrackParseUpdate): void {
    // 固定白名单：仅 AFTER_PARSE_MAP 中声明的键可生成 SET 列；空对象 → 零改动。
    const sets: string[] = [];
    const bind: Record<string, unknown> = { id };
    for (const [key, col, conv] of AFTER_PARSE_MAP) {
      if (parsed[key] !== undefined) {
        sets.push(col);
        bind[col] = conv((parsed as Record<string, unknown>)[key]);
      }
    }
    if (sets.length === 0) return;
    stmtUpdateAfterParse(sets).run(bind);
  }

  function updateFileIdentity(id: string, identity: { filePath: string }): void {
    stmtUpdateFileIdentity.run(identity.filePath, id);
  }

  function setStatus(ids: string[], status: TrackStatus): void {
    if (!VALID_STATUSES.has(status)) {
      throw new Error(`trackRepo.setStatus: 非法 status "${status}"`);
    }
    if (ids.length === 0) return;
    // IN 列表按批拆分（每批 ≤ IN_BATCH）：正向 IN 语义可分批组合，多条 UPDATE 等价。
    const tx = db.transaction(() => {
      for (let i = 0; i < ids.length; i += IN_BATCH) {
        const chunk = ids.slice(i, i + IN_BATCH);
        const stmt = db.prepare(`
          UPDATE tracks SET status = ? WHERE id IN (${inPlaceholders(chunk.length)})
        `);
        stmt.run(status, ...chunk);
      }
    });
    tx();
  }

  function markMissing(exceptPathsLower: string[]): void {
    // 退化路径：空 except → 全部 available 变 missing（保留既有语义，不依赖临时表）。
    if (exceptPathsLower.length === 0) {
      const stmt = db.prepare(`
        UPDATE tracks SET status = 'missing' WHERE status = 'available'
      `);
      stmt.run();
      return;
    }
    // NOT IN 语义不可分批改写：若按 [500, 500, ...] 逐批执行 UPDATE，首批会把
    // 后续批仍在该批 except 集合内的路径提前误标 missing。故改用临时表——
    //   1) CREATE TEMP TABLE IF NOT EXISTS（跨调用复用同连接时需先 DELETE 清残留）
    //   2) 分批 INSERT OR IGNORE except 路径（PRIMARY KEY 去重，抗重复项）
    //   3) 单条 UPDATE ... NOT IN (SELECT path FROM <temp>) 完成标记
    //   4) DROP 回收临时表
    // 临时表生命周期严格限定在本事务内，避免污染连接状态。
    const tx = db.transaction(() => {
      db.prepare(`
        CREATE TEMP TABLE IF NOT EXISTS _wc_mark_missing_paths (path TEXT PRIMARY KEY)
      `).run();
      db.prepare(`DELETE FROM _wc_mark_missing_paths`).run();
      for (let i = 0; i < exceptPathsLower.length; i += IN_BATCH) {
        const chunk = exceptPathsLower.slice(i, i + IN_BATCH);
        const placeholders = chunk.map(() => '(?)').join(', ');
        db.prepare(
          `INSERT OR IGNORE INTO _wc_mark_missing_paths (path) VALUES ${placeholders}`,
        ).run(...chunk);
      }
      db.prepare(`
        UPDATE tracks
        SET status = 'missing'
        WHERE status = 'available'
          AND lower(file_path) NOT IN (SELECT path FROM _wc_mark_missing_paths)
      `).run();
      db.prepare(`DROP TABLE _wc_mark_missing_paths`).run();
    });
    tx();
  }

  function findByFileIdentity(
    fileName: string,
    size: number,
    mtime: number,
    opts?: FindByIdentityOpts,
  ): TrackRow[] {
    if (opts?.status !== undefined) {
      // 与 setStatus 一致的防御面：status 值经白名单守卫，避免注入非法过滤值。
      if (!VALID_STATUSES.has(opts.status)) {
        throw new Error(`trackRepo.findByFileIdentity: 非法 status "${opts.status}"`);
      }
      const stmt = db.prepare(`
        ${SELECT_FROM}
        WHERE tracks.file_name = ?
          AND tracks.file_size = ?
          AND tracks.file_mtime = ?
          AND tracks.status = ?
      `);
      const rows = stmt.all(fileName, size, mtime, opts.status) as RawTrackRow[];
      return rows.map(mapRow);
    }
    const stmt = db.prepare(`
      ${SELECT_FROM}
      WHERE tracks.file_name = ?
        AND tracks.file_size = ?
        AND tracks.file_mtime = ?
    `);
    const rows = stmt.all(fileName, size, mtime) as RawTrackRow[];
    return rows.map(mapRow);
  }

  function setFavorite(id: string, favorite: boolean): void {
    if (favorite) stmtFavOn.run(id);
    else stmtFavOff.run(id);
  }

  function incrementPlay(id: string): void {
    stmtIncrementPlay.run(id);
  }

  function listByIds(ids: string[]): TrackRow[] {
    if (ids.length === 0) return [];
    // IN 列表按批拆分（每批 ≤ IN_BATCH）：各批结果拼接返回，规避参数上限。
    const out: TrackRow[] = [];
    for (let i = 0; i < ids.length; i += IN_BATCH) {
      const chunk = ids.slice(i, i + IN_BATCH);
      const stmt = db.prepare(`
        ${SELECT_FROM} WHERE tracks.id IN (${inPlaceholders(chunk.length)})
      `);
      const rows = stmt.all(...chunk) as RawTrackRow[];
      out.push(...rows.map(mapRow));
    }
    return out;
  }

  return {
    createMany,
    listSongs,
    findById,
    updateAfterParse,
    updateFileIdentity,
    setStatus,
    markMissing,
    findByFileIdentity,
    setFavorite,
    incrementPlay,
    listByIds,
  };
}
