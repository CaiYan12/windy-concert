// T2.4 cover.worker —— §3.5e 封面生成（worker_threads 消息驱动）。
// 约束：worker 内禁止 import 数据库与 electron；仅 node 内置 + sharp。
// 协议留痕（计划未定义处，取最小形态，对齐 scanner.worker 风格）：
//   - 入口消息：主进程→worker {type:'process', coverId, coversDir, job}；coversDir 由消息携带（留痕：
//     目录名与 db 行以同一 coverId 原子对应，且 userData 路径由主进程注入、worker 不依赖 electron）
//   - folder 候选探测在 worker 内做：§3.5e 顺序 cover.jpg → cover.png → folder.jpg → folder.png
//     → front.jpg → album.jpg，逐个 fs 存在性检查，命中即读
//   - sharp 三档输出：64/256/512 JPEG（quality 85，fit:'inside'），写入 {coversDir}/{coverId}/{size}.jpg
//   - 完成回执：{type:'done', coverId, width, height, mime, originalPath}——width/height/mime 取原图
//     metadata（mime 由 sharp format 映射 image/*，embedded 缺 format 时回退入口 mime）；originalPath
//     为 folder 来源的实际命中文件路径（embedded 为 null）——service 需要它落 cover_art.original_path
//   - 失败回执：{type:'failed', coverId, reason}——processCoverMessage 内全量 catch，不抛死 worker；
//     未知消息类型无 coverId 可路由，静默忽略（协议最小化，与 scanner.worker error 回执差异留痕）
//   - 清理策略：三档写入中途失败时，best-effort 删除该次已创建的输出目录（缓存可重建，半成品即弃，
//     避免残留目录被误当作完整封面）。
import { parentPort } from 'node:worker_threads';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

// ---------------------------------------------------------------------------
// 消息协议类型
// ---------------------------------------------------------------------------

/** 封面任务（scanService.CoverJob 的 worker 侧形态，embedded 必带 bytes）。 */
export type CoverProcessJob =
  | { source: 'embedded'; bytes: Uint8Array; mime?: string }
  | { source: 'folder'; folderPath: string };

/** 主进程→worker。 */
export interface CoverWorkerInbound {
  type: 'process';
  coverId: string;
  coversDir: string;
  job: CoverProcessJob;
}

/** worker→主进程（done 带 metadata 回执；failed 不抛死 worker）。 */
export type CoverWorkerOutbound =
  | {
      type: 'done';
      coverId: string;
      width: number | null;
      height: number | null;
      mime: string | null;
      originalPath: string | null;
    }
  | { type: 'failed'; coverId: string; reason: string };

// ---------------------------------------------------------------------------
// 内部常量
// ---------------------------------------------------------------------------

/** §3.5e folder 候选探测顺序（逐字）。 */
export const FOLDER_CANDIDATES = [
  'cover.jpg',
  'cover.png',
  'folder.jpg',
  'folder.png',
  'front.jpg',
  'album.jpg',
] as const;

/** 三档输出尺寸（§3.5e）。 */
const OUTPUT_SIZES = [64, 256, 512] as const;
const JPEG_QUALITY = 85;

// ---------------------------------------------------------------------------
// 纯函数处理（导出供单测直接驱动，不经 worker_threads）
// ---------------------------------------------------------------------------

/** §3.5e 顺序探测 folder 候选，命中返回绝对路径，全未命中返回 null。 */
export async function findFolderCover(folderPath: string): Promise<string | null> {
  for (const name of FOLDER_CANDIDATES) {
    const candidate = path.join(folderPath, name);
    try {
      await fsp.access(candidate);
      return candidate;
    } catch {
      // 不存在 → 探测下一个候选
    }
  }
  return null;
}

/** 处理单条封面任务：成功/失败都以回执消息结束（不抛出）。 */
export async function processCoverMessage(msg: CoverWorkerInbound): Promise<CoverWorkerOutbound> {
  const { coverId, coversDir, job } = msg;
  try {
    let input: Buffer;
    let originalPath: string | null = null;
    if (job.source === 'embedded') {
      input = Buffer.from(job.bytes);
    } else {
      originalPath = await findFolderCover(job.folderPath);
      if (!originalPath) {
        throw new Error(`封面候选未命中（${FOLDER_CANDIDATES.join(' → ')}）: ${job.folderPath}`);
      }
      input = await fsp.readFile(originalPath);
    }

    // 单实例复用：先 metadata 后 clone 三次 resize，省两次完整解码
    const source = sharp(input);
    const metadata = await source.metadata();

    const outDir = path.join(coversDir, coverId);
    let outDirCreated = false;
    try {
      await fsp.mkdir(outDir, { recursive: true });
      outDirCreated = true;
      for (const size of OUTPUT_SIZES) {
        await source
          .clone()
          .resize(size, size, { fit: 'inside' })
          .jpeg({ quality: JPEG_QUALITY })
          .toFile(path.join(outDir, `${size}.jpg`));
      }
    } catch (err) {
      // 半成品即弃：仅在该次处理已创建目录后失败时清理（best-effort，不覆盖原始失败原因）
      if (outDirCreated) {
        await fsp.rm(outDir, { recursive: true, force: true }).catch(() => {});
      }
      throw err;
    }

    // mime 取原图 metadata：sharp format → image/*；embedded 缺 format 时回退入口 mime
    const mime = metadata.format
      ? `image/${metadata.format}`
      : job.source === 'embedded'
        ? (job.mime ?? null)
        : null;

    return {
      type: 'done',
      coverId,
      width: metadata.width ?? null,
      height: metadata.height ?? null,
      mime,
      originalPath,
    };
  } catch (err) {
    return { type: 'failed', coverId, reason: String(err) };
  }
}

// ---------------------------------------------------------------------------
// 消息驱动
// ---------------------------------------------------------------------------

// 与 scanner.worker 的差异留痕：parentPort 缺失时仅跳过消息注册而不 throw——
// 便于单测直接 import 纯函数（findFolderCover/processCoverMessage）驱动真实逻辑。
const port = parentPort;
if (port) {
  port.on('message', (msg: CoverWorkerInbound) => {
    if (msg.type === 'process') {
      // processCoverMessage 内全量 catch（failed 回执），此处再兜一层顶层 try/catch 对齐
      // scanner.worker 风格：任何意外异常不击穿 worker。
      void processCoverMessage(msg).then((out) => port.postMessage(out));
    }
    // 未知消息类型：无 coverId 可路由，静默忽略（留痕）
  });
}
