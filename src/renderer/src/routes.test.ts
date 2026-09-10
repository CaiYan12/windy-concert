/**
 * 路由表单测（jsdom project：位于 src/renderer/** 以匹配 vitest.config.ts 的 jsdom include）。
 *
 * 策略（T4.1 评审 I2 后）：「路径 → 顶栏标题」的唯一解析器是 react-router 自身，测试因此直接
 *   对 router.tsx 的 APP_ROUTES 用 matchRoutes 断言 —— 与运行时同一份路由对象，杜绝平行匹配器漂移。
 *   语言资源用 node:fs 直读 resources/locales/zh-CN.json 做存在性守卫（同 T3.5 i18n 测试做法），
 *   并额外扫描渲染层源码里的 t('...') 字面量（I3），避免缺键时 t() 静默回退成 key 字面量。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { matchRoutes } from 'react-router-dom'
import { DEFAULT_ROUTE, DEFAULT_ROUTE_PATH, NAV_ITEMS, ROUTE_DEFS } from './routes'
import { APP_ROUTES, type RouteHandle } from './router'

// jsdom project 下 import.meta.url 不是 file: 协议（jsdom 以 http://localhost 为文档基址），
// fileURLToPath(new URL(..., import.meta.url)) 会抛 "URL must be of scheme file"；
// 故用仓库根（vitest 以项目根为 cwd，见任务约定「vitest 必须以 D:\Dev\windy-concert 为 cwd」）解析。
const locale = JSON.parse(
  readFileSync(resolve(process.cwd(), 'resources/locales/zh-CN.json'), 'utf-8')
) as Record<string, string>

/** 用与运行时相同的 APP_ROUTES + react-router 的 matchRoutes 解析某路径最终命中的 titleKey。 */
function titleKeyFor(pathname: string): string | undefined {
  const matches = matchRoutes(APP_ROUTES, pathname)
  return matches
    ?.map((match) => (match.route.handle as RouteHandle | undefined)?.titleKey)
    .filter((key): key is string => Boolean(key))
    .pop()
}

describe('ROUTE_DEFS（路由表）', () => {
  it('覆盖计划中的 11 条路由，顺序与路径集合一致', () => {
    expect(ROUTE_DEFS.map((def) => def.path)).toEqual([
      '/songs',
      '/albums',
      '/albums/:id',
      '/artists',
      '/artists/:id',
      '/playlists',
      '/playlists/:id',
      '/liked',
      '/recent',
      '/settings',
      '/search'
    ])
  })

  it('落地页（DEFAULT_ROUTE）为 Songs（F3-1）', () => {
    expect(DEFAULT_ROUTE_PATH).toBe('/songs')
    expect(DEFAULT_ROUTE).toBe(ROUTE_DEFS[0])
    expect(DEFAULT_ROUTE.titleKey).toBe('nav.songs')
  })

  it('路径无重复（避免路由匹配不确定）', () => {
    expect(new Set(ROUTE_DEFS.map((def) => def.path)).size).toBe(ROUTE_DEFS.length)
  })
})

describe('路径 → 标题单源（react-router handle，T4.1 评审 I2）', () => {
  const cases: readonly [string, string][] = [
    ['/songs', 'nav.songs'],
    ['/albums', 'nav.albums'],
    ['/albums/42', 'page.albumDetail'],
    ['/artists', 'nav.artists'],
    ['/artists/7', 'page.artistDetail'],
    ['/playlists', 'nav.playlists'],
    ['/playlists/3', 'page.playlistDetail'],
    ['/liked', 'nav.liked'],
    ['/recent', 'nav.recent'],
    ['/settings', 'nav.settings'],
    ['/search', 'page.searchResults']
  ]

  it.each(cases)('%s 命中 %s', (pathname, expected) => {
    expect(titleKeyFor(pathname)).toBe(expected)
  })

  it('每条 RouteDef 的路径经 react-router 解析回自身 titleKey（handle 与路由表同源）', () => {
    for (const def of ROUTE_DEFS) {
      expect(titleKeyFor(def.path), `${def.path} 的 handle 标题与路由表不一致`).toBe(def.titleKey)
    }
  })

  // 评审实测缺陷：旧 matchRoute 大小写敏感，`#/Albums` 侧栏高亮「专辑」却顶栏显示「歌曲」。
  // 改由 react-router 解析后，大小写/尾斜杠/多重斜杠/% 解码语义全部与侧栏 NavLink 一致。
  it.each([
    ['/Albums', 'nav.albums'],
    ['/albums/', 'nav.albums'],
    ['/albums//', 'nav.albums'],
    ['/%61lbums', 'nav.albums'],
    ['/ALBUMS/42', 'page.albumDetail']
  ])('非规范路径 %s 仍解析为 %s（与 react-router 默认语义一致）', (pathname, expected) => {
    expect(titleKeyFor(pathname)).toBe(expected)
  })

  it('根路径与未知路径无 handle（由 Topbar 回退落地页、router 重定向回落地页）', () => {
    expect(titleKeyFor('/')).toBeUndefined()
    expect(titleKeyFor('/nope')).toBeUndefined()
    expect(titleKeyFor('/albums/42/tracks')).toBeUndefined()
  })
})

describe('侧栏导航单源（NAV_ITEMS 由 ROUTE_DEFS 派生，T4.1 评审 I1）', () => {
  it('顺序与设计稿侧栏一致，且与 ROUTE_DEFS 同路径同文案键', () => {
    expect(NAV_ITEMS.map((item) => item.to)).toEqual([
      '/songs',
      '/albums',
      '/artists',
      '/playlists',
      '/liked',
      '/recent',
      '/settings'
    ])
    for (const item of NAV_ITEMS) {
      const def = ROUTE_DEFS.find((d) => d.path === item.to)
      expect(def, `NAV_ITEMS 的 ${item.to} 不在 ROUTE_DEFS 中`).toBeDefined()
      expect(item.labelKey).toBe(def?.titleKey)
      expect(def?.nav).toEqual({ icon: item.icon })
    }
  })
})

describe('路由文案的 i18n 键存在性', () => {
  it('每条路由的 titleKey / eyebrowKey 在 zh-CN.json 中都有非空文案', () => {
    for (const def of ROUTE_DEFS) {
      for (const key of [def.titleKey, def.eyebrowKey]) {
        expect(locale[key], `${def.path} 的 ${key} 缺少语言资源`).toBeTruthy()
      }
    }
  })
})

/** 递归收集渲染层源码文件（排除测试文件——测试可引用任意 key 做反例，不属「UI 实际使用」）。 */
function collectSourceFiles(dir: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (entry === 'assets') continue // 纯静态资产目录（svg），无 TS 源码
      files.push(...collectSourceFiles(full))
    } else if (/\.tsx?$/.test(entry) && !/\.(test|spec)\.tsx?$/.test(entry)) {
      files.push(full)
    }
  }
  return files
}

// 只提取**字面量**键：t('a11y.skipToContent') / t("nav.songs")。
// 动态调用（如 t(item.labelKey)、t(colorKey)）刻意跳过——键不在调用点，静态无法穷举（报告留痕）。
const T_LITERAL = /\bt\(\s*(?:'([^'\\]*(?:\\.[^'\\]*)*)'|"([^"\\]*(?:\\.[^"\\]*)*)")/g

describe('i18n 存在性守卫：源码 t() 字面量（T4.1 评审 I3）', () => {
  it('src/renderer/src 中所有 t(\'...\') 字面量键都在 zh-CN.json 中', () => {
    const root = resolve(process.cwd(), 'src/renderer/src')
    const used = new Set<string>()
    for (const file of collectSourceFiles(root)) {
      const source = readFileSync(file, 'utf-8')
      for (const match of source.matchAll(T_LITERAL)) {
        used.add(match[1] ?? match[2])
      }
    }

    expect(used.size, '未扫描到任何 t() 字面量，扫描逻辑可能失效').toBeGreaterThan(0)
    const missing = [...used].filter((key) => !locale[key]).sort()
    expect(missing, `源码使用但 zh-CN.json 缺失的 i18n key：${missing.join(', ')}`).toEqual([])
  })
})
