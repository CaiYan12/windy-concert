// T2.6 扫描单测（Phase 2 核心验收）——真集成九场景（F1-2 ~ F2-4）。
// 形态：真实 scanService + 真实 fs + 真实 music-metadata + 真实 sharp + :memory: db。
//   - RealLogicWorkerAdapter：EventEmitter 伪 worker（同 ScanWorker 协议），postMessage 收到
//     {type:'stat'} 调 scanner.worker 导出的纯函数 walkFiles 回放真实 stat 消息；收到 {type:'parse'}
//     调 parseFiles（消息出口注入 emit 回放，batch/done 形态与真 worker 完全一致）。
//   - 封面走 deps.onCoverJob → wireCoverPipeline → coverService（内嵌 RealLogicCoverWorker 直驱
//     cover.worker 的 processCoverMessage：真 sharp + 真 fs）→ 临时 coversDir 三档文件。
//   - 造数：fixture 是已提交资产，一律 copyFile 复制进 mkdtemp 临时目录后操作，绝不改动原件；
//     移动/删除/截断全部发生在临时副本上。
// 既有 scanService.test.ts（12 用例，内存造数）与 coverService.test.ts 不动；本文件为补充集成层。
import { EventEmitter } from 'node:events';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  utimesSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import type { Database } from 'better-sqlite3';
import { openDatabase } from '../../../src/main/database/connection';
import {
  createCoverService,
  wireCoverPipeline,
  type CoverWorkerLike,
} from '../../../src/main/library/coverService';
import { processCoverMessage, type CoverWorkerInbound } from '../../../src/main/library/cover.worker';
import {
  createScanService,
  type ScanServiceDeps,
  type ScanWorker,
} from '../../../src/main/library/scanService';
import {
  parseFiles,
  walkFiles,
  type StatFile,
  type WorkerInbound,
  type WorkerOutbound,
} from '../../../src/main/library/scanner.worker';
import { PLAYABLE, SCANNABLE } from '../../../src/main/library/formats';

// ---------------------------------------------------------------------------
// 伪 worker（真逻辑适配器，T2.6 接缝）
// ---------------------------------------------------------------------------

/** 扫描侧：直驱 scanner.worker 纯函数（真 fs walk + 真 music-metadata parse），协议与真 worker 一致。 */
class RealLogicWorkerAdapter extends EventEmitter implements ScanWorker {
  postMessage(msg: WorkerInbound): void {
    if (msg.type === 'stat') {
      void walkFiles(msg.dirs).then(({ files, skipped }) => {
        this.emit('message', { type: 'stat', files, skipped } satisfies WorkerOutbound);
      });
    } else if (msg.type === 'parse') {
      void parseFiles(msg.files, (m) => this.emit('message', m));
    }
  }
}

/** 封面侧：直驱 cover.worker 纯函数 processCoverMessage（真 sharp + 真 fs 探测）。 */
class RealLogicCoverWorker extends EventEmitter implements CoverWorkerLike {
  postMessage(msg: CoverWorkerInbound): void {
    void processCoverMessage(msg).then((out) => this.emit('message', out));
  }
}

// ---------------------------------------------------------------------------
// 装配与造数
// ---------------------------------------------------------------------------

const FIXTURES = fileURLToPath(new URL('../../fixtures/music', import.meta.url));
const FIXTURE_FILES = {
  mp3Full: '01-夜曲.mp3',
  flacFull: '02-夜曲.flac',
  m4aFull: '03-晴天.m4a',
  flacUntagged: '04-untagged.flac',
  broken: '08-broken.mp3',
  wma: 'album2/06-Track06.wma',
  mp3Partial: 'album2/07-Track07.mp3',
  folderCover: 'album2/cover.jpg',
} as const;

const openDbs: Database[] = [];
const tempDirs: string[] = [];

function tempDir(prefix: string): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function copyFixture(relSrc: string, destPath: string): void {
  copyFileSync(path.join(FIXTURES, relSrc), destPath);
}

interface Ctx {
  db: Database;
  musicDir: string;
  coversDir: string;
  service: ReturnType<typeof createScanService>;
  coverService: ReturnType<typeof createCoverService>;
}

function makeCtx(over: Partial<ScanServiceDeps> = {}): Ctx {
  const db = openDatabase(':memory:');
  openDbs.push(db);
  const musicDir = tempDir('wc-scan-music-');
  const coversDir = tempDir('wc-covers-');
  const worker = new RealLogicWorkerAdapter();
  const coverService = createCoverService({
    db,
    coversDir,
    workerFactory: () => new RealLogicCoverWorker(),
  });
  const deps: ScanServiceDeps = {
    db,
    getFolders: () => [musicDir],
    workerFactory: () => worker,
    ...over,
  };
  // 封面经阶段 E 接缝投递（对齐 T3 生产接线形态）
  wireCoverPipeline(deps, coverService);
  const service = createScanService(deps);
  return { db, musicDir, coversDir, service, coverService };
}

function queryAll(db: Database, sql: string): Array<Record<string, unknown>> {
  return db.prepare(sql).all() as Array<Record<string, unknown>>;
}

function tracksOf(db: Database): Array<Record<string, unknown>> {
  return queryAll(db, 'SELECT * FROM tracks ORDER BY file_path');
}

/** 三档封面文件存在性断言。 */
function expectCoverFiles(coversDir: string, coverId: string): void {
  for (const size of [64, 256, 512]) {
    const file = path.join(coversDir, coverId, `${size}.jpg`);
    expect(existsSync(file), file).toBe(true);
  }
}

afterEach(() => {
  while (openDbs.length) openDbs.pop()?.close();
  while (tempDirs.length) rmSync(tempDirs.pop()!, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// F1-2 深层嵌套目录
// ---------------------------------------------------------------------------

describe('F1-2 五层嵌套目录全部入库', () => {
  it('每层 1 首（01 类 ×3 + 07 类 ×2）→ 5 条 tracks、album/artist 归组正确', async () => {
    const ctx = makeCtx();
    // 造 5 层嵌套：l1/l2/l3 放全标签 01（十一月的萧邦·周杰伦），l4/l5 放 07（测试专辑二·测试艺人）
    const l1 = path.join(ctx.musicDir, 'l1');
    const l2 = path.join(l1, 'l2');
    const l3 = path.join(l2, 'l3');
    const l4 = path.join(l3, 'l4');
    const l5 = path.join(l4, 'l5');
    mkdirSync(l5, { recursive: true });
    copyFixture(FIXTURE_FILES.mp3Full, path.join(l1, 'a.mp3'));
    copyFixture(FIXTURE_FILES.mp3Full, path.join(l2, 'b.mp3'));
    copyFixture(FIXTURE_FILES.mp3Full, path.join(l3, 'c.mp3'));
    copyFixture(FIXTURE_FILES.mp3Partial, path.join(l4, 'd.mp3'));
    copyFixture(FIXTURE_FILES.mp3Partial, path.join(l5, 'e.mp3'));

    const summary = await ctx.service.scan();

    expect(summary.total).toBe(5);
    expect(summary.parsed).toBe(5);
    expect(summary.skipped).toBe(0);
    expect(summary.missingMarked).toBe(0);

    const tracks = tracksOf(ctx.db);
    expect(tracks).toHaveLength(5);
    expect(tracks.every((t) => t.status === 'available')).toBe(true);

    // 归组：album + albumArtist 键 → 两个专辑，track_count 经 recountStats 重算
    const albums = queryAll(
      ctx.db,
      `SELECT a.title, ar.name AS artist_name, a.track_count
       FROM albums a JOIN artists ar ON ar.id = a.artist_id ORDER BY a.title`,
    );
    expect(albums).toEqual([
      { title: '十一月的萧邦', artist_name: '周杰伦', track_count: 3 },
      { title: '测试专辑二', artist_name: '测试艺人', track_count: 2 },
    ]);
    const artists = queryAll(ctx.db, 'SELECT name FROM artists ORDER BY name');
    expect(artists.map((r) => r.name)).toEqual(['周杰伦', '测试艺人']);
  });
});

// ---------------------------------------------------------------------------
// F1-4 二次扫描零解析
// ---------------------------------------------------------------------------

describe('F1-4 二次扫描解析计数器=0', () => {
  it('同目录二扫 → 全 unchanged：parsed/adopted/missingMarked/skipped 全 0，库不增长', async () => {
    const ctx = makeCtx();
    copyFixture(FIXTURE_FILES.mp3Full, path.join(ctx.musicDir, '01-夜曲.mp3'));
    copyFixture(FIXTURE_FILES.wma, path.join(ctx.musicDir, '06-Track06.wma'));

    const first = await ctx.service.scan();
    expect(first.parsed).toBe(2);
    const artistsAfterFirst = queryAll(ctx.db, 'SELECT id FROM artists').length;

    const second = await ctx.service.scan();
    expect(second.total).toBe(2);
    expect(second.parsed).toBe(0);
    expect(second.adopted).toBe(0);
    expect(second.missingMarked).toBe(0);
    expect(second.skipped).toBe(0);

    expect(queryAll(ctx.db, 'SELECT * FROM tracks')).toHaveLength(2);
    expect(queryAll(ctx.db, 'SELECT id FROM artists').length).toBe(artistsAfterFirst);
  });
});

// ---------------------------------------------------------------------------
// 策略 1 移动/改名身份保持
// ---------------------------------------------------------------------------

describe('策略1 移动目录 id 不变 / 改名失配新建', () => {
  it('正向：文件移入另一子目录（文件名不变）→ adopt 命中，id 不变且 file_path 更新', async () => {
    const ctx = makeCtx();
    const orig = path.join(ctx.musicDir, '01-夜曲.mp3');
    copyFixture(FIXTURE_FILES.mp3Full, orig);
    await ctx.service.scan();
    const id0 = (tracksOf(ctx.db)[0] as { id: string }).id;

    // 移出扫描目录 → 二扫 → missing（adopt 前置：行须先为 missing）
    const holding = tempDir('wc-holding-');
    renameSync(orig, path.join(holding, '01-夜曲.mp3'));
    const missingSummary = await ctx.service.scan();
    expect(missingSummary.missingMarked).toBe(1);
    expect((tracksOf(ctx.db)[0] as { status: string }).status).toBe('missing');

    // 移入另一子目录（rename 保 mtime，三元组不变）→ 三扫 adopt：id 不变、路径更新、不重解析
    const sub = path.join(ctx.musicDir, 'sub');
    mkdirSync(sub);
    renameSync(path.join(holding, '01-夜曲.mp3'), path.join(sub, '01-夜曲.mp3'));
    const adoptSummary = await ctx.service.scan();
    expect(adoptSummary.adopted).toBe(1);
    expect(adoptSummary.parsed).toBe(0);

    const rows = tracksOf(ctx.db);
    expect(rows).toHaveLength(1);
    const row = rows[0] as { id: string; file_path: string; status: string };
    expect(row.id).toBe(id0);
    expect(row.file_path).toBe(path.join(sub, '01-夜曲.mp3'));
    expect(row.status).toBe('available');
  });

  it('反向：文件改名（文件名变）→ 三元组失配 → 新 UUID + 旧行 missing（策略边界）', async () => {
    const ctx = makeCtx();
    const orig = path.join(ctx.musicDir, '01-夜曲.mp3');
    copyFixture(FIXTURE_FILES.mp3Full, orig);
    await ctx.service.scan();
    const id0 = (tracksOf(ctx.db)[0] as { id: string }).id;

    renameSync(orig, path.join(ctx.musicDir, 'renamed.mp3'));
    const summary = await ctx.service.scan();

    expect(summary.parsed).toBe(1);
    expect(summary.adopted).toBe(0);

    const rows = queryAll(ctx.db, 'SELECT * FROM tracks ORDER BY status');
    expect(rows).toHaveLength(2);
    const missingRow = rows.find((r) => r.status === 'missing') as { id: string; file_path: string };
    const freshRow = rows.find((r) => r.status === 'available') as { id: string; file_path: string };
    expect(missingRow.id).toBe(id0); // 旧行保留、标 missing
    expect(missingRow.file_path).toBe(orig);
    expect(freshRow.id).not.toBe(id0); // 新 UUID
    expect(freshRow.file_path).toBe(path.join(ctx.musicDir, 'renamed.mp3'));
  });

  // V1.5 用户裁定（markMissing 前置）：单次移动（A→B）后一次重扫即保 UUID，
  // 无需旧实现要求的「移出扫描 → missing → 移回」三步流。
  it('单次移动：文件移入另一子目录一次重扫 → adopt 保 id（missingMarked 前置验证）', async () => {
    const ctx = makeCtx();
    const orig = path.join(ctx.musicDir, '01-夜曲.mp3');
    copyFixture(FIXTURE_FILES.mp3Full, orig);
    await ctx.service.scan();
    const id0 = (tracksOf(ctx.db)[0] as { id: string }).id;

    // 一次重扫内完成移动：rename 保 mtime，(fileName,size,mtime) 三元组不变
    const sub = path.join(ctx.musicDir, 'sub');
    mkdirSync(sub);
    renameSync(orig, path.join(sub, '01-夜曲.mp3'));
    const summary = await ctx.service.scan();

    // 前置 markMissing 先把缺席的旧行标 missing（计数语义保持），随后 adopt 命中复活
    expect(summary.missingMarked).toBe(1);
    expect(summary.adopted).toBe(1);
    expect(summary.parsed).toBe(0);

    const rows = tracksOf(ctx.db);
    expect(rows).toHaveLength(1);
    const row = rows[0] as { id: string; file_path: string; status: string };
    expect(row.id).toBe(id0); // 策略 1：UUID 不换
    expect(row.file_path).toBe(path.join(sub, '01-夜曲.mp3'));
    expect(row.status).toBe('available');
  });

  // 复制场景无振荡：新旧路径同时存在 → 旧行路径仍在 stat 内不被标 missing，
  // 新路径 adopt 过滤（status='missing'）0 命中 → create 新 UUID，旧行不动。
  // 副本经 utimesSync 对齐原 mtime：(fileName,size,mtime) 三元组完全一致，
  // 若旧行被误标 missing 则 adopt 会挤占——本用例即守卫该振荡风险。
  it('复制不挤占：同文件复制到另一目录一次重扫 → 新 UUID（create）且原行 available 不动', async () => {
    const ctx = makeCtx();
    const orig = path.join(ctx.musicDir, '01-夜曲.mp3');
    copyFixture(FIXTURE_FILES.mp3Full, orig);
    await ctx.service.scan();
    const id0 = (tracksOf(ctx.db)[0] as { id: string }).id;

    const copyDir = path.join(ctx.musicDir, 'copy');
    mkdirSync(copyDir);
    const copyPath = path.join(copyDir, '01-夜曲.mp3');
    copyFixture(FIXTURE_FILES.mp3Full, copyPath);
    const st = statSync(orig);
    utimesSync(copyPath, st.atime, st.mtime); // 对齐 mtime → 身份三元组与原行完全一致
    const summary = await ctx.service.scan();

    expect(summary.adopted).toBe(0);
    expect(summary.parsed).toBe(1);
    expect(summary.missingMarked).toBe(0); // 原件留存 → 无缺席行

    const rows = tracksOf(ctx.db);
    expect(rows).toHaveLength(2);
    const origRow = rows.find((r) => r.file_path === orig) as {
      id: string;
      status: string;
    };
    const copyRow = rows.find((r) => r.file_path !== orig) as {
      id: string;
      status: string;
    };
    expect(origRow.id).toBe(id0);
    expect(origRow.status).toBe('available'); // 无振荡
    expect(copyRow.id).not.toBe(id0); // create 新 UUID
    expect(copyRow.status).toBe('available');
  });
});

// ---------------------------------------------------------------------------
// F1-6 missing 与复活
// ---------------------------------------------------------------------------

describe('F1-6 删除→missing，恢复→available', () => {
  it('删除文件重扫标 missing；重新复制同内容恢复 → id 不变回到 available', async () => {
    const ctx = makeCtx();
    const target = path.join(ctx.musicDir, '01-夜曲.mp3');
    copyFixture(FIXTURE_FILES.mp3Full, target);
    await ctx.service.scan();
    const id0 = (tracksOf(ctx.db)[0] as { id: string }).id;

    // 删除 → 二扫 → missing（不删记录）
    unlinkSync(target);
    const missingSummary = await ctx.service.scan();
    expect(missingSummary.missingMarked).toBe(1);
    let row = tracksOf(ctx.db)[0] as { id: string; status: string };
    expect(row.id).toBe(id0);
    expect(row.status).toBe('missing');

    // 恢复：重新复制同内容文件（mtime 必然变化）→ 重扫。
    // mtime 变 → changed 分支重解析复活；若 mtime 碰巧相等 → unchanged 分支复活；
    // 两种路径终态一致：available + id 不变（如实断言 parsed ∈ {0,1}）。
    copyFixture(FIXTURE_FILES.mp3Full, target);
    const reviveSummary = await ctx.service.scan();
    expect([0, 1]).toContain(reviveSummary.parsed);
    expect(reviveSummary.missingMarked).toBe(0);

    row = tracksOf(ctx.db)[0] as { id: string; status: string };
    expect(row.id).toBe(id0);
    expect(row.status).toBe('available');
  });
});

// ---------------------------------------------------------------------------
// F1-7 损坏与被占用容错
// ---------------------------------------------------------------------------

describe('F1-7 损坏/占用文件不中断扫描', () => {
  it('a) ID3-only 损坏 mp3：扫描不中断、不入库、skipped 计 1', async () => {
    const ctx = makeCtx();
    copyFixture(FIXTURE_FILES.broken, path.join(ctx.musicDir, '08-broken.mp3'));

    const summary = await ctx.service.scan();

    expect(summary.total).toBe(1);
    expect(summary.parsed).toBe(0);
    expect(summary.skipped).toBe(1);
    expect(tracksOf(ctx.db)).toHaveLength(0);
  });

  it('b) 目录冒充音频文件：真实链路不中断不入库；parseFiles 纯函数层以 EISDIR 等效复现「stat 成功但 parseFile 抛错」跳过路径', async () => {
    // 真实链路：目录在 walk 阶段被 isDirectory 分支收进遍历队列，永不进入 stat/parse 清单——
    // 与任务设想（stat 成功 → parseFile 抛 EISDIR）的差异如实留痕：等效失败路径在纯函数层验证。
    const ctx = makeCtx();
    copyFixture(FIXTURE_FILES.mp3Full, path.join(ctx.musicDir, 'ok.mp3'));
    mkdirSync(path.join(ctx.musicDir, 'occupied.mp3')); // 目录冒充音频文件

    const summary = await ctx.service.scan();
    expect(summary.total).toBe(1); // 仅 ok.mp3；目录不入 stat 清单
    expect(summary.parsed).toBe(1);
    expect(summary.skipped).toBe(0);
    expect(tracksOf(ctx.db)).toHaveLength(1);

    // 纯函数层：StatFile 指向真实存在的目录 → stat 语义成立但 parseFile 抛 EISDIR →
    // batch/done 照常回传、该路径落入 skipped（占用失败不击穿解析循环）。
    const occupied = path.join(ctx.musicDir, 'occupied.mp3');
    const st = statSync(occupied); // stat 成功（目录）
    const entry: StatFile = { path: occupied, size: st.size, mtime: st.mtimeMs, ext: 'mp3' };
    const messages: WorkerOutbound[] = [];
    await parseFiles([entry], (m) => messages.push(m));
    expect(messages.map((m) => m.type)).toEqual(['batch', 'done']);
    const batch = messages[0] as Extract<WorkerOutbound, { type: 'batch' }>;
    expect(batch.parsed).toHaveLength(0);
    expect(batch.skipped).toEqual([occupied]);
    const done = messages[1] as Extract<WorkerOutbound, { type: 'done' }>;
    expect(done.total).toBe(0);
    expect(done.skipped).toEqual([occupied]);
  });

  // c) 真独占句柄：Windows 下 Node/libuv 打开文件默认带 FILE_SHARE_READ|WRITE|DELETE，
  //    不依赖原生插件无法造出阻止后续 fs.open 的独占句柄——如实报告，未实现。
});

// ---------------------------------------------------------------------------
// F1-3 WMA 入库不可播
// ---------------------------------------------------------------------------

describe('F1-3 WMA 入库 playable=0', () => {
  it('06-Track06.wma → 入库、playable=0、status=available（SCANNABLE∖PLAYABLE 语义）', async () => {
    // 格式集合语义 sanity：wma 可扫描但不可播
    expect(SCANNABLE.has('wma')).toBe(true);
    expect(PLAYABLE.has('wma')).toBe(false);

    const ctx = makeCtx();
    copyFixture(FIXTURE_FILES.wma, path.join(ctx.musicDir, '06-Track06.wma'));

    const summary = await ctx.service.scan();
    expect(summary.parsed).toBe(1);

    const row = tracksOf(ctx.db)[0] as {
      format: string;
      playable: number;
      status: string;
      title: string;
      album_title: string;
    };
    expect(row.format).toBe('wma');
    expect(row.playable).toBe(0);
    expect(row.status).toBe('available');
    expect(row.title).toBe('Track06');
    expect(row.album_title).toBe('测试专辑二');
  });
});

// ---------------------------------------------------------------------------
// F2-1 三格式全字段
// ---------------------------------------------------------------------------

describe('F2-1 三格式 fixture 全字段断言', () => {
  it('01/02/03 全字段入库 + meta_provenance 全 embedded + 封面三档真实生成', async () => {
    const ctx = makeCtx();
    copyFixture(FIXTURE_FILES.mp3Full, path.join(ctx.musicDir, '01-夜曲.mp3'));
    copyFixture(FIXTURE_FILES.flacFull, path.join(ctx.musicDir, '02-夜曲.flac'));
    copyFixture(FIXTURE_FILES.m4aFull, path.join(ctx.musicDir, '03-晴天.m4a'));

    const summary = await ctx.service.scan();
    expect(summary.parsed).toBe(3);
    await ctx.coverService.flush(); // 封面队列排空（异步于扫描主流程）

    const byFormat = new Map(
      tracksOf(ctx.db).map((r) => [r.format as string, r as Record<string, unknown>]),
    );
    expect(byFormat.size).toBe(3);

    const ALL_EMBEDDED =
      '{"title":"embedded","artist":"embedded","album":"embedded","albumArtist":"embedded","cover":"embedded"}';

    // mp3（01-夜曲）：96kbps / 44100 / 无位深 / ≈3s / 全标签
    const mp3 = byFormat.get('mp3')!;
    expect(mp3).toMatchObject({
      title: '夜曲',
      artist_string: '周杰伦',
      album_artist: '周杰伦',
      album_title: '十一月的萧邦',
      track_number: 1,
      disc_number: 1,
      year: 2005,
      genre: 'Pop',
      composer: '周杰伦',
      sample_rate: 44100,
      bit_depth: null,
      bitrate: 96, // format.bitrate 96000 / 1000
      format: 'mp3',
      playable: 1,
      status: 'available',
      meta_provenance: ALL_EMBEDDED,
    });
    expect(mp3.duration as number).toBeGreaterThan(2.8);
    expect(mp3.duration as number).toBeLessThan(3.2);

    // flac（02-夜曲）：位深 16 / 44100 / ≈3s
    const flac = byFormat.get('flac')!;
    expect(flac).toMatchObject({
      title: '夜曲',
      artist_string: '周杰伦',
      album_artist: '周杰伦',
      album_title: '十一月的萧邦',
      track_number: 1,
      disc_number: 1,
      year: 2005,
      genre: 'Pop',
      composer: '周杰伦',
      sample_rate: 44100,
      bit_depth: 16,
      playable: 1,
      status: 'available',
      meta_provenance: ALL_EMBEDDED,
    });
    // fixture 为静音合成音源：flac 极高压缩 → format.bitrate 4861 bps → 落库 4.86 kbps
    expect(flac.bitrate as number).toBeCloseTo(4.861, 1);
    expect(flac.duration as number).toBeGreaterThan(2.8);
    expect(flac.duration as number).toBeLessThan(3.2);

    // m4a（03-晴天）：位深 16 / track 3 / 2003
    const m4a = byFormat.get('m4a')!;
    expect(m4a).toMatchObject({
      title: '晴天',
      artist_string: '周杰伦',
      album_artist: '周杰伦',
      album_title: '叶惠美',
      track_number: 3,
      disc_number: 1,
      year: 2003,
      genre: 'Pop',
      composer: '周杰伦',
      sample_rate: 44100,
      bit_depth: 16,
      playable: 1,
      status: 'available',
      meta_provenance: ALL_EMBEDDED,
    });
    expect(m4a.bitrate as number).toBeCloseTo(2.12, 1); // 2119 bps → 2.12 kbps
    expect(m4a.duration as number).toBeGreaterThan(2.8);
    expect(m4a.duration as number).toBeLessThan(3.2);

    // 封面：01/02 同专辑（十一月的萧邦）去重后 + 03（叶惠美）→ 2 个专辑封面全部真实生成
    const albums = queryAll(
      ctx.db,
      'SELECT title, cover_id FROM albums WHERE cover_id IS NOT NULL ORDER BY title',
    ) as Array<{ title: string; cover_id: string }>;
    expect(albums.map((a) => a.title)).toEqual(['十一月的萧邦', '叶惠美']);
    expect(
      queryAll(ctx.db, 'SELECT COUNT(*) AS c FROM cover_art')[0]!.c,
    ).toBe(2);
    for (const album of albums) expectCoverFiles(ctx.coversDir, album.cover_id);
    const coverRows = queryAll(ctx.db, 'SELECT mime FROM cover_art');
    expect(coverRows.every((r) => r.mime === 'image/jpeg')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// F2-3 无标签回退
// ---------------------------------------------------------------------------

describe('F2-3 无标签文件回退', () => {
  it('04-untagged.flac → title=文件名去扩展名、artist_string=null、album=未知专辑', async () => {
    const ctx = makeCtx();
    copyFixture(FIXTURE_FILES.flacUntagged, path.join(ctx.musicDir, '04-untagged.flac'));

    const summary = await ctx.service.scan();
    expect(summary.parsed).toBe(1);

    const row = tracksOf(ctx.db)[0] as {
      title: string;
      artist_string: string | null;
      album_title: string;
      album_artist: string;
      meta_provenance: string;
    };
    expect(row.title).toBe('04-untagged'); // 文件名去扩展名
    expect(row.artist_string).toBeNull(); // F2-3：原样保留 null
    expect(row.album_title).toBe('未知专辑');
    expect(row.album_artist).toBe('未知艺术家'); // 主艺人/专辑艺人回退（策略 2）
    expect(row.meta_provenance).toBe(
      '{"title":"filename","artist":"default","album":"default","albumArtist":"default","cover":"folder"}',
    );
  });
});

// ---------------------------------------------------------------------------
// F2-4 folder 封面
// ---------------------------------------------------------------------------

describe('F2-4 仅 cover.jpg 目录获得 folder 来源封面', () => {
  it('album2（06+07+cover.jpg）→ albums.cover_id 非空 + original_path 指向 cover.jpg + 三档文件真实存在', async () => {
    const ctx = makeCtx();
    const album2 = path.join(ctx.musicDir, 'album2');
    mkdirSync(album2);
    copyFixture(FIXTURE_FILES.wma, path.join(album2, '06-Track06.wma'));
    copyFixture(FIXTURE_FILES.mp3Partial, path.join(album2, '07-Track07.mp3'));
    copyFixture(FIXTURE_FILES.folderCover, path.join(album2, 'cover.jpg'));

    const summary = await ctx.service.scan();
    expect(summary.parsed).toBe(2);
    await ctx.coverService.flush();

    // 两曲目归入同一专辑（归组键 album + albumArtist）
    const tracks = tracksOf(ctx.db);
    expect(tracks).toHaveLength(2);
    expect(tracks.every((t) => t.album_title === '测试专辑二')).toBe(true);

    // 专辑获得 folder 来源封面
    const albumRow = ctx.db
      .prepare('SELECT id, cover_id, track_count FROM albums WHERE title = ?')
      .get('测试专辑二') as { id: number; cover_id: string; track_count: number };
    expect(albumRow.track_count).toBe(2);
    expect(albumRow.cover_id).not.toBeNull();

    // cover_art：folder 来源 + original_path 指向 album2/cover.jpg
    const coverArt = ctx.db
      .prepare('SELECT id, source, original_path FROM cover_art WHERE id = ?')
      .get(albumRow.cover_id) as { id: string; source: string; original_path: string };
    expect(coverArt.source).toBe('folder');
    expect(coverArt.original_path).toBe(path.join(album2, 'cover.jpg'));

    // 三档文件经真 processCoverMessage（真 sharp）生成
    expectCoverFiles(ctx.coversDir, albumRow.cover_id);
  });
});
