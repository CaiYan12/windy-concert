/**
 * Icon 单测（jsdom project，位于 src/renderer/** 以匹配 vitest.config.ts 的 jsdom include）。
 *
 * 不引入 @testing-library/react（计划明确：未安装不得新增依赖）。
 * 验证策略：
 *  1) resolveIconUrl 纯函数——断言 5 个代表图标（含色变体 heart--accent）返回非空本地 url；
 *  2) 同 glob 枚举全部 47 个 vendored 资产，守卫「全部可解析 + 0 外联 + 无 data URI 内联」
 *     （data URI 会被 renderer CSP 的 `img-src 'self'` 拦截）；
 *  3) 用 react-dom/server 的 renderToStaticMarkup 直接断言 <img class="library-icon"> 的属性，
 *     不依赖 jsdom DOM 也不触发任何外部请求（url 来自 import.meta.glob，纯本地）。
 */
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { Icon, ICON_NAMES, resolveIconUrl, type IconName } from './Icon'

// 5 个代表性图标：覆盖基础色、accent 变体、on-accent 变体、导航/工具图标与 12px 特例档。
const SAMPLES: IconName[] = ['heart--accent', 'music-2', 'play--on-accent', 'search', 'chevron-up']

// 用与组件相同的 glob 形态枚举 vendored 资产集（不含内联，保持与 production 一致），
// 用于「全部 47 个均可解析 + 0 外联」的守卫；避免在测试里重复维护图标名单。
const ALL_ICON_FILES = import.meta.glob('../assets/icons/lucide/*.svg', {
  eager: true,
  query: '?url&no-inline',
  import: 'default'
}) as Record<string, string>

const nameFromKey = (key: string): string =>
  key.slice(key.lastIndexOf('/') + 1).replace(/\.svg$/, '')

describe('resolveIconUrl（纯函数）', () => {
  it('5 个代表图标（含色变体）解析为非空本地 url', () => {
    for (const name of SAMPLES) {
      const url = resolveIconUrl(name)
      expect(url, `${name} 应解析到本地资源`).toBeTruthy()
      // 本地资源：同源相对/绝对路径且是 svg。不断言目录名——生产产物是 [name]-[hash].svg，
      // 基名不含 lucide 目录，断言目录名会在 build 产物上误报。
      expect(url, `${name} 不应是外联 http(s)`).not.toMatch(/^https?:/)
      expect(url, `${name} 应指向具体 svg 文件`).toMatch(/\.svg(\?|$)/)
    }
  })

  it('全部 vendored 图标（47 个）均可解析为本地资源，且不存在外联', () => {
    const names = Object.keys(ALL_ICON_FILES).map(nameFromKey)
    expect(names).toHaveLength(47)
    for (const name of names) {
      const url = resolveIconUrl(name)
      expect(url, `${name} 应解析到本地资源`).toBeTruthy()
      expect(url, `${name} 不应是外联 http(s)`).not.toMatch(/^https?:\/\//)
      // 不得是 data URI：renderer CSP 为 `img-src 'self'`（不含 data:），内联会被拦截。
      expect(url, `${name} 不应被内联为 data URI`).not.toMatch(/^data:/)
    }
  })

  it('ICON_NAMES 与 glob 枚举的资产名集合完全相等（双向守卫）', () => {
    const fromAssets = new Set(Object.keys(ALL_ICON_FILES).map(nameFromKey))
    const declared = new Set<string>(ICON_NAMES)

    // 无多列：ICON_NAMES 里不能有资产中不存在的名字（改名前残留的旧名）。
    expect(
      [...declared].filter((n) => !fromAssets.has(n)),
      'ICON_NAMES 中列了资产不存在的图标名（疑似资产改名后未同步）'
    ).toEqual([])
    // 无少列：资产里不能有 ICON_NAMES 未列出的名字（手写名单漏项）。
    expect(
      [...fromAssets].filter((n) => !declared.has(n)),
      '存在未列入 ICON_NAMES 的资产文件（手写名单漏项）'
    ).toEqual([])
    // 无重复项：数组长度即集合大小，否则联合类型与集合语义不一致。
    expect(declared.size).toBe(ICON_NAMES.length)
    // 双向过滤已各自为空时即集合相等，这里再直接断言一次作为总体不变量。
    expect(declared).toEqual(fromAssets)
  })

  it('未知名 / 空名返回 undefined', () => {
    expect(resolveIconUrl('does-not-exist')).toBeUndefined()
    expect(resolveIconUrl('')).toBeUndefined()
  })
})

describe('Icon 渲染', () => {
  it('已知图标渲染 <img class="library-icon"> 且 src 指向本地资源', () => {
    const html = renderToStaticMarkup(<Icon name="heart--accent" size={24} />)
    expect(html).toContain('class="library-icon"')
    expect(html).toContain('src=')
    expect(html).toContain('heart--accent')
    expect(html).toContain('width="24"')
    expect(html).toContain('height="24"')
    expect(html).toContain('loading="lazy"')
    expect(html).toContain('draggable="false"')
  })

  it('合并 className 时始终保留 library-icon', () => {
    const html = renderToStaticMarkup(<Icon name="search" className="nav-icon" />)
    expect(html).toContain('class="library-icon nav-icon"')
  })

  it('装饰性图标默认 alt=""（屏幕阅读器跳过）', () => {
    const html = renderToStaticMarkup(<Icon name="music-2" />)
    expect(html).toContain('alt=""')
  })

  it('语义图标可经 alt 传入可访问文本', () => {
    const html = renderToStaticMarkup(<Icon name="search" alt="搜索" />)
    expect(html).toContain('alt="搜索"')
  })

  it('未知名回退为 null（渲染空串）并打印控制台 warn', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const html = renderToStaticMarkup(<Icon name={'nope' as IconName} />)
    expect(html).toBe('')
    expect(warn).toHaveBeenCalledOnce()
    expect(String(warn.mock.calls[0]?.[0])).toContain('nope')
    warn.mockRestore()
  })

  it('同一未知图标名重复渲染只 warn 一次（行复用/StrictMode 防刷屏）', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    renderToStaticMarkup(<Icon name={'nope-dedupe' as IconName} />)
    renderToStaticMarkup(<Icon name={'nope-dedupe' as IconName} />)
    expect(warn).toHaveBeenCalledOnce()
    warn.mockRestore()
  })
})
