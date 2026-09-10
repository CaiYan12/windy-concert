// T4.1 路由表（纯数据）——
//   刻意不 import react-router-dom / React / CSS：本模块运行期零依赖（唯一的 IconName 是 type-only
//   import，编译后整体擦除），既供 router.tsx 构建路由对象，也可被单测（jsdom project）直接 import
//   断言路由表结构，不触发任何 DOM 副作用。
//   顶栏标题与 eyebrow 只存 i18n key（禁硬编码文案，§4.3-6），真实文案查 resources/locales/zh-CN.json。
//
//   「路径 → 标题」的解析**不再由本模块承担**：titleKey/eyebrowKey 经 router.tsx 注入 RouteObject.handle，
//   由 react-router 自己匹配（大小写不敏感、% 解码、// 归一），Topbar 用 useMatches() 读取。
//   历史教训（T4.1 评审 I2）：此处曾有一份平行的 matchRoute 纯函数做「路径 → RouteDef」，与 react-router
//   的匹配语义（默认 caseSensitive:false）不一致——`#/Albums` 会侧栏高亮「专辑」而顶栏显示「歌曲」。
//   现存唯一匹配器 = react-router，从根上消除漂移。
import type { IconName } from './components/Icon'

export interface RouteDef {
  /** react-router 路径模式（绝对形式；router.tsx 注册为 AppShell 子路由时去掉前导 '/'）。 */
  path: string
  /** 顶栏页标题（topbar .page-title）的 i18n key。 */
  titleKey: string
  /** 顶栏眉标（topbar .eyebrow）的 i18n key。对照 mockups/*.html 各页标题区文案。 */
  eyebrowKey: string
  /**
   * 侧栏导航项配置：存在即表示该路由是侧栏可见入口，icon 为 <Icon> 名称（IconName 联合类型在此
   * 编译期校验拼写）。仅列表页设置；详情页（/albums/:id 等）与 /search 不设。
   * 侧栏由此从本表派生，杜绝 Sidebar 内另维护一份 NAV_ITEMS 造成的二处漂移（T4.1 评审 I1）。
   */
  nav?: { icon: IconName }
}

/** 落地页 F3-1：Songs。'/' 与未知路径均重定向到它。 */
const SONGS_ROUTE: RouteDef = {
  path: '/songs',
  titleKey: 'nav.songs',
  eyebrowKey: 'eyebrow.musicLibrary',
  nav: { icon: 'music-2' }
}

export const DEFAULT_ROUTE: RouteDef = SONGS_ROUTE
export const DEFAULT_ROUTE_PATH = SONGS_ROUTE.path

/**
 * 11 条路由（顺序即侧栏/文档中的自然顺序）。带 nav 的 7 条即侧栏入口（顺序与设计稿一致）。
 * 详情页（/albums/:id 等）顶栏文案：设计稿显示实体名（如专辑名），T4.4 接入数据后替换；
 * 占位期用 i18n 的通用详情标题（page.albumDetail / page.artistDetail / page.playlistDetail）。
 */
export const ROUTE_DEFS: readonly RouteDef[] = [
  SONGS_ROUTE,
  { path: '/albums', titleKey: 'nav.albums', eyebrowKey: 'eyebrow.musicLibrary', nav: { icon: 'disc-3' } },
  { path: '/albums/:id', titleKey: 'page.albumDetail', eyebrowKey: 'eyebrow.albumDetail' },
  { path: '/artists', titleKey: 'nav.artists', eyebrowKey: 'eyebrow.musicLibrary', nav: { icon: 'mic-2' } },
  { path: '/artists/:id', titleKey: 'page.artistDetail', eyebrowKey: 'eyebrow.artistDetail' },
  { path: '/playlists', titleKey: 'nav.playlists', eyebrowKey: 'eyebrow.myCollection', nav: { icon: 'library' } },
  { path: '/playlists/:id', titleKey: 'page.playlistDetail', eyebrowKey: 'eyebrow.playlistDetail' },
  { path: '/liked', titleKey: 'nav.liked', eyebrowKey: 'eyebrow.yourCollection', nav: { icon: 'heart' } },
  { path: '/recent', titleKey: 'nav.recent', eyebrowKey: 'eyebrow.listeningHistory', nav: { icon: 'history' } },
  { path: '/settings', titleKey: 'nav.settings', eyebrowKey: 'eyebrow.application', nav: { icon: 'settings' } },
  { path: '/search', titleKey: 'page.searchResults', eyebrowKey: 'eyebrow.search' }
]

/** 侧栏导航项：由 ROUTE_DEFS 派生（带 nav 的条目，顺序即设计稿侧栏顺序）——唯一源在路由表。 */
export interface NavItem {
  to: string
  labelKey: string
  icon: IconName
}

export const NAV_ITEMS: readonly NavItem[] = ROUTE_DEFS.filter(
  (def): def is RouteDef & { nav: { icon: IconName } } => def.nav !== undefined
).map((def) => ({ to: def.path, labelKey: def.titleKey, icon: def.nav.icon }))
