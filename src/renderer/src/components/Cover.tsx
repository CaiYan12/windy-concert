import { useState, type ReactElement } from 'react'
import { Icon } from './Icon'

/**
 * Cover —— 专辑/曲目封面组件（T4.3）。
 *
 * 取图协议（唯一来源 src/main/library/protocols.ts）：
 *   有 coverId → <img src="wc-cover://{coverId}?s={size}">，其中 coverId 为主进程生成的 UUID，
 *   size ∈ {64,256,512} 为主进程预生成的三档图像（resolveCoverRequest 只放行这三档）。
 *   无 coverId → 中性占位：--bg-elevated 底 + music-2 图标（对齐 mockup.css:723-734）。
 *   占位图标的不透明度为 .38（mockup.css:728 的设计意图），由 cover.css 的
 *   `.cover--placeholder .library-icon` 承担；占位图标**不加**任何额外类（设计稿未加过，见 cover.css 注释）。
 *
 * 尺寸解耦（回应「表格缩略图档位自行实测决定并留痕」）：
 *   · size ∈ {64,256,512} 只决定**请求的图像档位**；CSS 盒尺寸由调用方 className 决定
 *     （cover--mini 48 / cover--table 40 / cover--hero 200）。
 *   · 表格缩略图取 **64 档**：§3.7 列宽 44px、设计稿 .cover--table 盒 40px 都小于最小的 64，
 *     取 64 是「不小于显示盒的最小生成档」——既不做上采样放大（避免模糊），也不请求无用的
 *     256/512（避免浪费 IPC/解码）。e2e 实测该档在真实 fixture 上 naturalWidth>0（见 tests/e2e/tracklist.spec.ts）。
 *   · 256 档用于网格卡片（T4.4 Albums）、512 档用于详情页大图（T4.2 AlbumDetail）；T4.3 无消费者，
 *     但 coverUrl 对三档一致生成，接口已就绪。
 *
 * onError 回退：wc-cover 请求失败（封面文件被清理 / coverId 过期）时降级为占位，
 *   不出现破图。失败状态以 **url 为键**记录（failedUrl），避免 virtuoso 行复用/属性变化时
 *   把「上一张图的失败」错误地延续到新图上（无需 effect 复位）。
 */

/** 封面图像档位（主进程 COVER_SIZES 白名单，见 protocols.ts）。 */
export type CoverSize = 64 | 256 | 512

export interface CoverProps {
  /** 封面 id（UUID）；null/undefined → 占位。 */
  coverId: string | null
  /** 请求的图像档位（非 CSS 盒尺寸）。 */
  size: CoverSize
  /** 可访问文本；默认空串（封面为装饰性，标题在相邻单元格）。 */
  alt?: string
  /** 附加 class（与 .cover 组合，用于给盒尺寸，如 cover--table）。 */
  className?: string
}

/**
 * 纯函数：coverId + 档位 → wc-cover 协议 URL；无 coverId 返回 null。
 * 导出以便单测直接断言 URL 形态（无需渲染）。
 */
export function coverUrl(coverId: string | null | undefined, size: CoverSize): string | null {
  if (!coverId) return null
  return `wc-cover://${coverId}?s=${size}`
}

// 占位图标的固有尺寸（px，Icon 的 IconSize 档位）。
// 仅作 <img width/height> 的固有值与 CSS 未加载时的兜底；**实际显示尺寸由 cover.css 的 58% 决定**。
const PLACEHOLDER_ICON_SIZE: Record<CoverSize, 20 | 24> = { 64: 20, 256: 24, 512: 24 }

export function Cover({ coverId, size, alt = '', className }: CoverProps): ReactElement {
  const url = coverUrl(coverId, size)
  // 失败以 url 为键：coverId/档位变化（行复用）不会沿用旧的失败标记。
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const classes = className ? `cover ${className}` : 'cover'

  if (!url || failedUrl === url) {
    return (
      <div className={`${classes} cover--placeholder`}>
        <Icon name="music-2" size={PLACEHOLDER_ICON_SIZE[size]} />
      </div>
    )
  }

  return (
    <div className={classes}>
      <img
        src={url}
        alt={alt}
        loading="lazy"
        draggable={false}
        onError={() => setFailedUrl(url)}
      />
    </div>
  )
}

export default Cover
