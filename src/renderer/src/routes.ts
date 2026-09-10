// T4.1 路由表（纯数据 + 纯函数）——
//   刻意不 import react-router-dom / React / CSS：本模块零依赖，既供 router.tsx 构建路由对象，
//   也可被单测（node 或 jsdom project）直接 import 断言「路径 → 页标题」映射，不触发任何 DOM 副作用。
//   顶栏标题与 eyebrow 只存 i18n key（禁硬编码文案，§4.3-6），真实文案查 resources/locales/zh-CN.json。

export interface RouteDef {
  /** react-router 路径模式（绝对形式；router.tsx 注册为 AppShell 子路由时去掉前导 '/'）。 */
  path: string
  /** 顶栏页标题（topbar .page-title）的 i18n key。 */
  titleKey: string
  /** 顶栏眉标（topbar .eyebrow）的 i18n key。对照 mockups/*.html 各页标题区文案。 */
  eyebrowKey: string
}

/** 落地页 F3-1：Songs。'/' 与未知路径均重定向到它。 */
const SONGS_ROUTE: RouteDef = {
  path: '/songs',
  titleKey: 'nav.songs',
  eyebrowKey: 'eyebrow.musicLibrary'
}

export const DEFAULT_ROUTE: RouteDef = SONGS_ROUTE
export const DEFAULT_ROUTE_PATH = SONGS_ROUTE.path

/**
 * 11 条路由（顺序即侧栏/文档中的自然顺序）。
 * 详情页（/albums/:id 等）顶栏文案：设计稿显示实体名（如专辑名），T4.4 接入数据后替换；
 * 占位期用 i18n 的通用详情标题（page.albumDetail / page.artistDetail / page.playlistDetail）。
 */
export const ROUTE_DEFS: readonly RouteDef[] = [
  SONGS_ROUTE,
  { path: '/albums', titleKey: 'nav.albums', eyebrowKey: 'eyebrow.musicLibrary' },
  { path: '/albums/:id', titleKey: 'page.albumDetail', eyebrowKey: 'eyebrow.albumDetail' },
  { path: '/artists', titleKey: 'nav.artists', eyebrowKey: 'eyebrow.musicLibrary' },
  { path: '/artists/:id', titleKey: 'page.artistDetail', eyebrowKey: 'eyebrow.artistDetail' },
  { path: '/playlists', titleKey: 'nav.playlists', eyebrowKey: 'eyebrow.myCollection' },
  { path: '/playlists/:id', titleKey: 'page.playlistDetail', eyebrowKey: 'eyebrow.playlistDetail' },
  { path: '/liked', titleKey: 'nav.liked', eyebrowKey: 'eyebrow.yourCollection' },
  { path: '/recent', titleKey: 'nav.recent', eyebrowKey: 'eyebrow.listeningHistory' },
  { path: '/settings', titleKey: 'nav.settings', eyebrowKey: 'eyebrow.application' },
  { path: '/search', titleKey: 'page.searchResults', eyebrowKey: 'eyebrow.search' }
]

/** 段参数占位（如 ':id'）；仅用于把路径模式编译为正则，不在此抽取参数值（参数由 useParams 读取）。 */
const PARAM_SEGMENT = /^:/

function escapeSegment(segment: string): string {
  return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function compile(pattern: string): RegExp {
  const source = pattern
    .split('/')
    .map((segment) => (PARAM_SEGMENT.test(segment) ? '([^/]+)' : escapeSegment(segment)))
    .join('/')
  return new RegExp(`^${source}$`)
}

const COMPILED: readonly { def: RouteDef; re: RegExp }[] = ROUTE_DEFS.map((def) => ({
  def,
  re: compile(def.path)
}))

/** 去掉尾部斜杠（'/albums/' 与 '/albums' 视为同一路由）；保留根路径 '/' 本身。 */
function normalize(pathname: string): string {
  return pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname
}

/**
 * 纯函数：路径 → 路由定义。
 * 未命中返回 undefined（'/'、未知路径皆然）——调用方回退 DEFAULT_ROUTE（与 router 的重定向目标一致）。
 */
export function matchRoute(pathname: string): RouteDef | undefined {
  const path = normalize(pathname)
  return COMPILED.find(({ re }) => re.test(path))?.def
}
