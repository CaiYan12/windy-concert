import { Link } from 'react-router-dom'
import { type ReactElement } from 'react'
import type { AlbumCard } from '../../../shared/types'
import { useI18n } from '../i18n'
import { api } from '../ipc/client'
import { Cover } from '../components/Cover'
import { Icon } from '../components/Icon'
import { useBrowseData } from './useBrowseData'
import { playContext } from './playerBridge'

/**
 * Albums 页（T4.4）——专辑网格（§3.7：网格 180px 卡片，封面 256 档，卡片 hover 显示播放按钮）。
 * 数据经 library:listAlbums IPC 取（全量、无分页，故卡片数 = 真实总数，可渲染 count）。
 * 样式逐块迁移自 mockup.css:928-1028（album-grid / album-card / card-play / card-copy），
 * 着色一律 var(--*)，见 styles/browse.css。
 *
 * 卡片 hover 播放按钮：当前 playerStore 未建（T5.6），点击走 playerBridge 占位；真实专辑
 * 播放需先取该专辑曲目再 loadContext，留待 T5.6 接通（此处挂占位函数并记录留痕）。
 */
export function Albums(): ReactElement {
  const { t } = useI18n()
  const { data: albums, loading, error } = useBrowseData<AlbumCard[]>(
    () => api.library.listAlbums(),
    []
  )

  return (
    <div className="page-wrap browse-page">
      <div className="page-head">
        <h2>{t('nav.albums')}</h2>
        {albums && albums.length > 0 ? (
          <p>{t('albums.total', { count: albums.length })}</p>
        ) : null}
      </div>

      {error ? (
        <div className="browse-state" role="status">
          <div className="browse-state-title">{t('songs.error')}</div>
          <div className="browse-state-hint">{error}</div>
        </div>
      ) : loading ? (
        <div className="browse-state">
          <div className="browse-state-title">{t('albums.loading')}</div>
        </div>
      ) : albums && albums.length > 0 ? (
        <div className="browse-scroll">
          <div className="album-grid" aria-label={t('nav.albums')}>
          {albums.map((album) => (
            <Link
              key={album.id}
              to={`/albums/${album.id}`}
              className="album-card"
              aria-label={album.title}
            >
              <Cover coverId={album.coverId} size={256} className="cover--grid" />
              <button
                type="button"
                className="card-play"
                aria-label={t('albumDetail.play')}
                onClick={(e) => {
                  // T5.6 留痕：计划 T5.6 接线清单未列 Albums 卡片播放钮（仅 Songs/AlbumDetail/
                  // ArtistDetail 三页 + 详情页按钮），保持占位不动。playerStore 已建（T5.3），
                  // playContext 现为真实接线——空数组会触发空上下文停止，无假播放副作用；
                  // 正式接通（先取专辑曲目再 playContext(tracks, 0)）留待后续任务立案。
                  e.preventDefault()
                  e.stopPropagation()
                  playContext([])
                }}
              >
                <Icon name="play--on-accent" size={20} />
              </button>
              <div className="card-copy">
                <div className="card-title">{album.title}</div>
                <div className="card-meta">
                  {album.year != null ? `${album.artistName} · ${album.year}` : album.artistName}
                </div>
              </div>
            </Link>
          ))}
          </div>
        </div>
      ) : (
        <div className="browse-state">
          <div className="browse-state-title">{t('empty.albums.title')}</div>
          <div className="browse-state-hint">{t('empty.albums.hint')}</div>
        </div>
      )}
    </div>
  )
}

export default Albums
