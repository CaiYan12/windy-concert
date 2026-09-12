import { useEffect, type ReactElement } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useI18n } from '../../i18n'
import { NAV_ITEMS } from '../../routes'
import { ensureStatsLoaded, formatCount, useStats } from '../../stores/statsStore'
import { ensurePlaylistsLoaded, usePlaylists } from '../../stores/playlistsStore'
import { useToastStore } from '../../stores/toastStore'
import { Icon } from '../Icon'

/**
 * 侧栏七项（顺序 = design-plan §4.1 侧栏结构：歌曲/专辑/艺术家/歌单/收藏/最近播放/设置）。
 * 不再单独维护：由 routes.ts 的 ROUTE_DEFS 带 nav 的条目派生（唯一源），labelKey 即该路由的 titleKey。
 * 图标映射对照 docs/design/icons.md 与 mockup.css：music-2 / disc-3 / mic-2 / library / heart / history / settings。
 * （T4.1 评审 I1：此前 NAV_ITEMS 与 ROUTE_DEFS 二处维护、7 组 labelKey/titleKey 完全重复，无测试守护。）
 */

/**
 * Sidebar —— 侧栏（T4.1 / T4.11 接线 nav-badge）。逐元素对照 mockups/Songs.html:13-42 与
 * mockup.css:138-304。活跃态：NavLink 自动输出 aria-current="page"，样式由
 * .nav-link[aria-current="page"] 驱动（mockup.css:217-243，含 ::before 左侧 3px --accent 指示条，
 * 无底色高亮）。
 *
 * nav-badge（T4.11）：设计稿核实（mockups/*.html 全量 grep `nav-badge`）——**仅「歌曲」一项有
 * 徽标**，显示曲目总数（设计稿样本 30,000，千位分隔）；专辑/艺术家等导航项无徽标位，故只实现
 * Songs 一处。数据经 statsStore 取 library:getStats（AppShell 不再中转——本组件自取，模式与
 * 各浏览页 useBrowseData 同风格；T4.1 立案时拟由 AppShell 传入 songsCount 的方案随 getStats
 * 通道落地作废，songsCount prop 移除）。stats 未就绪/失败不渲染徽标节点（禁假数据，不留 0/空壳）。
 */
export function Sidebar(): ReactElement {
  const { t } = useI18n()
  const navigate = useNavigate()
  const { stats } = useStats()
  // T6.2：侧栏「我的歌单」列表读共享切片（Playlists 页 / 详情页同一事实源）。
  const { playlists, listLoaded, creating, create } = usePlaylists()

  // 幂等首拉（scan done 自动刷新见 statsStore 模块级订阅）。
  useEffect(() => {
    ensureStatsLoaded()
    // T6.2：侧栏是歌单列表的常驻消费者——应用启动即建立列表（create/rename/delete 后由
    // store 自身 refresh 联动，本组件无需再取数）。
    ensurePlaylistsLoaded()
  }, [])

  /**
   * 侧栏「新建歌单」：与右键菜单的「新建歌单」同口径——以默认名立即落库（回车即得，
   * 不弹系统对话框），随后跳进详情页改名/加曲。失败只 toast，不改变当前路由。
   */
  const handleCreatePlaylist = (): void => {
    void (async () => {
      const row = await create(t('nav.playlists.untitled'))
      if (!row) {
        useToastStore.getState().showToast(t('toast.actionFailed'))
        return
      }
      navigate(`/playlists/${row.id}`)
    })()
  }

  return (
    <aside className="sidebar" aria-label={t('nav.ariaMain')}>
      <div className="brand-lockup">
        <div className="brand-mark">
          {/* 设计稿 brand-mark 图标为 17px（mockup.css:165-170）；Icon 尺寸档仅 12|15|16|20|24，
              取最接近的 16（1px 差异，T4.1 报告留痕）。opacity .92 由 shell.css 提供。 */}
          <Icon name="music-2" size={16} />
        </div>
        <div>
          <div className="brand-name">{t('app.name')}</div>
          <div className="brand-subtitle">{t('brand.subtitle')}</div>
        </div>
      </div>

      <nav aria-label={t('nav.ariaLibrary')}>
        <ul className="nav-list">
          {NAV_ITEMS.map((item) => (
            <li key={item.to}>
              <NavLink className="nav-link" to={item.to}>
                <Icon name={item.icon} />
                <span>{t(item.labelKey)}</span>
                {item.to === '/songs' && stats !== null ? (
                  <span className="nav-badge">{formatCount(stats.tracks)}</span>
                ) : null}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className="sidebar-divider" />

      <div className="sidebar-section-head">
        <span>{t('nav.myPlaylists')}</span>
        {/* 新建歌单入口（T6.2 接线）：以默认名建单并跳详情页改名；create 有重入守卫，连击不重复建。 */}
        <button
          type="button"
          aria-label={t('nav.playlists.new')}
          disabled={creating}
          onClick={handleCreatePlaylist}
        >
          <Icon name="plus" />
        </button>
      </div>

      <div className="playlist-scroll">
        {/* 歌单列表（T6.2）：仅在列表已加载后渲染真实行——未加载时保持空列表，不渲染假歌单。 */}
        <ul className="playlist-list">
          {listLoaded
            ? playlists.map((playlist) => (
                <li key={playlist.id}>
                  <NavLink className="playlist-link" to={`/playlists/${playlist.id}`}>
                    <span className="playlist-dot" />
                    <span>{playlist.name}</span>
                  </NavLink>
                </li>
              ))
            : null}
        </ul>
      </div>
    </aside>
  )
}

export default Sidebar
