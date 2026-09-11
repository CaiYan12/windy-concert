import { Link, useParams } from 'react-router-dom'
import { type ReactElement } from 'react'
import type { TrackRow } from '../../../shared/types'
import { useI18n } from '../i18n'
import { usePlayerStore } from '../stores/playerStore'
import { useToastStore } from '../stores/toastStore'
import { api } from '../ipc/client'
import { Cover } from '../components/Cover'
import { Icon } from '../components/Icon'
import { TrackList } from '../components/TrackList'
import { useBrowseData } from './useBrowseData'
import { playContext, shuffleContext } from './playerBridge'

/**
 * ArtistDetail 页（T4.4）——艺术家详情（§3.7 基础版：Hero + 专辑网格 + 全部曲目）。
 * 数据经 library:getArtist IPC 取（artist / albums / tracks 三件套）。
 * bio / 热门曲目等属 0.5（计划 §3.7 / T6），本期不接。
 *
 * 播放/随机播放按钮：同 AlbumDetail，T5.6 经 playerBridge 接通 playerStore.loadContext。
 * 专辑网格复用 AlbumCard 形态（与 Albums 页一致），卡片点按进入 AlbumDetail。
 */
export function ArtistDetail(): ReactElement {
  const { t } = useI18n()
  const { id } = useParams<{ id: string }>()
  const artistId = Number(id)
  const { data, loading, error } = useBrowseData(
    () => api.library.getArtist(artistId),
    [artistId]
  )

  // T5.6：曲目表右键「下一首播放 / 添加到队列」接 playerStore；不可播双击 → toast。
  const handlePlayNext = (track: TrackRow): void => {
    usePlayerStore.getState().playNext(track)
  }
  const handleEnqueue = (track: TrackRow): void => {
    usePlayerStore.getState().enqueue(track)
  }
  const handleUnplayableActivate = (): void => {
    useToastStore.getState().showToast(t('player.unsupportedFormat'))
  }

  if (error) {
    return (
      <div className="page-wrap browse-page">
        <div className="browse-state" role="status">
          <div className="browse-state-title">{t('songs.error')}</div>
          <div className="browse-state-hint">{error}</div>
        </div>
      </div>
    )
  }

  if (loading || !data) {
    return (
      <div className="page-wrap browse-page">
        <div className="browse-state">
          <div className="browse-state-title">{t('songs.loading')}</div>
        </div>
      </div>
    )
  }

  if (!data.artist) {
    return (
      <div className="page-wrap browse-page">
        <div className="browse-state">
          <div className="browse-state-title">{t('artistDetail.notFound')}</div>
        </div>
      </div>
    )
  }

  const { artist, albums, tracks } = data

  return (
    <div className="page-wrap browse-page">
      <div className="page-head">
        <Link to="/artists" className="button button--quiet">
          <Icon name="chevron-left" size={16} />
          {t('artistDetail.back')}
        </Link>
      </div>

      <section className="hero hero--artist">
        <span className="artist-avatar artist-hero-avatar">
          <Icon name="mic-2" size={24} />
        </span>
        <div className="hero-copy">
          <div className="hero-label">{t('artistDetail.label')}</div>
          <h2>{artist.name}</h2>
          <div className="hero-meta">
            <span>{t('artists.trackCount', { count: artist.trackCount })}</span>
            <span className="dot" />
            <span>{t('artists.albumCount', { count: artist.albumCount })}</span>
          </div>
          <div className="hero-actions">
            <button
              type="button"
              className="round-action round-action--primary"
              aria-label={t('albumDetail.play')}
              onClick={() => playContext(tracks, 0)}
            >
              <Icon name="play--on-accent" size={20} />
            </button>
            <button
              type="button"
              className="round-action"
              aria-label={t('albumDetail.shuffle')}
              onClick={() => shuffleContext(tracks)}
            >
              <Icon name="shuffle" size={20} />
            </button>
          </div>
        </div>
      </section>

      <div className="section-heading">
        <h3>{t('artistDetail.albums')}</h3>
        {albums.length > 0 ? <span className="count numeric">{albums.length}</span> : null}
      </div>
      {albums.length > 0 ? (
        <div className="album-grid" aria-label={t('artistDetail.albums')}>
          {albums.map((album) => (
            <Link
              key={album.id}
              to={`/albums/${album.id}`}
              className="album-card"
              aria-label={album.title}
            >
              <Cover coverId={album.coverId} size={256} className="cover--grid" />
              <div className="card-copy">
                <div className="card-title">{album.title}</div>
                <div className="card-meta">
                  {/* 曲目计数走既有键 albumDetail.trackCount（与 AlbumDetail 卡一致）——
                    T4.4 评审 Important-1：此前此处拼裸中文「首」绕过 t()，哨兵测试测不到硬编码。 */}
                  {album.year != null
                    ? `${album.year} · ${t('albumDetail.trackCount', { count: album.trackCount })}`
                    : t('albumDetail.trackCount', { count: album.trackCount })}
                </div>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="browse-state">
          <div className="browse-state-title">{t('empty.albums.title')}</div>
        </div>
      )}

      <div className="section-heading">
        <h3>{t('artistDetail.allTracks')}</h3>
        {tracks.length > 0 ? <span className="count numeric">{tracks.length}</span> : null}
      </div>
      <TrackList
        songs={tracks}
        // T4.11：详情页表头为纯文本列名（设计稿 ArtistDetail.html 无 sort-button）——
        // 曲目按专辑归组后 disc→track 固定序展示，不承担排序语义；此前传的 sortBy/order
        // 仅驱动表头 aria-sort 失真（用户无法改序），随 sortable 开关一并移除。
        sortable={false}
        className="detail-tracklist"
        onActivate={(_track, index) => playContext(tracks, index)}
        onPlayNext={handlePlayNext}
        onEnqueue={handleEnqueue}
        onUnplayableActivate={handleUnplayableActivate}
      />
    </div>
  )
}

export default ArtistDetail
