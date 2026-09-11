/**
 * TrackList favoriteIds 派生（T6.1 评审 M2 锚点）。
 *
 * 为什么单独成文件：TrackList 的数据行由 virtuoso 渲染（jsdom 无布局时零行），需文件级
 * vi.mock('react-virtuoso') 最小替身（同 TrackList.focus.test.tsx 形态）；职责上本文件只锚
 * 「行内 ♡/♥ 的收藏态以 favoriteIds 切片为准、省略时回退 track.favorite」这一机制——
 * 评审 M2 变异（移除派生、直接传原 track）此前全绿无锚，本文件使该变异必红。
 */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TrackRow } from '../../../shared/types'
import { useI18nStore } from '../i18n'
import { TrackList } from './TrackList'

vi.mock('react-virtuoso', () => ({
  Virtuoso: function VirtuosoMock({
    data,
    itemContent,
    computeItemKey,
    components
  }: {
    data: readonly unknown[]
    itemContent: (index: number, item: unknown) => React.ReactNode
    computeItemKey: (index: number, item: unknown) => string | number
    components?: { Header?: React.ComponentType | null }
  }) {
    const Header = components?.Header
    return (
      <>
        {Header ? <Header /> : null}
        {data.map((item, i) => (
          <div key={computeItemKey(i, item)}>{itemContent(i, item)}</div>
        ))}
      </>
    )
  }
}))

const USED_KEYS = [
  'songs.tableLabel',
  'songs.column.title',
  'songs.column.artist',
  'songs.column.album',
  'songs.column.duration',
  'songs.column.format',
  'songs.column.bitrate',
  'songs.column.quality',
  'songs.column.status',
  'songs.column.cover',
  'songs.column.index',
  'track.favorite',
  'track.unfavorite',
  'track.playing',
  'menu.play'
]

beforeEach(() => {
  useI18nStore.setState({
    messages: Object.fromEntries(USED_KEYS.map((k) => [k, `«${k}»`])),
    loaded: true,
    language: 'zh-CN'
  })
  ;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

function makeTrack(over: Partial<TrackRow> = {}): TrackRow {
  return {
    id: 'id-1',
    title: '夜曲',
    artistId: 1,
    artistName: '周杰伦',
    albumId: 1,
    albumTitle: '十一月的萧邦',
    albumArtist: '周杰伦',
    trackNumber: 1,
    discNumber: 1,
    year: 2005,
    genre: 'Pop',
    duration: 226,
    filePath: 'D:/music/01-夜曲.mp3',
    format: 'mp3',
    bitrate: 320,
    sampleRate: 96000,
    bitDepth: 24,
    playable: true,
    status: 'available',
    coverId: null,
    favorite: false,
    playCount: 0,
    dateAdded: '2024-01-01T00:00:00Z',
    lastPlayedAt: null,
    favoritedAt: null,
    ...over
  }
}

function mountList(props: Parameters<typeof TrackList>[0]): {
  container: HTMLElement
  row: HTMLElement
  unmount: () => void
} {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(<TrackList {...props} />)
  })
  const row = container.querySelector<HTMLElement>('.track-row:not(.track-row--head)')
  if (!row) throw new Error('mock virtuoso 未渲染数据行')
  return {
    container,
    row,
    unmount: () => {
      act(() => root.unmount())
      container.remove()
    }
  }
}

function favButton(row: HTMLElement): HTMLButtonElement {
  const btn = row.querySelector<HTMLButtonElement>('.icon-button')
  if (!btn) throw new Error('行内未渲染收藏按钮')
  return btn
}

describe('TrackList favoriteIds 派生（T6.1：行 ♡/♥ 以切片为单一事实源）', () => {
  it('favoriteIds 含该 id 而 track.favorite=false → 渲染 ♥（切片覆盖陈旧快照）', () => {
    const { row, unmount } = mountList({
      songs: [makeTrack({ favorite: false })],
      favoriteIds: new Set(['id-1'])
    })
    const btn = favButton(row)
    expect(btn.className).toContain('is-favorite')
    expect(btn.getAttribute('aria-label')).toBe('«track.unfavorite»')
    const src = btn.querySelector('img')?.getAttribute('src') ?? ''
    expect(src).toContain('heart--accent')
    unmount()
  })

  it('favoriteIds 为空集而 track.favorite=true → 渲染 ♡（切片覆盖陈旧快照，反向）', () => {
    const { row, unmount } = mountList({
      songs: [makeTrack({ favorite: true })],
      favoriteIds: new Set<string>()
    })
    const btn = favButton(row)
    expect(btn.className).not.toContain('is-favorite')
    expect(btn.getAttribute('aria-label')).toBe('«track.favorite»')
    const src = btn.querySelector('img')?.getAttribute('src') ?? ''
    expect(src).toContain('heart')
    expect(src).not.toContain('heart--accent')
    unmount()
  })

  it('省略 favoriteIds → 回退 track.favorite（未接切片的消费方兼容路径）', () => {
    const { row, unmount } = mountList({ songs: [makeTrack({ favorite: true })] })
    const btn = favButton(row)
    expect(btn.className).toContain('is-favorite')
    expect(btn.getAttribute('aria-label')).toBe('«track.unfavorite»')
    unmount()
  })
})
