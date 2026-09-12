import { type ReactElement } from 'react'
import { useLocation } from 'react-router-dom'
import { useI18n } from '../i18n'
import { Songs } from './Songs'
import { Albums } from './Albums'
import { ArtistDetail } from './ArtistDetail'
import { Artists } from './Artists'
import { AlbumDetail } from './AlbumDetail'
import { SearchResults } from './SearchResults'
import { Liked } from './Liked'
import { Playlists } from './Playlists'
import { PlaylistDetail } from './PlaylistDetail'
import { Recent } from './Recent'
import { Settings } from './Settings'

/**
 * PagePlaceholder —— 路由 → 页面分发器（T4.4 起逐步落地真实页面）。
 *
 * 历史：T4.1 各路由统一挂占位；T4.3 在 /songs 分支临时渲染真实 <TrackList> 并引入
 * `#/songs?playing=<id>` 生产后门（用于 e2e 注入播放态 accent 变体断言）。T4.4 用真实
 * Songs 页替换该分支，并随之一并移除 `?playing=` 后门三件套（PagePlaceholder 钩子 /
 * tracklist.css 的 .tracklist-page / e2e 对钩子的依赖）——播放态断言改由 T5.6 playerStore
 * 提供（T4.4~T5.6 e2e 覆盖空窗，T5.6 补齐，见 tests/e2e/tracklist.spec.ts 注释留痕）。
 *
 * router.tsx / routes.ts 属 T4.1 冻结文件（不改），故页面迁移只能在此按 pathname 分流
 * （探索结论：ROUTE_DEFS 已含 /albums/:id、/artists/:id，router 已将其注册为 PagePlaceholder，
 * 故带参路由无需改动 router.tsx）。全部 11 条路由均已落地真实页面
 * （liked T6.1、search T4.5、playlists T6.2、recent T6.5、settings T7.1）。
 */
export function PagePlaceholder(): ReactElement {
  const { t } = useI18n()
  const { pathname } = useLocation()

  // ---- T4.4 已落地页面 ----
  if (pathname === '/songs') return <Songs />
  if (pathname === '/albums') return <Albums />
  if (pathname.startsWith('/albums/')) return <AlbumDetail />
  if (pathname === '/artists') return <Artists />
  if (pathname.startsWith('/artists/')) return <ArtistDetail />
  // T4.5：/search 落地真实页面（routes.ts / router.tsx 冻结，仍走本分发器模式）。
  if (pathname === '/search') return <SearchResults />
  // T6.1：/liked 落地真实页面（routes.ts / router.tsx 冻结，仍走本分发器模式）。
  if (pathname === '/liked') return <Liked />
  // T6.2：/playlists 与 /playlists/:id 落地真实页面（routes.ts / router.tsx 冻结，同分发器模式）。
  // 顺序：先精确匹配 /playlists，再前缀匹配详情（同 /albums 与 /albums/:id 的处理次序）。
  if (pathname === '/playlists') return <Playlists />
  if (pathname.startsWith('/playlists/')) return <PlaylistDetail />
  // T6.5：/recent 落地真实页面（routes.ts / router.tsx 冻结，同分发器模式）。
  if (pathname === '/recent') return <Recent />
  // T7.1：/settings 落地真实页面（routes.ts / router.tsx 冻结，同分发器模式）。
  // 至此 11 条路由全部为真实页面，下方纯占位分支仅剩兜底语义（防死链）。
  if (pathname === '/settings') return <Settings />

  // ---- 尚未落地的路由：纯占位（仅服务未实现页面，避免死链） ----
  return (
    <div className="page-wrap">
      <p className="muted">{t('page.placeholder')}</p>
    </div>
  )
}

export default PagePlaceholder
