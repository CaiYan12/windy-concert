// T2.2 scanner.worker —— §3.5a 阶段 A walker + 阶段 C 解析（worker_threads 消息驱动）。
// 约束：worker 内禁止 import 数据库与 electron；仅 node 内置 + music-metadata + shared/types + ./formats。
// 协议补全留痕（计划未定义处，取最小形态）：
//   - 入口消息：主进程→worker {type:'stat', dirs}（worker 由该消息驱动启动遍历）
//   - skipped 通道：stat 消息携带 walker 阶段失败清单；batch 消息携带本批解析跳过清单
//   - done 形态：全部解析完成后发一条 {type:'done', total, skipped}（total=解析产出总数，skipped=累计跳过清单）
//   - error 形态（评审 Important #1 / Minor #1 新增）：worker 顶层异常或收到未知消息类型时，
//     发一条 {type:'error', stage:'stat'|'parse'|'unknown', message:string} 回主进程；发送后不再继续处理该消息（避免半状态）
// T2.6 最小导出重构留痕：walk → export walkFiles、parseAll → export parseFiles(files, post)
// （纯函数抽 export，worker 入口消息处理改为调用二者，行为零变化）；parentPort 缺失放宽为
// 跳过消息注册（对齐 cover.worker 先例）——供测试 RealLogicWorkerAdapter 直驱真实逻辑。
import { parentPort } from 'node:worker_threads';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { parseFile } from 'music-metadata';
import { SCANNABLE } from './formats';

// ---------------------------------------------------------------------------
// 消息协议类型
// ---------------------------------------------------------------------------

/** stat 产出的文件清单元素（§3.5a 阶段 A：仅元数据，不解析）。 */
export interface StatFile {
  path: string;
  size: number;
  /** mtime 毫秒时间戳（对齐 TrackInsert.fileMtime: number）。 */
  mtime: number;
  /** 小写归一后的扩展名（不含点）。 */
  ext: string;
}

/** 内嵌封面（§3.5e：front 优先否则第一张），交主进程待 cover 队列。 */
export interface ParsedPicture {
  bytes: Uint8Array;
  mime: string | null;
  type: string | null;
}

/** 解析产出（阶段 C 每 200 条一批回传；tags 为 T2.5 provenance 预埋：true=来自内嵌标签）。 */
export interface ParsedTrack {
  path: string;
  title: string;
  /** artist_string 原样保留（F2-3：可为 null，由主进程决定回退）。 */
  artistString: string | null;
  albumArtist: string;
  album: string;
  /** 小写扩展名。 */
  format: string;
  /** kbps（format.bitrate/1000，可空）。 */
  bitrate: number | null;
  sampleRate: number | null;
  bitDepth: number | null;
  /** 跳过判据保证非空：duration 为空即跳过。 */
  duration: number;
  channels: number | null;
  picture: ParsedPicture | null;
  tags: { title: boolean; artist: boolean; album: boolean; albumArtist: boolean };
  // V1.3 评审补齐 F2-1 全字段：三格式 fixture 全字段断言的前置透传
  trackNumber?: number | null;
  discNumber?: number | null;
  year?: number | null;
  genre?: string | null;
  composer?: string | null;
  comment?: string | null;
  codec?: string | null;
}

/** 主进程→worker。 */
export type WorkerInbound = { type: 'stat'; dirs: string[] } | { type: 'parse'; files: StatFile[] };

/** worker→主进程（skipped 为失败/跳过路径清单，仅记日志跳过——F1-7）。 */
export type WorkerOutbound =
  | { type: 'stat'; files: StatFile[]; skipped: string[] }
  | { type: 'batch'; parsed: ParsedTrack[]; skipped: string[] }
  | { type: 'done'; total: number; skipped: string[] }
  | { type: 'error'; stage: 'stat' | 'parse' | 'unknown'; message: string };

// ---------------------------------------------------------------------------
// 内部常量
// ---------------------------------------------------------------------------

/** stat 并发批大小（§3.5a：批 64）。 */
const STAT_BATCH = 64;
/** 每批回传解析条数（§3.5a 阶段 C：每 200 条一批）。 */
const PARSE_BATCH = 200;

// Minor #4：模块顶部收敛 parentPort 引用。
// T2.6 变更留痕：原实现 parentPort 缺失即 throw——但 vitest 需直接 import 纯函数
// walkFiles/parseFiles（对齐 cover.worker T2.4 先例），故放宽为「缺失则仅跳过消息注册」；
// 真实 worker 线程中 parentPort 恒存在，入口消息处理行为零变化。
const port = parentPort;

// ---------------------------------------------------------------------------
// 阶段 A：walker（readdir withFileTypes 递归；目录失败仅记 skipped 跳过）
// T2.6 导出留痕：原私有 walk 抽为导出纯函数 walkFiles——RealLogicWorkerAdapter（测试）
// 收到 {type:'stat'} 后直驱本函数回放真实 stat 消息；worker 入口逻辑零变化。
// ---------------------------------------------------------------------------

export async function walkFiles(dirs: string[]): Promise<{ files: StatFile[]; skipped: string[] }> {
  const queue = [...dirs];
  const rawFiles: string[] = [];
  const skipped: string[] = [];
  // 路径去重（评审 Important #2 / F1-7「容错与路径去重」）：以小写绝对路径为键，
  // 对齐 §3.5a 对账键大小写不敏感约定。重叠目录场景：用户先后启用 D:\Music 与 D:\Music\Sub，
  // 同一文件会被遍历两次，仅首次出现者进入 stat 结果，重复出现者排除；重复项不单列统计（最小实现）。
  const seenPaths = new Set<string>();

  while (queue.length > 0) {
    const dir = queue.shift() as string;
    let entries;
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      // 目录失败（不存在/无权限）仅记日志跳过——F1-7
      skipped.push(dir);
      continue;
    }
    for (const entry of entries) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) queue.push(p);
      else if (entry.isFile()) {
        const key = p.toLowerCase();
        if (!seenPaths.has(key)) {
          seenPaths.add(key);
          rawFiles.push(p);
        }
      }
    }
  }

  // 扩展名过滤：ext ∈ SCANNABLE 才纳入（toLowerCase 归一）
  const candidates = rawFiles.filter((p) => {
    const ext = path.extname(p).slice(1).toLowerCase();
    return ext !== '' && SCANNABLE.has(ext);
  });

  // stat 并发批 64：取 size/mtime，单文件失败仅记 skipped
  const files: StatFile[] = [];
  for (let i = 0; i < candidates.length; i += STAT_BATCH) {
    const batch = candidates.slice(i, i + STAT_BATCH);
    const stats = await Promise.all(
      batch.map(async (p) => {
        try {
          const st = await fsp.stat(p);
          return { path: p, size: st.size, mtime: st.mtimeMs, ext: path.extname(p).slice(1).toLowerCase() };
        } catch {
          skipped.push(p);
          return null;
        }
      }),
    );
    for (const s of stats) if (s) files.push(s);
  }

  return { files, skipped };
}

// ---------------------------------------------------------------------------
// 阶段 C：解析（music-metadata parseFile；字段映射逐字按计划）
// ---------------------------------------------------------------------------

function titleFallback(p: string): string {
  return path.basename(p, path.extname(p));
}

async function parseOne(file: StatFile): Promise<ParsedTrack | null> {
  let common;
  let format;
  try {
    const mm = await parseFile(file.path);
    common = mm.common;
    format = mm.format;
  } catch {
    return null; // parseFile 抛错 → 跳过（F1-7 / T2.1 实测）
  }
  // T2.1 实测：截断 mp3 不抛错，需以 hasAudio/duration 判定
  if (!format.hasAudio || format.duration == null) return null;

  // artist_string 原样保留（可为 null）
  const artistString = common.artists?.[0] ?? common.artist ?? common.albumartist ?? null;
  const albumArtist = common.albumartist ?? artistString ?? '未知艺术家';
  const album = common.album ?? '未知专辑';
  const title = common.title ?? titleFallback(file.path);

  // 封面：common.picture[0]，type=front 优先否则第一张（§3.5e）
  const pictures = common.picture ?? [];
  const pic = pictures.find((p) => p.type === 'front') ?? pictures[0] ?? null;

  return {
    path: file.path,
    title,
    artistString,
    albumArtist,
    album,
    format: file.ext,
    bitrate: format.bitrate != null ? format.bitrate / 1000 : null,
    sampleRate: format.sampleRate ?? null,
    bitDepth: format.bitsPerSample ?? null,
    duration: format.duration,
    channels: format.numberOfChannels ?? null,
    picture: pic ? { bytes: pic.data, mime: pic.format ?? null, type: pic.type ?? null } : null,
    tags: {
      title: common.title != null,
      artist: (common.artists?.[0] ?? common.artist ?? common.albumartist) != null,
      album: common.album != null,
      albumArtist: common.albumartist != null,
    },
    // V1.3 评审补齐 F2-1 全字段（music-metadata 11.15.0 实际形态：comment 元素为 IComment{text}，
    // disc 字段名为 disk；track/disk 为必有对象故 ?? null 仅兜 no 值）
    trackNumber: common.track?.no ?? null,
    discNumber: common.disk?.no ?? null,
    year: common.year ?? null,
    genre: common.genre?.[0] ?? null,
    composer: common.composer?.[0] ?? null,
    comment: common.comment?.[0]?.text ?? null,
    codec: format.codec ?? null,
  };
}

// ---------------------------------------------------------------------------
// 阶段 C：解析（music-metadata parseFile；字段映射逐字按计划）
// T2.6 导出留痕：原私有 parseAll 抽为导出纯函数 parseFiles——消息出口经 post 参数注入
// （worker 入口传 port.postMessage，测试适配器传 EventEmitter.emit 回放），协议形态零变化。
// ---------------------------------------------------------------------------

export async function parseFiles(
  files: StatFile[],
  post: (msg: WorkerOutbound) => void,
): Promise<void> {
  const parsed: ParsedTrack[] = [];
  const skipped: string[] = [];
  let batchSkipped: string[] = [];

  const flush = () => {
    const msg: WorkerOutbound = {
      type: 'batch',
      parsed: [...parsed],
      skipped: batchSkipped,
    };
    post(msg);
    parsed.length = 0;
    batchSkipped = [];
  };

  let total = 0;
  for (const file of files) {
    const track = await parseOne(file);
    if (track) {
      parsed.push(track);
      total += 1;
    } else {
      skipped.push(file.path);
      batchSkipped.push(file.path);
    }
    if (parsed.length >= PARSE_BATCH) flush();
  }
  if (parsed.length > 0 || batchSkipped.length > 0) flush();
  post({ type: 'done', total, skipped } satisfies WorkerOutbound);
}

// ---------------------------------------------------------------------------
// 消息驱动
// ---------------------------------------------------------------------------

if (port) {
  port.on('message', async (msg: WorkerInbound) => {
    // 顶层错误兜底（评审 Important #1）：async 处理函数内任何异常都回 error 消息，
    // catch 后 return，不再继续处理该消息（避免半状态）。stage 标记当前处理阶段。
    let stage: 'stat' | 'parse' | 'unknown' = 'unknown';
    try {
      if (msg.type === 'stat') {
        stage = 'stat';
        const { files, skipped } = await walkFiles(msg.dirs);
        port.postMessage({ type: 'stat', files, skipped } satisfies WorkerOutbound);
      } else if (msg.type === 'parse') {
        stage = 'parse';
        await parseFiles(msg.files, (m) => port.postMessage(m));
      } else {
        // 未知消息类型（评审 Minor #1）：回执 error，不静默丢弃
        port.postMessage({
          type: 'error',
          stage: 'unknown',
          message: `unknown message type: ${String((msg as { type?: unknown }).type)}`,
        } satisfies WorkerOutbound);
      }
    } catch (err) {
      port.postMessage({ type: 'error', stage, message: String(err) } satisfies WorkerOutbound);
      return;
    }
  });
}
