/**
 * playlistsStore 单测（jsdom project：位于 src/renderer/**）——T6.2 / T6.3 歌单共享切片。
 *
 * 形态：用 createPlaylistsStore(deps) 工厂注入 getApi/warn 桩，避免依赖 window.api 与模块级单例，
 * 逐用例隔离；单例 usePlaylistsStore 的接线由页面/侧栏组件用例覆盖。
 *
 * 覆盖点：applyTrackOrder / orderTracksByIds 两个纯函数；列表段 refresh/ensureLoaded + 并发序号；
 * 详情段 loadDetail（换歌单清旧、旧响应丢弃）；create 空名拒绝 + 重入守卫 + refresh；
 * rename/remove/removeTrack/reorder 的乐观 + 回滚；addTracks 重取详情 + 刷新计数；无 api 静默跳过。
 */
import { describe, expect, it, vi } from 'vitest'
import type { TrackRow } from '../../../shared/types'
import type { PlaylistDetail, PlaylistRow } from '../../../main/database/repositories/playlistRepo'
import { makeTrack } from '../player/playerStubs'
import {
  applyTrackOrder,
  createPlaylistsStore,
  orderTracksByIds,
  type PlaylistsApi,
  type PlaylistsState
} from './playlistsStore'

function makePlaylist(id: number, name = `P${id}`, trackCount = 0): PlaylistRow {
  return {
    id,
    name,
    description: null,
    trackCount,
    // T6.4：派生拼贴封面字段（repo 层已随 T6.2 增补；此处给空数组即可）。
    coverIds: [],
    createdAt: '2020-01-01 00:00:00',
    updatedAt: '2020-01-01 00:00:00'
  }
}

function detail(id: number, tracks: TrackRow[], name = `P${id}`): PlaylistDetail {
  return { playlist: makePlaylist(id, name, tracks.length), tracks }
}

interface ApiHarness {
  listCalls: number
  getCalls: number[]
  createCalls: string[]
  renameCalls: Array<[number, string]>
  deleteCalls: number[]
  addTracksCalls: Array<[number, string[]]>
  removeTrackCalls: Array<[number, string]>
  reorderCalls: Array<[number, string[]]>
  api: PlaylistsApi
}

function installApi(
  over: {
    list?: () => Promise<PlaylistRow[]>
    get?: (id: number) => Promise<PlaylistDetail>
    create?: (name: string) => Promise<PlaylistRow>
    rename?: (id: number, name: string) => Promise<void>
    delete?: (id: number) => Promise<void>
    addTracks?: (id: number, trackIds: string[]) => Promise<void>
    removeTrack?: (id: number, trackId: string) => Promise<void>
    reorder?: (id: number, trackIds: string[]) => Promise<void>
  } = {}
): ApiHarness {
  const h: ApiHarness = {
    listCalls: 0,
    getCalls: [],
    createCalls: [],
    renameCalls: [],
    deleteCalls: [],
    addTracksCalls: [],
    removeTrackCalls: [],
    reorderCalls: [],
    api: null as unknown as PlaylistsApi
  }
  h.api = {
    playlists: {
      list: () => {
        h.listCalls += 1
        return over.list ? over.list() : Promise.resolve([])
      },
      get: (id) => {
        h.getCalls.push(id)
        return over.get ? over.get(id) : Promise.resolve({ playlist: null, tracks: [] })
      },
      create: (name) => {
        h.createCalls.push(name)
        return over.create ? over.create(name) : Promise.resolve(makePlaylist(1, name))
      },
      rename: (id, name) => {
        h.renameCalls.push([id, name])
        return over.rename ? over.rename(id, name) : Promise.resolve()
      },
      delete: (id) => {
        h.deleteCalls.push(id)
        return over.delete ? over.delete(id) : Promise.resolve()
      },
      addTracks: (id, trackIds) => {
        h.addTracksCalls.push([id, trackIds])
        return over.addTracks ? over.addTracks(id, trackIds) : Promise.resolve()
      },
      removeTrack: (id, trackId) => {
        h.removeTrackCalls.push([id, trackId])
        return over.removeTrack ? over.removeTrack(id, trackId) : Promise.resolve()
      },
      reorder: (id, trackIds) => {
        h.reorderCalls.push([id, trackIds])
        return over.reorder ? over.reorder(id, trackIds) : Promise.resolve()
      }
    }
  }
  return h
}

function makeStore(harness: ApiHarness, warn = vi.fn()): {
  store: ReturnType<typeof createPlaylistsStore>
  warn: ReturnType<typeof vi.fn>
} {
  const store = createPlaylistsStore({ getApi: () => harness.api, warn })
  return { store, warn }
}

const state = (store: ReturnType<typeof createPlaylistsStore>): PlaylistsState => store.getState()

// ---------------------------------------------------------------------------
// 纯函数
// ---------------------------------------------------------------------------

describe('applyTrackOrder（T6.3 拖拽重排纯函数）', () => {
  it('向下拖：from < to，插入到目标行上缘（目标行左移一位）', () => {
    // [a,b,c,d] 把 a(0) 插到 c(2) 之前 → [b,a,c,d]
    expect(applyTrackOrder(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'a', 'c', 'd'])
    // 拖到末行之前 → 目标行左移
    expect(applyTrackOrder(['a', 'b', 'c', 'd'], 1, 3)).toEqual(['a', 'c', 'b', 'd'])
  })

  it('向上拖：from > to，直接插入到 to 位置之前', () => {
    // [a,b,c,d] 把 d(3) 插到 b(1) 之前 → [a,d,b,c]
    expect(applyTrackOrder(['a', 'b', 'c', 'd'], 3, 1)).toEqual(['a', 'd', 'b', 'c'])
    expect(applyTrackOrder(['a', 'b', 'c', 'd'], 2, 0)).toEqual(['c', 'a', 'b', 'd'])
  })

  it('同 index / 越界 → 返回原数组引用（调用方据此判 no-op）', () => {
    const items = ['a', 'b', 'c']
    expect(applyTrackOrder(items, 1, 1)).toBe(items)
    expect(applyTrackOrder(items, -1, 1)).toBe(items)
    expect(applyTrackOrder(items, 0, 3)).toBe(items)
    expect(applyTrackOrder(items, 5, 0)).toBe(items)
    expect(applyTrackOrder([], 0, 0)).toEqual([])
  })

  it('相邻互换（拖到紧邻下一行之前 → 位置不变，符合上缘插入线语义）', () => {
    const items = ['a', 'b', 'c']
    // a(0) 插到 b(1) 之上 → a 本就在 b 之上 → 顺序不变
    expect(applyTrackOrder(items, 0, 1)).toEqual(['a', 'b', 'c'])
    // b(1) 插到 a(0) 之上 → 真正互换
    expect(applyTrackOrder(items, 1, 0)).toEqual(['b', 'a', 'c'])
  })

  it('不修改入参（返回新数组）', () => {
    const items = ['a', 'b', 'c']
    const next = applyTrackOrder(items, 0, 2)
    expect(items).toEqual(['a', 'b', 'c'])
    expect(next).not.toBe(items)
  })

  it('重复元素按位置移动（与 id 无关）', () => {
    const items = ['x', 'y', 'x', 'z']
    expect(applyTrackOrder(items, 2, 0)).toEqual(['x', 'x', 'y', 'z'])
  })
})

describe('orderTracksByIds（按 id 序列重排，重复曲目按序取出）', () => {
  it('保留重复曲目：按 trackIds 出现次序一一从桶里取', () => {
    const tracks = [makeTrack('t1'), makeTrack('t2'), makeTrack('t1')]
    const next = orderTracksByIds(tracks, ['t2', 't1', 't1'])
    expect(next.map((t) => t.id)).toEqual(['t2', 't1', 't1'])
  })

  it('trackIds 中不存在的 id 被忽略', () => {
    const tracks = [makeTrack('t1'), makeTrack('t2')]
    const next = orderTracksByIds(tracks, ['t2', 'ghost', 't1'])
    expect(next.map((t) => t.id)).toEqual(['t2', 't1'])
  })

  it('不修改入参', () => {
    const tracks = [makeTrack('t1'), makeTrack('t2')]
    orderTracksByIds(tracks, ['t2', 't1'])
    expect(tracks.map((t) => t.id)).toEqual(['t1', 't2'])
  })
})

// ---------------------------------------------------------------------------
// 列表段
// ---------------------------------------------------------------------------

describe('playlistsStore.refresh / ensureLoaded', () => {
  it('refresh 载入列表并置 listLoaded', async () => {
    const h = installApi({ list: async () => [makePlaylist(1, 'A'), makePlaylist(2, 'B')] })
    const { store } = makeStore(h)

    await state(store).refresh()

    expect(state(store).playlists.map((p) => p.name)).toEqual(['A', 'B'])
    expect(state(store).listLoaded).toBe(true)
    expect(state(store).listLoading).toBe(false)
    expect(state(store).listError).toBeNull()
  })

  it('ensureLoaded 幂等：连续调用只发一次；已加载后不再请求', async () => {
    const h = installApi({ list: async () => [makePlaylist(1)] })
    const { store } = makeStore(h)

    state(store).ensureLoaded()
    state(store).ensureLoaded()
    await Promise.resolve()
    await Promise.resolve()
    expect(h.listCalls).toBe(1)

    state(store).ensureLoaded()
    await Promise.resolve()
    expect(h.listCalls).toBe(1)
  })

  it('refresh 并发保护：旧请求晚到不覆盖新结果', async () => {
    let resolveFirst: ((rows: PlaylistRow[]) => void) | null = null
    const h = installApi({ list: async () => [makePlaylist(2, 'New')] })
    const first = new Promise<PlaylistRow[]>((resolve) => {
      resolveFirst = resolve
    })
    let call = 0
    h.api.playlists.list = () => {
      h.listCalls += 1
      call += 1
      if (call === 1) return first
      return Promise.resolve([makePlaylist(2, 'New')])
    }
    const { store } = makeStore(h)

    const p1 = state(store).refresh()
    const p2 = state(store).refresh()
    resolveFirst!([makePlaylist(1, 'Stale')])
    await Promise.all([p1, p2])

    expect(state(store).playlists.map((p) => p.name)).toEqual(['New'])
  })

  it('refresh 失败：写 listError、不 rethrow、warn；listLoaded 保持 false', async () => {
    const h = installApi({
      list: async () => {
        throw new Error('boom')
      }
    })
    const { store, warn } = makeStore(h)

    await expect(state(store).refresh()).resolves.toBeUndefined()

    expect(state(store).listError).toBe('boom')
    expect(state(store).listLoaded).toBe(false)
    expect(warn).toHaveBeenCalled()
  })

  it('无 api：refresh 静默跳过 + warn、不置 loading', async () => {
    const warn = vi.fn()
    const store = createPlaylistsStore({ getApi: () => undefined, warn })
    await state(store).refresh()
    expect(state(store).listLoading).toBe(false)
    expect(state(store).listLoaded).toBe(false)
    expect(warn).toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// 详情段
// ---------------------------------------------------------------------------

describe('playlistsStore.loadDetail', () => {
  it('载入详情：detailId / detail 就位', async () => {
    const tracks = [makeTrack('t1'), makeTrack('t2')]
    const h = installApi({ get: async (id) => detail(id, tracks) })
    const { store } = makeStore(h)

    await state(store).loadDetail(7)

    expect(state(store).detailId).toBe(7)
    expect(state(store).detail?.tracks.map((t) => t.id)).toEqual(['t1', 't2'])
    expect(state(store).detail?.playlist?.id).toBe(7)
    expect(state(store).detailLoading).toBe(false)
  })

  it('切换歌单：清空上一歌单曲目（避免闪现旧数据）', async () => {
    const h = installApi({
      get: async (id) => detail(id, [makeTrack(`t${id}`)])
    })
    const { store } = makeStore(h)
    await state(store).loadDetail(1)

    const p = state(store).loadDetail(2)
    // await 前：detailId 已切换、detail 已清空。
    expect(state(store).detailId).toBe(2)
    expect(state(store).detail).toBeNull()
    await p
    expect(state(store).detail?.tracks.map((t) => t.id)).toEqual(['t2'])
  })

  it('旧详情响应晚到被丢弃（并发序号）', async () => {
    let resolveFirst: ((d: PlaylistDetail) => void) | null = null
    const first = new Promise<PlaylistDetail>((resolve) => {
      resolveFirst = resolve
    })
    let call = 0
    const h = installApi()
    h.api.playlists.get = (id) => {
      h.getCalls.push(id)
      call += 1
      if (call === 1) return first
      return Promise.resolve(detail(id, [makeTrack(`t${id}`)]))
    }
    const { store } = makeStore(h)

    const p1 = state(store).loadDetail(1)
    const p2 = state(store).loadDetail(2)
    resolveFirst!(detail(1, [makeTrack('t1')]))
    await Promise.all([p1, p2])

    expect(state(store).detail?.playlist?.id).toBe(2)
  })

  it('详情失败：写 detailError + warn', async () => {
    const h = installApi({
      get: async () => {
        throw new Error('detail boom')
      }
    })
    const { store, warn } = makeStore(h)
    await state(store).loadDetail(3)
    expect(state(store).detailError).toBe('detail boom')
    expect(state(store).detailLoading).toBe(false)
    expect(warn).toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// 写操作
// ---------------------------------------------------------------------------

describe('playlistsStore.create', () => {
  it('trim 后提交、成功后刷新列表并返回新行', async () => {
    const h = installApi({
      create: async (name) => makePlaylist(9, name),
      list: async () => [makePlaylist(9, '旅程')]
    })
    const { store } = makeStore(h)

    const row = await state(store).create('  旅程  ')

    expect(h.createCalls).toEqual(['旅程'])
    expect(row?.id).toBe(9)
    expect(state(store).playlists.map((p) => p.name)).toEqual(['旅程'])
    expect(state(store).creating).toBe(false)
  })

  it('空名 / 全空白拒绝：不发请求、返回 null', async () => {
    const h = installApi()
    const { store } = makeStore(h)
    expect(await state(store).create('')).toBeNull()
    expect(await state(store).create('   ')).toBeNull()
    expect(h.createCalls).toEqual([])
  })

  it('重入守卫：create 在飞时再次调用不发第二次请求', async () => {
    let release: (() => void) | null = null
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const h = installApi({
      create: async (name) => {
        await gate
        return makePlaylist(1, name)
      }
    })
    const { store } = makeStore(h)

    const p1 = state(store).create('A')
    expect(state(store).creating).toBe(true)
    const second = await state(store).create('B')
    expect(second).toBeNull()
    release!()
    await p1
    expect(h.createCalls).toEqual(['A'])
  })

  it('失败：返回 null + warn、creating 复位', async () => {
    const h = installApi({
      create: async () => {
        throw new Error('nope')
      }
    })
    const { store, warn } = makeStore(h)
    expect(await state(store).create('X')).toBeNull()
    expect(warn).toHaveBeenCalled()
    expect(state(store).creating).toBe(false)
  })
})

describe('playlistsStore.rename', () => {
  it('乐观更新列表行 + 详情标题；成功返回 true', async () => {
    const h = installApi({
      list: async () => [makePlaylist(1, '旧名')],
      get: async (id) => detail(id, [makeTrack('t1')], '旧名')
    })
    const { store } = makeStore(h)
    await state(store).refresh()
    await state(store).loadDetail(1)

    const p = state(store).rename(1, '新名')
    // 乐观：await 前已改。
    expect(state(store).playlists[0].name).toBe('新名')
    expect(state(store).detail?.playlist?.name).toBe('新名')
    await expect(p).resolves.toBe(true)
    expect(h.renameCalls).toEqual([[1, '新名']])
  })

  it('失败回滚列表与详情 + warn', async () => {
    const h = installApi({
      list: async () => [makePlaylist(1, '旧名')],
      get: async (id) => detail(id, [], '旧名'),
      rename: async () => {
        throw new Error('rename failed')
      }
    })
    const { store, warn } = makeStore(h)
    await state(store).refresh()
    await state(store).loadDetail(1)

    await expect(state(store).rename(1, '新名')).resolves.toBe(false)

    expect(state(store).playlists[0].name).toBe('旧名')
    expect(state(store).detail?.playlist?.name).toBe('旧名')
    expect(warn).toHaveBeenCalled()
  })

  it('空名拒绝：不发请求', async () => {
    const h = installApi()
    const { store } = makeStore(h)
    expect(await state(store).rename(1, '  ')).toBe(false)
    expect(h.renameCalls).toEqual([])
  })
})

describe('playlistsStore.remove', () => {
  it('乐观从列表移除；成功返回 true', async () => {
    const h = installApi({ list: async () => [makePlaylist(1, 'A'), makePlaylist(2, 'B')] })
    const { store } = makeStore(h)
    await state(store).refresh()

    const p = state(store).remove(1)
    expect(state(store).playlists.map((p2) => p2.id)).toEqual([2])
    await expect(p).resolves.toBe(true)
    expect(h.deleteCalls).toEqual([1])
  })

  it('失败回滚列表 + warn', async () => {
    const h = installApi({
      list: async () => [makePlaylist(1, 'A'), makePlaylist(2, 'B')],
      delete: async () => {
        throw new Error('delete failed')
      }
    })
    const { store, warn } = makeStore(h)
    await state(store).refresh()

    await expect(state(store).remove(1)).resolves.toBe(false)

    expect(state(store).playlists.map((p) => p.id)).toEqual([1, 2])
    expect(warn).toHaveBeenCalled()
  })
})

describe('playlistsStore.addTracks', () => {
  it('调用 addTracks，随后重取详情并刷新列表计数', async () => {
    const tracks = [makeTrack('t1'), makeTrack('t2')]
    let detailLoaded = 0
    const h = installApi({
      get: async (id) => {
        detailLoaded += 1
        return detail(id, tracks)
      },
      list: async () => [makePlaylist(1, 'P1', tracks.length)]
    })
    const { store } = makeStore(h)
    await state(store).loadDetail(1)

    await expect(state(store).addTracks(1, ['t2'])).resolves.toBe(true)

    expect(h.addTracksCalls).toEqual([[1, ['t2']]])
    // 详情重取（第二次 get）+ 列表刷新。
    expect(detailLoaded).toBe(2)
    expect(state(store).detail?.tracks.length).toBe(2)
    expect(state(store).playlists[0].trackCount).toBe(2)
  })

  it('空数组：不发请求、返回 false', async () => {
    const h = installApi()
    const { store } = makeStore(h)
    expect(await state(store).addTracks(1, [])).toBe(false)
    expect(h.addTracksCalls).toEqual([])
  })

  it('失败：返回 false + warn，不重取详情', async () => {
    const h = installApi({
      addTracks: async () => {
        throw new Error('fk')
      }
    })
    const { store, warn } = makeStore(h)
    await expect(state(store).addTracks(1, ['t1'])).resolves.toBe(false)
    expect(h.getCalls).toEqual([])
    expect(warn).toHaveBeenCalled()
  })
})

describe('playlistsStore.removeTrack', () => {
  it('乐观移除最小 index 的一次出现 + 计数 -1；成功返回 true', async () => {
    const tracks = [makeTrack('t1'), makeTrack('t2'), makeTrack('t1')]
    const h = installApi({ get: async (id) => detail(id, tracks) })
    const { store } = makeStore(h)
    await state(store).loadDetail(1)
    await state(store).refresh()

    const p = state(store).removeTrack(1, 't1')
    // 乐观：只删第一条 t1。
    expect(state(store).detail?.tracks.map((t) => t.id)).toEqual(['t2', 't1'])
    expect(state(store).detail?.playlist?.trackCount).toBe(2)
    await expect(p).resolves.toBe(true)
    expect(h.removeTrackCalls).toEqual([[1, 't1']])
  })

  it('失败回滚详情与列表 + warn', async () => {
    const tracks = [makeTrack('t1'), makeTrack('t2')]
    const h = installApi({
      get: async (id) => detail(id, tracks),
      list: async () => [makePlaylist(1, 'P1', 2)],
      removeTrack: async () => {
        throw new Error('remove failed')
      }
    })
    const { store, warn } = makeStore(h)
    await state(store).loadDetail(1)
    await state(store).refresh()

    await expect(state(store).removeTrack(1, 't1')).resolves.toBe(false)

    expect(state(store).detail?.tracks.map((t) => t.id)).toEqual(['t1', 't2'])
    expect(state(store).playlists[0].trackCount).toBe(2)
    expect(warn).toHaveBeenCalled()
  })

  it('详情非当前歌单时：仍发请求但不改本地详情', async () => {
    const h = installApi({ get: async (id) => detail(id, [makeTrack('t9')]) })
    const { store } = makeStore(h)
    await state(store).loadDetail(5)

    await state(store).removeTrack(9, 'nope')

    expect(state(store).detail?.playlist?.id).toBe(5)
    expect(h.removeTrackCalls).toEqual([[9, 'nope']])
  })
})

describe('playlistsStore.reorder', () => {
  it('乐观按 id 序列重排详情（含重复曲目）；成功返回 true', async () => {
    const tracks = [makeTrack('t1'), makeTrack('t2'), makeTrack('t1')]
    const h = installApi({ get: async (id) => detail(id, tracks) })
    const { store } = makeStore(h)
    await state(store).loadDetail(1)

    const p = state(store).reorder(1, ['t2', 't1', 't1'])
    expect(state(store).detail?.tracks.map((t) => t.id)).toEqual(['t2', 't1', 't1'])
    await expect(p).resolves.toBe(true)
    expect(h.reorderCalls).toEqual([[1, ['t2', 't1', 't1']]])
  })

  it('空数组拒绝：不发请求（与 repo 守卫同口径，绝不整表清空）', async () => {
    const h = installApi({ get: async (id) => detail(id, [makeTrack('t1')]) })
    const { store } = makeStore(h)
    await state(store).loadDetail(1)

    expect(await state(store).reorder(1, [])).toBe(false)
    expect(h.reorderCalls).toEqual([])
    expect(state(store).detail?.tracks.map((t) => t.id)).toEqual(['t1'])
  })

  it('失败回滚详情顺序 + warn', async () => {
    const tracks = [makeTrack('t1'), makeTrack('t2')]
    const h = installApi({
      get: async (id) => detail(id, tracks),
      reorder: async () => {
        throw new Error('reorder failed')
      }
    })
    const { store, warn } = makeStore(h)
    await state(store).loadDetail(1)

    await expect(state(store).reorder(1, ['t2', 't1'])).resolves.toBe(false)

    expect(state(store).detail?.tracks.map((t) => t.id)).toEqual(['t1', 't2'])
    expect(warn).toHaveBeenCalled()
  })
})
