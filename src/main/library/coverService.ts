// T2.4 coverService —— §3.5e 封面队列（异步于扫描主流程）。
//   enqueue(job)：scanService 阶段 E 接缝的消费者；立即返回，不阻塞 scan（扫描 done 不等待封面完成）。
//   去重状态机（F2-4 同专辑复用 + I-1 来源优先级 embedded>folder）：内存
//     Map<albumId, {state:'pending'|'succeeded', source?:'embedded'|'folder'}>——
//     succeeded 附已生效 source：folder 已胜出 + embedded 后到 → 强制内嵌优先、升级重跑覆盖（用户裁定）；
//     embedded 已胜出 + folder 后到 → 直接丢弃；failed/未尝试 → 排队处理（失败允许下一 job 再试）。
//   串行队列（留痕：简单为先，受限并发留给后续优化）。
//   成功路径：预生成 coverId → worker 写三档文件 → 成功回执后 coverRepo 落库 + setAlbumCover +
//     onCoverReady（covers:ready 的进程内发射点，IPC 接线归 T3）。
//   失败路径：该 albumId 标 failed（状态保持 pending 可重试），不落库；worker 'error' 事件与
//     异常同样只标 failed，不击穿 service（worker 实例失效，下一任务重建）。
//   观测：droppedCount 只读计数（去重丢弃 + 失败归一 failed），供 T3 汇总 scan.log 的 coversDropped。
//
// 接线决定留痕（不破坏既有 9 用例的最小方案）：不改 scanService.ts / index.ts——本文件提供
// wireCoverPipeline(deps, coverService)，T3 组装时对 ScanServiceDeps 注入 onCoverJob = cover.enqueue；
// 类型仅 import 自 scanService（type-only，无运行时环）。
import { randomUUID } from 'node:crypto';
import type { Database } from 'better-sqlite3';
import type { CoversReady } from '../../shared/types';
import { createCoverRepo } from '../database/repositories/coverRepo';
import type { CoverJob, ScanServiceDeps } from './scanService';
import type { CoverProcessJob, CoverWorkerInbound, CoverWorkerOutbound } from './cover.worker';
import CoverWorker from './cover.worker?nodeWorker';

// ---------------------------------------------------------------------------
// 类型
// ---------------------------------------------------------------------------

/** coverService 依赖的 worker 最小协议面（node:worker_threads Worker 与测试伪 worker 的公共子集，T2.6 接缝）。 */
export interface CoverWorkerLike {
  postMessage(msg: CoverWorkerInbound): void;
  on(event: 'message', listener: (msg: CoverWorkerOutbound) => void): unknown;
  on(event: 'error', listener: (err: Error) => void): unknown;
  off(event: 'message', listener: (msg: CoverWorkerOutbound) => void): unknown;
  off(event: 'error', listener: (err: Error) => void): unknown;
  terminate?(): unknown;
}

export interface CoverServiceDeps {
  db: Database;
  /** 三档输出根目录 userData/covers（由调用方注入；worker 内再落 {coverId}/{64,256,512}.jpg）。 */
  coversDir: string;
  /** T2.6 可测性接缝：测试注入 in-process 伪 worker；默认真实 worker（?nodeWorker）。 */
  workerFactory?: () => CoverWorkerLike;
  /** covers:ready 事件的进程内发射点（IPC 接线归 T3，留痕）。 */
  onCoverReady?: (p: CoversReady) => void;
}

export interface CoverService {
  /** 阶段 E 接缝消费入口：立即返回，不阻塞扫描主流程。 */
  enqueue(job: CoverJob): void;
  /** 测试辅助（留痕）：等待队列排空且当前任务落库完成；生产路径不依赖。 */
  flush(): Promise<void>;
  /** 只读观测计数：封面被丢弃而未落库的次数 = 去重丢弃 + 失败归一 failed（合计口径，留痕）。 */
  readonly droppedCount: number;
  /** rescanAll 全量重扫前调用：清空 albumId 去重状态机以允许封面刷新；
   *  droppedCount 累计不归零（drop 计数是观测口径，仅重置去重状态）。 */
  resetAlbumStates(): void;
}

/** worker 成功回执的归一形态。 */
type DoneResult = {
  ok: true;
  width: number | null;
  height: number | null;
  mime: string | null;
  originalPath: string | null;
};
type WorkerResult = DoneResult | { ok: false };

// ---------------------------------------------------------------------------
// 工厂
// ---------------------------------------------------------------------------

export function createCoverService(deps: CoverServiceDeps): CoverService {
  const coverRepo = createCoverRepo(deps.db);
  // 默认 worker：electron-vite ?nodeWorker 在 build 时编译为 new Worker(...)（T2.6 前测试注入伪 worker）。
  const workerFactory = deps.workerFactory ?? ((): CoverWorkerLike => CoverWorker({}));

  // 去重状态机（I-1 来源优先级 embedded>folder）：'pending' = 尝试中或曾失败（可继续排队重试）；
  //   'succeeded' 附带已生效 source——folder 已成功后若 embedded 到达，强制升级重跑（覆盖）；
  //   embedded 已成功后 folder 到达则纯丢弃（用户裁定强制内嵌优先）。
  type AlbumStatus =
    | { state: 'pending' }
    | { state: 'succeeded'; source: 'embedded' | 'folder' };
  const albumState = new Map<number, AlbumStatus>();
  const queue: CoverJob[] = [];
  const pending = new Map<string, (r: WorkerResult) => void>(); // coverId → 回执解析
  const drainWaiters: Array<() => void> = [];
  let inFlight = false;
  let worker: CoverWorkerLike | null = null;

  // 观测计数（coversDropped 观测断层修复）：两类"未落库即丢失"分开累计、合计暴露。
  // 口径留痕：dedupDropped = 去重丢弃（enqueue 时已 succeeded + pump 排空时跳过 succeeded）；
  // failedNormalized = 顶部 entry 失败归一 failed（worker failed 回执 / 'error' 事件归一）。
  let dedupDropped = 0;
  let failedNormalized = 0;

  // -------------------------------------------------------------------------
  // worker 管理
  // -------------------------------------------------------------------------

  function ensureWorker(): CoverWorkerLike {
    if (worker) return worker;
    const w = workerFactory();
    w.on('message', (msg: CoverWorkerOutbound) => {
      const resolve = pending.get(msg.coverId);
      if (!resolve) return;
      pending.delete(msg.coverId);
      if (msg.type === 'done') {
        resolve({
          ok: true,
          width: msg.width,
          height: msg.height,
          mime: msg.mime,
          originalPath: msg.originalPath,
        });
      } else {
        resolve({ ok: false });
      }
    });
    w.on('error', () => {
      // worker 崩溃：所有挂起任务标 failed（该 albumId 待同专辑下一 job 重试），不击穿 service；
      // 实例失效即弃，下一任务重建。
      for (const resolve of pending.values()) resolve({ ok: false });
      pending.clear();
      worker = null;
      if (w.terminate) void w.terminate();
    });
    worker = w;
    return w;
  }

  // -------------------------------------------------------------------------
  // 串行队列
  // -------------------------------------------------------------------------

  function notifyDrained(): void {
    if (queue.length === 0) {
      for (const w of drainWaiters.splice(0)) w();
    }
  }

  // 来源优先级判定（I-1）：返回 'drop'=纯丢弃（计入 dropped）/ 'upgrade'=folder→embedded 升级重跑
  // （不计入 dropped，重置为 pending 后重跑）/ 'enqueue'=正常入队运行。
  function dedupDecision(job: CoverJob): 'drop' | 'upgrade' | 'enqueue' {
    const cur = albumState.get(job.albumId);
    if (cur?.state !== 'succeeded') return 'enqueue';
    if (cur.source === 'embedded' || job.source === 'folder') return 'drop';
    return 'upgrade'; // folder 已胜出 + embedded 后到 → 强制内嵌优先，升级重跑
  }

  function pump(): void {
    if (inFlight) return;
    while (queue.length > 0) {
      const job = queue.shift() as CoverJob;
      const decision = dedupDecision(job);
      if (decision === 'drop') {
        dedupDropped++; // 纯丢弃：同专辑已胜出者更高优先级或同源
        continue;
      }
      if (decision === 'upgrade') {
        // 升级重跑：不计入 dropped；重置为 pending 后队首优先重跑（成功后覆盖 cover_id 与三档文件）
        albumState.set(job.albumId, { state: 'pending' });
        queue.unshift(job);
        continue;
      }
      inFlight = true;
      void runJob(job).finally(() => {
        inFlight = false;
        notifyDrained();
        pump();
      });
      return;
    }
    notifyDrained();
  }

  async function runJob(job: CoverJob): Promise<void> {
    const coverId = randomUUID(); // 预生成：封面目录名先于落库确定（coverRepo 扩签配合，留痕）
    try {
      const w = ensureWorker();
      const result = await new Promise<WorkerResult>((resolve) => {
        pending.set(coverId, resolve);
        const workerJob: CoverProcessJob =
          job.source === 'embedded'
            ? { source: 'embedded', bytes: job.bytes as Uint8Array, mime: job.mime }
            : { source: 'folder', folderPath: job.folderPath as string };
        w.postMessage({ type: 'process', coverId, coversDir: deps.coversDir, job: workerJob });
      });
      if (!result.ok) {
        // 失败路径：不落库；状态保持 pending，允许同 album 下一 job 再试（首个成功者胜出语义）。
        failedNormalized++; // 失败归一 failed 计数（worker failed 回执 / 'error' 归一）
        return;
      }
      coverRepo.insertCover({
        id: coverId,
        source: job.source,
        originalPath:
          job.source === 'folder' ? (result.originalPath ?? job.folderPath ?? null) : null,
        mime: result.mime,
        width: result.width,
        height: result.height,
      });
      coverRepo.setAlbumCover(job.albumId, coverId);
      albumState.set(job.albumId, { state: 'succeeded', source: job.source });
      deps.onCoverReady?.({ coverId });
    } catch {
      // 落库异常等（worker 'error' 事件在 ensureWorker 内已归一为 failed 回执）：
      // 该 albumId 标 failed（保持可重试），不击穿 service。
      failedNormalized++; // M-3：catch 分支与 error 归一口径（失败归一 failed 计数）
      pending.delete(coverId);
    }
  }

  // -------------------------------------------------------------------------
  // 对外方法
  // -------------------------------------------------------------------------

  function enqueue(job: CoverJob): void {
    const decision = dedupDecision(job);
    if (decision === 'drop') {
      dedupDropped++; // 已成功且更高优先级/同源：直接丢弃
      return;
    }
    if (decision === 'upgrade') {
      // 升级重跑（folder→embedded）：不计入 dropped；重置为 pending 后队首优先重跑
      albumState.set(job.albumId, { state: 'pending' });
      queue.unshift(job);
      pump();
      return;
    }
    albumState.set(job.albumId, { state: 'pending' });
    queue.push(job);
    pump();
  }

  function flush(): Promise<void> {
    if (!inFlight && queue.length === 0) return Promise.resolve();
    return new Promise<void>((resolve) => drainWaiters.push(resolve));
  }

  function resetAlbumStates(): void {
    // 仅重置去重状态机（albumId → 状态），使后续同 albumId 的封面 job 不再被 succeeded 丢弃、
    // 全量重扫可刷新封面（rescanAll 全量语义，Phase 3 前置）。
    // droppedCount（dedupDropped + failedNormalized）累计保留——drop 计数为观测口径，不随重置归零。
    albumState.clear();
  }

  return {
    enqueue,
    flush,
    resetAlbumStates,
    get droppedCount() {
      return dedupDropped + failedNormalized;
    },
  };
}

// ---------------------------------------------------------------------------
// scanService 接线辅助（T3 index.ts 组装时调用；本任务不改 scanService.ts / index.ts，留痕）
// ---------------------------------------------------------------------------

export function wireCoverPipeline(deps: Pick<ScanServiceDeps, 'onCoverJob'>, cover: CoverService): void {
  deps.onCoverJob = (job) => cover.enqueue(job);
}
// T3 组装留痕（coversDropped 观测口径）：scan.log 汇总 coversDropped 时应汇合两个来源——
//   scanService.coversDropped（未注入 onCoverJob 时的扫描侧丢弃计数）
//   + coverService.droppedCount（封面队列侧：去重丢弃 + 失败归一 failed）。
// 分开列示还是合计为单一 coversDropped 字段，由 T3 决定口径。
