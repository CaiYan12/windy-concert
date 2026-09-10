/**
 * 路由表单测（jsdom project：位于 src/renderer/** 以匹配 vitest.config.ts 的 jsdom include）。
 *
 * 策略：只测 routes.ts 的纯数据与纯函数（matchRoute / ROUTE_DEFS），不渲染 router.tsx——
 *   · 「路径 → 路由定义」是顶栏标题与壳层活跃态的唯一来源，Typo 会静默降级为落地页标题，故逐条锁死；
 *   · 语言资源用 node:fs 直读 resources/locales/zh-CN.json 做存在性守卫（同 T3.5 i18n 测试做法），
 *     避免把 locale JSON 拉进 tsconfig.web 的程序图；键缺失时 t() 会回退成 key 字面量（UI 上会看到
 *     "eyebrow.musicLibrary"），必须在单测层拦截。
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DEFAULT_ROUTE, DEFAULT_ROUTE_PATH, ROUTE_DEFS, matchRoute } from './routes'

// jsdom project 下 import.meta.url 不是 file: 协议（jsdom 以 http://localhost 为文档基址），
// fileURLToPath(new URL(..., import.meta.url)) 会抛 "URL must be of scheme file"；
// 故用仓库根（vitest 以项目根为 cwd，见任务约定「vitest 必须以 D:\Dev\windy-concert 为 cwd」）解析。
const locale = JSON.parse(
  readFileSync(resolve(process.cwd(), 'resources/locales/zh-CN.json'), 'utf-8')
) as Record<string, string>

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

  it('路径无重复（避免 matchRoute 命中不确定）', () => {
    expect(new Set(ROUTE_DEFS.map((def) => def.path)).size).toBe(ROUTE_DEFS.length)
  })
})

describe('matchRoute（纯函数）', () => {
  const cases: readonly [string, string][] = [
    ['/songs', '/songs'],
    ['/albums', '/albums'],
    ['/albums/42', '/albums/:id'],
    ['/artists', '/artists'],
    ['/artists/7', '/artists/:id'],
    ['/playlists', '/playlists'],
    ['/playlists/3', '/playlists/:id'],
    ['/liked', '/liked'],
    ['/recent', '/recent'],
    ['/settings', '/settings'],
    ['/search', '/search']
  ]

  it.each(cases)('%s 命中 %s', (pathname, expectedPath) => {
    expect(matchRoute(pathname)?.path).toBe(expectedPath)
  })

  it('尾部斜杠归一（/albums/ 与 /albums 同路由）', () => {
    expect(matchRoute('/albums/')?.path).toBe('/albums')
    expect(matchRoute('/albums/42/')?.path).toBe('/albums/:id')
  })

  it('列表页不误吞详情页，详情页不误吞列表页', () => {
    expect(matchRoute('/albums')?.path).not.toBe('/albums/:id')
    expect(matchRoute('/albums/42')?.path).not.toBe('/albums')
  })

  it('根路径与未知路径均未命中（由 router 重定向回落地页）', () => {
    expect(matchRoute('/')).toBeUndefined()
    expect(matchRoute('/nope')).toBeUndefined()
    expect(matchRoute('/albums/42/tracks')).toBeUndefined()
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
