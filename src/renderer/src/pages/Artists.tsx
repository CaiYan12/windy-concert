import { Link } from 'react-router-dom'
import { type ReactElement } from 'react'
import type { ArtistCard } from '../../../shared/types'
import { useI18n } from '../i18n'
import { api } from '../ipc/client'
import { Icon } from '../components/Icon'
import { useBrowseData } from './useBrowseData'

/**
 * Artists 页（T4.4）——艺术家列表（§3.7：列表行 = 占位头像 + 名称 + 曲目数）。
 * 数据经 library:listArtists IPC 取（全量、无分页）。样式迁移自 mockup.css:1354-1409。
 * 头像为占位（artists 表无封面列，设计稿即 mic-2 占位图标；T6 起如需真实头像再扩展）。
 */
export function Artists(): ReactElement {
  const { t } = useI18n()
  const { data: artists, loading, error } = useBrowseData<ArtistCard[]>(
    () => api.library.listArtists(),
    []
  )

  return (
    <div className="page-wrap browse-page">
      <div className="page-head">
        <h2>{t('nav.artists')}</h2>
        {artists && artists.length > 0 ? (
          <p>{t('artists.total', { count: artists.length })}</p>
        ) : null}
      </div>

      {error ? (
        <div className="browse-state" role="status">
          <div className="browse-state-title">{t('songs.error')}</div>
          <div className="browse-state-hint">{error}</div>
        </div>
      ) : loading ? (
        <div className="browse-state">
          <div className="browse-state-title">{t('artists.loading')}</div>
        </div>
      ) : artists && artists.length > 0 ? (
        <div className="browse-scroll">
          <div className="artist-list" aria-label={t('nav.artists')}>
          {artists.map((artist) => (
            <Link
              key={artist.id}
              to={`/artists/${artist.id}`}
              className="artist-row"
              aria-label={artist.name}
            >
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
        </div>
      ) : (
        <div className="browse-state">
          <div className="browse-state-title">{t('empty.artists.title')}</div>
          <div className="browse-state-hint">{t('empty.artists.hint')}</div>
        </div>
      )}
    </div>
  )
}

export default Artists
