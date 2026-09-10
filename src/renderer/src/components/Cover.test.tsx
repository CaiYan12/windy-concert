/**
 * Cover 单测（jsdom project：位于 src/renderer/** 以匹配 vitest.config.ts 的 jsdom include）。
 *
 * 承 T4.0/T4.1 的测试形态：不引入 @testing-library；纯函数直接断言，
 * 组件用 react-dom/server 的 renderToStaticMarkup 断言属性；onError 回退需要事件驱动，
 * 故单测用例用 react-dom/client + act 做一次最小客户端挂载（无额外依赖）。
 */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Cover, coverUrl } from './Cover'

const UUID = '123e4567-e89b-12d3-a456-426614174000'

describe('coverUrl（纯函数）', () => {
  it('有 coverId → wc-cover://{id}?s={size}（三档一致）', () => {
    expect(coverUrl(UUID, 64)).toBe(`wc-cover://${UUID}?s=64`)
    expect(coverUrl(UUID, 256)).toBe(`wc-cover://${UUID}?s=256`)
    expect(coverUrl(UUID, 512)).toBe(`wc-cover://${UUID}?s=512`)
  })

  it('无 coverId（null / undefined / 空串）→ null（占位）', () => {
    expect(coverUrl(null, 64)).toBeNull()
    expect(coverUrl(undefined, 256)).toBeNull()
    expect(coverUrl('', 512)).toBeNull()
  })
})

describe('Cover 渲染（SSR）', () => {
  it('有 coverId → <img src="wc-cover://…?s=64">，class 由 className 组合', () => {
    const html = renderToStaticMarkup(<Cover coverId={UUID} size={64} className="cover--table" />)
    expect(html).toContain('class="cover cover--table"')
    expect(html).toContain(`src="wc-cover://${UUID}?s=64"`)
    expect(html).toContain('loading="lazy"')
    expect(html).toContain('draggable="false"')
    expect(html).toContain('alt=""')
    expect(html).not.toContain('cover--placeholder')
  })

  it('三档请求各自成 URL（256 / 512）', () => {
    expect(renderToStaticMarkup(<Cover coverId={UUID} size={256} />)).toContain(
      `wc-cover://${UUID}?s=256`
    )
    expect(renderToStaticMarkup(<Cover coverId={UUID} size={512} />)).toContain(
      `wc-cover://${UUID}?s=512`
    )
  })

  it('无 coverId → 占位（cover cover--placeholder + music-2 图标），不出 <img> 取图', () => {
    const html = renderToStaticMarkup(<Cover coverId={null} size={64} className="cover--table" />)
    expect(html).toContain('class="cover cover--table cover--placeholder"')
    expect(html).toContain('library-icon cover-icon')
    expect(html).toContain('music-2')
    expect(html).not.toContain('wc-cover://')
  })

  it('alt 透传到 <img>（语义封面场景）', () => {
    const html = renderToStaticMarkup(<Cover coverId={UUID} size={256} alt="专辑封面" />)
    expect(html).toContain('alt="专辑封面"')
  })
})

describe('Cover onError 回退（客户端挂载）', () => {
  it('取图失败 → 降级为占位，不残留破图 <img>', () => {
    ;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    act(() => {
      root.render(<Cover coverId={UUID} size={64} className="cover--table" />)
    })
    const img = container.querySelector('img')
    expect(img?.getAttribute('src')).toBe(`wc-cover://${UUID}?s=64`)

    act(() => {
      img?.dispatchEvent(new Event('error'))
    })
    expect(container.querySelector('.cover--placeholder')).not.toBeNull()
    expect(container.querySelector('img.cover-icon')).not.toBeNull()
    expect(container.querySelector(`img[src="wc-cover://${UUID}?s=64"]`)).toBeNull()

    act(() => {
      root.unmount()
    })
    container.remove()
  })

  it('failedUrl 以 url 为键：失败后 coverId 变化 → 重新出图（不复用旧失败标记）', () => {
    ;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true
    const OTHER = 'abcdefab-1234-5678-9abc-def012345678'
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    // ① 首图取图失败 → 占位
    act(() => {
      root.render(<Cover coverId={UUID} size={64} className="cover--table" />)
    })
    act(() => {
      container.querySelector('img')?.dispatchEvent(new Event('error'))
    })
    expect(container.querySelector('.cover--placeholder')).not.toBeNull()

    // ② coverId 变化（virtuoso 行复用场景）→ 新 url 未被标记失败，应重新渲染 <img>
    act(() => {
      root.render(<Cover coverId={OTHER} size={64} className="cover--table" />)
    })
    expect(container.querySelector('.cover--placeholder')).toBeNull()
    expect(container.querySelector('img')?.getAttribute('src')).toBe(`wc-cover://${OTHER}?s=64`)

    act(() => {
      root.unmount()
    })
    container.remove()
  })
})
