/**
 * Recent 页单测（T6.5，jsdom project）——哨兵 i18n + 客户端挂载（无 @testing-library）。
 *
 * 形态（对照 Liked.test / Songs.test）：
 *   · window.api.history.listRecent 用可读写桩（返回用例行、记录 limit 实参）。
 *   · 时间列断言用真实 zh-CN 文案子集 + vi.useFakeTimers 固定 now——页面内部 new Date()
 *     被 fake timers 钉住，formatRelative 输出确定（分段正确性由 formatRelative.test
 *     单测穷尽，此处只锚定「页面确实渲染了相对时间列」）。
 *   · 服务端（repo）已按 MAX(id) 去重、played_at DESC 排序，页面按返回序呈现——
 *     桩数据直接给「去重后」的形态，断言行序 = 服务端序。
 */
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TrackRow } from '../../../shared/types'
import { useI18nStore } from '../i18n'
import { flushBrowse, installSentinelI18n, mountPage, resetBrowseApiData } from './browseFixtures'
import { RECENT_LIMIT, Recent } from './Recent'

function makeTrack(id: string, over: Partial<TrackRow> = {}): TrackRow {
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
    playCount: 1,
    dateAdded: '2020-01-01T00:00:00Z',
    lastPlayedAt: null,
    favoritedAt: null,
    ...over
  }
}

/** 用例读写：listRecent 返回行 + 记录 limit 实参（断言 RECENT_LIMIT 生效）。 */
let recentRows: TrackRow[] = []
let listRecentCalls: number[] = []
let failList = false

function installHistoryApi(): void {
  const w = globalThis.window as unknown as { api: Record<string, unknown> }
  w.api.history = {
    listRecent: async (limit: number): Promise<TrackRow[]> => {
      listRecentCalls.push(limit)
      if (failList) return Promise.reject(new Error('history failed'))
      return recentRows
    }
  }
}

/** 时间列文案所需的真实文案子集（哨兵不插值，相对时间列需真实模板）。 */
function installRealTimeMessages(): void {
  useI18nStore.setState({
    messages: {
      'recent.time.justNow': '刚刚',
      'recent.time.minutesAgo': '{n} 分钟前',
      'recent.time.today': '{time}',
      'recent.time.yesterday': '昨天 {time}',
      'recent.time.date': '{m} 月 {d} 日',
      'recent.time.dateYear': '{y} 年 {m} 月 {d} 日',
      'recent.time.unknown': '—'
    },
    loaded: true,
    language: 'zh-CN'
  })
}

const rows = (container: HTMLElement): HTMLElement[] =>
  Array.from(container.querySelectorAll<HTMLElement>('.track-table--recent .track-row:not(.track-row--head)'))

beforeEach(() => {
  installSentinelI18n()
  resetBrowseApiData()
  installHistoryApi()
  recentRows = []
  listRecentCalls = []
  failList = false
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

async function mountRecent(): Promise<{ container: HTMLElement; unmount: () => void }> {
  const page = mountPage(
    <MemoryRouter>
      <Recent />
    </MemoryRouter>
  )
  await flushBrowse()
  return page
}

describe('Recent 页取数（T6.5）', () => {
  it('挂载即调 history:listRecent，limit = RECENT_LIMIT（100）', async () => {
    recentRows = [makeTrack('a')]
    await mountRecent()
    expect(listRecentCalls).toEqual([RECENT_LIMIT])
    expect(RECENT_LIMIT).toBe(100)
  })

  it('渲染行序 = 服务端序（去重后最新在前），标题/艺术家/专辑如实呈现', async () => {
    // 桩给「去重后」形态：a 播过两次只剩最新一条，仍排最前。
    recentRows = [makeTrack('a', { lastPlayedAt: '2026-09-12 02:00:00' }), makeTrack('b', { lastPlayedAt: '2026-09-12 01:00:00' })]
    const page = await mountRecent()
    const r = rows(page.container)
    expect(r).toHaveLength(2)
    expect(r[0].querySelector('.track-title')!.textContent).toBe('Ta')
    expect(r[1].querySelector('.track-title')!.textContent).toBe('Tb')
    expect(r[0].textContent).toContain('Artist')
    expect(r[0].textContent).toContain('Album')
    page.unmount()
  })

  it('时间列渲染相对时间（fake timers 固定 now → 播放于 5 分钟前 → 「5 分钟前」）', async () => {
    // 固定「当前时刻」：本地 2026-09-12 10:30:00（fake timers 钉住页面内部 new Date()）。
    vi.useFakeTimers({ now: new Date(2026, 8, 12, 10, 30, 0) })
    const pad = (v: number): string => String(v).padStart(2, '0')
    const toSqliteUtc = (d: Date): string =>
      `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
      `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`
    const playedAt = toSqliteUtc(new Date(Date.now() - 5 * 60_000))
    installRealTimeMessages()
    recentRows = [makeTrack('a', { lastPlayedAt: playedAt })]
    const page = await mountRecent()
    const cell = page.container.querySelector<HTMLElement>('[data-field="played-at"]')
    expect(cell).not.toBeNull()
    expect(cell!.textContent).toBe('5 分钟前')
    page.unmount()
  })

  it('lastPlayedAt 为 null → 占位「—」（真实文案）', async () => {
    installRealTimeMessages()
    recentRows = [makeTrack('a', { lastPlayedAt: null })]
    const page = await mountRecent()
    expect(page.container.querySelector('[data-field="played-at"]')!.textContent).toBe('—')
    page.unmount()
  })
})

describe('Recent 页态（T6.5）', () => {
  it('空态：零记录文案 + history 图标 + 「开始播放」入口（哨兵键锚定）', async () => {
    const page = await mountRecent()
    expect(page.container.querySelector('.recent-empty')).not.toBeNull()
    expect(page.container.textContent).toContain('«empty.recent.title»')
    expect(page.container.textContent).toContain('«empty.recent.hint»')
    expect(page.container.querySelector('.recent-empty .recent-empty-icon')).not.toBeNull()
    expect(page.container.textContent).toContain('«empty.recent.action»')
    expect(page.container.querySelector('.track-table--recent')).toBeNull()
    page.unmount()
  })

  it('错误态：不渲染表头/假行', async () => {
    failList = true
    const page = await mountRecent()
    expect(page.container.textContent).toContain('«songs.error»')
    expect(page.container.querySelector('.track-table--recent')).toBeNull()
    page.unmount()
  })

  it('页头标题/副标题走 i18n（哨兵键锚定）', async () => {
    recentRows = [makeTrack('a')]
    const page = await mountRecent()
    expect(page.container.querySelector('.page-head h2')!.textContent).toBe('«nav.recent»')
    expect(page.container.querySelector('.page-head p')!.textContent).toBe('«recent.subtitle»')
    page.unmount()
  })
})
