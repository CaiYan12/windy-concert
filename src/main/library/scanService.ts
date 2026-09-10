// T2.3 scanService —— §3.5a 五阶段扫描编排（本阶段最重任务）。
//   A stat：worker 遍历目录产出 {path,size,mtime,ext}
//   B 分类：主进程对账 DB 身份行 → unchanged 跳过 / changed 保留 id 重解析 / adopt 挪路径不重解析 / create 新 UUID
//           反向对账：DB 路径未出现在 stat 结果 → markMissing（不删记录）
//   C parse：worker 仅解析 changed+create，每 200 条一批回传
//   D 写库：每批一个事务；主艺人（策略 2）+ 专辑归组键(album+albumArtist) upsert；收尾 recountStats()
//   E 封面：onCoverJob 接缝投递（本任务只留接缝，队列与 folder 探测归 T2.4）
//
// 派发决定留痕：
//   - deps 显式注入工厂 createScanService(deps)：workerFactory 为 T2.6 可测性接缝——默认 =
//     electron-vite `?nodeWorker` 包装的真实 worker；测试一律注入同协议 EventEmitter 伪 worker。
//   - scan({mode}) 内部参数预留 'incremental'|'full'：本阶段 full 与 incremental 行为一致，
//     全量 rescanAll 的差异化语义归 T3（library:rescanAll 契约，计划 §3.6）。
//   - scan 进行中重复调用：返回进行中的同一 Promise（不抛错，留痕选择）。
//   - TrackInsert 写库复用 createMany([t])（未新增 insertOne）。
//   - V1.3 评审补齐（F2-1 前置）：worker ParsedTrack 已补 trackNumber/discNumber/year/genre/
//     composer/comment/codec 七字段，create/changed 写库透传（废止原「置 NULL」留痕）。
//   - onCoverJob 按 track 粒度投递：同专辑去重与 folder 候选探测归 T2.4；未注入则丢弃并计数（留痕）。
//   - onProgress 为 scan:progress 事件的进程内发射点，IPC webContents 接线在 T3（留痕）。
//   - src/main/index.ts 的启动接线（settings store 未建）推迟到 T3，本任务只暴露 startupScan()。
import { randomUUID } from 'node:crypto';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import type { Database } from 'better-sqlite3';
import type { ScanProgress } from '../../shared/types';
import { PLAYABLE } from './formats';
import type { ParsedTrack, StatFile, WorkerInbound, WorkerOutbound } from './scanner.worker';
import ScannerWorker from './scanner.worker?nodeWorker';
import { createAlbumRepo } from '../database/repositories/albumRepo';
import { createArtistRepo } from '../database/repositories/artistRepo';
import {
  createTrackRepo,
  type TrackIdentity,
  type TrackInsert,
} from '../database/repositories/trackRepo';

// ---------------------------------------------------------------------------
// 类型
// ---------------------------------------------------------------------------

/** scanService 依赖的 worker 最小协议面（node:worker_threads Worker 与测试伪 worker 的公共子集，T2.6 接缝）。 */
export interface ScanWorker {
  postMessage(msg: WorkerInbound): void;
  on(event: 'message', listener: (msg: WorkerOutbound) => void): unknown;
  on(event: 'error', listener: (err: Error) => void): unknown;
  on(event: 'exit', listener: (code: number) => void): unknown;
  off(event: 'message', listener: (msg: WorkerOutbound) => void): unknown;
  off(event: 'error', listener: (err: Error) => void): unknown;
  off(event: 'exit', listener: (code: number) => void): unknown;
  terminate?(): unknown;
}

/** 阶段 E 封面任务投递形态（§3.5e；同专辑去重归 T2.4 的 cover 队列）。 */
export interface CoverJob {
  albumId: number;
  source: 'embedded' | 'folder';
  bytes?: Uint8Array;
  folderPath?: string;
  mime?: string;
}

/** 扫描总结（scan.log 与 T3 IPC 返回共用）。 */
export interface ScanSummary {
  /** stat 阶段发现的文件总数。 */
  total: number;
  /** 实际解析并写库条数（create + changed）。 */
  parsed: number;
  /** worker 报告的跳过清单总长（stat 阶段 + parse 阶段）。 */
  skipped: number;
  /** adopt 成功条数。 */
  adopted: number;
  /** 本次被标记 missing 的条数。 */
  missingMarked: number;
  elapsedMs: number;
}

export type ScanMode = 'incremental' | 'full';

export interface ScanOptions {
  /** 预留：'full' 差异化语义归 T3 rescanAll，本阶段两种模式行为一致（留痕）。 */
  mode?: ScanMode;
}

export interface ScanServiceDeps {
  db: Database;
  /** 启用中的音乐目录（默认实现由调用方从 folderRepo.list() 过滤 enabled 提供）。 */
  getFolders: () => string[];
  /** T2.6 可测性接缝：测试注入 in-process 伪 worker；默认真实 worker。 */
  workerFactory?: () => ScanWorker;
  /** scan:progress 事件的进程内发射点（IPC 接线在 T3，留痕）。 */
  onProgress?: (p: ScanProgress) => void;
  /** 阶段 E 接缝：封面任务投递（T2.4 提供 cover 队列；未注入则丢弃并计数，留痕）。 */
  onCoverJob?: (job: CoverJob) => void;
  /** scan.log 目录；未注入则不写文件、仅返回 summary（T2.6 测试注入临时目录）。 */
  logDir?: string;
  /** elapsedMs 计时注入（默认 Date.now）。 */
  now?: () => number;
}

export interface ScanService {
  scan(options?: ScanOptions): Promise<ScanSummary>;
  /** 仅当 autoScanOnStartup 且存在启用目录时后台触发增量扫描（不阻塞窗口显示；index.ts 接线归 T3）。 */
  startupScan(autoScanOnStartup: boolean): void;
}

type StatMsg = Extract<WorkerOutbound, { type: 'stat' }>;
type BatchMsg = Extract<WorkerOutbound, { type: 'batch' }>;

/** 主艺人回退（策略 2：artist_string 优先，回退未知艺术家）。 */
const FALLBACK_ARTIST = '未知艺术家';

// ---------------------------------------------------------------------------
// 工厂
// ---------------------------------------------------------------------------

export function createScanService(deps: ScanServiceDeps): ScanService {
  const trackRepo = createTrackRepo(deps.db);
  const artistRepo = createArtistRepo(deps.db);
  const albumRepo = createAlbumRepo(deps.db);
  const now = deps.now ?? Date.now;

  // 默认 worker：electron-vite ?nodeWorker 在 build 时编译为 new Worker(...)（T2.6 前测试不触发此路径）。
  const workerFactory = deps.workerFactory ?? ((): ScanWorker => ScannerWorker({}));

  let inFlight: Promise<ScanSummary> | null = null;

  // -------------------------------------------------------------------------
  // worker 消息辅助
  // -------------------------------------------------------------------------

  type WorkerHooks = {
    onMessage: (m: WorkerOutbound) => void;
    onError: (err: Error) => void;
    onExit: (code: number) => void;
  };

  function attachWorker(worker: ScanWorker, hooks: WorkerHooks): () => void {
    worker.on('message', hooks.onMessage);
    worker.on('error', hooks.onError);
    worker.on('exit', hooks.onExit);
    return () => {
      worker.off('message', hooks.onMessage);
      worker.off('error', hooks.onError);
      worker.off('exit', hooks.onExit);
    };
  }

  function workerErrorMessage(stage: string, message: string): Error {
    return new Error(`扫描 worker 错误（stage=${stage}）: ${message}`);
  }

  // -------------------------------------------------------------------------
  // 阶段 D：单条解析产出写库（在每批事务内调用）
  // -------------------------------------------------------------------------

  function applyParsed(
    parsedTrack: ParsedTrack,
    statEntry: StatFile,
    changedId: string | undefined,
  ): { albumId: number } {
    // 主艺人（策略 2）与专辑归组（键 = album + albumArtist，albums 表 UNIQUE(title, artist_id)）。
    const artistId = artistRepo.upsertArtist(parsedTrack.artistString ?? FALLBACK_ARTIST);
    const albumArtistId = artistRepo.upsertArtist(parsedTrack.albumArtist);
    const albumId = albumRepo.upsertAlbum(parsedTrack.album, albumArtistId);

    const playable = PLAYABLE.has(parsedTrack.format); // F1-3：格式白名单判定（worker 已小写归一）

    if (changedId !== undefined) {
      // changed：路径不变、内容变化 → 保留原 id 全量重写元数据与身份三元组。
      trackRepo.updateAfterParse(changedId, {
        artistId,
        albumId,
        title: parsedTrack.title,
        artistString: parsedTrack.artistString,
        albumArtist: parsedTrack.albumArtist,
        albumTitle: parsedTrack.album,
        duration: parsedTrack.duration,
        bitrate: parsedTrack.bitrate,
        sampleRate: parsedTrack.sampleRate,
        bitDepth: parsedTrack.bitDepth,
        channels: parsedTrack.channels,
        trackNumber: parsedTrack.trackNumber,
        discNumber: parsedTrack.discNumber,
        year: parsedTrack.year,
        genre: parsedTrack.genre,
        composer: parsedTrack.composer,
        comment: parsedTrack.comment,
        codec: parsedTrack.codec,
        playable,
      });
      trackRepo.updateFileIdentity(changedId, {
        fileSize: statEntry.size,
        fileMtime: statEntry.mtime,
      });
    } else {
      // create：新 UUID（策略 1）。V1.3 评审补齐 F2-1 全字段：7 键透传（原置 NULL 留痕已废止）。
      const insert: TrackInsert = {
        id: randomUUID(),
        title: parsedTrack.title,
        artistId,
        albumId,
        artistString: parsedTrack.artistString,
        albumArtist: parsedTrack.albumArtist,
        albumTitle: parsedTrack.album,
        duration: parsedTrack.duration,
        trackNumber: parsedTrack.trackNumber,
        discNumber: parsedTrack.discNumber,
        year: parsedTrack.year,
        genre: parsedTrack.genre,
        composer: parsedTrack.composer,
        comment: parsedTrack.comment,
        codec: parsedTrack.codec,
        filePath: statEntry.path,
        fileName: path.basename(statEntry.path),
        fileSize: statEntry.size,
        fileMtime: statEntry.mtime,
        format: parsedTrack.format,
        bitrate: parsedTrack.bitrate,
        sampleRate: parsedTrack.sampleRate,
        bitDepth: parsedTrack.bitDepth,
        channels: parsedTrack.channels,
        playable,
      };
      trackRepo.createMany([insert]);
    }

    return { albumId };
  }

  // -------------------------------------------------------------------------
  // scan 主体
  // -------------------------------------------------------------------------

  async function runScan(options: ScanOptions): Promise<ScanSummary> {
    const mode: ScanMode = options.mode ?? 'incremental';
    const t0 = now();
    let coversDropped = 0;

    const emitProgress = (phase: ScanProgress['phase'], done: number, total: number): void => {
      deps.onProgress?.({ phase, done, total, elapsedMs: now() - t0 });
    };

    const worker = workerFactory();
    try {
      // ---------------- 阶段 A：stat ----------------
      emitProgress('stat', 0, 0);
      let detach: () => void = () => {};
      const statResult: StatMsg = await new Promise<StatMsg>((resolve, reject) => {
        detach = attachWorker(worker, {
          onMessage: (m) => {
            if (m.type === 'stat') {
              detach();
              resolve(m);
            } else if (m.type === 'error') {
              detach();
              reject(workerErrorMessage(m.stage, m.message));
            }
            // batch/done 不会出现在 stat 阶段：忽略
          },
          onError: (err) => {
            detach();
            reject(err);
          },
          onExit: (code) => {
            if (code !== 0) {
              detach();
              reject(new Error(`扫描 worker 异常退出（code=${code}）`));
            }
          },
        });
        worker.postMessage({ type: 'stat', dirs: deps.getFolders() });
      });
      emitProgress('stat', statResult.files.length, statResult.files.length);

      // ---------------- 阶段 B：分类对账（比较键统一 path.toLowerCase()，Windows 大小写不敏感）----------------
      const statByKey = new Map<string, StatFile>();
      for (const f of statResult.files) statByKey.set(f.path.toLowerCase(), f);

      const identities: TrackIdentity[] = trackRepo.listIdentityAll();
      const dbByPath = new Map<string, TrackIdentity>();
      for (const row of identities) {
        const k = row.filePath.toLowerCase();
        if (!dbByPath.has(k)) dbByPath.set(k, row); // 重复路径防御：首行生效（file_path UNIQUE 约束下不应出现）
      }

      const changedById = new Map<string, string>();
      const toParse: StatFile[] = [];
      // C1（评审裁定）：missing 行文件回到原路径的复活集合（unchanged/changed 分支收集）。
      const reviveIds: string[] = [];
      let adopted = 0;

      for (const f of statResult.files) {
        const k = f.path.toLowerCase();
        const row = dbByPath.get(k);
        if (!row) {
          // adopt 匹配：(fileName,size,mtime) 唯一命中一条 missing → 仅挪路径 + 复活；
          // 0 或 ≥2 命中均按 create 处理（歧义宁可新建）。
          const hits = trackRepo.findByFileIdentity(path.basename(f.path), f.size, f.mtime, {
            status: 'missing',
          });
          if (hits.length === 1) {
            // M1（评审裁定）：挪路径与复活 status 两写原子化——半状态残留与 C1 叠加会永久 missing。
            deps.db.transaction(() => {
              trackRepo.updateFileIdentity(hits[0].id, { filePath: f.path });
              trackRepo.setStatus([hits[0].id], 'available');
            })();
            adopted += 1;
          } else {
            toParse.push(f);
          }
        } else if (row.fileSize !== f.size || row.fileMtime !== f.mtime) {
          // changed：三元组有变 → 重新解析、保留原 id；
          // C1：若该行此前被标 missing（文件移除后回到原路径且内容有变），需一并复活。
          changedById.set(k, row.id);
          toParse.push(f);
          if (row.status === 'missing') reviveIds.push(row.id);
        } else if (row.status === 'missing') {
          // C1（评审裁定）：unchanged 分支（路径在且 size+mtime 均等）→ 跳过解析，但 §3.5a
          // 原文未提 status 复活——按 T2.6 F1-6「文件恢复 → available」与 CONTEXT.md 曲目
          // 状态定义补齐：missing 行文件回到原路径 → status 复活为 available，否则 status
          // 永远停留 missing（破 F1-6、T2.6 场景与 M5 拔盘重连场景）。
          reviveIds.push(row.id);
        }
        // 其余 = unchanged 且非 missing（路径在、size+mtime 均等）→ 跳过
      }

      // 反向对账：DB 中路径未出现在 stat 结果 → missing（不删记录）。
      // adopt 的行在标记前已把 file_path 改写为 stat 内路径，天然被 except 排除。
      trackRepo.markMissing([...statByKey.keys()]);
      // C1 复活统一落库：置于 markMissing 之后——markMissing 仅对 available 行操作，
      // 与复活调用互不干扰；复活行路径必在 stat 结果内，亦不会被误标。
      if (reviveIds.length > 0) trackRepo.setStatus(reviveIds, 'available');
      const missingMarked = identities.filter(
        (r) => r.status === 'available' && !statByKey.has(r.filePath.toLowerCase()),
      ).length;

      // ---------------- 阶段 C + D：parse 与逐批事务写库 ----------------
      let parsed = 0;
      let parseSkipped: string[] = [];
      const toParseTotal = toParse.length;

      if (toParseTotal > 0) {
        const applyBatch = deps.db.transaction((batch: ParsedTrack[]) => {
          for (const parsedTrack of batch) {
            const k = parsedTrack.path.toLowerCase();
            const statEntry = statByKey.get(k);
            if (!statEntry) continue; // 理论不可达（worker 回传路径必来自 parse 清单）；防御跳过
            const { albumId } = applyParsed(parsedTrack, statEntry, changedById.get(k));

            // 阶段 E 接缝：封面任务按 track 粒度投递（同专辑去重归 T2.4，留痕）。
            if (deps.onCoverJob) {
              if (parsedTrack.picture) {
                deps.onCoverJob({
                  albumId,
                  source: 'embedded',
                  bytes: parsedTrack.picture.bytes,
                  mime: parsedTrack.picture.mime ?? undefined,
                });
              } else {
                deps.onCoverJob({
                  albumId,
                  source: 'folder',
                  folderPath: path.dirname(statEntry.path),
                });
              }
            } else {
              coversDropped += 1;
            }
          }
        });

        await new Promise<void>((resolve, reject) => {
          let detachParse: () => void = () => {};
          detachParse = attachWorker(worker, {
            onMessage: (m) => {
              if (m.type === 'batch') {
                const batchMsg = m as BatchMsg;
                // I1（评审裁定）：批事务同步异常必须转 reject——真实 worker 下 listener 抛错
                // 会变成主进程 uncaughtException，runScan Promise 永不 settle、inFlight 卡死。
                try {
                  applyBatch(batchMsg.parsed);
                } catch (err) {
                  detachParse();
                  reject(err instanceof Error ? err : new Error(String(err)));
                  return;
                }
                parsed += batchMsg.parsed.length;
                emitProgress('parse', parsed, toParseTotal);
              } else if (m.type === 'done') {
                parseSkipped = m.skipped;
                detachParse();
                resolve();
              } else if (m.type === 'error') {
                detachParse();
                reject(workerErrorMessage(m.stage, m.message));
              }
            },
            onError: (err) => {
              detachParse();
              reject(err);
            },
            onExit: (code) => {
              if (code !== 0) {
                detachParse();
                reject(new Error(`扫描 worker 异常退出（code=${code}）`));
              }
            },
          });
          worker.postMessage({ type: 'parse', files: toParse });
        });
      }

      // ---------------- 收尾：重算 counts + done 进度 + 日志 ----------------
      albumRepo.recountStats(); // §3.5a 阶段 D 锚点：扫描完成后一条事务重算 album/artist counts

      const total = statResult.files.length;
      emitProgress('done', total, total);

      const summary: ScanSummary = {
        total,
        parsed,
        skipped: statResult.skipped.length + parseSkipped.length,
        adopted,
        missingMarked,
        elapsedMs: now() - t0,
      };

      if (deps.logDir) {
        const line = `${JSON.stringify({ at: new Date().toISOString(), mode, ...summary, coversDropped })}\n`;
        await fsp.mkdir(deps.logDir, { recursive: true });
        await fsp.appendFile(path.join(deps.logDir, 'scan.log'), line, 'utf8');
      }

      return summary;
    } finally {
      // worker 用完即收（每次 scan 独立 spawn）。
      if (worker.terminate) void worker.terminate();
    }
  }

  // -------------------------------------------------------------------------
  // 对外方法
  // -------------------------------------------------------------------------

  function scan(options: ScanOptions = {}): Promise<ScanSummary> {
    // 并发调用：返回进行中的同一 Promise（留痕选择；上层 T3 决定是否需要排队/拒绝）。
    if (inFlight) return inFlight;
    const promise = runScan(options).finally(() => {
      inFlight = null;
    });
    inFlight = promise;
    return promise;
  }

  function startupScan(autoScanOnStartup: boolean): void {
    if (!autoScanOnStartup) return;
    if (deps.getFolders().length === 0) return;
    // 后台触发、不阻塞窗口显示（T3 完成 index.ts 接线；失败仅记录，UX 决策归 T3，留痕）。
    scan().catch((err) => {
      console.error('[scanService] 启动扫描失败:', err);
    });
  }

  return { scan, startupScan };
}
