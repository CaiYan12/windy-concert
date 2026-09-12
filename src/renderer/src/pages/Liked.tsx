import { useEffect, type ReactElement } from 'react'
import type { TrackRow } from '../../../shared/types'
import { useI18n } from '../i18n'
import { usePlayerStore, usePlayingTrackId } from '../stores/playerStore'
import { useToastStore } from '../stores/toastStore'
import { formatCount } from '../stores/statsStore'
import {
  FAVORITE_SORT_KEYS,
  useFavorites,
  useFavoritesStore,
  type FavoriteSortKey
} from '../stores/favoritesStore'
import { Icon } from '../components/Icon'
import { TrackList } from '../components/TrackList'
import { playContext, shuffleContext } from './playerBridge'
import { usePlaylistMenu } from './playlistBridge'

/**
 * Liked 页（T6.1）——「收藏」自动歌单（§4.6 / F6-1；对照 mockups/Liked.html）。
 *
 * 结构（对照设计稿 normal 态）：
 *   · Hero（.hero.hero--liked）：**全项目第二处获准渐变**——绿色低透明渐变（--accent 12% → --bg-base）。
 *     第一处为 AlbumDetail 的 .hero--album（design-plan §4.3），§4.6 明文批准第二处（同构不同色）。
 *     含大标题 + 真实曲目数（favorites:list 全量返回，绝不用假总数）；封面位为心形图标盒。
 *   · 排序下拉（.sort-control，arrow-up-down 图标 + 原生 select）：5 键白名单
 *     favorited_at/artist/album/title/playCount（F6-1），选中经切片 refresh(sortBy) 服务端重排。
 *   · 曲目表 = TrackList 复用（双击整队=本页收藏列表上下文、右键、行内 ♡ 均取共享切片）。
 *   · 空态：零收藏时以 i18n 文案 + 图标呈现（不用假行填充）。
 *
 * 数据边界：
 *   · 取数经 favoritesStore（favorites:list）。进入本页 refresh() 一次以对齐全量——保证在 Songs/
 *     详情页新收藏的曲目立刻出现在本页（三处同步的「列表 → Liked」方向），并重建 favoriteIds；
 *     AppShell 启动另有 ensureLoaded 建集合（供未进本页时列表 ♡ 使用），二者由 refresh 序号守卫协调。
 *   · 展示行进一步按切片 isFavorite 过滤：别的消费方（如播放栏）取消收藏后，本页无需重取即移除该行。
 *   · loading/error：首次加载/失败走 browse-state（同 AlbumDetail 形态）；重排保留旧行不闪空。
 */

/** 排序键 → i18n 文案键：artist/album/playCount 复用既有列名/排序键；favorited_at/title 新增（对照设计稿下拉）。 */
const SORT_LABEL_KEYS: Record<FavoriteSortKey, string> = {
  favorited_at: 'liked.sort.favoritedAt',
  artist: 'songs.column.artist',
  album: 'songs.column.album',
  title: 'liked.sort.title',
  playCount: 'songs.sortBy.playCount'
}

export function Liked(): ReactElement {
  const { t } = useI18n()
  const playingTrackId = usePlayingTrackId()
  // T6.1：收藏共享切片——本页是 Liked 上下文，行 ♡/右键与 PlayerBar 同一事实源。
  const favorites = useFavorites()
  // T6.6 前置：右键「添加到歌单」子菜单接线（同 PlaylistDetail 模式）。
  const playlistMenu = usePlaylistMenu()

  // 进入本页向服务端对齐全量（refresh 同时重建 favoriteIds）。空依赖数组：仅挂载时一次。
  useEffect(() => {
    void useFavoritesStore.getState().refresh()
  }, [])

  // 展示行：以切片为唯一事实源——favorites 是服务端全量，再按 isFavorite 过滤（乐观取消即时消失；
  // loaded 前集合不完整，此时不过滤，避免把整表误清空）。
  const rows = favorites.loaded
    ? favorites.favorites.filter((track) => favorites.isFavorite(track.id))
    : favorites.favorites

  // T6.1：行双击整队（上下文=本页收藏列表 rows）；右键接 playNext/enqueue；不可播双击 → toast。
  const handlePlayNext = (track: TrackRow): void => {
    usePlayerStore.getState().playNext(track)
  }
  const handleEnqueue = (track: TrackRow): void => {
    usePlayerStore.getState().enqueue(track)
  }
  const handleUnplayableActivate = (): void => {
    useToastStore.getState().showToast(t('player.unsupportedFormat'))
  }
  const handleToggleFavorite = (track: TrackRow, next: boolean): void => {
    void useFavoritesStore.getState().toggle(track.id, next)
  }
  const handleSortChange = (sortBy: FavoriteSortKey): void => {
    void useFavoritesStore.getState().refresh(sortBy)
  }

  // 首次加载（尚无任何行）走加载态；重排（已有行）保留旧行不闪空。
  if (favorites.loading && !favorites.loaded) {
    return (
      <div className="page-wrap browse-page liked-page">
        <div className="browse-state">
          <div className="browse-state-title">{t('songs.loading')}</div>
        </div>
      </div>
    )
  }

  if (favorites.error && favorites.favorites.length === 0) {
    return (
      <div className="page-wrap browse-page liked-page">
        <div className="browse-state" role="status">
          <div className="browse-state-title">{t('songs.error')}</div>
          <div className="browse-state-hint">{favorites.error}</div>
        </div>
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="page-wrap browse-page liked-page">
        <div className="browse-state liked-empty" role="status">
          <Icon name="heart" size={24} className="liked-empty-icon" />
          <div className="browse-state-title">{t('empty.liked.title')}</div>
          <div className="browse-state-hint">{t('empty.liked.hint')}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="page-wrap browse-page liked-page">
      <section className="hero hero--liked">
        <div className="cover cover--hero liked-hero-cover">
          <Icon name="heart--accent" size={24} />
        </div>
        <div className="hero-copy">
          <div className="hero-label">{t('liked.label')}</div>
          <h2>{t('liked.title')}</h2>
          <div className="hero-artist">{t('liked.subtitle')}</div>
          <div className="hero-meta">
            <span>{t('liked.trackCount', { count: formatCount(rows.length) })}</span>
            <span className="dot" />
            <span>{t('liked.metaSort', { sort: t(SORT_LABEL_KEYS[favorites.sortBy]) })}</span>
          </div>
          <div className="hero-actions">
            <button
              type="button"
              className="round-action round-action--primary"
              aria-label={t('liked.playAll')}
              onClick={() => playContext(rows, 0)}
            >
              <Icon name="play--on-accent" size={20} />
            </button>
            <button
              type="button"
              className="round-action"
              aria-label={t('liked.shuffleAll')}
              onClick={() => shuffleContext(rows)}
            >
              <Icon name="shuffle" size={20} />
            </button>
          </div>
        </div>
      </section>

      <div className="section-heading">
        <h3>{t('liked.sectionHeading')}</h3>
        <label className="sort-control">
          <Icon name="arrow-up-down" size={16} />
          <span className="sr-only">{t('liked.sort.label')}</span>
          <select
            aria-label={t('liked.sort.aria')}
            value={favorites.sortBy}
            onChange={(e) => handleSortChange(e.target.value as FavoriteSortKey)}
          >
            {FAVORITE_SORT_KEYS.map((key) => (
              <option key={key} value={key}>
                {t(SORT_LABEL_KEYS[key])}
              </option>
            ))}
          </select>
        </label>
      </div>

      <TrackList
        songs={rows}
        playingTrackId={playingTrackId}
        onActivate={(_track, index) => playContext(rows, index)}
        onPlayNext={handlePlayNext}
        onEnqueue={handleEnqueue}
        onUnplayableActivate={handleUnplayableActivate}
        favoriteIds={favorites.loaded ? favorites.favoriteIds : undefined}
        onToggleFavorite={handleToggleFavorite}
        playlists={playlistMenu.playlists}
        onAddToPlaylist={playlistMenu.onAddToPlaylist}
        onCreatePlaylist={playlistMenu.onCreatePlaylist}
      />
    </div>
  )
}

export default Liked
