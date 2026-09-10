// T2.4 coverService 单测。
// 策略：伪 worker 注入（T2.6 接缝）——伪 worker 的 postMessage 直接驱动 cover.worker 导出的纯函数
// processCoverMessage（真实 sharp + 真实 fs 探测，不经 worker_threads），保证 folder 顺序/三档输出
// 的断言落在真实实现上；coversDir 用临时目录；db 用 :memory:；专辑行经 albumRepo 直接造数。
import { EventEmitter } from 'node:events';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import sharp from 'sharp';
import type { Database } from 'better-sqlite3';
import { openDatabase } from '../../../src/main/database/connection';
import { createAlbumRepo } from '../../../src/main/database/repositories/albumRepo';
import { createArtistRepo } from '../../../src/main/database/repositories/artistRepo';
import {
  createCoverService,
  wireCoverPipeline,
  type CoverServiceDeps,
  type CoverWorkerLike,
} from '../../../src/main/library/coverService';
import {
  processCoverMessage,
  type CoverWorkerInbound,
  type CoverWorkerOutbound,
} from '../../../src/main/library/cover.worker';
import type { CoverJob, ScanServiceDeps } from '../../../src/main/library/scanService';

// ---------------------------------------------------------------------------
// 伪 worker（T2.6 可测性接缝）：同协议 EventEmitter 形态
// ---------------------------------------------------------------------------

/** 真实逻辑伪 worker：processCoverMessage 驱动（真实 sharp + fs），回执 done/failed 消息。 */
class RealLogicWorker extends EventEmitter implements CoverWorkerLike {
  sent: CoverWorkerInbound[] = [];
  postMessage(msg: CoverWorkerInbound): void {
    this.sent.push(msg);
    void processCoverMessage(msg).then((out) => this.emit('message', out));
  }
}

/** 失败伪 worker：一律回 failed 回执（模拟 worker 内处理失败，不抛死 worker）。 */
class FailingWorker extends EventEmitter implements CoverWorkerLike {
  sent: CoverWorkerInbound[] = [];
  postMessage(msg: CoverWorkerInbound): void {
    this.sent.push(msg);
    this.emit('message', {
      type: 'failed',
      coverId: msg.coverId,
      reason: 'boom',
    } satisfies CoverWorkerOutbound);
  }
}

/** 崩溃伪 worker：postMessage 即触发 'error' 事件（模拟 worker 线程崩溃）。 */
class CrashingWorker extends EventEmitter implements CoverWorkerLike {
  sent: CoverWorkerInbound[] = [];
  postMessage(msg: CoverWorkerInbound): void {
    this.sent.push(msg);
    this.emit('error', new Error('worker crashed'));
  }
}

/** 先失败后真实：首个任务回 failed，其后驱动真实逻辑（首个成功者胜出语义验证）。 */
class FailOnceWorker extends EventEmitter implements CoverWorkerLike {
  sent: CoverWorkerInbound[] = [];
  private failedOnce = false;
  postMessage(msg: CoverWorkerInbound): void {
    this.sent.push(msg);
    if (!this.failedOnce) {
      this.failedOnce = true;
      this.emit('message', { type: 'failed', coverId: msg.coverId, reason: 'boom' } satisfies CoverWorkerOutbound);
      return;
    }
    void processCoverMessage(msg).then((out) => this.emit('message', out));
  }
}

// ---------------------------------------------------------------------------
// 造数与装配
// ---------------------------------------------------------------------------

const openDbs: Database[] = [];
const tempDirs: string[] = [];

function tempDir(prefix: string): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

async function makeImage(format: 'jpeg' | 'png', width = 100, height = 80): Promise<Uint8Array> {
  const buf = await sharp({
    create: { width, height, channels: 3, background: { r: 10, g: 20, b: 30 } },
  })
    [format]()
    .toBuffer();
  return new Uint8Array(buf);
}

interface Ctx {
  db: Database;
  coversDir: string;
  albumId: number;
  service: ReturnType<typeof createCoverService>;
  worker: RealLogicWorker;
  ready: string[];
}

function makeService(workerLike?: CoverWorkerLike, over: Partial<CoverServiceDeps> = {}): Ctx {
  const db = openDatabase(':memory:');
  openDbs.push(db);
  const coversDir = tempDir('wc-covers-');
  const artistId = createArtistRepo(db).upsertArtist('Artist A');
  const albumId = createAlbumRepo(db).upsertAlbum('Album X', artistId);
  const worker = workerLike ?? new RealLogicWorker();
  const ready: string[] = [];
  const service = createCoverService({
    db,
    coversDir,
    workerFactory: () => worker,
    onCoverReady: (p) => ready.push(p.coverId),
    ...over,
  });
  return { db, coversDir, albumId, service, worker: worker as RealLogicWorker, ready };
}

afterEach(() => {
  while (openDbs.length) openDbs.pop()?.close();
  // Windows delete-pending 竞态：sharp/fs 句柄刚关闭时 rmSync 可能 ENOTEMPTY，短重试消除偶发假失败
  for (const dir of tempDirs.splice(0).reverse()) {
    let lastErr: unknown;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        rmSync(dir, { recursive: true, force: true });
        lastErr = undefined;
        break;
      } catch (err) {
        lastErr = err;
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
      }
    }
    if (lastErr) throw lastErr;
  }
});

// ---------------------------------------------------------------------------
// 用例
// ---------------------------------------------------------------------------

describe('coverService', () => {
  it('① embedded 任务成功：三档文件存在 + cover_art 行 + albums.cover_id 联动 + onCoverReady', async () => {
    const ctx = makeService();
    const bytes = await makeImage('jpeg');

    ctx.service.enqueue({ albumId: ctx.albumId, source: 'embedded', bytes, mime: 'image/jpeg' });
    await ctx.service.flush(); // enqueue 立即返回（异步于扫描），flush 等待排空

    expect(ctx.ready).toHaveLength(1);
    const coverId = ctx.ready[0]!;

    // 三档输出：{coversDir}/{coverId}/{64,256,512}.jpg
    for (const size of [64, 256, 512]) {
      const file = path.join(ctx.coversDir, coverId, `${size}.jpg`);
      expect(existsSync(file), file).toBe(true);
    }

    // cover_art 行：预生成 id / 原图 metadata（width/height/mime 取 sharp metadata）
    const row = ctx.db
      .prepare('SELECT id, source, original_path, mime, width, height FROM cover_art')
      .get() as { id: string; source: string; original_path: string | null; mime: string; width: number; height: number };
    expect(row.id).toBe(coverId);
    expect(row.source).toBe('embedded');
    expect(row.original_path).toBeNull();
    expect(row.mime).toBe('image/jpeg');
    expect(row.width).toBe(100);
    expect(row.height).toBe(80);

    // albums.cover_id 联动
    const album = ctx.db.prepare('SELECT cover_id FROM albums WHERE id = ?').get(ctx.albumId) as {
      cover_id: string;
    };
    expect(album.cover_id).toBe(coverId);
  });

  it('② folder 任务按 §3.5e 顺序命中：cover.png 胜出 folder.jpg，original_path 落库', async () => {
    const ctx = makeService();
    const dir = tempDir('wc-album-');
    writeFileSync(path.join(dir, 'folder.jpg'), await makeImage('jpeg')); // 候选序列靠后
    writeFileSync(path.join(dir, 'cover.png'), await makeImage('png')); // 候选序列靠前 → 胜出

    ctx.service.enqueue({ albumId: ctx.albumId, source: 'folder', folderPath: dir });
    await ctx.service.flush();

    expect(ctx.ready).toHaveLength(1);
    const coverId = ctx.ready[0]!;
    const row = ctx.db
      .prepare('SELECT source, original_path, mime FROM cover_art WHERE id = ?')
      .get(coverId) as { source: string; original_path: string; mime: string };
    expect(row.source).toBe('folder');
    expect(row.original_path?.toLowerCase()).toBe(path.join(dir, 'cover.png').toLowerCase());
    expect(row.mime).toBe('image/png');
    for (const size of [64, 256, 512]) {
      expect(existsSync(path.join(ctx.coversDir, coverId, `${size}.jpg`))).toBe(true);
    }
  });

  it('③ 同专辑去重：首任务成功后第二任务直接丢弃（首个成功者胜出）', async () => {
    const ctx = makeService();
    const bytes = await makeImage('jpeg');

    ctx.service.enqueue({ albumId: ctx.albumId, source: 'embedded', bytes, mime: 'image/jpeg' });
    ctx.service.enqueue({
      albumId: ctx.albumId,
      source: 'embedded',
      bytes: await makeImage('jpeg', 40, 40),
    });
    await ctx.service.flush();

    // 仅首个任务进入 worker；落库与回执各一次；第二任务计去重丢弃
    expect(ctx.worker.sent).toHaveLength(1);
    expect(ctx.ready).toHaveLength(1);
    expect(ctx.service.droppedCount).toBe(1);
    expect(
      (ctx.db.prepare('SELECT COUNT(*) AS c FROM cover_art').get() as { c: number }).c,
    ).toBe(1);
  });

  it('④ 首任务失败 → 不落库；同 album 下一任务可成功（失败允许重试）', async () => {
    const ctx = makeService(new FailOnceWorker());
    const bytes = await makeImage('jpeg');

    ctx.service.enqueue({ albumId: ctx.albumId, source: 'embedded', bytes, mime: 'image/jpeg' });
    await ctx.service.flush();
    expect(ctx.ready).toHaveLength(0);
    expect(ctx.service.droppedCount).toBe(1); // 首任务失败归一 failed 计数
    expect(
      (ctx.db.prepare('SELECT COUNT(*) AS c FROM cover_art').get() as { c: number }).c,
    ).toBe(0);
    const albumAfterFail = ctx.db.prepare('SELECT cover_id FROM albums WHERE id = ?').get(ctx.albumId) as {
      cover_id: string | null;
    };
    expect(albumAfterFail.cover_id).toBeNull();

    ctx.service.enqueue({
      albumId: ctx.albumId,
      source: 'embedded',
      bytes: await makeImage('jpeg', 40, 40),
    });
    await ctx.service.flush();
    expect(ctx.worker.sent).toHaveLength(2); // 第二任务未被去重丢弃
    expect(ctx.ready).toHaveLength(1);
    const coverId = ctx.ready[0]!;
    expect(
      (ctx.db.prepare('SELECT COUNT(*) AS c FROM cover_art').get() as { c: number }).c,
    ).toBe(1);
    const album = ctx.db.prepare('SELECT cover_id FROM albums WHERE id = ?').get(ctx.albumId) as {
      cover_id: string | null;
    };
    expect(album.cover_id).toBe(coverId);
    for (const size of [64, 256, 512]) {
      expect(existsSync(path.join(ctx.coversDir, coverId, `${size}.jpg`))).toBe(true);
    }
  });

  it('⑤ worker error 后同一 service 内重建实例，下一任务成功落库', async () => {
    // factory 按序返回：首次 CrashingWorker（触发 'error'），ensureWorker 重建时交付 RealLogicWorker。
    // 留痕：原"独立双 service 恢复"用例已并入本用例——重建路径由同一 service 内驱动，更贴近
    // 生产语义（service 实例存活，仅 worker 实例失效重建），独立双 service 形态不再保留。
    const real = new RealLogicWorker();
    const workers = [new CrashingWorker(), real];
    const ctx = makeService(real, { workerFactory: () => workers.shift()! });

    ctx.service.enqueue({ albumId: ctx.albumId, source: 'embedded', bytes: await makeImage('jpeg') });
    await ctx.service.flush();
    expect(ctx.ready).toHaveLength(0);
    expect(real.sent).toHaveLength(0); // 崩溃实例未交付任务
    expect(
      (ctx.db.prepare('SELECT COUNT(*) AS c FROM cover_art').get() as { c: number }).c,
    ).toBe(0);
    expect(ctx.service.droppedCount).toBe(1); // 'error' 归一 failed 计数

    // 同一 service：下一任务触发 ensureWorker 重建 → factory 返回 RealLogicWorker，成功落库
    ctx.service.enqueue({
      albumId: ctx.albumId,
      source: 'embedded',
      bytes: await makeImage('jpeg', 40, 40),
    });
    await ctx.service.flush();
    expect(real.sent).toHaveLength(1);
    expect(ctx.ready).toHaveLength(1);
    const coverId = ctx.ready[0]!;
    expect(
      (ctx.db.prepare('SELECT COUNT(*) AS c FROM cover_art').get() as { c: number }).c,
    ).toBe(1);
    const album = ctx.db.prepare('SELECT cover_id FROM albums WHERE id = ?').get(ctx.albumId) as {
      cover_id: string | null;
    };
    expect(album.cover_id).toBe(coverId);
    for (const size of [64, 256, 512]) {
      expect(existsSync(path.join(ctx.coversDir, coverId, `${size}.jpg`))).toBe(true);
    }
  });

  it('⑥ wireCoverPipeline：ScanServiceDeps.onCoverJob 注入 coverService.enqueue（T3 接线形态预演）', async () => {
    const ctx = makeService();
    const deps: Pick<ScanServiceDeps, 'onCoverJob'> = {};
    wireCoverPipeline(deps, ctx.service);

    // scanService 阶段 E 按 track 粒度投递 → wire 后直达 coverService 队列
    deps.onCoverJob!({
      albumId: ctx.albumId,
      source: 'embedded',
      bytes: await makeImage('jpeg'),
    });
    await ctx.service.flush();

    expect(ctx.ready).toHaveLength(1);
    expect(
      (ctx.db.prepare('SELECT COUNT(*) AS c FROM cover_art').get() as { c: number }).c,
    ).toBe(1);
  });

  it('⑦ 同专辑混源：folder 先成功 → embedded 后到 → 替换重跑胜出（I-1 强制内嵌优先）', async () => {
    const ctx = makeService();
    const dir = tempDir('wc-album-');
    writeFileSync(path.join(dir, 'cover.png'), await makeImage('png'));

    // folder 先成功（cover_id 指向 A）
    ctx.service.enqueue({ albumId: ctx.albumId, source: 'folder', folderPath: dir });
    await ctx.service.flush();
    expect(ctx.ready).toHaveLength(1);
    const coverA = ctx.ready[0]!;
    expect(
      (ctx.db.prepare('SELECT cover_id FROM albums WHERE id = ?').get(ctx.albumId) as { cover_id: string }).cover_id,
    ).toBe(coverA);

    // embedded 后到 → 升级重跑覆盖
    const bytes = await makeImage('jpeg', 120, 90);
    ctx.service.enqueue({ albumId: ctx.albumId, source: 'embedded', bytes, mime: 'image/jpeg' });
    await ctx.service.flush();

    // onCoverReady 再次触发，指向新 coverId B（≠ A）
    expect(ctx.ready).toHaveLength(2);
    const coverB = ctx.ready[1]!;
    expect(coverB).not.toBe(coverA);

    // albums.cover_id 指向新 B
    expect(
      (ctx.db.prepare('SELECT cover_id FROM albums WHERE id = ?').get(ctx.albumId) as { cover_id: string }).cover_id,
    ).toBe(coverB);

    // 三档文件 B 存在
    for (const size of [64, 256, 512]) {
      expect(existsSync(path.join(ctx.coversDir, coverB, `${size}.jpg`))).toBe(true);
    }

    // 旧行保留（孤儿目录留痕、不删，缓存可重建）
    expect(
      (ctx.db.prepare('SELECT COUNT(*) AS c FROM cover_art').get() as { c: number }).c,
    ).toBe(2);

    // 升级重跑不计入 dropped
    expect(ctx.service.droppedCount).toBe(0);
  });

  it('⑧ 已 embedded 后 folder 到达 → 丢弃（I-1 强制内嵌优先）', async () => {
    const ctx = makeService();
    const bytes = await makeImage('jpeg');

    // embedded 先成功
    ctx.service.enqueue({ albumId: ctx.albumId, source: 'embedded', bytes, mime: 'image/jpeg' });
    await ctx.service.flush();
    expect(ctx.ready).toHaveLength(1);
    const coverId = ctx.ready[0]!;

    // folder 后到 → 丢弃
    const dir = tempDir('wc-album-');
    writeFileSync(path.join(dir, 'cover.png'), await makeImage('png'));
    ctx.service.enqueue({ albumId: ctx.albumId, source: 'folder', folderPath: dir });
    await ctx.service.flush();

    // droppedCount +1、cover_id 不变、仅一条 cover_art 行
    expect(ctx.service.droppedCount).toBe(1);
    expect(
      (ctx.db.prepare('SELECT cover_id FROM albums WHERE id = ?').get(ctx.albumId) as { cover_id: string }).cover_id,
    ).toBe(coverId);
    expect(ctx.ready).toHaveLength(1);
    expect(
      (ctx.db.prepare('SELECT COUNT(*) AS c FROM cover_art').get() as { c: number }).c,
    ).toBe(1);
  });

  it('⑨ resetAlbumStates：succeeded 后 reset → 同 album job 再次处理成功（rescanAll 刷新封面接缝）', async () => {
    const ctx = makeService();
    const bytes = await makeImage('jpeg');

    // 首任务成功（albumId 进入 succeeded）
    ctx.service.enqueue({ albumId: ctx.albumId, source: 'embedded', bytes, mime: 'image/jpeg' });
    await ctx.service.flush();
    expect(ctx.ready).toHaveLength(1);
    expect(ctx.service.droppedCount).toBe(0);
    expect(ctx.worker.sent).toHaveLength(1);

    // succeeded 后再次投递同 album → 默认被去重丢弃
    ctx.service.enqueue({
      albumId: ctx.albumId,
      source: 'embedded',
      bytes: await makeImage('jpeg', 40, 40),
    });
    await ctx.service.flush();
    expect(ctx.service.droppedCount).toBe(1); // 去重丢弃计数 +1
    expect(ctx.ready).toHaveLength(1); // 未再处理

    // resetAlbumStates：清空去重状态机；droppedCount 累计保留（观测口径不归零）
    ctx.service.resetAlbumStates();
    expect(ctx.service.droppedCount).toBe(1);

    // 再次投递同 album → 重新处理成功（封面刷新接缝）
    ctx.service.enqueue({
      albumId: ctx.albumId,
      source: 'embedded',
      bytes: await makeImage('jpeg', 80, 60),
    });
    await ctx.service.flush();
    expect(ctx.service.droppedCount).toBe(1); // 未新增丢弃
    expect(ctx.ready).toHaveLength(2); // 第二次成功处理
    expect(ctx.worker.sent).toHaveLength(2);
  });
});
