import { Link, useParams } from 'react-router-dom'
import { type ReactElement } from 'react'
import { useI18n } from '../i18n'
import { api } from '../ipc/client'
import { Cover } from '../components/Cover'
import { Icon } from '../components/Icon'
import { TrackList } from '../components/TrackList'
import { useBrowseData } from './useBrowseData'
import { playContext, shuffleContext, shuffleTracks } from './playerBridge'

/**
 * AlbumDetail 页（T4.4）——专辑详情（§3.7：Hero 渐变 + 封面 200 + 标题/艺术家/年份·曲目数 +
 * 播放/随机播放按钮；曲目表按 disc→trackNumber 排序，复用 TrackList）。
 *
 * Hero 渐变（.hero--album in styles/browse.css）：**全项目唯一允许的渐变**（§3.7 / T4.4 计划）。
 * 颜色硬编码为设计稿字面值 #2a2832 → var(--bg-base)（设计稿 mockup.css:1069，不在 tokens 里，留痕）。
 *
 * 随机播放（T4.4 计划）：将曲目数组洗牌后 loadContext——playerStore 未建（T5.6），先经
 * playerBridge.shuffleContext 挂占位；playContext 同理。两按钮是 T5.6 接通 loadContext 的唯一切换点。
 */
export function AlbumDetail(): ReactElement {
  const { t } = useI18n()
  const { id } = useParams<{ id: string }>()
  const albumId = Number(id)
  const { data, loading, error } = useBrowseData(
    () => api.library.getAlbum(albumId),
    [albumId]
  )

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

  if (!data.album) {
    return (
      <div className="page-wrap browse-page">
        <div className="browse-state">
          <div className="browse-state-title">{t('albumDetail.notFound')}</div>
        </div>
      </div>
    )
  }

  const { album, tracks } = data
  const totalMinutes = Math.round(tracks.reduce((sum, tr) => sum + tr.duration, 0) / 60)

  return (
    <div className="page-wrap browse-page">
      <div className="page-head">
        <Link to="/albums" className="button button--quiet">
          <Icon name="chevron-left" size={16} />
          {t('albumDetail.back')}
        </Link>
      </div>

      <section className="hero hero--album">
        <Cover coverId={album.coverId} size={256} className="cover--hero" alt={album.title} />
        <div className="hero-copy">
          <div className="hero-label">{t('albumDetail.label')}</div>
          <h2>{album.title}</h2>
          <div className="hero-artist">{album.artistName}</div>
          <div className="hero-meta">
            {album.year != null ? <span>{album.year}</span> : null}
            <span className="dot" />
            <span>{t('albumDetail.trackCount', { count: album.trackCount })}</span>
            {totalMinutes > 0 ? (
              <>
                <span className="dot" />
                <span>{t('albumDetail.totalMinutes', { count: totalMinutes })}</span>
              </>
            ) : null}
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
              onClick={() => shuffleContext(shuffleTracks(tracks))}
            >
              <Icon name="shuffle" size={20} />
            </button>
          </div>
        </div>
      </section>

      <TrackList
        songs={tracks}
        sortBy="title"
        order="asc"
        className="detail-tracklist"
        onActivate={(track) => playContext(tracks, tracks.indexOf(track))}
      />
    </div>
  )
}

export default AlbumDetail
