import type { ReactElement } from 'react'

/**
 * Icon —— 本地 vendored Lucide Static 1.43.0 图标组件。
 *
 * 设计资产约定（docs/design/icons.md §统一实现规则 + notes.md §8 实施交接提醒）：
 * - 图标统一走本地资产，经 <img class="library-icon"> 渲染；
 * - 禁止 CDN / inline SVG / CSS mask / 引入任何图标库 npm 包（如 lucide-react）。
 * - 资源经 Vite 静态资源机制（import.meta.glob + ?url&no-inline）加载，electron-vite build 后
 *   作为独立资产文件随产物输出（详见下文 ?no-inline 说明）。
 *
 * 颜色机制（实证，非猜测）：
 * 读取 docs/design/mockups/assets/lucide/heart.svg 与 heart--accent.svg 可见——
 * <img> 无法给 SVG 内部 <path> 上色，且规则禁止 CSS mask；因此语义色已烘焙进各变体文件
 * （heart.svg => stroke #ffffff；heart--accent.svg => stroke #1ed760）。
 * 即 icons.md 中的 --text-* 与 --accent 语义对应到这组固定色文件，选色靠选对变体文件名。
 * 故本组件的 color 仅作调用方语义标注，不参与运行时着色（见 IconProps.color 注释）。
 */

// Vite 在构建期把每个 svg 解析为本地资源 URL（dev: /src/... 路径；build: /assets/哈希.svg）。
// eager + ?url + import:'default' 确保结果是字符串 URL，且随打包产物输出。
//
// ?no-inline 是硬约束，不是优化：图标 svg 均 < 4KB，Vite 默认会内联成 data:image/svg+xml URI，
// 而 renderer 的 CSP（src/renderer/index.html）为 `img-src 'self' wc-cover:`，不含 data:——
// 内联后的图标会在打包应用里被 CSP 拦截。强制产出独立资产文件后走 `'self'`，与 CSP 一致。
const ICON_URLS = import.meta.glob('../assets/icons/lucide/*.svg', {
  eager: true,
  query: '?url&no-inline',
  import: 'default'
}) as Record<string, string>

export type IconName =
  | 'arrow-up-down'
  | 'ban'
  | 'check--accent'
  | 'check'
  | 'chevron-down'
  | 'chevron-left'
  | 'chevron-right'
  | 'chevron-up'
  | 'corner-down-right'
  | 'disc-3--cover-night'
  | 'disc-3--cover-plum'
  | 'disc-3'
  | 'file-check-2'
  | 'file-x-2'
  | 'folder-plus--on-accent'
  | 'folder-plus'
  | 'folder'
  | 'grip-vertical'
  | 'heart--accent'
  | 'heart'
  | 'history'
  | 'library--cover-chopin'
  | 'library'
  | 'list-music'
  | 'mic-2--cover-amber'
  | 'mic-2'
  | 'more-horizontal'
  | 'music-2--accent'
  | 'music-2--cover-blue'
  | 'music-2'
  | 'pause--on-accent'
  | 'pause'
  | 'pencil'
  | 'play--on-accent'
  | 'play'
  | 'plus--on-accent'
  | 'plus'
  | 'refresh-cw'
  | 'repeat'
  | 'search'
  | 'settings'
  | 'shuffle'
  | 'skip-back'
  | 'skip-forward'
  | 'trash-2'
  | 'volume-2'
  | 'x'

/** 尺寸档：16/20/24 为主档；12/15 为表头排序与文件状态图标的密度特例（icons.md）。 */
export type IconSize = 12 | 15 | 16 | 20 | 24

const ICON_BASE_PATH = '../assets/icons/lucide/'

/**
 * 纯函数：图标名 -> 本地资源 URL。
 * 未命中返回 undefined，组件据此回退 null + 控制台 warn（避免单处笔误炸整页）。
 */
export function resolveIconUrl(name: string): string | undefined {
  if (!name) return undefined
  return ICON_URLS[`${ICON_BASE_PATH}${name}.svg`]
}

export interface IconProps {
  /** 图标名（对应 SVG 文件名去扩展名，含变体如 heart--accent）。必须是 IconName 之一。 */
  name: IconName
  /** 尺寸档（px）。默认 16。 */
  size?: IconSize
  /**
   * Token 语义色（文档意图标注）。<img> 无法给 SVG 内部路径上色、且禁用 CSS mask；
   * 颜色已烘焙进变体文件（如 heart--accent.svg 的 stroke=#1ed760），故 color 不参与渲染着色，
   * 选色靠选对变体文件名。保留此 prop 以表达调用方语义，便于后续检视与对照 icons.md。
   */
  color?: string
  /** 附加 class（始终保留 library-icon）。 */
  className?: string
  /**
   * 可访问文本。装饰性图标默认空串（alt="" → 屏幕阅读器跳过，等价于 aria-hidden）；
   * 语义图标（如按钮内图标）由调用方传入可读文本。
   */
  alt?: string
}

const DEFAULT_SIZE: IconSize = 16

export function Icon({
  name,
  size = DEFAULT_SIZE,
  className,
  alt = ''
}: IconProps): ReactElement | null {
  const src = resolveIconUrl(name)
  if (!src) {
    if (typeof console !== 'undefined') {
      console.warn(
        `[Icon] 未知图标名 "${name}"，已回退为 null。请核对 src/renderer/src/assets/icons/lucide/ 下的文件名。`
      )
    }
    return null
  }
  const classes = className ? `library-icon ${className}`.trim() : 'library-icon'
  return (
    <img
      className={classes}
      src={src}
      width={size}
      height={size}
      alt={alt}
      loading="lazy"
      draggable={false}
      // 组件只负责尺寸；display/flex/object-fit/opacity/user-select 由 .library-icon 基础类统一提供（base.css）。
      style={{ width: size, height: size }}
    />
  )
}

export default Icon
