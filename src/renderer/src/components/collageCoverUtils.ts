// T6.4 CollageCover 纯函数层 —— 单测锚点，零 DOM 查询（jsdom 无 canvas 2d，绘制能力由调用方注入）。
//
// 拆出动机：设计稿的拼贴封面在列表里是「前 4 首封面 2×2 排布」（Playlists.html:11-14 的
// .collage-cover > 4 × .cover）。真实实现用离屏 canvas 拼好后导出 dataURL（仅展示，不落库），
// 而 jsdom 既无 canvas 2d 也无布局测量——把「取哪 4 个封面 / 每格落在哪 / 画什么」提炼为纯函数，
// 组件只负责「加载位图 → 调 drawCollage → toDataURL → 渲染」，两端各自可测。
import type { TrackRow } from '../../../shared/types'
import { coverUrl } from './Cover'

/** 拼贴格数（2×2，设计稿 .collage-cover 为两行两列）。 */
export const COLLAGE_TILE_COUNT = 4

/**
 * 占位格底色。canvas 读不到 CSS 变量（getComputedStyle 对离屏 canvas 无意义），
 * 故把 tokens.css:12 的 --bg-input 值烘焙为常量——取色依据为 design-plan.md:170
 * 「不足 4 首用占位色块补位，色块取 --bg-input」。
 */
export const COLLAGE_PLACEHOLDER_COLOR = '#242424'

/** 纯函数：取前 count 首的 coverId（不足补 null，恒返回定长数组）。 */
export function resolveCollageTiles(
  tracks: readonly Pick<TrackRow, 'coverId'>[],
  count: number = COLLAGE_TILE_COUNT
): Array<string | null> {
  const tiles: Array<string | null> = []
  for (let i = 0; i < count; i++) {
    tiles.push(tracks[i]?.coverId ?? null)
  }
  return tiles
}

/** 单格落点（px）。 */
export interface CollageCellRect {
  x: number
  y: number
  w: number
  h: number
}

/**
 * 纯函数：第 index 格（0..3，行优先）在 size×size 画布上的落点。
 * 用 Math.floor(size/2) 作半宽：奇数尺寸下两列/两行不重叠（右/下边缘留 1px 空档可接受）。
 */
export function collageCellRect(index: number, size: number): CollageCellRect {
  const half = Math.floor(size / 2)
  const col = index % 2
  const row = Math.floor(index / 2) % 2
  return { x: col * half, y: row * half, w: half, h: half }
}

/**
 * drawCollage 所需的最小 2D 上下文能力（结构性类型）。
 * 不直接依赖 CanvasRenderingContext2D——jsdom 无该实现，单测以假 ctx 断言逐格绘制调用。
 */
export interface CollageDrawContext {
  fillStyle: string | CanvasGradient | CanvasPattern
  fillRect(x: number, y: number, w: number, h: number): void
  drawImage(image: CanvasImageSource, dx: number, dy: number, dw: number, dh: number): void
}

/**
 * 纯过程：把 4 格位图按 2×2 绘到 ctx。
 *   · 该格有 coverId 且位图加载成功 → drawImage 铺满该格；
 *   · 否则（无 coverId / 位图 onerror）→ 填 COLLAGE_PLACEHOLDER_COLOR 占位底色。
 * 无返回值、无副作用外溢（ctx 由调用方提供）。
 */
export function drawCollage(
  ctx: CollageDrawContext,
  tiles: readonly (string | null)[],
  images: readonly (CanvasImageSource | null)[],
  size: number
): void {
  for (let i = 0; i < COLLAGE_TILE_COUNT; i++) {
    const rect = collageCellRect(i, size)
    const image = images[i]
    if (tiles[i] && image) {
      ctx.drawImage(image, rect.x, rect.y, rect.w, rect.h)
    } else {
      ctx.fillStyle = COLLAGE_PLACEHOLDER_COLOR
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h)
    }
  }
}

/**
 * 加载 4 格封面位图（失败 / 无 coverId 该格为 null，不 reject）。
 * onload / onerror 兜底确保 Promise 一定结算——否则任一封面 404 会让整个拼贴永远停在占位态。
 */
export function loadCollageImages(
  tiles: readonly (string | null)[],
  size: 64 | 256 | 512
): Promise<Array<HTMLImageElement | null>> {
  return Promise.all(
    tiles.map(
      (coverId) =>
        new Promise<HTMLImageElement | null>((resolve) => {
          const url = coverUrl(coverId, size)
          if (!url) {
            resolve(null)
            return
          }
          const image = new Image()
          image.onload = () => resolve(image)
          image.onerror = () => resolve(null)
          image.src = url
        })
    )
  )
}

/**
 * 建离屏 canvas 并取 2D 上下文；返回 null 表示环境无 canvas 2d（jsdom / 极老内核）——
 * 组件据此降级为「4 个 .cover 直接铺格」的 DOM 拼贴（无需位图合成，视觉等价）。
 */
export function createCollageCanvas(
  size: number
): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') return null
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  let ctx: CanvasRenderingContext2D | null = null
  try {
    ctx = typeof canvas.getContext === 'function' ? canvas.getContext('2d') : null
  } catch {
    // 某些 jsdom 配置下 getContext 直接抛错；一律视作「不可用」走降级。
    ctx = null
  }
  if (!ctx) return null
  return { canvas, ctx }
}
