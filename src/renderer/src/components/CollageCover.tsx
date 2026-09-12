import { useEffect, useMemo, useState, type ReactElement } from 'react'
import type { TrackRow } from '../../../shared/types'
import { Cover, type CoverSize } from './Cover'
import {
  COLLAGE_TILE_COUNT,
  createCollageCanvas,
  drawCollage,
  loadCollageImages,
  resolveCollageTiles
} from './collageCoverUtils'

/**
 * CollageCover —— 歌单拼贴封面（T6.4）。
 *
 * 设计依据：Playlists.html:11-14 / PlaylistDetail.html:9 的 `.collage-cover`——两行两列，逐格放
 * 歌单前 4 首曲目的封面；曲目不足 4 首的格子用 `.cover--placeholder`（music-2 图标）补位。
 *
 * 真实实现（T6.4 任务要求）：把前 4 首封面画到**离屏 canvas** 的 2×2 网格上，导出 dataURL，
 * 以一个 <img> 呈现。**仅列表展示用，不落库**——歌单表不存封面字段（shared/types 的
 * PlaylistRow 无 coverId），故本组件每次挂载按当前曲目重算，不入库、不设缓存。
 *
 * 降级（两条，互不冲突）：
 *   ① 无 canvas 2d（jsdom / 极老内核）：改为直接把 4 个 <Cover> 铺进 2×2 网格（DOM 拼贴），
 *      视觉与合成结果等价——设计稿本身就是这种 DOM 形态；单测即走此路径。
 *   ② 一格封面加载失败 / 无 coverId：该格填占位底色（占位色 = tokens --bg-elevated）。
 *      全 4 格都无 coverId 时不建 canvas，直接 DOM 拼贴（省一次位图加载与合成）。
 *
 * CSP 关联（重要，留痕）：组件产出的 dataURL 以 <img src="data:..."> 呈现，需 renderer CSP 的
 *   img-src 放行 data:（src/renderer/index.html 已同步追加，理由见该文件注释）。若 CSP 未放行，
 *   Chromium 会拦截该图并在控制台报 CSP violation（e2e 的「控制台无 error」断言会红）。
 */
export interface CollageCoverProps {
  /** 取前 4 首的封面 id；省略/空数组 → 4 格全占位。 */
  tracks?: readonly Pick<TrackRow, 'coverId'>[]
  /** 位图请求档位（同时决定合成画布边长）；网格卡用 256，详情 Hero 用 512。 */
  size?: CoverSize
  /** 附加 class（与 .collage-cover 组合，如 cover--hero）。 */
  className?: string
  /** 可访问文本；默认空串（拼贴封面为装饰性，歌单名在相邻 .card-copy）。 */
  alt?: string
}

export function CollageCover({
  tracks = [],
  size = 256,
  className,
  alt = ''
}: CollageCoverProps): ReactElement {
  const tiles = useMemo(() => resolveCollageTiles(tracks), [tracks])
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  // 依赖用内容串而非 tiles 数组身份：详情页曲目数组每次取数都是新引用，用身份会重复合成。
  const tileKey = tiles.join('\u0000')

  useEffect(() => {
    let cancelled = false

    // 全占位：不建 canvas（省一次空合成），直接走 DOM 拼贴。
    if (tiles.every((tile) => tile === null)) {
      setDataUrl(null)
      return
    }

    const made = createCollageCanvas(size)
    if (!made) {
      // ① 无 canvas 2d：降级 DOM 拼贴（保持 dataUrl 为 null）。
      setDataUrl(null)
      return
    }

    void loadCollageImages(tiles, size).then((images) => {
      if (cancelled) return
      drawCollage(made.ctx, tiles, images, size)
      try {
        const url = made.canvas.toDataURL('image/png')
        setDataUrl(url.length > 0 ? url : null)
      } catch {
        // toDataURL 在受污染画布 / 不支持时抛错——降级 DOM 拼贴，不留白。
        setDataUrl(null)
      }
    })

    return () => {
      cancelled = true
    }
    // tiles 内容（tileKey）与 size 是唯一语义依赖；tiles 数组身份有意不入依赖。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tileKey, size])

  const classes = className ? `collage-cover ${className}` : 'collage-cover'
  const ariaProps = alt ? ({ role: 'img', 'aria-label': alt } as const) : {}

  if (dataUrl === null) {
    // ② DOM 拼贴降级：4 格 Cover（有 coverId 走 wc-cover，无则占位），与设计稿 DOM 同形。
    return (
      <div className={classes} {...ariaProps}>
        {Array.from({ length: COLLAGE_TILE_COUNT }, (_, index) => (
          <Cover key={index} coverId={tiles[index]} size={size} />
        ))}
      </div>
    )
  }

  return (
    <div className={classes} {...ariaProps}>
      <img className="collage-cover-image" src={dataUrl} alt={alt} draggable={false} />
    </div>
  )
}

export default CollageCover
