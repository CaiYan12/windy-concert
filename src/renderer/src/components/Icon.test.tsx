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
import { Icon, resolveIconUrl, type IconName } from './Icon'

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
      // 本地资源：不得是外联 http(s)（CDN 被禁止）。
      expect(url, `${name} 不应是外联 http(s)`).not.toMatch(/^https?:\/\//)
      expect(url, `${name} 应指向 lucide 资产目录`).toContain('lucide')
      expect(url, `${name} 应指向具体 svg 文件`).toMatch(/\.svg($|\?)/)
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
})
