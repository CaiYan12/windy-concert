/**
 * libraryStore 单测（jsdom project：位于 src/renderer/** 以匹配 vitest.config.ts 的 jsdom include）。
 *
 * 桩方式（对照 tests/unit/i18n/i18n.test.ts「在 globalThis.window 挂 api 桩」）：
 *   store 经 getApi() 惰性读 window.api，故每个用例先 installApi() 换桩、再显式驱动。
 *
 * 测试隔离（关键）：模块级 ensureScanProgressSubscription() 会跨用例累积订阅——
 *   beforeEach 先 stopScanProgressSubscription() 复位、并重置 store 状态；各用例 installApi()
 *   后自行 ensure 订阅。故无跨用例订阅泄漏，也无需 vi.resetModules / 动态 import。
 */
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ScanProgress, SortKey, SortOrder, TrackRow } from '../../../shared/types'
import {
  DEFAULT_LIBRARY_PARAMS,
  ensureScanProgressSubscription,
  stopScanProgressSubscription,
  useLibrary,
  useLibraryStore,
  type UseLibrary
} from './libraryStore'

// ---------------------------------------------------------------------------
// 桩与工具
// ---------------------------------------------------------------------------

type ListSongsParams = { sortBy: SortKey; order?: SortOrder; offset?: number; limit?: number }

interface StubApi {
  library: { listSongs: (p: ListSongsParams) => Promise<TrackRow[]> }
  onScanProgress: (cb: (p: ScanProgress) => void) => () => void
}

interface ApiHarness {
  /** listSongs 每次调用的入参（断言分页/排序参数）。 */
  calls: ListSongsParams[]
  /** onScanProgress 注册的回调（断言订阅次数 / 手动投递 scan:progress）。 */
  scanCbs: Array<(p: ScanProgress) => void>
  /** unsubscribe 被调用次数。 */
  unsubscribed: number
}

function setWindowApi(api: StubApi): void {
  ;(globalThis as unknown as { window: { api: StubApi } }).window.api = api
}

function installApi(listSongs?: (p: ListSongsParams) => Promise<TrackRow[]>): ApiHarness {
  const calls: ListSongsParams[] = []
  const scanCbs: Array<(p: ScanProgress) => void> = []
  const harness: ApiHarness = { calls, scanCbs, unsubscribed: 0 }
  const api: StubApi = {
    library: {
      listSongs: (p) => {
        calls.push(p)
        return listSongs ? listSongs(p) : Promise.resolve([])
      }
    },
    onScanProgress: (cb) => {
      scanCbs.push(cb)
      return () => {
        harness.unsubscribed += 1
      }
    }
  }
  setWindowApi(api)
  return harness
}

function makeTrack(id: string): TrackRow {
  return {
    id,
    title: `T${id}`,
    artistId: 1,
    artistName: 'Artist',
    albumId: 1,
    albumTitle: 'Album',
    albumArtist: 'Artist',
    trackNumber: 1,
    discNumber: 1,
    year: 2020,
    genre: 'Genre',
    duration: 100,
    filePath: `/music/${id}.flac`,
    format: 'flac',
    bitrate: 1000,
    sampleRate: 44100,
    bitDepth: 16,
    playable: true,
    status: 'available',
    coverId: null,
    favorite: false,
    playCount: 0,
    dateAdded: '2020-01-01T00:00:00Z',
    lastPlayedAt: null,
    favoritedAt: null
  }
}

function deferred<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason?: unknown) => void
} {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

const songs = (): TrackRow[] => useLibraryStore.getState().songs
const ids = (): string[] => songs().map((t) => t.id)

function resetStore(): void {
  useLibraryStore.setState({
    songs: [],
    loading: false,
    error: null,
    params: { ...DEFAULT_LIBRARY_PARAMS }
  })
}

beforeEach(() => {
  stopScanProgressSubscription() // 解除上一用例（或模块加载）可能残留的订阅
  resetStore()
  vi.spyOn(console, 'warn').mockImplementation(() => {}) // refresh 失败/无 api 会 warn，静音
})

// ---------------------------------------------------------------------------
// 用例
// ---------------------------------------------------------------------------

describe('libraryStore.refresh', () => {
  it('按默认参数拉取并把 songs set 进状态（loading 收尾、error 清空）', async () => {
    const rows = [makeTrack('a'), makeTrack('b')]
    const harness = installApi(async () => rows)

    await useLibraryStore.getState().refresh()

    expect(songs()).toEqual(rows)
    expect(useLibraryStore.getState().loading).toBe(false)
    expect(useLibraryStore.getState().error).toBeNull()
    // payload 为当前 params 快照
    expect(harness.calls).toEqual([{ sortBy: 'title', order: 'asc', offset: 0, limit: 50 }])
  })

  it('setSort 更新参数（offset 归零）并自动以新参数取数', async () => {
    const harness = installApi(async () => [])

    useLibraryStore.getState().setSort('year', 'desc')

    expect(useLibraryStore.getState().params).toEqual({
      sortBy: 'year',
      order: 'desc',
      offset: 0,
      limit: 50
    })
    // 自动 refresh：set 参数后 listSongs 立即以新参数发出，调用方无需显式 refresh
    expect(harness.calls).toEqual([{ sortBy: 'year', order: 'desc', offset: 0, limit: 50 }])
    await flush()
    expect(useLibraryStore.getState().loading).toBe(false)
  })

  it('setPage 自动以新分页取数；setSort 保留 limit 并把 offset 归零', async () => {
    const harness = installApi(async () => [])

    useLibraryStore.getState().setPage(100, 25)
    expect(harness.calls[0]).toEqual({ sortBy: 'title', order: 'asc', offset: 100, limit: 25 })

    await flush()
    // 换排序 = 回到首页：保留 limit，offset 归零
    useLibraryStore.getState().setSort('artist', 'asc')
    expect(harness.calls[1]).toEqual({ sortBy: 'artist', order: 'asc', offset: 0, limit: 25 })
  })

  it('setSort/setPage 确实触发 refresh（桩断言被调用次数与带出的新参数）', async () => {
    const harness = installApi(async () => [])
    const realRefresh = useLibraryStore.getState().refresh
    const spy = vi.fn(realRefresh) // 包一层真实 refresh：既观测触发，又保留真实取数
    useLibraryStore.setState({ refresh: spy })
    try {
      useLibraryStore.getState().setSort('duration', 'desc')
      expect(spy).toHaveBeenCalledTimes(1)

      useLibraryStore.getState().setPage(0, 10)
      expect(spy).toHaveBeenCalledTimes(2)

      await flush()
      expect(harness.calls).toEqual([
        { sortBy: 'duration', order: 'desc', offset: 0, limit: 50 },
        { sortBy: 'duration', order: 'desc', offset: 0, limit: 10 }
      ])
    } finally {
      useLibraryStore.setState({ refresh: realRefresh }) // 还原，避免桩泄漏到后续用例
    }
  })

  it('并发保护：连发两次 refresh，旧请求晚到不覆盖新结果（序号令牌）', async () => {
    const d1 = deferred<TrackRow[]>()
    const d2 = deferred<TrackRow[]>()
    const queue = [d1.promise, d2.promise]
    installApi(() => queue.shift() ?? Promise.resolve([]))

    const r1 = useLibraryStore.getState().refresh() // seq=1，等待 d1
    const r2 = useLibraryStore.getState().refresh() // seq=2，等待 d2

    d2.resolve([makeTrack('second')]) // 后发先到
    await r2
    expect(ids()).toEqual(['second'])

    d1.resolve([makeTrack('first')]) // 先发后到 → 应被丢弃
    await r1
    expect(ids()).toEqual(['second'])
  })

  it('并发保护（反向）：旧请求「失败」晚到不得覆盖新请求的成功状态', async () => {
    // 可控 promise：A（旧）慢、B（新）快——B 先成功，A 后 reject。
    const slowA = deferred<TrackRow[]>()
    const fastB = deferred<TrackRow[]>()
    const queue = [slowA.promise, fastB.promise]
    installApi(() => queue.shift() ?? Promise.resolve([]))

    const rA = useLibraryStore.getState().refresh() // seq=1，等待 slowA
    const rB = useLibraryStore.getState().refresh() // seq=2，等待 fastB

    fastB.resolve([makeTrack('new')]) // 新请求先成功
    await rB
    expect(ids()).toEqual(['new'])
    expect(useLibraryStore.getState().error).toBeNull()
    expect(useLibraryStore.getState().loading).toBe(false)

    slowA.reject(new Error('late-failure')) // 旧请求失败晚到
    await rA // 失败被 store 内部吞掉，不 reject 到调用方
    const state = useLibraryStore.getState()
    // 守护 refresh 的 catch 分支序号守卫：旧请求的失败必须被丢弃，不得污染新结果
    expect(state.error).toBeNull()
    expect(ids()).toEqual(['new'])
    expect(state.loading).toBe(false)
  })

  it('loading 转换：in-flight 为 true；新请求 settle 后 false；旧请求晚到被弃仍为 false', async () => {
    const slowA = deferred<TrackRow[]>()
    const fastB = deferred<TrackRow[]>()
    const queue = [slowA.promise, fastB.promise]
    installApi(() => queue.shift() ?? Promise.resolve([]))

    const rA = useLibraryStore.getState().refresh()
    expect(useLibraryStore.getState().loading).toBe(true) // in-flight（A）

    const rB = useLibraryStore.getState().refresh()
    expect(useLibraryStore.getState().loading).toBe(true) // in-flight（A 仍在飞，B 新发）

    fastB.resolve([makeTrack('new')])
    await rB
    expect(useLibraryStore.getState().loading).toBe(false) // 新请求 settle 收尾

    slowA.reject(new Error('late-failure'))
    await rA
    expect(useLibraryStore.getState().loading).toBe(false) // 被弃的旧请求不改动 loading
  })

  it('并发保护（反向）：旧请求晚到结算时新请求仍在飞 → 不得清 loading', async () => {
    const slowA = deferred<TrackRow[]>()
    const slowB = deferred<TrackRow[]>()
    const queue = [slowA.promise, slowB.promise]
    installApi(() => queue.shift() ?? Promise.resolve([]))

    const rA = useLibraryStore.getState().refresh() // seq=1
    const rB = useLibraryStore.getState().refresh() // seq=2，仍在飞
    expect(useLibraryStore.getState().loading).toBe(true)

    slowA.reject(new Error('late-failure')) // 旧请求失败晚到，新请求未 settle
    await rA
    // 守护 catch 序号守卫：旧请求不得把新请求的 in-flight loading 误清为 false
    expect(useLibraryStore.getState().loading).toBe(true)
    expect(useLibraryStore.getState().error).toBeNull()

    slowB.resolve([makeTrack('new')])
    await rB
    expect(useLibraryStore.getState().loading).toBe(false)
    expect(ids()).toEqual(['new'])
  })

  it('失败路径：api reject → error 置为消息、不抛、loading 收尾、保留旧 songs', async () => {
    useLibraryStore.setState({ songs: [makeTrack('keep')] })
    installApi(async () => {
      throw new Error('boom')
    })

    await expect(useLibraryStore.getState().refresh()).resolves.toBeUndefined()
    const state = useLibraryStore.getState()
    expect(state.error).toBe('boom')
    expect(state.loading).toBe(false)
    expect(ids()).toEqual(['keep'])
  })

  it('失败路径：非 Error 抛出经 toErrorMessage 归一（字符串原样）', async () => {
    installApi(async () => {
      throw 'plain-failure' // 非 Error：验证 toErrorMessage 的字符串分支
    })
    await useLibraryStore.getState().refresh()
    expect(useLibraryStore.getState().error).toBe('plain-failure')
  })

  it('window.api 缺失时静默跳过（不置 loading、不抛）', async () => {
    ;(globalThis as unknown as { window: { api?: StubApi } }).window.api = undefined
    await expect(useLibraryStore.getState().refresh()).resolves.toBeUndefined()
    expect(useLibraryStore.getState().loading).toBe(false)
    expect(songs()).toEqual([])
  })
})

describe('scan:progress 订阅', () => {
  it('done 相位触发 refresh；非 done 不触发', async () => {
    const harness = installApi(async () => [makeTrack('scanned')])
    ensureScanProgressSubscription()
    expect(harness.scanCbs).toHaveLength(1)

    harness.scanCbs[0]({ phase: 'parse', done: 1, total: 2, elapsedMs: 1 })
    await flush()
    expect(harness.calls).toHaveLength(0)
    expect(songs()).toEqual([])

    harness.scanCbs[0]({ phase: 'done', done: 2, total: 2, elapsedMs: 2 })
    await flush()
    expect(harness.calls).toHaveLength(1)
    expect(ids()).toEqual(['scanned'])
  })

  it('ensureScanProgressSubscription 幂等：重复调用只订阅一次', () => {
    const harness = installApi()
    ensureScanProgressSubscription()
    ensureScanProgressSubscription()
    expect(harness.scanCbs).toHaveLength(1)
  })

  it('stopScanProgressSubscription 解除订阅并允许后续重新订阅', () => {
    const first = installApi()
    ensureScanProgressSubscription()
    expect(first.scanCbs).toHaveLength(1)

    stopScanProgressSubscription()
    expect(first.unsubscribed).toBe(1)

    const second = installApi()
    ensureScanProgressSubscription()
    expect(second.scanCbs).toHaveLength(1)
  })
})

describe('useLibrary（useSyncExternalStore 适配）', () => {
  it('SSR 渲染下返回当前状态快照与动作', () => {
    useLibraryStore.setState({ songs: [makeTrack('h1')], loading: true, error: 'e' })

    let captured: UseLibrary | undefined
    const Probe = (): null => {
      captured = useLibrary()
      return null
    }
    renderToStaticMarkup(createElement(Probe))

    expect(captured).toBeDefined()
    expect(captured?.songs.map((t) => t.id)).toEqual(['h1'])
    expect(captured?.loading).toBe(true)
    expect(captured?.error).toBe('e')
    expect(captured?.params).toEqual(DEFAULT_LIBRARY_PARAMS)
    expect(typeof captured?.refresh).toBe('function')
    expect(typeof captured?.setSort).toBe('function')
    expect(typeof captured?.setPage).toBe('function')
  })
})
