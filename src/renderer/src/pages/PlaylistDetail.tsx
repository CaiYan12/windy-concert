import { useEffect, useRef, useState, type FormEvent, type ReactElement } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { TrackRow } from '../../../shared/types'
import { useI18n } from '../i18n'
import { usePlayerStore, usePlayingTrackId } from '../stores/playerStore'
import { useToastStore } from '../stores/toastStore'
import { useFavorites, useFavoritesStore } from '../stores/favoritesStore'
import { applyTrackOrder, usePlaylists } from '../stores/playlistsStore'
import { CollageCover } from '../components/CollageCover'
import { Icon } from '../components/Icon'
import { TrackList } from '../components/TrackList'
import { playContext, shuffleContext } from './playerBridge'
import { usePlaylistMenu } from './playlistBridge'

/**
 * PlaylistDetail 页（T6.2 + T6.3）——歌单详情（对照 mockups/PlaylistDetail.html normal 态）。
 *
 * 结构：
 *   · 返回条（.button--quiet + chevron-left）→ /playlists。
 *   · Hero（.hero，无渐变——设计稿 PlaylistDetail 的 .hero 是 --bg-base 平涂，不给第三处渐变）：
 *     左侧 T6.4 CollageCover（.collage-cover.cover--hero，512 档，前 4 首封面）；右侧歌单名 +
 *     曲目数·总时长 + 「按添加顺序 / 自动拼贴封面」元信息 + 播放/随机/重命名/删除四个动作。
 *   · 曲目表（TrackList draggable）：HTML5 DnD 重排（T6.3）+ 右键「从歌单中移除」（T6.2）。
 *
 * 交互落点（任务书 T6.2/T6.3 逐条）：
 *   · 双击标题 → 内联重命名（.inline-input；Enter 提交、Escape 取消）；「重命名」按钮同入口。
 *   · 删除 → **行内确认条**（.inline-confirm，--danger 文字 + 3s 自动收回），不弹系统对话框
 *     （设计稿 Playlists.html state-note 明文「删除使用行内确认条，不调用系统弹窗」）。
 *   · 添加曲目 → 曲目行右键子菜单（TrackContextMenu 既有能力，经 usePlaylistMenu 接线）。
 *   · 移除曲目 → 右键菜单「从歌单中移除」→ removeTrack + toast。
 *   · 拖拽重排 → onReorder(from, to) → applyTrackOrder 求新顺序 → 全量 playlists:reorder 持久化。
 *
 * 数据与状态：
 *   · 取数经 playlistsStore 详情段（loadDetail(id)）；就绪判定 = detailId === 当前路由 id 且
 *     detail 非空（换歌单时不闪上一歌单的曲目）。
 *   · 空歌单（零曲目）保留 Hero（歌单身份/改名/删除仍可达），仅把曲目表换成空态——
 *     与设计稿「空态页不含 Hero」略有出入，取舍见报告：无 Hero 时空态下歌单名不可见。
 *
 * 列格偏离留痕：设计稿详情页曲目表用 `.track-table--compact`（6 列：#/封面/标题·艺术家/规格/时长
 *  + 拖拽格）。本实现复用既有 TrackList 的完整十列 + 拖拽格（11 列）——compact 形态在项目里由
 * SearchResults 自建 `CompactTrackRow` 实现，TrackList 不支持列子集；为一张表新增 TrackList 的
 * 列裁剪能力（牵动表头/行/响应式三处）超出 T6.2/T6.3 范围，故保持与 Songs 一致的列集并在此留痕。
 */
export function PlaylistDetail(): ReactElement {
  const { t } = useI18n()
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const playlistId = Number(id)
  const playingTrackId = usePlayingTrackId()
  const favorites = useFavorites()
  // 右键「添加到歌单」子菜单接线（歌单数据源 + 加曲 + 新建歌单，T4.3 起的三个 props）。
  const playlistMenu = usePlaylistMenu()

  const {
    detailId,
    detail,
    detailError,
    loadDetail,
    rename,
    remove,
    removeTrack,
    reorder
  } = usePlaylists()

  // 内联重命名态
  const [renaming, setRenaming] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const renameRef = useRef<HTMLInputElement>(null)
  // 删除行内确认条（3s 自动收回）
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  // id 变化即取详情（store 侧有请求序号守卫，旧响应不会覆盖新歌单）。
  useEffect(() => {
    void loadDetail(playlistId)
  }, [loadDetail, playlistId])

  useEffect(() => {
    if (renaming) renameRef.current?.focus()
  }, [renaming])

  // 确认条 3s 自动收回：展开即起计时，收起/卸载清定时器。
  useEffect(() => {
    if (!confirmingDelete) return
    const timer = window.setTimeout(() => setConfirmingDelete(false), 3000)
    return () => window.clearTimeout(timer)
  }, [confirmingDelete])

  if (detailError) {
    return (
      <div className="page-wrap browse-page">
        <div className="browse-state" role="status">
          <div className="browse-state-title">{t('songs.error')}</div>
          <div className="browse-state-hint">{detailError}</div>
        </div>
      </div>
    )
  }

  // 未就绪：初始未拉取 / 换歌单在飞 / 详情段仍停在别的 id → 一律 loading（不闪旧曲目）。
  if (detail === null || detailId !== playlistId) {
    return (
      <div className="page-wrap browse-page">
        <div className="browse-state">
          <div className="browse-state-title">{t('playlists.loading')}</div>
        </div>
      </div>
    )
  }

  // 已归属当前 id，但歌单不存在（repo 返回 { playlist: null }）。
  if (!detail.playlist) {
    return (
      <div className="page-wrap browse-page">
        <div className="browse-state" role="status">
          <div className="browse-state-title">{t('playlistDetail.notFound')}</div>
        </div>
      </div>
    )
  }

  const { playlist, tracks } = detail

  const startRename = (): void => {
    setNameDraft(playlist.name)
    setRenaming(true)
  }

  const submitRename = (event: FormEvent): void => {
    event.preventDefault()
    void (async () => {
      const next = nameDraft.trim()
      // 未改动或空名：直接收起，不发请求（空名由 store 拒绝，此处提前短路避免误解）。
      if (next.length === 0 || next === playlist.name) {
        setRenaming(false)
        return
      }
      const ok = await rename(playlist.id, next)
      setRenaming(false)
      useToastStore
        .getState()
        .showToast(ok ? t('toast.playlistRenamed') : t('toast.actionFailed'))
    })()
  }

  const handleDeleteConfirm = (): void => {
    void (async () => {
      const ok = await remove(playlist.id)
      if (!ok) {
        setConfirmingDelete(false)
        useToastStore.getState().showToast(t('toast.actionFailed'))
        return
      }
      useToastStore.getState().showToast(t('toast.playlistDeleted'))
      navigate('/playlists')
    })()
  }

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

  /** T6.3：拖拽落位 → 行内 index 换算新顺序 → 全量持久化。 */
  const handleReorder = (fromIndex: number, toIndex: number): void => {
    const next = applyTrackOrder(tracks, fromIndex, toIndex)
    if (next === tracks) return // no-op（同位置/越界）：不发请求
    void (async () => {
      const ok = await reorder(playlist.id, next.map((row) => row.id))
      if (!ok) useToastStore.getState().showToast(t('toast.actionFailed'))
    })()
  }

  /** T6.2：右键「从歌单中移除」→ store 乐观移除最小 index 的一次出现。 */
  const handleRemoveTrack = (track: TrackRow): void => {
    void (async () => {
      const ok = await removeTrack(playlist.id, track.id)
      useToastStore
        .getState()
        .showToast(ok ? t('toast.removedFromPlaylist') : t('toast.actionFailed'))
    })()
  }

  const totalMinutes = Math.round(tracks.reduce((sum, row) => sum + row.duration, 0) / 60)

  return (
    <div className="page-wrap browse-page">
      <div className="page-head">
        <Link to="/playlists" className="button button--quiet">
          <Icon name="chevron-left" size={16} />
          {t('playlistDetail.back')}
        </Link>
      </div>

      <section className="hero">
        <CollageCover tracks={tracks} size={512} className="cover--hero" alt={playlist.name} />
        <div className="hero-copy">
          <div className="hero-label">{t('playlistDetail.label')}</div>
          {renaming ? (
            <form className="hero-rename" onSubmit={submitRename}>
              <input
                ref={renameRef}
                className="inline-input"
                type="text"
                value={nameDraft}
                placeholder={t('playlistDetail.renamePlaceholder')}
                aria-label={t('playlists.nameLabel')}
                onChange={(e) => setNameDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.preventDefault()
                    setRenaming(false)
                  }
                }}
              />
            </form>
          ) : (
            <h2 onDoubleClick={startRename}>{playlist.name}</h2>
          )}
          <div className="hero-artist">
            {t('playlistDetail.trackCount', { count: playlist.trackCount })}
            {totalMinutes > 0
              ? ` · ${t('playlistDetail.totalMinutes', { count: totalMinutes })}`
              : ''}
          </div>
          <div className="hero-meta">
            <span>{t('playlistDetail.metaOrder')}</span>
            <span className="dot" />
            <span>{t('playlistDetail.metaCover')}</span>
          </div>
          <div className="hero-actions">
            <button
              type="button"
              className="round-action round-action--primary"
              aria-label={t('playlistDetail.play')}
              onClick={() => playContext(tracks, 0)}
            >
              <Icon name="play--on-accent" size={20} />
            </button>
            <button
              type="button"
              className="round-action"
              aria-label={t('playlistDetail.shuffle')}
              onClick={() => shuffleContext(tracks)}
            >
              <Icon name="shuffle" size={20} />
            </button>
            <button type="button" className="button button--quiet" onClick={startRename}>
              <Icon name="pencil" size={16} />
              {t('playlists.rename')}
            </button>
            <button
              type="button"
              className="button button--quiet danger-text"
              aria-label={t('playlists.delete')}
              onClick={() => setConfirmingDelete(true)}
            >
              <Icon name="trash-2" size={16} />
              {t('playlists.delete')}
            </button>
          </div>

          {/* 行内确认条：--danger 文字，3s 自动收回（不弹系统对话框）。
              类名逐字对照设计稿（Settings.html 的 .inline-confirm + .inline-actions +
              .button--quiet.danger-text），不另造按钮类。 */}
          {confirmingDelete ? (
            <div className="inline-confirm" role="alert">
              <span>{t('playlists.deleteConfirm', { name: playlist.name })}</span>
              <span className="inline-actions">
                <button
                  type="button"
                  className="button button--quiet danger-text"
                  onClick={handleDeleteConfirm}
                >
                  {t('playlists.deleteConfirmAction')}
                </button>
                <button
                  type="button"
                  className="button button--quiet"
                  onClick={() => setConfirmingDelete(false)}
                >
                  {t('common.cancel')}
                </button>
              </span>
            </div>
          ) : null}
        </div>
      </section>

      {tracks.length === 0 ? (
        <div className="browse-state" role="status">
          <div className="browse-state-title">{t('empty.playlistDetail.title')}</div>
          <div className="browse-state-hint">{t('empty.playlistDetail.hint')}</div>
          <Link to="/songs" className="button button--primary">
            {t('empty.playlistDetail.action')}
          </Link>
        </div>
      ) : (
        <TrackList
          songs={tracks}
          // 设计稿详情页表头无排序按钮（曲目按添加顺序，不承担排序语义）。
          sortable={false}
          draggable
          playingTrackId={playingTrackId}
          onReorder={handleReorder}
          onActivate={(_track, index) => playContext(tracks, index)}
          onPlayNext={handlePlayNext}
          onEnqueue={handleEnqueue}
          onUnplayableActivate={handleUnplayableActivate}
          favoriteIds={favorites.loaded ? favorites.favoriteIds : undefined}
          onToggleFavorite={handleToggleFavorite}
          playlists={playlistMenu.playlists}
          onAddToPlaylist={playlistMenu.onAddToPlaylist}
          onCreatePlaylist={playlistMenu.onCreatePlaylist}
          onRemoveFromPlaylist={handleRemoveTrack}
        />
      )}
    </div>
  )
}

export default PlaylistDetail
