// T3.2 自定义协议请求解析纯函数（§3.5f）——wc-file / wc-cover 的安全校验收口点。
//   纯函数零 electron import（electron 依赖仅经 index.ts 注入侧使用），便于 vitest 直驱单测。
//
// 安全校验点清单：
//   - wc-file：URL 解析失败 / host 缺失 / decodeURIComponent 非法序列 → error；
//     还原路径先 path.normalize 击穿 `..`/`.` 穿越段，再做前缀校验：
//     filePath.toLowerCase() 必须命中某启用目录 lower 化路径 + path.sep 分隔符边界（或与之相等），
//     防任意文件读取；`d:\music` 不放行 `d:\music2\x.mp3`（分隔符边界，留痕）。
//   - wc-cover：coverId 必须 UUID 正则（防路径穿越拼 coversDir 外任意路径）；
//     s 参数白名单 {64,256,512}（缺省 256），其余 query 忽略；拼 {coversDir}/{coverId}/{s}.jpg。
//   - folderCache：启用目录集合的内存缓存（folderRepo.list 每次 SQL 查询，协议 handler 高频调用，
//     缓存避免逐请求查库）；目录变更（add/remove/setEnabled）由 ipc handler 侧调 invalidate 失效。
import path from 'node:path';

// ---------------------------------------------------------------------------
// 类型
// ---------------------------------------------------------------------------

/** 协议请求解析结果：成功返回文件绝对路径；失败返回可写入 Response body 的错误说明。 */
export type ResolveResult = { filePath: string } | { error: string };

/** 目录缓存形态：get() 命中缓存；目录变更后由 ipc 侧 invalidate() 失效。 */
export interface FolderCache {
  get(): string[];
  invalidate(): void;
}

// ---------------------------------------------------------------------------
// wc-file 音频请求解析
// ---------------------------------------------------------------------------

/**
 * 解析 wc-file 请求 URL（渲染层构造形态：`wc-file://<encodeURIComponent(绝对路径)>`）。
 * WHATWG URL 对非特殊 scheme（wc-file）的 host 为 opaque host：原样保留百分号编码、
 * 不做小写化/百分号解码（已用 Node 实测验证，留痕），故 host ↔ encodeURIComponent 可逆。
 * @param url            完整请求 URL（Request.url 原样传入）
 * @param enabledFolders 启用中的音乐目录绝对路径集合（folderRepo 缓存侧供给）
 */
export function resolveAudioRequest(url: string, enabledFolders: string[]): ResolveResult {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { error: 'wc-file: 非法 URL' };
  }
  // host 为空时兜底取 pathname（去前导 '/'）：容错 `wc-file:///...` 三斜杠构造形态（留痕）。
  const raw = parsed.host || parsed.pathname.replace(/^\//, '');
  if (raw.length === 0) {
    return { error: 'wc-file: 缺少路径' };
  }
  let filePath: string;
  try {
    filePath = decodeURIComponent(raw);
  } catch {
    return { error: 'wc-file: 非法百分号编码' };
  }
  // 先 normalize 击穿 `..`/`.` 穿越段（`d:\music\..\..\secret.mp3` → `d:\secret.mp3`），
  // 否则穿越路径仍以 `d:\music\` 前缀命中校验（前缀校验必须后置，留痕）。
  filePath = path.normalize(filePath);

  // 前缀校验：lower 化比较（Windows 路径大小写不敏感；folderRepo 存储已小写盘符）。
  // 分隔符边界：folder + path.sep 前缀或整体相等——`d:\music` 不放行 `d:\music2\x.mp3`。
  const lower = filePath.toLowerCase();
  const hit = enabledFolders.some((folder) => {
    const f = folder.toLowerCase();
    return lower === f || lower.startsWith(f + path.sep);
  });
  if (!hit) {
    return { error: `wc-file: 路径未命中启用中的音乐目录 ${filePath}` };
  }
  return { filePath };
}

// ---------------------------------------------------------------------------
// wc-cover 封面请求解析
// ---------------------------------------------------------------------------

/** UUID v1-v5 通形（coverService 以 randomUUID 预生成；正则拒绝一切非 UUID 的路径穿越输入）。 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 封面尺寸白名单（worker 三档输出 64/256/512.jpg；缺省 256 对齐媒体形态 `<img src="wc-cover://{id}?s=256">`）。 */
const COVER_SIZES = new Set([64, 256, 512]);

/**
 * 解析 wc-cover 请求 URL（渲染层构造形态：`wc-cover://{coverId}?s=256`）。
 * coverId 必须 UUID 正则命中（防 `{coversDir}/{../..}/...` 路径穿越）；
 * s 白名单 {64,256,512}（缺省 256），其余 query 忽略。
 */
export function resolveCoverRequest(url: string, coversDir: string): ResolveResult {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { error: 'wc-cover: 非法 URL' };
  }
  // host 为空时兜底取 pathname（去前导 '/'）：容错 `wc-cover:///...` 三斜杠构造形态（留痕）。
  const coverId = parsed.host || parsed.pathname.replace(/^\//, '');
  if (!UUID_RE.test(coverId)) {
    return { error: `wc-cover: 非法 coverId "${coverId}"，未命中 UUID 白名单` };
  }
  const sRaw = parsed.searchParams.get('s');
  const s = sRaw === null ? 256 : Number(sRaw);
  if (!COVER_SIZES.has(s)) {
    return { error: `wc-cover: 非法尺寸 s=${sRaw}，白名单 {64,256,512}` };
  }
  return { filePath: path.join(coversDir, coverId, `${s}.jpg`) };
}

// ---------------------------------------------------------------------------
// 启用目录缓存（folderCache）
// ---------------------------------------------------------------------------

/**
 * 启用目录集合的内存缓存：get() 首调拉取、之后命中缓存；invalidate() 清缓存待下次 get 重拉。
 * 失效接线：ipc 侧 library:addFolder / removeFolder / setFolderEnabled 三 handler 成功后调用。
 * @param getFolders 启用目录来源（index.ts 组装的 folderRepo.list 过滤 enabled 闭包）
 */
export function createFolderCache(getFolders: () => string[]): FolderCache {
  let cache: string[] | null = null;
  return {
    get(): string[] {
      if (cache === null) cache = getFolders();
      return cache;
    },
    invalidate(): void {
      cache = null;
    },
  };
}
