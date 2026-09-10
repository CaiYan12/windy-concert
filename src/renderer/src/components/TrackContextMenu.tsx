import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactElement
} from 'react'
import type { PlaylistSummary, TrackRow } from '../../../shared/types'
import { useI18n } from '../i18n'
import { Icon } from './Icon'
import { trackMenuItems, type TrackMenuItem } from './trackListUtils'

/**
 * TrackContextMenu —— 曲目右键菜单（T4.3 评审修复拆出；自 TrackList.tsx 原样迁出 + I2/I4/M1 修复）。
 *
 * 四组：下一首播放 / 添加到队列 / 收藏或取消收藏 / 添加到歌单▸（§3.7 line 572）。
 *
 * 本轮修复（评审点名）：
 *   · I2 滚动关闭误伤子菜单：原实现 `window.addEventListener('scroll', onClose, true)` 捕获阶段
 *     任何滚动都关闭菜单，而「添加到歌单」子菜单自身 `max-height:60vh; overflow-y:auto`，
 *     歌单变长后滚动子菜单即卸载菜单。改为忽略「来源在菜单内」的滚动（见 onScroll）。
 *   · I4 键盘可达性：方向键上下切换菜单项、打开即聚焦首项、关闭归还焦点到触发行（由父级
 *     TrackList 的 closeMenu 承担）、子菜单父项 aria-expanded。Escape 关闭沿用。
 *   · M1 首帧坐标跳动：钳制坐标改用 useLayoutEffect（DOM 变更后、浏览器绘制前完成），
 *     不再先以未钳制坐标绘制一帧。
 */

export interface TrackContextMenuProps {
  x: number
  y: number
  track: TrackRow
  playlists: readonly PlaylistSummary[]
  onClose: () => void
  onPlayNext?: (track: TrackRow) => void
  onEnqueue?: (track: TrackRow) => void
  onToggleFavorite?: (track: TrackRow, next: boolean) => void
  onAddToPlaylist?: (track: TrackRow, playlistId: number) => void
  onCreatePlaylist?: (track: TrackRow) => void
}

export function TrackContextMenu({
  x,
  y,
  track,
  playlists,
  onClose,
  onPlayNext,
  onEnqueue,
  onToggleFavorite,
  onAddToPlaylist,
  onCreatePlaylist
}: TrackContextMenuProps): ReactElement {
  const { t } = useI18n()
  const menuRef = useRef<HTMLDivElement>(null)
  const parentRef = useRef<HTMLDivElement>(null)
  /** 仅键盘 ArrowRight 展开子菜单时才抢焦；鼠标 hover 展开不打断用户当前焦点。 */
  const focusSubmenuOnOpen = useRef(false)
  const [pos, setPos] = useState({ left: x, top: y })
  const [subOpen, setSubOpen] = useState(false)

  // M1：打开后按实际尺寸钳制到视口内（避免贴右/下边跳动一帧）。
  // 用 useLayoutEffect：在 DOM 挂载后、浏览器绘制前同步修正坐标；同时聚焦首项（I4）。
  useLayoutEffect(() => {
    const el = menuRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const margin = 8
    setPos({
      left: Math.max(margin, Math.min(x, window.innerWidth - rect.width - margin)),
      top: Math.max(margin, Math.min(y, window.innerHeight - rect.height - margin))
    })
    el.querySelector<HTMLElement>(':scope > [role="menuitem"]')?.focus()
  }, [x, y])

  // 键盘展开子菜单后，等子菜单可见再移焦（ArrowRight 路径）。
  useLayoutEffect(() => {
    if (!subOpen || !focusSubmenuOnOpen.current) return
    focusSubmenuOnOpen.current = false
    menuRef.current
      ?.querySelector<HTMLElement>('.context-submenu [role="menuitem"]')
      ?.focus()
  }, [subOpen])

  // 点击外部 / Escape / 滚动 / 尺寸变化 → 关闭。
  useEffect(() => {
    const onPointerDown = (event: MouseEvent): void => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) onClose()
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    // I2：只在滚动来源位于菜单之外时关闭。子菜单自身可滚动（.context-submenu），
    // 其 scroll 事件不应卸载菜单；文档/虚拟列表滚动仍照常关闭。
    const onScroll = (event: Event): void => {
      if (menuRef.current && menuRef.current.contains(event.target as Node)) return
      onClose()
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    window.addEventListener('resize', onClose)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('resize', onClose)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [onClose])

  const items = trackMenuItems(track)

  /** 当前可见（参与键盘轮转）的菜单项：子菜单关闭时排除其内部项。 */
  const visibleItems = (): HTMLElement[] => {
    const root = menuRef.current
    if (!root) return []
    return Array.from(root.querySelectorAll<HTMLElement>('[role="menuitem"]')).filter((el) => {
      return !el.closest('.context-submenu') || subOpen
    })
  }

  /** I4：方向键在可见菜单项间轮转；子菜单用 ←/→ 收起/展开。 */
  const onMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    const active = document.activeElement as HTMLElement | null
    const inSubmenu = !!active?.closest('.context-submenu')

    if (event.key === 'ArrowRight') {
      if (active && parentRef.current === active) {
        event.preventDefault()
        focusSubmenuOnOpen.current = true
        setSubOpen(true)
      }
      return
    }
    if (event.key === 'ArrowLeft') {
      if (inSubmenu) {
        event.preventDefault()
        setSubOpen(false)
        parentRef.current?.focus()
      }
      return
    }

    const menuItems = visibleItems()
    if (menuItems.length === 0) return
    const current = active ? menuItems.indexOf(active) : -1
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      menuItems[(current + 1 + menuItems.length) % menuItems.length]?.focus()
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      menuItems[(current - 1 + menuItems.length) % menuItems.length]?.focus()
    } else if (event.key === 'Home') {
      event.preventDefault()
      menuItems[0]?.focus()
    } else if (event.key === 'End') {
      event.preventDefault()
      menuItems[menuItems.length - 1]?.focus()
    }
  }

  const run = (id: TrackMenuItem['id']): void => {
    if (id === 'play-next') onPlayNext?.(track)
    else if (id === 'enqueue') onEnqueue?.(track)
    else if (id === 'favorite') onToggleFavorite?.(track, !track.favorite)
    onClose()
  }

  return (
    <div
      ref={menuRef}
      className="context-menu"
      role="menu"
      aria-label={t('songs.contextMenu')}
      style={{ left: pos.left, top: pos.top }}
      onKeyDown={onMenuKeyDown}
    >
      {items.map((item) =>
        item.submenu ? (
          <div
            key={item.id}
            ref={parentRef}
            className={subOpen ? 'context-item context-item--parent is-open' : 'context-item context-item--parent'}
            role="menuitem"
            tabIndex={0}
            aria-haspopup="menu"
            aria-expanded={subOpen}
            onClick={() => setSubOpen(true)}
            onMouseEnter={() => setSubOpen(true)}
            onMouseLeave={() => setSubOpen(false)}
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node)) setSubOpen(false)
            }}
          >
            <span>{t(item.labelKey)}</span>
            <Icon name="chevron-right" size={16} />
            <div className="context-submenu" role="menu">
              {playlists.map((playlist) => (
                <button
                  key={playlist.id}
                  className="context-item"
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onAddToPlaylist?.(track, playlist.id)
                    onClose()
                  }}
                >
                  {playlist.name}
                </button>
              ))}
              <button
                className="context-item"
                type="button"
                role="menuitem"
                onClick={() => {
                  onCreatePlaylist?.(track)
                  onClose()
                }}
              >
                <Icon name="plus" size={16} />
                <span>{t('menu.newPlaylist')}</span>
              </button>
            </div>
          </div>
        ) : (
          <button
            key={item.id}
            className="context-item"
            type="button"
            role="menuitem"
            onClick={() => run(item.id)}
          >
            <span>{t(item.labelKey)}</span>
            {item.shortcut ? <span className="shortcut">{item.shortcut}</span> : null}
          </button>
        )
      )}
    </div>
  )
}

export default TrackContextMenu
