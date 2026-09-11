import { Link, useSearchParams } from 'react-router-dom'
import { type ReactElement } from 'react'
import type { SearchResult, TrackRow } from '../../../shared/types'
import { useI18n } from '../i18n'
import { api } from '../ipc/client'
import { Cover } from '../components/Cover'
import { Icon } from '../components/Icon'
import { formatDuration, formatIndex, resolveRowState, specParts } from '../components/trackListUtils'
import { useBrowseData } from './useBrowseData'

/**
 * SearchResults 页（T4.5）—— /search?q= 全结果页，对照 mockups/SearchResults.html 四段式。
 *
 * 取数：useSearchParams 读 ?q=（hash 路由下 react-router 会解析 hash 内的 search 段，
 * 与 T4.3 e2e 的 `#/songs?playing=<id>` 同一机制，已验证可用），q 变化经 useBrowseData
 * deps 驱动重取。q 为空 → 引导空态（**不自动搜全库**，禁假数据）；四组全空 → empty.searchResults.*。
 *
 * 曲目组为何不复用 TrackList（留痕）：
 *   TrackList 为 virtuoso 虚拟滚动 + 全 10 列网格 + 可排序表头，需要确定高度容器（.browse-page
 *   flex 契约）且列语义（艺术家列/专辑列/比特率…）与搜索页紧凑表（mockup 用 6 列
 *   .track-table--compact：#/封面/标题·艺术家/规格/时长/状态）不一致；在四段混排页面里给
 *   单组Tracks 塞确定高度会挤压其余三段。故按 mockup 迁移 compact 网格（列格来源
 *   mockup.css:760），行渲染为本页局部组件（复用 trackListUtils 纯函数与 Cover/Icon）。
 *   专辑组（album-grid/album-card）与艺术家组（artist-row）复用 Albums/Artists 页的既有卡片
 *   形态与样式（browse.css 已有，不重复造类）。
 *
 * 分组头「查看全部」：对照 SearchResults.html——链到对应媒体库分区页（/songs 等），
 * 非链回本页（本页已是对该查询的全部结果，repo 侧上限 50/组，无「更多」可展开）。
 * 歌单组行不加链接：歌单详情页尚未落地（PagePlaceholder 占位），不给死链（留痕）。
 */
export function SearchResults(): ReactElement {
  const { t } = useI18n()
  const [searchParams] = useSearchParams()
  const q = searchParams.get('q')?.trim() ?? ''

  // q 为空：引导空态，且不挂载取数组件——useBrowseData 无法条件调用，故把取数整段
  // 下沉到子组件（hook 规则合规的「条件取数」写法），保证 q 为空时 library:search 零调用
  //（禁自动搜全库，SearchResults.test.tsx 以 searchCalls 空断言锚定）。
  if (q.length === 0) {
    return (
      <div className="page-wrap browse-page">
        <div className="page-head">
          <h2>{t('page.searchResults')}</h2>
        </div>
        <div className="browse-state">
          <div className="browse-state-title">{t('search.emptyQuery.title')}</div>
          <div className="browse-state-hint">{t('search.emptyQuery.hint')}</div>
        </div>
      </div>
    )
  }
  return <SearchResultsContent q={q} />
}

/** 有 q 时的取数与渲染体（由 SearchResults 仅在 q 非空时挂载）。 */
function SearchResultsContent({ q }: { q: string }): ReactElement {
  const { t } = useI18n()

  const { data, loading, error } = useBrowseData<SearchResult>(
    () => api.library.search(q),
    [q]
  )

  const groups: ReadonlyArray<{
    key: 'tracks' | 'albums' | 'artists' | 'playlists'
    label: string
    count: number
    viewAllTo: string
  }> = data
    ? [
        { key: 'tracks', label: t('search.group.tracks'), count: data.tracks.length, viewAllTo: '/songs' },
        { key: 'albums', label: t('search.group.albums'), count: data.albums.length, viewAllTo: '/albums' },
        { key: 'artists', label: t('search.group.artists'), count: data.artists.length, viewAllTo: '/artists' },
        { key: 'playlists', label: t('search.group.playlists'), count: data.playlists.length, viewAllTo: '/playlists' }
      ]
    : []
  const isEmpty =
    data != null && data.tracks.length === 0 && data.albums.length === 0 && data.artists.length === 0 && data.playlists.length === 0

  return (
    <div className="page-wrap browse-page">
      <div className="page-head">
        <h2>{t('search.resultsHeading', { q })}</h2>
        <p>{t('search.resultsSubtitle')}</p>
      </div>

      {error ? (
        <div className="browse-state" role="status">
          <div className="browse-state-title">{t('songs.error')}</div>
          <div className="browse-state-hint">{error}</div>
        </div>
      ) : loading ? (
        <div className="browse-state">
          <div className="browse-state-title">{t('search.loading')}</div>
        </div>
      ) : isEmpty ? (
        <div className="browse-state">
          <div className="browse-state-title">{t('empty.searchResults.title')}</div>
          <div className="browse-state-hint">{t('empty.searchResults.hint')}</div>
        </div>
      ) : data ? (
        <div className="search-results-grid">
          {groups.map((group) => (group.count > 0 ? <ResultGroup key={group.key} group={group} data={data} /> : null))}
        </div>
      ) : null}
    </div>
  )
}

/** 单分组段（段内按 key 分发渲染；空组由调用方过滤，不渲染凑数内容）。 */
function ResultGroup({
  group,
  data
}: {
  group: { key: 'tracks' | 'albums' | 'artists' | 'playlists'; label: string; count: number; viewAllTo: string }
  data: SearchResult
}): ReactElement {
  const { t } = useI18n()
  return (
    <section className="result-group" aria-label={group.label}>
      <div className="result-group-head">
        <h2>
          {group.label} <span className="count numeric">{group.count}</span>
        </h2>
        <Link to={group.viewAllTo}>{t('search.viewAll')}</Link>
      </div>
      {group.key === 'tracks' ? <CompactTrackTable tracks={data.tracks} /> : null}
      {group.key === 'albums' ? <AlbumCards albums={data.albums} /> : null}
      {group.key === 'artists' ? <ArtistRows artists={data.artists} /> : null}
      {group.key === 'playlists' ? <PlaylistRows playlists={data.playlists} /> : null}
    </section>
  )
}

/* ---------- 曲目组：紧凑 6 列表（mockup.css:760 列格，样式见 styles/search.css） ---------- */

function CompactTrackTable({ tracks }: { tracks: TrackRow[] }): ReactElement {
  const { t } = useI18n()
  return (
    <div className="track-table track-table--compact" role="table" aria-label={t('search.group.tracks')}>
      {tracks.map((track, index) => (
        <CompactTrackRow key={track.id} track={track} index={index} />
      ))}
    </div>
  )
}

function CompactTrackRow({ track, index }: { track: TrackRow; index: number }): ReactElement {
  const { t } = useI18n()
  const state = resolveRowState(track)
  const spec = specParts(track.sampleRate, track.bitDepth)
  const rowClass = ['track-row', state === 'missing' ? 'is-missing' : '', state === 'unplayable' ? 'is-unavailable' : '']
    .filter(Boolean)
    .join(' ')
  return (
    <div className={rowClass} role="row">
      <div className="track-cell track-cell--index numeric" role="cell">
        {formatIndex(index)}
      </div>
      <div className="track-cell track-cell--cover" role="cell">
        <Cover coverId={track.coverId} size={64} className="cover--table" />
      </div>
      <div className="track-cell" role="cell">
        <div className="track-title" title={track.title}>
          {track.title}
        </div>
        <div className="track-subtitle">{`${track.artistName} · ${track.albumTitle}`}</div>
      </div>
      <div className="track-cell spec" role="cell">
        {spec ? t('songs.spec.format', { bit: spec.bit, rate: spec.rate }) : '—'}
      </div>
      <div className="track-cell duration numeric" role="cell">
        {formatDuration(track.duration)}
      </div>
      <div className="track-cell track-status" role="cell">
        {state === 'missing' ? (
          <span className="track-status-mark" title={t('track.missing')}>
            <Icon name="file-x-2" size={15} alt={t('track.missing')} />
          </span>
        ) : state === 'unplayable' ? (
          <span className="track-status-mark" title={t('track.unplayableTooltip')}>
            <Icon name="ban" size={15} alt={t('track.unplayableTooltip')} />
          </span>
        ) : track.favorite ? (
          <Icon name="heart--accent" size={16} alt={t('track.favorite')} />
        ) : null}
      </div>
    </div>
  )
}

/* ---------- 专辑组：复用 Albums 页卡片形态（browse.css .album-grid/.album-card） ---------- */

function AlbumCards({ albums }: { albums: SearchResult['albums'] }): ReactElement {
  const { t } = useI18n()
  return (
    <div className="album-grid" aria-label={t('search.group.albums')}>
      {albums.map((album) => (
          <Link key={album.id} to={`/albums/${album.id}`} className="album-card" aria-label={album.title}>
            <Cover coverId={album.coverId} size={256} className="cover--grid" />
            <div className="card-copy">
              <div className="card-title">{album.title}</div>
              <div className="card-meta">
                {album.year != null ? `${album.artistName} · ${album.year}` : album.artistName}
              </div>
            </div>
          </Link>
        ))}
    </div>
  )
}

/* ---------- 艺术家组：复用 Artists 页行形态（browse.css .artist-row） ---------- */

function ArtistRows({ artists }: { artists: SearchResult['artists'] }): ReactElement {
  const { t } = useI18n()
  return (
    <div className="artist-list" aria-label={t('search.group.artists')}>
      {artists.map((artist) => (
          <Link key={artist.id} to={`/artists/${artist.id}`} className="artist-row" aria-label={artist.name}>
            <span className="artist-avatar">
              <Icon name="mic-2" size={20} />
            </span>
            <span className="artist-name">{artist.name}</span>
            <span className="artist-count numeric">
              {t('artists.trackCount', { count: artist.trackCount })}
            </span>
            <span className="artist-chevron">
              <Icon name="chevron-right" size={16} />
            </span>
          </Link>
        ))}
    </div>
  )
}

/* ---------- 歌单组：无详情路由 → 非链接行（留痕见文件头） ---------- */

function PlaylistRows({ playlists }: { playlists: SearchResult['playlists'] }): ReactElement {
  const { t } = useI18n()
  return (
    <div className="artist-list" aria-label={t('search.group.playlists')}>
      {playlists.map((playlist) => (
        <div key={playlist.id} className="artist-row" aria-label={playlist.name}>
          <span className="artist-avatar">
            <Icon name="library" size={20} />
          </span>
          <span className="artist-name">{playlist.name}</span>
          <span className="artist-count numeric">
            {t('playlists.trackCount', { count: playlist.trackCount })}
          </span>
        </div>
      ))}
    </div>
  )
}

export default SearchResults
