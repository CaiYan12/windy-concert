/**
 * TrackList 单测（jsdom project：位于 src/renderer/** 以匹配 vitest.config.ts 的 jsdom include）。
 *
 * 承 T4.0/T4.1/T4.2 的测试形态：不引入 @testing-library。
 *   · 纯函数（resolveRowState / nextSort / formatDuration / specParts / trackMenuItems / 列白名单守卫）
 *     直接断言；
 *   · 组件（TrackRowItem / TrackHeaderRow / TrackList 的空/加载/错误态）用 renderToStaticMarkup 断言；
 *   · 带数据的 <TrackList> 走 react-virtuoso（依赖真实布局测量），SSR 不可靠——其真实渲染由
 *     tests/e2e/tracklist.spec.ts 覆盖，此处不重复。
 *
 * i18n 处理：本测试把 i18n store 的 messages 换成**哨兵表**（值 = «key»），
 *   从而断言「组件确实经 t() 取用了正确的 key」，而不复制 resources 里的真实文案
 *   （真实文案与键完整性由 tests/unit/i18n 的 node 用例守卫）。
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it } from 'vitest'
import type { TrackRow } from '../../../shared/types'
import { useI18nStore } from '../i18n'
import {
  SORT_KEYS,
  TRACK_COLUMNS,
  TrackHeaderRow,
  TrackList,
  TrackRowItem,
  formatDuration,
  formatIndex,
  isSortKey,
  nextSort,
  resolveRowState,
  specParts,
  trackMenuItems
} from './TrackList'

// ---------------------------------------------------------------------------
// 夹具
// ---------------------------------------------------------------------------

// 组件会在渲染期查用的 i18n key（哨兵值 «key» 让断言直接证明「用了哪个 key」）。
const USED_KEYS = [
  'songs.column.cover',
  'songs.column.index',
  'songs.column.title',
  'songs.column.artist',
  'songs.column.album',
  'songs.column.duration',
  'songs.column.format',
  'songs.column.bitrate',
  'songs.column.quality',
  'songs.column.status',
  'songs.tableLabel',
  'songs.loading',
  'songs.error',
  'songs.contextMenu',
  'track.missing',
  'track.unplayableTooltip',
  'track.favorite',
  'track.unfavorite',
  'track.playing',
  'menu.play',
  'menu.playNow',
  'menu.addToQueue',
  'menu.favorite',
  'menu.unfavorite',
  'menu.addToPlaylist',
  'menu.newPlaylist',
  'empty.songs.title',
  'empty.songs.hint'
]

const MESSAGES: Record<string, string> = Object.fromEntries(
  USED_KEYS.map((key) => [key, `«${key}»`])
)
// 带参数的 key 需要真实模板才能验证插值。
MESSAGES['songs.spec.format'] = '{bit} bit / {rate} kHz'
MESSAGES['hires.kbps'] = '{value} kbps'

beforeEach(() => {
  useI18nStore.setState({ messages: { ...MESSAGES }, loaded: true, language: 'zh-CN' })
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

// ---------------------------------------------------------------------------
// 纯函数
// ---------------------------------------------------------------------------

describe('resolveRowState（行状态判定，missing > unplayable > normal）', () => {
  it('status=missing → missing，且优先于 playable=false', () => {
    expect(resolveRowState({ status: 'missing', playable: false })).toBe('missing')
    expect(resolveRowState({ status: 'missing', playable: true })).toBe('missing')
  })

  it('非 missing 且 !playable → unplayable', () => {
    expect(resolveRowState({ status: 'available', playable: false })).toBe('unplayable')
    expect(resolveRowState({ status: 'ignored', playable: false })).toBe('unplayable')
  })

  it('ignored 一律不可播（即使 playable 意外为 true）', () => {
    expect(resolveRowState({ status: 'ignored', playable: true })).toBe('unplayable')
  })

  it('available + playable → normal', () => {
    expect(resolveRowState({ status: 'available', playable: true })).toBe('normal')
  })
})

describe('排序白名单与切换（§3.7 7 键）', () => {
  it('SORT_KEYS 恰为白名单 7 键', () => {
    expect(SORT_KEYS).toEqual([
      'title',
      'artist',
      'album',
      'dateAdded',
      'year',
      'duration',
      'playCount'
    ])
  })

  it('isSortKey 只放行白名单键（format / bitrate 等非白名单被拒）', () => {
    for (const key of SORT_KEYS) expect(isSortKey(key)).toBe(true)
    expect(isSortKey('format')).toBe(false)
    expect(isSortKey('bitrate')).toBe(false)
    expect(isSortKey('')).toBe(false)
  })

  it('点击当前列仅翻转方向；点击其它列切列并回到 asc', () => {
    expect(nextSort({ sortBy: 'title', order: 'asc' }, 'title')).toEqual({
      sortBy: 'title',
      order: 'desc'
    })
    expect(nextSort({ sortBy: 'title', order: 'desc' }, 'title')).toEqual({
      sortBy: 'title',
      order: 'asc'
    })
    expect(nextSort({ sortBy: 'title', order: 'desc' }, 'artist')).toEqual({
      sortBy: 'artist',
      order: 'asc'
    })
  })

  it('表头列定义：10 列，可排序列（title/artist/album/duration）全部命中白名单', () => {
    expect(TRACK_COLUMNS).toHaveLength(10)
    const sortKeys = TRACK_COLUMNS.filter((c) => c.sortKey).map((c) => c.sortKey as string)
    expect(sortKeys).toEqual(['title', 'artist', 'album', 'duration'])
    for (const key of sortKeys) expect(isSortKey(key)).toBe(true)
  })
})

describe('格式化纯函数', () => {
  it('formatDuration：m:ss / h:mm:ss，缺失或非正数 → —', () => {
    expect(formatDuration(226)).toBe('3:46')
    expect(formatDuration(3725)).toBe('1:02:05')
    expect(formatDuration(0)).toBe('—')
    expect(formatDuration(-1)).toBe('—')
    expect(formatDuration(Number.NaN)).toBe('—')
  })

  it('formatIndex：0-based → 两位序号', () => {
    expect(formatIndex(0)).toBe('01')
    expect(formatIndex(9)).toBe('10')
    expect(formatIndex(99)).toBe('100')
  })

  it('specParts：采样率·位深齐全才有值（kHz = Hz/1000）', () => {
    expect(specParts(96000, 24)).toEqual({ bit: 24, rate: 96 })
    expect(specParts(44100, 16)).toEqual({ bit: 16, rate: 44.1 })
    expect(specParts(null, 24)).toBeNull()
    expect(specParts(96000, null)).toBeNull()
  })
})

describe('trackMenuItems（右键菜单四组）', () => {
  it('固定四组、顺序与设计稿一致', () => {
    const items = trackMenuItems({ favorite: false })
    expect(items.map((i) => i.id)).toEqual(['play-next', 'enqueue', 'favorite', 'add-to-playlist'])
    expect(items[0].labelKey).toBe('menu.playNow')
    expect(items[0].shortcut).toBe('↵')
    expect(items[1].labelKey).toBe('menu.addToQueue')
    expect(items[2].labelKey).toBe('menu.favorite')
    expect(items[3].labelKey).toBe('menu.addToPlaylist')
    expect(items[3].submenu).toBe(true)
  })

  it('第三组文案随收藏态切换（收藏 / 取消收藏）', () => {
    expect(trackMenuItems({ favorite: true })[2].labelKey).toBe('menu.unfavorite')
    expect(trackMenuItems({ favorite: false })[2].labelKey).toBe('menu.favorite')
  })
})

// ---------------------------------------------------------------------------
// 单行渲染（六态）
// ---------------------------------------------------------------------------

describe('TrackRowItem（六态渲染）', () => {
  it('normal：无状态类，标题/艺术家/时长/格式/比特率/规格 + ♡ 收藏按钮', () => {
    const html = renderToStaticMarkup(
      <TrackRowItem track={makeTrack()} index={0} isPlaying={false} isSelected={false} />
    )
    expect(html).toContain('class="track-row"')
    expect(html).toContain('夜曲')
    expect(html).toContain('周杰伦')
    expect(html).toContain('3:46')
    expect(html).toContain('MP3')
    expect(html).toContain('320 kbps')
    expect(html).toContain('24 bit / 96 kHz')
    expect(html).toContain('«track.favorite»')
    expect(html).toContain('heart')
    expect(html).not.toContain('heart--accent')
  })

  it('missing：is-missing + 右侧 file-x-2 + 「文件缺失」，不出现 ban', () => {
    const html = renderToStaticMarkup(
      <TrackRowItem
        track={makeTrack({ status: 'missing', playable: false })}
        index={2}
        isPlaying={false}
        isSelected={false}
      />
    )
    expect(html).toContain('is-missing')
    expect(html).toContain('file-x-2')
    expect(html).toContain('title="«track.missing»"')
    expect(html).toContain('«track.missing»')
    expect(html).not.toContain('ban')
  })

  it('unplayable：is-unavailable + ban + tooltip 全文 + 播放按钮 disabled', () => {
    const html = renderToStaticMarkup(
      <TrackRowItem
        track={makeTrack({ status: 'available', playable: false })}
        index={3}
        isPlaying={false}
        isSelected={false}
      />
    )
    expect(html).toContain('is-unavailable')
    expect(html).toContain('ban')
    expect(html).toContain('title="«track.unplayableTooltip»"')
    expect(html).toContain('«track.unplayableTooltip»')
    expect(html).toContain('disabled=""')
  })

  it('playing：is-playing + 序号位换成 music-2（不再渲染序号） + 收藏态 ♥', () => {
    const html = renderToStaticMarkup(
      <TrackRowItem track={makeTrack({ favorite: true })} index={4} isPlaying isSelected={false} />
    )
    expect(html).toContain('is-playing')
    expect(html).toContain('«track.playing»')
    expect(html).toContain('heart--accent')
    expect(html).not.toContain('index-number')
  })

  it('selected：is-selected + aria-selected="true"', () => {
    const html = renderToStaticMarkup(
      <TrackRowItem track={makeTrack()} index={5} isPlaying={false} isSelected />
    )
    expect(html).toContain('is-selected')
    expect(html).toContain('aria-selected="true"')
  })
})

// ---------------------------------------------------------------------------
// 表头
// ---------------------------------------------------------------------------

describe('TrackHeaderRow', () => {
  it('4 个可排序列渲染 sort-button；当前列升序显示 chevron-up 12px', () => {
    const html = renderToStaticMarkup(<TrackHeaderRow sortBy="title" order="asc" />)
    expect((html.match(/class="sort-button"/g) ?? []).length).toBe(4)
    expect(html).toContain('aria-sort="ascending"')
    expect(html).toContain('chevron-up')
    expect(html).toContain('width="12"')
    expect(html).toContain('height="12"')
  })

  it('降序当前列 → chevron-down；其余可排序列 aria-sort=none', () => {
    const html = renderToStaticMarkup(<TrackHeaderRow sortBy="duration" order="desc" />)
    expect(html).toContain('aria-sort="descending"')
    expect(html).toContain('chevron-down')
    expect((html.match(/aria-sort="none"/g) ?? []).length).toBe(3)
  })

  it('序号列以 # 呈现 + sr-only 完整标签；状态列仅 sr-only', () => {
    const html = renderToStaticMarkup(<TrackHeaderRow sortBy="title" order="asc" />)
    expect(html).toContain('<span aria-hidden="true">#</span>')
    expect(html).toContain('sr-only">«songs.column.index»')
    expect(html).toContain('sr-only">«songs.column.status»')
  })
})

// ---------------------------------------------------------------------------
// 列表（空 / 加载 / 错误态；有数据态由 e2e 覆盖）
// ---------------------------------------------------------------------------

describe('TrackList 非数据态', () => {
  it('空态：表头 + 空库文案 + role=table 的可访问名', () => {
    const html = renderToStaticMarkup(<TrackList songs={[]} />)
    expect(html).toContain('role="table"')
    expect(html).toContain('aria-label="«songs.tableLabel»"')
    expect(html).toContain('«empty.songs.title»')
    expect(html).toContain('«empty.songs.hint»')
    expect(html).toContain('track-row--head')
  })

  it('加载态：loading 且无数据 → 加载文案', () => {
    const html = renderToStaticMarkup(<TrackList songs={[]} loading />)
    expect(html).toContain('«songs.loading»')
  })

  it('错误态：error 且无数据 → 错误标题 + 具体信息', () => {
    const html = renderToStaticMarkup(<TrackList songs={[]} error="IPC 失败" />)
    expect(html).toContain('«songs.error»')
    expect(html).toContain('IPC 失败')
  })

  it('有数据时不渲染空态文案（数据态走 virtuoso）', () => {
    const html = renderToStaticMarkup(<TrackList songs={[makeTrack()]} />)
    expect(html).not.toContain('«empty.songs.title»')
    expect(html).not.toContain('«songs.loading»')
  })
})
