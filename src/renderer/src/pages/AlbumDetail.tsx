import { Link, useParams } from 'react-router-dom'
import { type ReactElement } from 'react'
import type { TrackRow } from '../../../shared/types'
import { useI18n } from '../i18n'
import { usePlayerStore, usePlayingTrackId } from '../stores/playerStore'
import { useToastStore } from '../stores/toastStore'
import { useFavorites, useFavoritesStore } from '../stores/favoritesStore'
import { api } from '../ipc/client'
import { Cover } from '../components/Cover'
import { Icon } from '../components/Icon'
import { TrackList } from '../components/TrackList'
import { useBrowseData } from './useBrowseData'
import { playContext, shuffleContext } from './playerBridge'

/**
 * AlbumDetail 页（T4.4）——专辑详情（§3.7：Hero 渐变 + 封面 200 + 标题/艺术家/年份·曲目数 +
 * 播放/随机播放按钮；曲目表按 disc→trackNumber 排序，复用 TrackList）。
 *
 * Hero 渐变（.hero--album in styles/browse.css）：全项目**第一处获准渐变**（§3.7 / T4.4；
 * 第二处为 Liked 页 .hero--liked，见 T6.1 §4.6）。
 * 颜色硬编码为设计稿字面值 #2a2832 → var(--bg-base)（设计稿 mockup.css:1069，不在 tokens 里，留痕）。
 *
 * 随机播放（T4.4 计划）：将曲目数组洗牌后 loadContext——T5.6 经 playerBridge.shuffleContext 接通
 * playerStore.loadContext(shuffle(tracks), 0)。「播放」按钮 playContext(tracks, 0)、曲目表双击整队
 * 同理，两按钮与 TrackList 双击是 T5.6 接通 loadContext 的唯一切换点（playerBridge 内部转调 store）。
 */
export function AlbumDetail(): ReactElement {
  const { t } = useI18n()
  const { id } = useParams<{ id: string }>()
  const albumId = Number(id)
  // T5.7 缺口②闭合：曲目表 C1 accent 接线——当前播放曲目 id 下传 TrackList（详见 Songs.tsx 留痕）。
  const playingTrackId = usePlayingTrackId()
  // T6.1：收藏切片接线（详见 Songs.tsx 留痕）——详情页曲目行 ♡/右键收藏同样以切片为准。
  const favorites = useFavorites()
  const { data, loading, error } = useBrowseData(
    () => api.library.getAlbum(albumId),
    [albumId]
  )

  // T5.6：曲目表右键「下一首播放 / 添加到队列」接 playerStore；不可播双击 → toast。
  // store 动作经 getState 调，避免无谓重渲染。
  const handlePlayNext = (track: TrackRow): void => {
    usePlayerStore.getState().playNext(track)
  }
  const handleEnqueue = (track: TrackRow): void => {
    usePlayerStore.getState().enqueue(track)
  }
  const handleUnplayableActivate = (): void => {
    useToastStore.getState().showToast(t('player.unsupportedFormat'))
  }
  // T6.1：行 ♡/右键收藏 → 切片 toggle（详见 Songs.tsx 留痕）。
  const handleToggleFavorite = (track: TrackRow, next: boolean): void => {
    void useFavoritesStore.getState().toggle(track.id, next)
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
              onClick={() => shuffleContext(tracks)}
            >
              <Icon name="shuffle" size={20} />
            </button>
          </div>
        </div>
      </section>

      <TrackList
        songs={tracks}
        // T4.11：详情页表头为纯文本列名（设计稿 AlbumDetail.html 无 sort-button）——
        // 曲目按 disc→trackNumber 固定序展示，不承担排序语义；此前传的 sortBy/order
        // 仅驱动表头 aria-sort 失真（用户无法改序），随 sortable 开关一并移除。
        sortable={false}
        playingTrackId={playingTrackId}
        className="detail-tracklist"
        onActivate={(_track, index) => playContext(tracks, index)}
        onPlayNext={handlePlayNext}
        onEnqueue={handleEnqueue}
        onUnplayableActivate={handleUnplayableActivate}
        favoriteIds={favorites.loaded ? favorites.favoriteIds : undefined}
        onToggleFavorite={handleToggleFavorite}
      />
    </div>
  )
}

export default AlbumDetail
