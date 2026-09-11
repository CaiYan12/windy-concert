/**
 * favoritesStore 单测（jsdom project：位于 src/renderer/**）——T6.1 共享收藏切片。
 *
 * 形态：用 createFavoritesStore(deps) 工厂注入 getApi/warn 桩，避免依赖 window.api 与模块级单例，
 * 逐用例隔离；单例 useFavoritesStore 的接线由页面/播放栏组件用例覆盖。
 *
 * 覆盖点：toggle 乐观 + 回滚（含 warn）、ensureLoaded 幂等、refresh 排序透传 + 集合重建、
 * isFavorite、取消收藏乐观移除列表行、refresh 失败写 error、无 api 静默跳过。
 */
import { describe, expect, it, vi } from 'vitest'
import type { TrackRow } from '../../../shared/types'
import {
  createFavoritesStore,
  DEFAULT_FAVORITE_SORT,
  type FavoritesApi,
  type FavoritesState
} from './favoritesStore'

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
    favorite: true,
    playCount: 0,
    dateAdded: '2020-01-01T00:00:00Z',
    lastPlayedAt: null,
    favoritedAt: '2020-01-01T00:00:00Z'
  }
}

interface ApiHarness {
  listCalls: string[]
  setCalls: Array<[string, boolean]>
  api: FavoritesApi
}

function installApi(over: {
  list?: (sortBy: string) => Promise<TrackRow[]>
  set?: (trackId: string, favorite: boolean) => Promise<void>
} = {}): ApiHarness {
  const listCalls: string[] = []
  const setCalls: Array<[string, boolean]> = []
  const api: FavoritesApi = {
    favorites: {
      list: (sortBy) => {
        listCalls.push(sortBy)
        return over.list ? over.list(sortBy) : Promise.resolve([])
      },
      set: (trackId, favorite) => {
        setCalls.push([trackId, favorite])
        return over.set ? over.set(trackId, favorite) : Promise.resolve()
      }
    }
  }
  return { listCalls, setCalls, api }
}

function makeStore(harness: ApiHarness, warn = vi.fn()): {
  store: ReturnType<typeof createFavoritesStore>
  warn: ReturnType<typeof vi.fn>
} {
  const store = createFavoritesStore({ getApi: () => harness.api, warn })
  return { store, warn }
}

const state = (store: ReturnType<typeof createFavoritesStore>): FavoritesState => store.getState()

describe('favoritesStore.refresh / ensureLoaded', () => {
  it('refresh 透传 sortBy、重建集合与列表、loaded=true', async () => {
    const harness = installApi({ list: async () => [makeTrack('a'), makeTrack('b')] })
    const { store } = makeStore(harness)

    await state(store).refresh('playCount')

    expect(harness.listCalls).toEqual(['playCount'])
    expect(state(store).sortBy).toBe('playCount')
    expect([...state(store).favoriteIds].sort()).toEqual(['a', 'b'])
    expect(state(store).favorites.map((t) => t.id)).toEqual(['a', 'b'])
    expect(state(store).loaded).toBe(true)
    expect(state(store).loading).toBe(false)
    expect(state(store).error).toBeNull()
  })

  it('refresh 省略 sortBy 时沿用当前排序（默认 favorited_at）', async () => {
    const harness = installApi()
    const { store } = makeStore(harness)

    expect(state(store).sortBy).toBe(DEFAULT_FAVORITE_SORT)
    await state(store).refresh()

    expect(harness.listCalls).toEqual([DEFAULT_FAVORITE_SORT])
  })

  it('ensureLoaded 幂等：连续调用只发一次请求；已加载后不再请求', async () => {
    const harness = installApi({ list: async () => [makeTrack('a')] })
    const { store } = makeStore(harness)

    state(store).ensureLoaded()
    state(store).ensureLoaded()
    await Promise.resolve()
    await Promise.resolve()

    expect(harness.listCalls).toHaveLength(1)

    // 已 loaded：再次 ensureLoaded 为空操作。
    state(store).ensureLoaded()
    await Promise.resolve()
    expect(harness.listCalls).toHaveLength(1)
  })

  it('refresh 失败：写 error、不 rethrow、warn；loaded 保持 false 可重试', async () => {
    const harness = installApi({
      list: async () => {
        throw new Error('boom')
      }
    })
    const { store, warn } = makeStore(harness)

    await expect(state(store).refresh()).resolves.toBeUndefined()

    expect(state(store).error).toBe('boom')
    expect(state(store).loaded).toBe(false)
    expect(state(store).loading).toBe(false)
    expect(warn).toHaveBeenCalled()
  })

  it('无 api：refresh 静默跳过（warn）、不置 loading', async () => {
    const store = createFavoritesStore({ getApi: () => undefined, warn: vi.fn() })
    await expect(state(store).refresh()).resolves.toBeUndefined()
    expect(state(store).loading).toBe(false)
    expect(state(store).loaded).toBe(false)
  })
})

describe('favoritesStore.toggle', () => {
  it('乐观收藏：集合立即加入，并调 favorites.set(id,true)', async () => {
    const harness = installApi()
    const { store } = makeStore(harness)

    const p = state(store).toggle('a')
    // 乐观：await 前集合已更新。
    expect(state(store).isFavorite('a')).toBe(true)
    await p
    expect(harness.setCalls).toEqual([['a', true]])
    expect(state(store).isFavorite('a')).toBe(true)
  })

  it('乐观取消收藏：集合移除、并从 Liked 列表乐观移除该行', async () => {
    const harness = installApi({ list: async () => [makeTrack('a'), makeTrack('b')] })
    const { store } = makeStore(harness)
    await state(store).refresh()

    await state(store).toggle('a')

    expect(harness.setCalls).toEqual([['a', false]])
    expect(state(store).isFavorite('a')).toBe(false)
    expect(state(store).favorites.map((t) => t.id)).toEqual(['b'])
  })

  it('next 显式给值：忽略当前状态按 next 写入', async () => {
    const harness = installApi()
    const { store } = makeStore(harness)
    await state(store).toggle('a', true)
    await state(store).toggle('a', true) // 已是 true 再显式 true
    expect(harness.setCalls).toEqual([
      ['a', true],
      ['a', true]
    ])
  })

  it('失败回滚：api reject → 集合还原、列表行复原、warn', async () => {
    const harness = installApi({
      list: async () => [makeTrack('a'), makeTrack('b')],
      set: async () => {
        throw new Error('write failed')
      }
    })
    const { store, warn } = makeStore(harness)
    await state(store).refresh()

    await state(store).toggle('a')

    // 回滚：a 仍在集合与列表中。
    expect(state(store).isFavorite('a')).toBe(true)
    expect(state(store).favorites.map((t) => t.id).sort()).toEqual(['a', 'b'])
    expect(warn).toHaveBeenCalled()
  })

  it('无 api：忽略切换（不改状态）+ warn', async () => {
    const warn = vi.fn()
    const store = createFavoritesStore({ getApi: () => undefined, warn })
    await state(store).toggle('a')
    expect(state(store).isFavorite('a')).toBe(false)
    expect(warn).toHaveBeenCalled()
  })
})

describe('favoritesStore.isFavorite', () => {
  it('读集合：未收藏 false，收藏后 true，取消后 false', async () => {
    const harness = installApi()
    const { store } = makeStore(harness)
    expect(state(store).isFavorite('a')).toBe(false)
    await state(store).toggle('a')
    expect(state(store).isFavorite('a')).toBe(true)
    await state(store).toggle('a')
    expect(state(store).isFavorite('a')).toBe(false)
  })
})
