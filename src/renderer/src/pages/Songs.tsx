import { useEffect, type ReactElement } from 'react'
import { useI18n } from '../i18n'
import { useLibrary } from '../stores/libraryStore'
import { TrackList } from '../components/TrackList'

/**
 * Songs 页（T4.4）——用真实页面替换 PagePlaceholder 的 Songs 分支。
 *
 * 接线（沿用 T4.2 libraryStore 既有模式）：
 *   · useLibrary() 取列表 + 分页/排序参数；首屏经 refresh() 取数（setSort 内部自动 refresh）。
 *   · onSortChange 直接接 libraryStore.setSort（§3.7 七键排序白名单 → 自动重取）。
 *   · TrackList 纯展示，playingTrackId 当前无 playerStore 不注入（T5.6 接通）。
 *
 * 页头（对照 mockups/Songs.html）：标题绑定真实字段，但**总数不渲染**——
 * library:listSongs 是服务端分页（默认 limit 50、clamp 上界 200），songs.length 是
 * 当前页长度而非总数（T4.2 已核查无 songsCount 通道），用页长冒充总数即回归假数据
 * （违反 T4.1「不渲染假数据」）。故只渲染「全部歌曲」标题，不附计数。计数通道（library:getStats
 * 或 listSongs 返回 {items,total}）待 Phase 4 后补，届时再补总数行（计划 T4.2 备注已留痕）。
 */
export function Songs(): ReactElement {
  const { t } = useI18n()
  const library = useLibrary()

  useEffect(() => {
    void library.refresh()
  }, [library.refresh])

  return (
    <div className="page-wrap browse-page">
      <div className="page-head">
        <h2>{t('songs.heading')}</h2>
      </div>
      <TrackList
        songs={library.songs}
        loading={library.loading}
        error={library.error}
        sortBy={library.params.sortBy}
        order={library.params.order}
        onSortChange={library.setSort}
      />
    </div>
  )
}

export default Songs
