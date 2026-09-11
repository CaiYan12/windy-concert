import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactElement
} from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import type { SearchResult } from '../../../shared/types'
import { useI18n } from '../i18n'
import { api } from '../ipc/client'
import { Cover } from './Cover'
import { Icon, type IconName } from './Icon'
import { formatDuration } from './trackListUtils'
import { debounce, SEARCH_DEBOUNCE_MS, SEARCH_PREVIEW_LIMIT, takeFirst } from './searchUtils'

/**
 * SearchBox（T4.5）——顶栏真搜索框，替换 Topbar 的 T4.1 静态外观骨架。
 *
 * 行为（对照 mockups/components.html SearchBox 下拉区 + SearchResults.html）：
 *   · debounce 200ms：输入停止 200ms 后才发起 library:search（纯函数在 searchUtils.ts，有单测 +
 *     变异验证锚点——删除防抖等待会使 searchUtils.test.ts 的「200ms 内不发起」断言变红）；
 *   · focus 过渡 320→400px 由 shell.css 既有 .search-box / :focus-within 规则承担（T4.1 已迁）；
 *   · 输入 ≥1 字符（去首尾空格）即在下拉显示分组预览：四组各前 SEARCH_PREVIEW_LIMIT(5) 条，
 *     每组「查看全部」链到 /search?q=…；**空组不渲染**（components.html：「无结果组不渲染」），
 *     四组全空显示 search.noResults 空态——禁假数据，不凑数；
 *   · Escape 关闭下拉并归还焦点到输入框（照 TrackList/TrackContextMenu 的焦点归还模式）；
 *     ↓/↑ 在下拉可聚焦项（链接）间移动，首项 ↑ 回输入框、输入框 ↓ 进首项；
 *   · 点击下拉外部关闭；Ctrl/Cmd+K 聚焦输入框（T4.1 留痕的接线点）；Enter 跳全结果页；
 *   · IME 组合中（isComposing）的 Enter/Escape 不触发跳页/关下拉（候选词确认/取消不是指令）；
 *   · 路由变化（含点击下拉内链接导航）统一关闭下拉，并作废在途响应防止其落地重开——
 *     Escape / Enter / 卸载同族处理（requestSeqRef 自增）。
 *
 * 竞态：连续输入会叠加在途请求，用自增 requestId 只采纳最后一次响应（旧响应丢弃）。
 *
 * 与 mockup 的布局偏离（留痕）：设计稿 .search-preview 以 top:58px/left:24px 绝对定位在
 * mockup 壳层坐标系里；本组件改为锚定自身包裹层 .search-anchor（position:relative），
 * top: calc(100% + 6px) / left:0 / width 400px——视觉结果一致（紧贴输入框正下方、与聚焦
 * 等宽），且不依赖壳层盒模型，Topbar 布局变更不会拉歪下拉。
 */

/** 下拉面板各组条数上限的局部别名（语义名，避免裸数字散落 JSX）。 */
const PREVIEW_LIMIT = SEARCH_PREVIEW_LIMIT

/**
 * 下拉条目前导列（mockup.css:2103 三列网格的 28px 列）：
 *   · 曲目/专辑 → 封面盒（wc-cover 请求档 64 不变，28px 显示盒由 .cover--preview 的 CSS 承担）；
 *   · 艺术家/歌单 → 无封面数据（SearchResult 的 artist/playlist 结构没有 coverId），禁造假数据，
 *     用中性图标占位盒（对照 components.html 下拉的 artist-avatar / library 图标形态）。
 */
type PreviewLeading = { kind: 'cover'; coverId: string | null } | { kind: 'badge'; icon: IconName }

export function SearchBox(): ReactElement {
  const { t } = useI18n()
  const navigate = useNavigate()
  const location = useLocation()
  const [value, setValue] = useState('')
  const [preview, setPreview] = useState<SearchResult | null>(null)
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const requestSeqRef = useRef(0)

  // 防抖取数：useMemo 保证 runner 与组件同生命周期（unmount 时 cancel 挂起调用）。
  const debouncedSearch = useMemo(
    () =>
      debounce((q: string) => {
        const trimmed = q.trim()
        if (trimmed.length === 0) {
          // 清空输入：关下拉、丢旧预览（不留上一次查询的残影）。
          setPreview(null)
          setOpen(false)
          return
        }
        const seq = ++requestSeqRef.current
        void api.library
          .search(trimmed)
          .then((res) => {
            // 只采纳最后一次请求的响应（防抖之后的竞态兜底）。
            if (requestSeqRef.current !== seq) return
            setPreview(res)
            setOpen(true)
          })
          .catch((err: unknown) => {
            if (requestSeqRef.current !== seq) return
            // 下拉预览取数失败：静默关闭下拉（全结果页仍有自己的错误态），不阻塞输入。
            console.warn('[SearchBox] 预览取数失败:', err)
            setPreview(null)
            setOpen(false)
          })
      }, SEARCH_DEBOUNCE_MS),
    []
  )
  useEffect(() => {
    return () => {
      // 卸载清理：除取消挂起的防抖计时器外，还要作废在途响应（seq++）——
      // 否则响应落地后 setState 无守卫，会把不存在的下拉状态写回（卸载后 setState 无意义且有告警风险）。
      debouncedSearch.cancel()
      requestSeqRef.current++
    }
  }, [debouncedSearch])

  // 路由变化统一收口：关下拉 + 作废在途响应（seq++）。Topbar/SearchBox 跨页持续挂载，
  // 点击下拉内 Link 导航后 open 仍为 true，下拉会残影浮在新页之上，必须随路由关闭；
  // seq++ 防止在途响应落地后把刚关掉的下拉重新打开。首次挂载时 open 本为 false，无副作用。
  useEffect(() => {
    setOpen(false)
    requestSeqRef.current++
  }, [location])

  // 点击下拉外部关闭（pointerdown 捕获按下即算，点选下拉内部不关）。
  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent): void => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  // Ctrl/Cmd+K 聚焦搜索框（T4.1 静态骨架的 kbd 提示在此接线）。
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        inputRef.current?.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  const trimmedValue = value.trim()

  const goToResults = (): void => {
    if (trimmedValue.length === 0) return
    setOpen(false)
    // 跳页后作废在途响应：防止其落地后把刚关掉的下拉重新打开。
    requestSeqRef.current++
    setPreview(null)
    navigate(`/search?q=${encodeURIComponent(trimmedValue)}`)
  }

  /** ↓/↑ 导航：在面板可聚焦元素（链接）间移动；首项 ↑ / 输入框 ↓ 与输入框互转。 */
  const focusNavItems = (): HTMLAnchorElement[] => {
    const panel = containerRef.current?.querySelector('.search-preview')
    return Array.from(panel?.querySelectorAll<HTMLAnchorElement>('a[href]') ?? [])
  }

  const onInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>): void => {
    // IME 组合中（候选词未确认）：Enter 是确认候选词、Escape 是取消组合，
    // 均不得触发跳页/关下拉。组合中按 Escape 打断候选的意图被一并豁免——可接受
    //（审查员裁定），用户重新输入即可恢复。
    if (event.nativeEvent.isComposing) return
    if (event.key === 'Escape') {
      // 关闭下拉 + 归还焦点（焦点本就在输入框时 focus() 是幂等 no-op；
      // 从下拉项按 Escape 冒泡到这里时把焦点交还输入框）。
      // seq++ 作废在途响应：防止其落地后把刚关掉的下拉重新打开。
      setOpen(false)
      requestSeqRef.current++
      debouncedSearch.cancel()
      inputRef.current?.focus()
      return
    }
    if (event.key === 'Enter') {
      goToResults()
      return
    }
    if (event.key === 'ArrowDown') {
      const items = focusNavItems()
      if (items.length > 0) {
        event.preventDefault()
        items[0].focus()
      }
    }
  }

  const onPanelKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Escape') return
    if (event.key === 'Escape') {
      // 与输入框 Escape 同族：关下拉 + 作废在途响应 + 取消挂起计时器 + 归还焦点。
      setOpen(false)
      requestSeqRef.current++
      debouncedSearch.cancel()
      inputRef.current?.focus()
      return
    }
    const items = focusNavItems()
    const index = items.findIndex((el) => el === document.activeElement)
    if (index === -1) return
    event.preventDefault()
    if (event.key === 'ArrowDown' && index < items.length - 1) items[index + 1].focus()
    if (event.key === 'ArrowUp') {
      if (index > 0) items[index - 1].focus()
      else inputRef.current?.focus()
    }
  }

  // 分组定义集中一处：空组不渲染（下拉与全结果页共用该判定语义）。
  const groups = useMemo(() => {
    if (!preview) return []
    const enc = encodeURIComponent(trimmedValue)
    return [
      {
        key: 'tracks',
        label: t('search.group.tracks'),
        viewAllTo: `/search?q=${enc}`,
        count: preview.tracks.length,
        items: takeFirst(preview.tracks, PREVIEW_LIMIT).map((track) => ({
          key: track.id,
          leading: { kind: 'cover', coverId: track.coverId } as PreviewLeading,
          title: track.title,
          meta: `${track.artistName} · ${track.format}`,
          trailing: formatDuration(track.duration),
          to: null // 曲目无详情路由（mockup 下拉曲目项同样不可点）
        }))
      },
      {
        key: 'albums',
        label: t('search.group.albums'),
        viewAllTo: `/search?q=${enc}`,
        count: preview.albums.length,
        items: takeFirst(preview.albums, PREVIEW_LIMIT).map((album) => ({
          key: String(album.id),
          leading: { kind: 'cover', coverId: album.coverId } as PreviewLeading,
          title: album.title,
          meta: album.year != null ? `${album.artistName} · ${album.year}` : album.artistName,
          trailing: null,
          to: `/albums/${album.id}`
        }))
      },
      {
        key: 'artists',
        label: t('search.group.artists'),
        viewAllTo: `/search?q=${enc}`,
        count: preview.artists.length,
        items: takeFirst(preview.artists, PREVIEW_LIMIT).map((artist) => ({
          key: String(artist.id),
          leading: { kind: 'badge', icon: 'mic-2' } as PreviewLeading,
          title: artist.name,
          meta: t('artists.trackCount', { count: artist.trackCount }),
          trailing: null,
          to: `/artists/${artist.id}`
        }))
      },
      {
        key: 'playlists',
        label: t('search.group.playlists'),
        viewAllTo: `/search?q=${enc}`,
        count: preview.playlists.length,
        items: takeFirst(preview.playlists, PREVIEW_LIMIT).map((playlist) => ({
          key: String(playlist.id),
          leading: { kind: 'badge', icon: 'library' } as PreviewLeading,
          title: playlist.name,
          meta: t('playlists.trackCount', { count: playlist.trackCount }),
          trailing: null,
          to: null // 歌单详情页尚未落地（PagePlaceholder 占位），下拉不给死链（留痕）
        }))
      }
    ]
  }, [preview, t, trimmedValue])

  const nonEmptyGroups = groups.filter((group) => group.items.length > 0)

  return (
    <div className="search-anchor" ref={containerRef}>
      <label className="search-box">
        <Icon name="search" />
        <input
          ref={inputRef}
          type="search"
          value={value}
          placeholder={t('search.placeholder')}
          aria-label={t('search.ariaLabel')}
          onChange={(event) => {
            setValue(event.target.value)
            debouncedSearch(event.target.value)
          }}
          onKeyDown={onInputKeyDown}
        />
        <kbd>{t('search.shortcut')}</kbd>
      </label>
      {open && trimmedValue.length > 0 ? (
        <div className="search-preview" role="dialog" aria-label={t('search.previewLabel')} onKeyDown={onPanelKeyDown}>
          {nonEmptyGroups.length > 0 ? (
            nonEmptyGroups.map((group) => (
              <div className="search-preview-group" key={group.key}>
                <div className="search-preview-head">
                  <span>{group.label}</span>
                  <Link to={group.viewAllTo}>{t('search.viewAll')}</Link>
                </div>
                {group.items.map((item) => {
                  // 28px 前导列：封面（请求档 64，显示盒由 .cover--preview CSS 承担）
                  // 或中性图标占位盒（艺术家/歌单无封面数据，禁造假数据）。
                  const leading =
                    item.leading.kind === 'cover' ? (
                      <Cover coverId={item.leading.coverId} size={64} className="cover--preview" />
                    ) : (
                      <span className="preview-badge">
                        <Icon name={item.leading.icon} size={16} />
                      </span>
                    )
                  const copy = (
                    <div className="preview-copy">
                      <div className="preview-title">{item.title}</div>
                      <div className="preview-meta">{item.meta}</div>
                    </div>
                  )
                  // 曲目/歌单项不可点（无目标路由）→ div；专辑/艺术家 → Link（含 chevron，对照 mockup）。
                  return item.to ? (
                    <Link key={item.key} to={item.to} className="search-preview-item">
                      {leading}
                      {copy}
                      <Icon name="chevron-right" size={16} className="muted" />
                    </Link>
                  ) : (
                    <div key={item.key} className="search-preview-item">
                      {leading}
                      {copy}
                      {item.trailing != null ? <span className="muted numeric">{item.trailing}</span> : null}
                    </div>
                  )
                })}
              </div>
            ))
          ) : (
            <div className="search-preview-empty">{t('search.noResults')}</div>
          )}
        </div>
      ) : null}
    </div>
  )
}

export default SearchBox
