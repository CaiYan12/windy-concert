// T2.3 scanService 单测（基础用例；全面九场景归 T2.6）。
// 策略：in-process 伪 worker（同协议 EventEmitter 形态，按需回放 stat/parse 消息）
// + :memory: db + 临时 logDir；造数直接内存构造 ParsedTrack，不依赖真实 fixtures 文件解析。
import { EventEmitter } from 'node:events';
import { mkdtempSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { Database } from 'better-sqlite3';
import { openDatabase } from '../../../src/main/database/connection';
import { createAlbumRepo } from '../../../src/main/database/repositories/albumRepo';
import { createArtistRepo } from '../../../src/main/database/repositories/artistRepo';
import { createTrackRepo } from '../../../src/main/database/repositories/trackRepo';
import {
  createScanService,
  type CoverJob,
  type ScanProgress,
  type ScanServiceDeps,
  type ScanWorker,
} from '../../../src/main/library/scanService';
import type {
  ParsedTrack,
  StatFile,
  WorkerInbound,
  WorkerOutbound,
} from '../../../src/main/library/scanner.worker';

// ---------------------------------------------------------------------------
// 伪 worker（T2.6 可测性接缝）：同协议 EventEmitter 形态
// ---------------------------------------------------------------------------

class FakeWorker extends EventEmitter implements ScanWorker {
  sent: WorkerInbound[] = [];
  responder: (msg: WorkerInbound) => void = () => {};

  postMessage(msg: WorkerInbound): void {
    this.sent.push(msg);
    this.responder(msg);
  }
}

// ---------------------------------------------------------------------------
// 造数与装配
// ---------------------------------------------------------------------------

function statFile(p: string, size = 100, mtime = 1000): StatFile {
  return { path: p, size, mtime, ext: path.extname(p).slice(1).toLowerCase() };
}

function parsedTrack(p: string, over: Partial<ParsedTrack> = {}): ParsedTrack {
  return {
    path: p,
    title: over.title ?? path.basename(p, path.extname(p)),
    artistString: 'Artist A',
    albumArtist: 'Artist A',
    album: 'Album X',
    format: path.extname(p).slice(1).toLowerCase(),
    bitrate: 320,
    sampleRate: 44100,
    bitDepth: null,
    duration: 180,
    channels: 2,
    picture: null,
    tags: { title: true, artist: true, album: true, albumArtist: true },
    ...over,
  };
}

interface Ctx {
  db: Database;
  worker: FakeWorker;
  progress: ScanProgress[];
  coverJobs: CoverJob[];
  service: ReturnType<typeof createScanService>;
  trackRepo: ReturnType<typeof createTrackRepo>;
  artistRepo: ReturnType<typeof createArtistRepo>;
  albumRepo: ReturnType<typeof createAlbumRepo>;
}

const openDbs: Database[] = [];

function makeService(over: Partial<ScanServiceDeps> = {}): Ctx {
  const db = openDatabase(':memory:');
  openDbs.push(db);
  const worker = new FakeWorker();
  const progress: ScanProgress[] = [];
  const coverJobs: CoverJob[] = [];
  const service = createScanService({
    db,
    getFolders: () => ['D:/music'],
    workerFactory: () => worker,
    onProgress: (p) => progress.push(p),
    onCoverJob: (j) => coverJobs.push(j),
    ...over,
  });
  return {
    db,
    worker,
    progress,
    coverJobs,
    service,
    trackRepo: createTrackRepo(db),
    artistRepo: createArtistRepo(db),
    albumRepo: createAlbumRepo(db),
  };
}

afterEach(() => {
  while (openDbs.length) openDbs.pop()?.close();
});

/** 标准三文件场景：a1.mp3 / a2.mp3（Album X · Artist A）+ b1.ape（Album Y · Artist B）。 */
function standardResponder(ctx: Ctx): (msg: WorkerInbound) => void {
  return (msg) => {
    if (msg.type === 'stat') {
      ctx.worker.emit('message', {
        type: 'stat',
        files: [statFile('D:/music/a1.mp3'), statFile('D:/music/a2.mp3'), statFile('D:/music/b1.ape')],
        skipped: [],
      } satisfies WorkerOutbound);
    } else if (msg.type === 'parse') {
      ctx.worker.emit('message', {
        type: 'batch',
        parsed: [
          parsedTrack('D:/music/a1.mp3', {
            title: 'Song 1',
            picture: { bytes: new Uint8Array([1, 2, 3]), mime: 'image/jpeg', type: 'front' },
          }),
          parsedTrack('D:/music/a2.mp3', { title: 'Song 2' }),
          parsedTrack('D:/music/b1.ape', {
            title: 'Song 3',
            artistString: 'Artist B feat. C',
            albumArtist: 'Artist B',
            album: 'Album Y',
          }),
        ],
        done: 3,
        skipped: [],
      } satisfies WorkerOutbound);
      ctx.worker.emit('message', { type: 'done', total: 3, skipped: [] } satisfies WorkerOutbound);
    }
  };
}

// ---------------------------------------------------------------------------
// 用例
// ---------------------------------------------------------------------------

describe('scanService', () => {
  it('① 全新目录 3 条 create 全链：artists/albums/tracks 与归组正确、playable 按扩展名', async () => {
    const ctx = makeService();
    ctx.worker.responder = standardResponder(ctx);

    const summary = await ctx.service.scan();
    expect(summary).toEqual({
      total: 3,
      parsed: 3,
      skipped: 0,
      adopted: 0,
      missingMarked: 0,
      elapsedMs: expect.any(Number),
    });

    // artists：主艺人（策略 2：artistString）与专辑艺人各自 upsert
    const artists = (ctx.db.prepare('SELECT name FROM artists ORDER BY name').all() as Array<{ name: string }>).map(
      (r) => r.name,
    );
    expect(artists).toEqual(['Artist A', 'Artist B', 'Artist B feat. C']);

    // albums：归组键 = album + albumArtist；recountStats 已重算 track_count
    const albums = ctx.albumRepo.listAlbums();
    expect(albums.map((a) => [a.title, a.artistName, a.trackCount])).toEqual([
      ['Album X', 'Artist A', 2],
      ['Album Y', 'Artist B', 1],
    ]);

    // tracks：playable 按扩展名（F1-3：ape 不可播）；artist_string 原样保留
    const rows = ctx.db
      .prepare('SELECT title, format, playable, artist_string, status FROM tracks ORDER BY title')
      .all() as Array<{ title: string; format: string; playable: number; artist_string: string; status: string }>;
    expect(rows).toHaveLength(3);
    const b1 = rows.find((r) => r.title === 'Song 3')!;
    expect(b1.format).toBe('ape');
    expect(b1.playable).toBe(0);
    expect(b1.artist_string).toBe('Artist B feat. C');
    expect(b1.status).toBe('available');
    expect(rows.find((r) => r.title === 'Song 1')!.playable).toBe(1);

    // 封面投递（阶段 E 接缝）：1 embedded + 2 folder（track 粒度，去重归 T2.4）
    expect(ctx.coverJobs.map((j) => j.source)).toEqual(['embedded', 'folder', 'folder']);
    const albumX = albums.find((a) => a.title === 'Album X')!;
    expect(ctx.coverJobs[0]).toMatchObject({ albumId: albumX.id, source: 'embedded', mime: 'image/jpeg' });
    expect(ctx.coverJobs[1]).toMatchObject({ source: 'folder', folderPath: 'D:/music' });

    // 进度：stat 开局 → parse（done=累计写入, total=待解析）→ done 收尾
    expect(ctx.progress[0].phase).toBe('stat');
    expect(ctx.progress.at(-1)!.phase).toBe('done');
    const parseP = ctx.progress.find((p) => p.phase === 'parse')!;
    expect(parseP).toMatchObject({ done: 3, total: 3 });
    expect(typeof parseP.elapsedMs).toBe('number');
  });

  it('② unchanged 二扫：parse 计数=0，不重复写库', async () => {
    const ctx = makeService();
    ctx.worker.responder = standardResponder(ctx);

    await ctx.service.scan();
    const second = await ctx.service.scan();

    expect(second).toEqual({
      total: 3,
      parsed: 0,
      skipped: 0,
      adopted: 0,
      missingMarked: 0,
      elapsedMs: expect.any(Number),
    });
    // 仅首扫发起 parse
    expect(ctx.worker.sent.filter((m) => m.type === 'parse')).toHaveLength(1);
    expect((ctx.db.prepare('SELECT COUNT(*) AS c FROM tracks').get() as { c: number }).c).toBe(3);
    expect((ctx.db.prepare('SELECT COUNT(*) AS c FROM artists').get() as { c: number }).c).toBe(3);
  });

  it('③ adopt 唯一命中：id 不变、status 回 available、不重新解析', async () => {
    const ctx = makeService();
    const artistId = ctx.artistRepo.upsertArtist('Artist A');
    const albumId = ctx.albumRepo.upsertAlbum('Album X', artistId);
    ctx.trackRepo.createMany([
      {
        id: 'old-id',
        title: 'Old',
        artistId,
        albumId,
        albumArtist: 'Artist A',
        albumTitle: 'Album X',
        filePath: 'D:/old/song.mp3',
        fileName: 'song.mp3',
        fileSize: 100,
        fileMtime: 1000,
        format: 'mp3',
        playable: true,
      },
    ]);
    ctx.trackRepo.setStatus(['old-id'], 'missing');

    ctx.worker.responder = (msg) => {
      if (msg.type === 'stat') {
        ctx.worker.emit('message', {
          type: 'stat',
          files: [statFile('D:/new/song.mp3', 100, 1000)],
          skipped: [],
        } satisfies WorkerOutbound);
      }
    };

    const summary = await ctx.service.scan();
    expect(summary).toEqual({
      total: 1,
      parsed: 0,
      skipped: 0,
      adopted: 1,
      missingMarked: 0,
      elapsedMs: expect.any(Number),
    });
    expect(ctx.worker.sent.filter((m) => m.type === 'parse')).toHaveLength(0);

    const row = ctx.trackRepo.findById('old-id')!;
    expect(row.filePath).toBe('D:/new/song.mp3');
    expect(row.status).toBe('available');
    expect(row.title).toBe('Old'); // 未重新解析，元数据保留
  });

  it('④ adopt 双命中 → 走 create 分配新 UUID（歧义宁可新建）', async () => {
    const ctx = makeService();
    const artistId = ctx.artistRepo.upsertArtist('Artist A');
    const albumId = ctx.albumRepo.upsertAlbum('Album X', artistId);
    for (const id of ['dup-1', 'dup-2']) {
      ctx.trackRepo.createMany([
        {
          id,
          title: 'Dup',
          artistId,
          albumId,
          albumArtist: 'Artist A',
          albumTitle: 'Album X',
          filePath: `D:/old/${id}/dup.mp3`,
          fileName: 'dup.mp3',
          fileSize: 200,
          fileMtime: 2000,
          format: 'mp3',
          playable: true,
        },
      ]);
    }
    ctx.trackRepo.setStatus(['dup-1', 'dup-2'], 'missing');

    ctx.worker.responder = (msg) => {
      if (msg.type === 'stat') {
        ctx.worker.emit('message', {
          type: 'stat',
          files: [statFile('D:/new/dup.mp3', 200, 2000)],
          skipped: [],
        } satisfies WorkerOutbound);
      } else if (msg.type === 'parse') {
        ctx.worker.emit('message', {
          type: 'batch',
          parsed: [parsedTrack('D:/new/dup.mp3', { title: 'Dup New' })],
          done: 1,
          skipped: [],
        } satisfies WorkerOutbound);
        ctx.worker.emit('message', { type: 'done', total: 1, skipped: [] } satisfies WorkerOutbound);
      }
    };

    const summary = await ctx.service.scan();
    expect(summary).toEqual({
      total: 1,
      parsed: 1,
      skipped: 0,
      adopted: 0,
      missingMarked: 0,
      elapsedMs: expect.any(Number),
    });

    const rows = ctx.db
      .prepare('SELECT id, file_path, status FROM tracks ORDER BY id')
      .all() as Array<{ id: string; file_path: string; status: string }>;
    expect(rows).toHaveLength(3);
    const fresh = rows.find((r) => r.file_path === 'D:/new/dup.mp3')!;
    expect(fresh.id).not.toBe('dup-1');
    expect(fresh.id).not.toBe('dup-2');
    expect(fresh.status).toBe('available');
    // 两条歧义 missing 记录原样保留
    expect(rows.find((r) => r.id === 'dup-1')!.status).toBe('missing');
    expect(rows.find((r) => r.id === 'dup-2')!.status).toBe('missing');
  });

  it('⑤ missing 反向标记：stat 缺席 → status=missing（不删记录）', async () => {
    const ctx = makeService();
    ctx.worker.responder = standardResponder(ctx);
    await ctx.service.scan();

    ctx.worker.responder = (msg) => {
      if (msg.type === 'stat') {
        ctx.worker.emit('message', { type: 'stat', files: [], skipped: [] } satisfies WorkerOutbound);
      }
    };
    const summary = await ctx.service.scan();

    expect(summary.total).toBe(0);
    expect(summary.missingMarked).toBe(3);
    // 记录不删除，仅状态标记
    expect((ctx.db.prepare('SELECT COUNT(*) AS c FROM tracks').get() as { c: number }).c).toBe(3);
    const statuses = ctx.db.prepare('SELECT status FROM tracks').all() as Array<{ status: string }>;
    expect(statuses.every((r) => r.status === 'missing')).toBe(true);
  });

  it('⑥ summary 字段齐全 + scan.log 写入临时目录', async () => {
    const logDir = mkdtempSync(path.join(os.tmpdir(), 'wc-scan-'));
    const ctx = makeService({ logDir });
    ctx.worker.responder = standardResponder(ctx);

    const summary = await ctx.service.scan();
    for (const key of ['total', 'parsed', 'skipped', 'adopted', 'missingMarked', 'elapsedMs'] as const) {
      expect(typeof summary[key]).toBe('number');
    }

    const content = readFileSync(path.join(logDir, 'scan.log'), 'utf8').trim();
    const line = JSON.parse(content) as Record<string, unknown>;
    expect(line).toMatchObject({
      mode: 'incremental',
      total: 3,
      parsed: 3,
      skipped: 0,
      adopted: 0,
      missingMarked: 0,
    });
    expect(typeof line.elapsedMs).toBe('number');
  });

  it('⑦ C1 missing 复活：文件移除后回归原路径 → status=available 且 id 不变', async () => {
    const ctx = makeService();
    ctx.worker.responder = standardResponder(ctx);
    await ctx.service.scan();

    const readRows = () =>
      ctx.db
        .prepare('SELECT id, file_path, status FROM tracks ORDER BY file_path')
        .all() as Array<{ id: string; file_path: string; status: string }>;
    const before = readRows();
    expect(before.every((r) => r.status === 'available')).toBe(true);

    // 文件移除：stat 回放不含任何路径 → 全部 missing
    ctx.worker.responder = (msg) => {
      if (msg.type === 'stat') {
        ctx.worker.emit('message', { type: 'stat', files: [], skipped: [] } satisfies WorkerOutbound);
      }
    };
    const missingSummary = await ctx.service.scan();
    expect(missingSummary.missingMarked).toBe(3);
    expect(readRows().every((r) => r.status === 'missing')).toBe(true);

    // 文件回归原路径（size/mtime 不变 → unchanged 分支）：status 复活 available、id 不变
    ctx.worker.responder = standardResponder(ctx);
    const backSummary = await ctx.service.scan();
    expect(backSummary.parsed).toBe(0);
    expect(backSummary.missingMarked).toBe(0);
    const after = readRows();
    expect(after.map((r) => r.id)).toEqual(before.map((r) => r.id));
    expect(after.every((r) => r.status === 'available')).toBe(true);

    // changed 分支复活：a1.mp3 回归但 mtime 变化 → 重解析且 status=available、id 保留
    ctx.worker.responder = (msg) => {
      if (msg.type === 'stat') {
        ctx.worker.emit('message', {
          type: 'stat',
          files: [statFile('D:/music/a1.mp3', 100, 2000)],
          skipped: [],
        } satisfies WorkerOutbound);
      } else if (msg.type === 'parse') {
        ctx.worker.emit('message', {
          type: 'batch',
          parsed: [parsedTrack('D:/music/a1.mp3', { title: 'Song 1' })],
          done: 1,
          skipped: [],
        } satisfies WorkerOutbound);
        ctx.worker.emit('message', { type: 'done', total: 1, skipped: [] } satisfies WorkerOutbound);
      }
    };
    const changedSummary = await ctx.service.scan();
    expect(changedSummary.parsed).toBe(1);
    const a1 = ctx.db
      .prepare("SELECT id, status FROM tracks WHERE file_path = 'D:/music/a1.mp3'")
      .get() as { id: string; status: string };
    expect(a1.id).toBe(before.find((r) => r.file_path === 'D:/music/a1.mp3')!.id);
    expect(a1.status).toBe('available');
  });

  it('⑧ I1 worker error → scan() reject 且 inFlight 清理后可重新 scan()', async () => {
    const ctx = makeService();
    ctx.worker.responder = (msg) => {
      if (msg.type === 'stat') {
        ctx.worker.emit('message', {
          type: 'error',
          stage: 'stat',
          message: 'boom',
        } satisfies WorkerOutbound);
      }
    };
    await expect(ctx.service.scan()).rejects.toThrow('扫描 worker 错误（stage=stat）: boom');

    // inFlight 已清理：同一 worker 换正常回放可重新扫描
    ctx.worker.responder = standardResponder(ctx);
    const summary = await ctx.service.scan();
    expect(summary.total).toBe(3);
    expect(summary.parsed).toBe(3);
  });

  it('⑨ I1 批事务失败 → reject 而非 unhandled（同批重复路径触发 UNIQUE 冲突）', async () => {
    const ctx = makeService();
    ctx.worker.responder = (msg) => {
      if (msg.type === 'stat') {
        ctx.worker.emit('message', {
          type: 'stat',
          files: [statFile('D:/music/dup.mp3')],
          skipped: [],
        } satisfies WorkerOutbound);
      } else if (msg.type === 'parse') {
        // 伪 worker 异常回放：同批两条同路径 → 第二条 INSERT 违反 file_path UNIQUE → 批事务抛错
        ctx.worker.emit('message', {
          type: 'batch',
          parsed: [parsedTrack('D:/music/dup.mp3'), parsedTrack('D:/music/dup.mp3', { title: 'Dup 2' })],
          done: 2,
          skipped: [],
        } satisfies WorkerOutbound);
      }
    };
    await expect(ctx.service.scan()).rejects.toThrow(/UNIQUE/i);

    // 失败后事务回滚（无残留行）且 inFlight 已清理：正常回放可重新扫描
    expect((ctx.db.prepare('SELECT COUNT(*) AS c FROM tracks').get() as { c: number }).c).toBe(0);
    ctx.worker.responder = (msg) => {
      if (msg.type === 'stat') {
        ctx.worker.emit('message', {
          type: 'stat',
          files: [statFile('D:/music/dup.mp3')],
          skipped: [],
        } satisfies WorkerOutbound);
      } else if (msg.type === 'parse') {
        ctx.worker.emit('message', {
          type: 'batch',
          parsed: [parsedTrack('D:/music/dup.mp3')],
          done: 1,
          skipped: [],
        } satisfies WorkerOutbound);
        ctx.worker.emit('message', { type: 'done', total: 1, skipped: [] } satisfies WorkerOutbound);
      }
    };
    const summary = await ctx.service.scan();
    expect(summary.parsed).toBe(1);
  });

  // -------------------------------------------------------------------------
  // T2.5 provenance 写入（F2-6）
  // -------------------------------------------------------------------------

  // 存储契约：meta_provenance 为紧凑 JSON、键序 = buildProvenance 字面量序，故用 toBe 精确断言；
  // 勿改成 JSON.parse 比对（那会放过键序/空白漂移）。— 评审 Minor 留痕
  it('⑩ 全标签曲目 → meta_provenance 全 embedded（cover 有 picture 亦为 embedded）', async () => {
    const ctx = makeService();
    ctx.worker.responder = standardResponder(ctx); // a1.mp3：tags 全 true + picture
    await ctx.service.scan();

    const row = ctx.db
      .prepare("SELECT meta_provenance FROM tracks WHERE file_path = 'D:/music/a1.mp3'")
      .get() as { meta_provenance: string };
    expect(row.meta_provenance).toBe(
      '{"title":"embedded","artist":"embedded","album":"embedded","albumArtist":"embedded","cover":"embedded"}',
    );
  });

  it('⑪ 零标签曲目 → title=filename、artist/album/albumArtist=default、cover=folder', async () => {
    const ctx = makeService();
    ctx.worker.responder = (msg) => {
      if (msg.type === 'stat') {
        ctx.worker.emit('message', {
          type: 'stat',
          files: [statFile('D:/music/bare.mp3')],
          skipped: [],
        } satisfies WorkerOutbound);
      } else if (msg.type === 'parse') {
        ctx.worker.emit('message', {
          type: 'batch',
          parsed: [
            parsedTrack('D:/music/bare.mp3', {
              tags: { title: false, artist: false, album: false, albumArtist: false },
              artistString: null, // 主艺人回退'未知艺术家'，provenance 落 default
            }),
          ],
          done: 1,
          skipped: [],
        } satisfies WorkerOutbound);
        ctx.worker.emit('message', { type: 'done', total: 1, skipped: [] } satisfies WorkerOutbound);
      }
    };
    await ctx.service.scan();

    const row = ctx.db
      .prepare("SELECT meta_provenance FROM tracks WHERE file_path = 'D:/music/bare.mp3'")
      .get() as { meta_provenance: string };
    expect(row.meta_provenance).toBe(
      '{"title":"filename","artist":"default","album":"default","albumArtist":"default","cover":"folder"}',
    );
  });

  it('⑫ changed 重解析 → provenance 随新解析结果刷新（embedded → filename/folder）', async () => {
    const ctx = makeService();
    ctx.worker.responder = standardResponder(ctx); // 首扫 a1.mp3：全标签 + picture
    await ctx.service.scan();

    // 二扫：mtime 变化 → changed；标签全部丢失、picture 移除
    ctx.worker.responder = (msg) => {
      if (msg.type === 'stat') {
        ctx.worker.emit('message', {
          type: 'stat',
          files: [statFile('D:/music/a1.mp3', 100, 2000)],
          skipped: [],
        } satisfies WorkerOutbound);
      } else if (msg.type === 'parse') {
        ctx.worker.emit('message', {
          type: 'batch',
          parsed: [
            parsedTrack('D:/music/a1.mp3', {
              title: 'Song 1',
              picture: null,
              tags: { title: false, artist: false, album: false, albumArtist: false },
              artistString: null,
            }),
          ],
          done: 1,
          skipped: [],
        } satisfies WorkerOutbound);
        ctx.worker.emit('message', { type: 'done', total: 1, skipped: [] } satisfies WorkerOutbound);
      }
    };
    const summary = await ctx.service.scan();
    expect(summary.parsed).toBe(1);

    const row = ctx.db
      .prepare("SELECT meta_provenance FROM tracks WHERE file_path = 'D:/music/a1.mp3'")
      .get() as { meta_provenance: string };
    expect(row.meta_provenance).toBe(
      '{"title":"filename","artist":"default","album":"default","albumArtist":"default","cover":"folder"}',
    );
  });
});
