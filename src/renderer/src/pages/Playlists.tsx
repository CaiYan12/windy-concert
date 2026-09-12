import { useEffect, useRef, useState, type FormEvent, type ReactElement } from 'react'
import { Link, useNavigate } from 'react-router-dom'
// PlaylistRow 为 repo 层返回形态收口点（与 playlistsStore 同款 type-only 引用，运行时擦除）。
import type { PlaylistRow } from '../../../main/database/repositories/playlistRepo'
import { useI18n } from '../i18n'
import { api } from '../ipc/client'
import { CollageCover } from '../components/CollageCover'
import { Icon } from '../components/Icon'
import { useToastStore } from '../stores/toastStore'
import { ensurePlaylistsLoaded, usePlaylists } from '../stores/playlistsStore'
import { playContext } from './playerBridge'

/**
 * Playlists 页（T6.2）——歌单网格（对照 mockups/Playlists.html normal 态）。
 *
 * 结构：
 *   · 页头：eyebrow（Library / Playlists）+ 「我的歌单」标题 + 副标题（真实歌单数 + 拼贴封面说明）。
 *   · 网格（.playlist-grid，auto-fill minmax(160px,1fr)，同 .album-grid）：第一张是**虚线新建卡**
 *     （.new-card），其余为歌单卡（.playlist-card，封面 = T6.4 CollageCover 合成 2×2 前 4 首封面）。
 *   · 空态：零歌单时渲染 .browse-state（标题/提示）+ 同一张虚线新建卡作为唯一行动点
 *     （对照设计稿 empty 态的「创建你的第一张歌单」+ 新建按钮，但不另建一套 .empty-state 样式
 *     ——项目既有空态一律走 .browse-state，见 Albums/Liked 页留痕）。
 *
 * 内联命名（对照设计稿 mockup.js 的 data-start-inline / data-inline-input 行为）：
 *   「新建歌单」→ 同一张卡就地变形成 <form>（.new-card--editing）+ .inline-input；
 *   Enter 提交（空名回退默认名「未命名歌单」，与 mockup.js `value.trim() || '未命名歌单'` 同口径），
 *   Escape 取消。**不弹系统对话框**（设计稿 state-note 明文）。
 *   提交成功后导航进新歌单详情页——新建即以默认名 + 空曲目落库，命名/加曲在详情页继续。
 *
 * 卡片播放钮（.card-play，设计稿 Playlists.html:11-13）：
 *   歌单列表接口只带 coverIds/trackCount（无曲目行），故点击时按 id 取一次详情再 playContext；
 *   trackCount === 0 的歌单不渲染播放钮（避免无内容可播的死按钮）。
 *   与 Albums 页的卡片播放钮不同（那里 T5.6 明确留白未接），此处按 id 取数为真实播放路径。
 */
export function Playlists(): ReactElement {
  const { t } = useI18n()
  const navigate = useNavigate()
  const { playlists, listLoading, listError, listLoaded, creating, create } = usePlaylists()
  // 内联命名态（local）：卡内变形，不进全局 store。
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // 幂等首拉（Sidebar / AppShell 亦会调用；直接深链进本页时兜底）。
  useEffect(() => {
    ensurePlaylistsLoaded()
  }, [])

  // 进入命名态后聚焦输入框（每次重新进入都聚焦；jsdom 无布局亦可聚焦）。
  useEffect(() => {
    if (naming) inputRef.current?.focus()
  }, [naming])

  const startNaming = (): void => {
    setName('')
    setNaming(true)
  }

  const cancelNaming = (): void => {
    setNaming(false)
    setName('')
  }

  const submitNaming = (event: FormEvent): void => {
    event.preventDefault()
    void (async () => {
      // 空名回退默认名（对照 mockup.js：`input.value.trim() || '未命名歌单'`）。
      const trimmed = name.trim()
      const row = await create(trimmed.length > 0 ? trimmed : t('nav.playlists.untitled'))
      if (!row) {
        // create 返回 null = 空名/通道不可用/请求失败（空名已在此回退，故只剩后两者）。
        useToastStore.getState().showToast(t('toast.actionFailed'))
        return
      }
      setNaming(false)
      setName('')
      // 直接进详情页：歌单已建但仍为空，用户在此改名/加曲（新建 toast 由详情页承担）。
      navigate(`/playlists/${row.id}`)
    })()
  }

  const handleCardPlay = (playlist: PlaylistRow): void => {
    void (async () => {
      try {
        const detail = await api.playlists.get(playlist.id)
        if (detail.tracks.length === 0) return
        playContext(detail.tracks, 0)
      } catch {
        useToastStore.getState().showToast(t('toast.actionFailed'))
      }
    })()
  }

  // 新建卡（虚线）：未命名时为 <button>，命名中变形为 <form>。两条分支共用，避免重复 DOM。
  const newCard = naming ? (
    <form className="new-card new-card--editing" onSubmit={submitNaming}>
      <input
        ref={inputRef}
        className="inline-input"
        type="text"
        value={name}
        disabled={creating}
        placeholder={t('playlists.newPlaceholder')}
        aria-label={t('playlists.nameLabel')}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault()
            cancelNaming()
          }
        }}
      />
    </form>
  ) : (
    <button type="button" className="new-card" onClick={startNaming}>
      <Icon name="plus" size={24} />
      <span>{t('playlists.new')}</span>
    </button>
  )

  return (
    <div className="page-wrap browse-page">
      <div className="page-head">
        <div>
          <span className="eyebrow">{t('playlists.eyebrow')}</span>
          <h2>{t('playlists.title')}</h2>
          {listLoaded ? (
            <p>{t('playlists.subtitle', { count: playlists.length })}</p>
          ) : null}
        </div>
      </div>

      {listError && playlists.length === 0 ? (
        <div className="browse-state" role="status">
          <div className="browse-state-title">{t('playlists.loadError')}</div>
          <div className="browse-state-hint">{listError}</div>
        </div>
      ) : listLoading && !listLoaded ? (
        <div className="browse-state">
          <div className="browse-state-title">{t('playlists.loading')}</div>
        </div>
      ) : playlists.length === 0 ? (
        <div className="browse-state playlists-empty" role="status">
          <Icon name="library" size={24} className="playlists-empty-icon" />
          <div className="browse-state-title">{t('empty.playlists.title')}</div>
          <div className="browse-state-hint">{t('empty.playlists.hint')}</div>
          {newCard}
        </div>
      ) : (
        <div className="browse-scroll">
          <div className="playlist-grid" aria-label={t('playlists.title')}>
            {newCard}
            {playlists.map((playlist) => (
              <Link
                key={playlist.id}
                to={`/playlists/${playlist.id}`}
                className="playlist-card"
                aria-label={playlist.name}
              >
                <CollageCover
                  // 列表接口的派生 coverIds（前 4 首有封面的曲目）→ 拼贴格数据；不足补占位。
                  tracks={playlist.coverIds.map((coverId) => ({ coverId }))}
                  size={256}
                  className="cover--grid"
                />
                {playlist.trackCount > 0 ? (
                  <button
                    type="button"
                    className="card-play"
                    aria-label={t('playlists.cardPlay', { name: playlist.name })}
                    onClick={(e) => {
                      // 卡片本体是 Link：阻断导航，只播不跳。
                      e.preventDefault()
                      e.stopPropagation()
                      handleCardPlay(playlist)
                    }}
                  >
                    <Icon name="play--on-accent" size={20} />
                  </button>
                ) : null}
                <div className="card-copy">
                  <div className="card-title">{playlist.name}</div>
                  <div className="card-meta">
                    {t('playlists.cardMeta', { count: playlist.trackCount })}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default Playlists
