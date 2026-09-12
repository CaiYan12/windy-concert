/**
 * 歌单页接线单测（T6.2 / T6.3，jsdom project）——Playlists 网格页 × PlaylistDetail 详情页。
 *
 * 难点与对策同 pageWiring.test.tsx：TrackList 用 react-virtuoso，jsdom 无布局测量不挂行；
 * 此处 vi.mock('react-virtuoso') 把列表退化为「直接 map 渲染 itemContent」，从而在单测里
 * 派发行级事件（拖拽 dragstart/dragover/drop、右键 contextmenu、双击 dblclick）。
 *
 * 隔离：
 *   · window.api 由 browseFixtures 建桩、playlistFixtures 补 playlists 八通道（import 顺序约定见两文件头）；
 *   · playlistsStore 应用单例逐用例 setState 复位（页面经单例取数，无注入点）；
 *   · playerStore.loadContext / toastStore.showToast 一律 spy 成 no-op，只断言「页面以正确参数调用」，
 *     不触发真实播放副作用。
 */
// ⚠️ 顺序约定（必须）：browseFixtures 要在**所有**其它 import 之前求值——它在模块顶层装好
// window.api 桩，而 client.ts 的 `api = window.api` 是在模块求值时捕获引用的；若
// playlistsStore（它 `import { toErrorMessage } from '../ipc/client'`）先被求值，api 会被定格为
// undefined，页面的 api.playlists.get(...) 将抛 TypeError 并被页内 try/catch 吞成 toast。
import './browseFixtures'
import { installSentinelI18n, mountPage, resetBrowseApiData } from './browseFixtures'
import { playlistApiData, resetPlaylistApiData, seedPlaylist } from './playlistFixtures'

import { act, type ReactElement } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TrackRow } from '../../../shared/types'
import { makeTrack } from '../player/playerStubs'
import { usePlayerStore } from '../stores/playerStore'
import { usePlaylistsStore } from '../stores/playlistsStore'
import { useToastStore } from '../stores/toastStore'
import { Playlists } from './Playlists'
import { PlaylistDetail } from './PlaylistDetail'

// 退化为「直接渲染全部 itemContent」——jsdom 无布局测量，真实 Virtuoso 不挂载行。
vi.mock('react-virtuoso', () => ({
  Virtuoso: ({
    data,
    itemContent,
    components
  }: {
    data: TrackRow[]
    itemContent: (index: number, item: TrackRow) => ReactElement
    components?: { Header?: () => ReactElement }
  }) => (
    <div className="track-list-scroll">
      {components?.Header ? <components.Header /> : null}
      {data.map((item, index) => (
        <div key={index}>{itemContent(index, item)}</div>
      ))}
    </div>
  )
}))

/** 微任务冲刷：store 动作（refresh/loadDetail/create…）链落地。 */
async function flush(times = 8): Promise<void> {
  await act(async () => {
    for (let i = 0; i < times; i += 1) await Promise.resolve()
  })
}

function click(el: Element): void {
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

function dblClick(el: Element): void {
  act(() => {
    el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
  })
}

function rightClick(el: Element): void {
  act(() => {
    el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }))
  })
}

function dragEvent(el: Element, type: 'dragstart' | 'dragover' | 'drop' | 'dragend'): void {
  act(() => {
    el.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }))
  })
}

/** 受控输入写值（React 19：走原型 setter + input 事件，否则 React 收不到变更）。 */
function typeInto(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  setter?.call(input, value)
  act(() => {
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

function submitForm(form: HTMLFormElement): void {
  act(() => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  })
}

/** 取容器内全部曲目行（排除表头）。 */
function rows(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>('.track-row:not(.track-row--head)'))
}

function renderPlaylists(): ReactElement {
  return (
    <MemoryRouter initialEntries={['/playlists']}>
      <Routes>
        <Route path="/playlists" element={<Playlists />} />
        <Route path="/playlists/:id" element={<div data-testid="detail-route" />} />
      </Routes>
    </MemoryRouter>
  )
}

function renderDetail(id: number): ReactElement {
  return (
    <MemoryRouter initialEntries={[`/playlists/${id}`]}>
      <Routes>
        <Route path="/playlists" element={<div data-testid="list-route" />} />
        <Route path="/playlists/:id" element={<PlaylistDetail />} />
      </Routes>
    </MemoryRouter>
  )
}

/** 歌单详情页里按文案找按钮（页内按钮文案均为哨兵 i18n 的 «key»）。 */
function buttonByText(container: HTMLElement, text: string): HTMLButtonElement {
  const found = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(
    (el) => el.textContent?.includes(text)
  )
  if (!found) throw new Error(`未找到文案含 ${text} 的按钮`)
  return found
}

let loadContextSpy: ReturnType<typeof vi.spyOn>
let showToastSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  installSentinelI18n()
  resetBrowseApiData()
  resetPlaylistApiData()
  usePlaylistsStore.setState({
    playlists: [],
    listLoading: false,
    listError: null,
    listLoaded: false,
    creating: false,
    detailId: null,
    detail: null,
    detailLoading: false,
    detailError: null
  })
  loadContextSpy = vi
    .spyOn(usePlayerStore.getState(), 'loadContext')
    .mockImplementation(() => undefined)
  showToastSpy = vi.spyOn(useToastStore.getState(), 'showToast').mockImplementation(() => undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

// ---------------------------------------------------------------------------
// Playlists 网格页
// ---------------------------------------------------------------------------
describe('Playlists 页（T6.2）', () => {
  it('渲染歌单卡与虚线新建卡（卡片标题/曲目数取自真实列表）', async () => {
    seedPlaylist('通勤', [makeTrack('a'), makeTrack('b')], ['c1', 'c2'])
    seedPlaylist('夜行', [makeTrack('c')], ['c3'])
    const page = mountPage(renderPlaylists())
    await flush()

    const cards = page.container.querySelectorAll('.playlist-card')
    expect(cards).toHaveLength(2)
    expect(page.container.querySelectorAll('.new-card')).toHaveLength(1)
    // list() 按 name ASC 返回：通勤 > 夜行（中文按码点，'夜' < '通' → 夜行在前）。
    const titles = Array.from(page.container.querySelectorAll('.card-title')).map(
      (el) => el.textContent
    )
    expect(titles.sort()).toEqual(['夜行', '通勤'])
    expect(page.container.textContent).toContain('«playlists.cardMeta»')
    page.unmount()
  })

  it('点新建卡 → 出现内联输入框；Enter 提交 → create 收到输入名并跳详情', async () => {
    const page = mountPage(renderPlaylists())
    await flush()

    click(page.container.querySelector('.new-card') as Element)
    const input = page.container.querySelector<HTMLInputElement>('.inline-input')
    expect(input).not.toBeNull()

    typeInto(input as HTMLInputElement, '  通勤 · 夜行  ')
    submitForm(page.container.querySelector('form.new-card--editing') as HTMLFormElement)
    await flush()

    // 名称已 trim（与 store/IPC 校验同口径）。
    expect(playlistApiData.createCalls).toEqual(['通勤 · 夜行'])
    expect(page.container.querySelector('[data-testid="detail-route"]')).not.toBeNull()
    page.unmount()
  })

  it('空名 Enter → 回退默认名（未命名歌单），不留空名请求', async () => {
    const page = mountPage(renderPlaylists())
    await flush()

    click(page.container.querySelector('.new-card') as Element)
    submitForm(page.container.querySelector('form.new-card--editing') as HTMLFormElement)
    await flush()

    expect(playlistApiData.createCalls).toEqual(['«nav.playlists.untitled»'])
    page.unmount()
  })

  it('Escape 取消命名 → 输入框收起且未创建', async () => {
    const page = mountPage(renderPlaylists())
    await flush()

    click(page.container.querySelector('.new-card') as Element)
    const input = page.container.querySelector<HTMLInputElement>('.inline-input') as HTMLInputElement
    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })

    expect(page.container.querySelector('.inline-input')).toBeNull()
    expect(playlistApiData.createCalls).toEqual([])
    page.unmount()
  })

  it('零歌单 → 空态文案 + 新建卡仍在（空态唯一行动点）', async () => {
    const page = mountPage(renderPlaylists())
    await flush()

    expect(page.container.textContent).toContain('«empty.playlists.title»')
    expect(page.container.querySelectorAll('.playlist-card')).toHaveLength(0)
    expect(page.container.querySelectorAll('.new-card')).toHaveLength(1)
    page.unmount()
  })

  it('卡片播放钮 → 取该歌单详情后整队播放（trackCount 为 0 时不渲染播放钮）', async () => {
    const tracks = [makeTrack('a'), makeTrack('b')]
    seedPlaylist('通勤', tracks, [])
    seedPlaylist('空单', [], [])
    const page = mountPage(renderPlaylists())
    await flush()

    // 两张卡里只有「通勤」有播放钮。
    const playButtons = page.container.querySelectorAll('.card-play')
    expect(playButtons).toHaveLength(1)
    click(playButtons[0])
    await flush()

    expect(playlistApiData.getCalls).toHaveLength(1)
    expect(loadContextSpy).toHaveBeenCalledWith(tracks, 0)
    page.unmount()
  })
})

// ---------------------------------------------------------------------------
// PlaylistDetail 详情页
// ---------------------------------------------------------------------------
describe('PlaylistDetail 页（T6.2 / T6.3）', () => {
  it('渲染 Hero（歌单名）与可拖拽曲目表（每行带 grip 手柄）', async () => {
    const tracks = [makeTrack('a'), makeTrack('b'), makeTrack('c')]
    const row = seedPlaylist('通勤', tracks, ['c1', 'c2'])
    const page = mountPage(renderDetail(row.id))
    await flush()

    expect(page.container.querySelector('.hero h2')?.textContent).toBe('通勤')
    const list = rows(page.container)
    expect(list).toHaveLength(3)
    expect(list[0].querySelector('.drag-handle')).not.toBeNull()
    expect(list[0].getAttribute('draggable')).toBe('true')
    page.unmount()
  })

  it('双击标题 → 内联重命名；Enter 提交调 rename 并 toast', async () => {
    const row = seedPlaylist('通勤', [makeTrack('a')], [])
    const page = mountPage(renderDetail(row.id))
    await flush()

    dblClick(page.container.querySelector('.hero h2') as Element)
    const input = page.container.querySelector<HTMLInputElement>('.hero-rename .inline-input')
    expect(input).not.toBeNull()
    expect(input?.value).toBe('通勤')

    typeInto(input as HTMLInputElement, '华语女声')
    submitForm(page.container.querySelector('form.hero-rename') as HTMLFormElement)
    await flush()

    expect(playlistApiData.renameCalls).toEqual([[row.id, '华语女声']])
    expect(showToastSpy).toHaveBeenCalledWith('«toast.playlistRenamed»')
    // 提交后收起输入框，标题回到普通 <h2>。
    expect(page.container.querySelector('.hero-rename')).toBeNull()
    page.unmount()
  })

  it('重命名去空/未改动 → 不发请求直接收起', async () => {
    const row = seedPlaylist('通勤', [makeTrack('a')], [])
    const page = mountPage(renderDetail(row.id))
    await flush()

    dblClick(page.container.querySelector('.hero h2') as Element)
    const input = page.container.querySelector<HTMLInputElement>('.hero-rename .inline-input')
    typeInto(input as HTMLInputElement, '   ')
    submitForm(page.container.querySelector('form.hero-rename') as HTMLFormElement)
    await flush()

    expect(playlistApiData.renameCalls).toEqual([])
    expect(showToastSpy).not.toHaveBeenCalled()
    page.unmount()
  })

  it('删除 → 行内确认条（.inline-confirm + danger-text）；取消即收起', async () => {
    const row = seedPlaylist('通勤', [makeTrack('a')], [])
    const page = mountPage(renderDetail(row.id))
    await flush()

    expect(page.container.querySelector('.inline-confirm')).toBeNull()
    click(page.container.querySelector('.hero-actions .danger-text') as Element)

    const bar = page.container.querySelector('.inline-confirm')
    expect(bar).not.toBeNull()
    expect(bar?.querySelector('.danger-text')?.textContent).toContain('«playlists.deleteConfirmAction»')

    click(buttonByText(page.container, '«common.cancel»'))
    expect(page.container.querySelector('.inline-confirm')).toBeNull()
    expect(playlistApiData.deleteCalls).toEqual([])
    page.unmount()
  })

  it('确认条 3s 自动收回（不点也要收回，避免常驻危险操作）', async () => {
    const row = seedPlaylist('通勤', [makeTrack('a')], [])
    const page = mountPage(renderDetail(row.id))
    await flush()

    vi.useFakeTimers()
    click(page.container.querySelector('.hero-actions .danger-text') as Element)
    expect(page.container.querySelector('.inline-confirm')).not.toBeNull()

    // 2999ms 仍在；3000ms 收回。
    act(() => {
      vi.advanceTimersByTime(2999)
    })
    expect(page.container.querySelector('.inline-confirm')).not.toBeNull()
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(page.container.querySelector('.inline-confirm')).toBeNull()
    page.unmount()
  })

  it('确认删除 → delete 调用 + toast + 返回歌单列表', async () => {
    const row = seedPlaylist('通勤', [makeTrack('a')], [])
    const page = mountPage(renderDetail(row.id))
    await flush()

    click(page.container.querySelector('.hero-actions .danger-text') as Element)
    click(buttonByText(page.container, '«playlists.deleteConfirmAction»'))
    await flush()

    expect(playlistApiData.deleteCalls).toEqual([row.id])
    expect(showToastSpy).toHaveBeenCalledWith('«toast.playlistDeleted»')
    expect(page.container.querySelector('[data-testid="list-route"]')).not.toBeNull()
    page.unmount()
  })

  it('右键「从歌单中移除」→ removeTrack（乐观移除 + toast）', async () => {
    const tracks = [makeTrack('a'), makeTrack('b')]
    const row = seedPlaylist('通勤', tracks, [])
    const page = mountPage(renderDetail(row.id))
    await flush()

    rightClick(rows(page.container)[1])
    const menu = page.container.querySelector<HTMLElement>('.context-menu')
    expect(menu).not.toBeNull()
    click(buttonByText(menu as HTMLElement, '«menu.removeFromPlaylist»'))
    await flush()

    expect(playlistApiData.removeTrackCalls).toEqual([[row.id, 'b']])
    expect(showToastSpy).toHaveBeenCalledWith('«toast.removedFromPlaylist»')
    // 乐观移除后本地只剩一行（无需重取详情）。
    expect(rows(page.container)).toHaveLength(1)
    page.unmount()
  })

  it('拖拽 drop → 按「插入到目标行上缘」重排并全量持久化', async () => {
    const tracks = [makeTrack('a'), makeTrack('b'), makeTrack('c')]
    const row = seedPlaylist('通勤', tracks, [])
    const page = mountPage(renderDetail(row.id))
    await flush()

    const list = rows(page.container)
    dragEvent(list[0], 'dragstart')
    expect(rows(page.container)[0].classList.contains('is-dragging')).toBe(true)
    dragEvent(list[2], 'dragover')
    dragEvent(list[2], 'drop')
    await flush()

    // from=0 落到 index 2 的上缘 → [b, a, c]（applyTrackOrder 语义）。
    expect(playlistApiData.reorderCalls).toEqual([[row.id, ['b', 'a', 'c']]])
    page.unmount()
  })

  it('歌单不存在（repo 返回 playlist: null）→ notFound 空态', async () => {
    const page = mountPage(renderDetail(999999))
    await flush()

    expect(page.container.textContent).toContain('«playlistDetail.notFound»')
    page.unmount()
  })

  it('空歌单（零曲目）→ 保留 Hero 并给出空态 + 浏览歌曲入口', async () => {
    const row = seedPlaylist('空单', [], [])
    const page = mountPage(renderDetail(row.id))
    await flush()

    expect(page.container.querySelector('.hero h2')?.textContent).toBe('空单')
    expect(page.container.textContent).toContain('«empty.playlistDetail.title»')
    expect(page.container.querySelectorAll('.track-row:not(.track-row--head)')).toHaveLength(0)
    page.unmount()
  })
})
