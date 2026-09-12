/**
 * CollageCover 单测（jsdom project）—— T6.4 歌单拼贴封面。
 *
 * jsdom 无 canvas 2d 也无布局测量，故此文件分两层：
 *   · 纯函数层（resolveCollageTiles / collageCellRect / drawCollage）用**假 2D 上下文**断言
 *     「取哪 4 格 / 每格落点 / 画图还是填占位」，把真实绘制能力从 jsdom 缺失中解耦；
 *   · 组件层用 renderToStaticMarkup + 一次最小客户端挂载，断言降级为「4 个 .cover 铺格」的
 *     DOM 拼贴形态（有 coverId 走 wc-cover、无则 cover--placeholder），且不产出 dataURL。
 */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CollageCover } from './CollageCover'
import {
  COLLAGE_PLACEHOLDER_COLOR,
  COLLAGE_TILE_COUNT,
  collageCellRect,
  createCollageCanvas,
  drawCollage,
  loadCollageImages,
  resolveCollageTiles,
  type CollageDrawContext
} from './collageCoverUtils'

const UUID_A = '123e4567-e89b-12d3-a456-426614174000'
const UUID_B = 'abcdefab-1234-5678-9abc-def012345678'

/**
 * 假 2D 上下文：只记录 fillRect / drawImage 调用，供绘制语义断言。
 * 用普通函数 + 调用记录（而非 vi.fn()）——CollageDrawContext 是带具体签名的结构性类型，
 * vi.fn() 的 Mock 类型与具名函数签名不兼容，硬转反而掩盖签名漂移。
 */
function makeFakeContext(): CollageDrawContext & {
  fillCalls: number[][]
  drawCalls: unknown[][]
} {
  const fillCalls: number[][] = []
  const drawCalls: unknown[][] = []
  return {
    fillStyle: '',
    fillCalls,
    drawCalls,
    fillRect(x, y, w, h) {
      fillCalls.push([x, y, w, h])
    },
    drawImage(image, dx, dy, dw, dh) {
      drawCalls.push([image, dx, dy, dw, dh])
    }
  }
}

const fakeImage = { tagName: 'IMG' } as unknown as CanvasImageSource

describe('resolveCollageTiles（纯函数）', () => {
  it('恒返回 4 格，取前 4 首的 coverId', () => {
    const tiles = resolveCollageTiles([
      { coverId: 'a' },
      { coverId: 'b' },
      { coverId: 'c' },
      { coverId: 'd' },
      { coverId: 'e' }
    ])
    expect(tiles).toEqual(['a', 'b', 'c', 'd'])
    expect(tiles).toHaveLength(COLLAGE_TILE_COUNT)
  })

  it('曲目不足 4 首 / 部分无封面 → 补 null', () => {
    expect(resolveCollageTiles([])).toEqual([null, null, null, null])
    expect(resolveCollageTiles([{ coverId: 'a' }, { coverId: null }])).toEqual([
      'a',
      null,
      null,
      null
    ])
  })
})

describe('collageCellRect（纯函数）', () => {
  it('256 画布：2×2 四格各 128，行优先', () => {
    expect(collageCellRect(0, 256)).toEqual({ x: 0, y: 0, w: 128, h: 128 })
    expect(collageCellRect(1, 256)).toEqual({ x: 128, y: 0, w: 128, h: 128 })
    expect(collageCellRect(2, 256)).toEqual({ x: 0, y: 128, w: 128, h: 128 })
    expect(collageCellRect(3, 256)).toEqual({ x: 128, y: 128, w: 128, h: 128 })
  })

  it('奇数尺寸：半宽取 floor，两列两行不重叠', () => {
    // 255 → half=127；右列起点 127，宽 127（右缘 254，留 1px）
    expect(collageCellRect(1, 255)).toEqual({ x: 127, y: 0, w: 127, h: 127 })
    expect(collageCellRect(3, 255)).toEqual({ x: 127, y: 127, w: 127, h: 127 })
  })
})

describe('drawCollage（假 2D 上下文）', () => {
  it('有位图的格子 drawImage 到对应落点', () => {
    const ctx = makeFakeContext()
    drawCollage(ctx, ['a', null, null, null], [fakeImage, null, null, null], 256)
    expect(ctx.drawCalls).toHaveLength(1)
    expect(ctx.drawCalls[0]).toEqual([fakeImage, 0, 0, 128, 128])
    // 其余三格填占位
    expect(ctx.fillCalls).toHaveLength(3)
  })

  it('无 coverId / 位图加载失败 → 该格填占位底色（不 drawImage）', () => {
    const ctx = makeFakeContext()
    // 第 0 格有 id 但位图加载失败（image=null）；第 1 格无 id（即便传入位图也必须是占位）；
    // 第 2/3 格有 id 且位图成功。
    drawCollage(ctx, ['a', null, 'c', 'd'], [null, fakeImage, fakeImage, fakeImage], 256)
    expect(ctx.drawCalls).toHaveLength(2)
    expect(ctx.fillCalls).toHaveLength(2)
    expect(ctx.fillCalls[0]).toEqual([0, 0, 128, 128])
    expect(ctx.fillCalls[1]).toEqual([128, 0, 128, 128])
  })

  it('占位填充色为 design-plan 指定的 --bg-input 烘焙值', () => {
    const ctx = makeFakeContext()
    drawCollage(ctx, [null, null, null, null], [null, null, null, null], 256)
    expect(ctx.fillStyle).toBe(COLLAGE_PLACEHOLDER_COLOR)
    expect(COLLAGE_PLACEHOLDER_COLOR).toBe('#242424')
  })

  it('4 格全部有位图 → 无占位填充', () => {
    const ctx = makeFakeContext()
    drawCollage(ctx, ['a', 'b', 'c', 'd'], [fakeImage, fakeImage, fakeImage, fakeImage], 256)
    expect(ctx.drawCalls).toHaveLength(4)
    expect(ctx.fillCalls).toHaveLength(0)
  })
})

describe('createCollageCanvas（环境探测）', () => {
  it('jsdom 无 canvas 2d → 返回 null（组件据此降级 DOM 拼贴）', () => {
    expect(createCollageCanvas(256)).toBeNull()
  })
})

describe('loadCollageImages', () => {
  it('无 coverId 的格子立即回 null（不建 Image）', async () => {
    const images = await loadCollageImages([null, null, null, null], 256)
    expect(images).toEqual([null, null, null, null])
  })

  it('有 coverId → 建 <img> 且 src 为 wc-cover 协议 URL', async () => {
    const created: HTMLImageElement[] = []
    const OriginalImage = globalThis.Image
    // 用一个最小替身捕获 src（jsdom 的 Image 不会真实加载，onload 永不触发）。
    class FakeImage {
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      private _src = ''
      constructor() {
        created.push(this as unknown as HTMLImageElement)
      }
      set src(value: string) {
        this._src = value
        // 模拟加载成功
        this.onload?.()
      }
      get src(): string {
        return this._src
      }
    }
    ;(globalThis as unknown as { Image: unknown }).Image = FakeImage
    try {
      const images = await loadCollageImages([UUID_A, null, null, null], 256)
      expect(created).toHaveLength(1)
      expect(created[0].src).toBe(`wc-cover://${UUID_A}?s=256`)
      expect(images[0]).toBe(created[0])
      expect(images.slice(1)).toEqual([null, null, null])
    } finally {
      ;(globalThis as unknown as { Image: unknown }).Image = OriginalImage
    }
  })
})

describe('CollageCover 渲染（SSR，降级 DOM 拼贴）', () => {
  it('无曲目 → 4 个占位 .cover--placeholder', () => {
    const html = renderToStaticMarkup(<CollageCover />)
    expect(html).toContain('class="collage-cover"')
    expect(html.match(/cover--placeholder/g)).toHaveLength(4)
    expect(html).toContain('music-2')
    expect(html).not.toContain('collage-cover-image')
  })

  it('有封面 → 4 格 .cover（前 4 首走 wc-cover，其余占位）', () => {
    const html = renderToStaticMarkup(
      <CollageCover tracks={[{ coverId: UUID_A }, { coverId: UUID_B }]} size={256} />
    )
    expect(html).toContain(`src="wc-cover://${UUID_A}?s=256"`)
    expect(html).toContain(`src="wc-cover://${UUID_B}?s=256"`)
    expect(html.match(/cover--placeholder/g)).toHaveLength(2)
  })

  it('className 组合进根节点；alt 提供时补 role=img + aria-label', () => {
    const html = renderToStaticMarkup(
      <CollageCover tracks={[{ coverId: UUID_A }]} className="cover--hero" alt="通勤 · 夜行" />
    )
    expect(html).toContain('class="collage-cover cover--hero"')
    expect(html).toContain('role="img"')
    expect(html).toContain('aria-label="通勤 · 夜行"')
  })

  it('请求档位随 size 透传（512 → s=512）', () => {
    const html = renderToStaticMarkup(
      <CollageCover tracks={[{ coverId: UUID_A }]} size={512} />
    )
    expect(html).toContain(`wc-cover://${UUID_A}?s=512`)
  })
})

describe('CollageCover 客户端挂载（jsdom 降级路径）', () => {
  it('挂载后仍为 DOM 拼贴（jsdom 无 canvas → 不产出 dataURL <img>）', () => {
    ;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    act(() => {
      root.render(<CollageCover tracks={[{ coverId: UUID_A }]} />)
    })

    expect(container.querySelector('.collage-cover')).not.toBeNull()
    expect(container.querySelector('.collage-cover-image')).toBeNull()
    expect(container.querySelectorAll('.cover')).toHaveLength(4)
    expect(container.querySelector(`img[src="wc-cover://${UUID_A}?s=256"]`)).not.toBeNull()

    act(() => {
      root.unmount()
    })
    container.remove()
  })
})
