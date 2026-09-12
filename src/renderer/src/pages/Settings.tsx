import { useEffect, useRef, useState, type ReactElement } from 'react'
import { api } from '../ipc/client'
import { useI18n } from '../i18n'
import { Icon } from '../components/Icon'
import type { IpcReturns } from '../../../shared/ipc'
import type { ScanProgress, Settings } from '../../../shared/types'

/** 目录行形态（经 IPC 返回类型派生，渲染层不反向依赖 main repo 模块）。 */
type FolderRow = IpcReturns['library:listFolders'][number]

/**
 * T7.3 Library 分区 —— 对照 mockups/Settings.html Library 分区（folder-list / inline-confirm /
 * switch / progress-track 样本）。
 *
 * 交互形态：
 *   · 目录列表：folder 图标 + 真实 Windows 路径（folderRepo 原值展示）+ 启用开关 +
 *     trash-2 删除；删除走行内确认条（禁系统弹窗），3s 自动收回（PlaylistDetail 同款）。
 *   · 添加按钮 → library:addFolder() 无参调用，main 侧弹系统目录选择框；用户取消选择
 *     在 main 侧 throw（'未选择目录'），此处按用户取消静默处理（仅 console.info 留痕）。
 *   · 「启动时自动扫描」开关绑 settings.autoScanOnStartup（settings:set 返回值确认回读，
 *     同 General 语言下拉模式）。
 *   · 「全量重扫」→ library:rescanAll()（fire-and-forget）；扫描中禁用按钮防重入——
 *     scanService 自身有 inFlight 重入守卫（并发调用返回同一 Promise），UI 侧禁用是
 *     第二道防线并给出视觉反馈（双保险，留痕）。
 *
 * scan:progress 订阅形态（多播核实留痕）：main 侧经 webContents.send 广播给窗口全部
 *   listener（ipc/index.ts onProgress 接线），非单播独占——libraryStore 的模块级常驻订阅
 *   （done→refresh songs）与本组件 useEffect 订阅互不干扰，各自收发；组件卸载即退订。
 */

/**
 * Settings 页（T7.1~T7.5，结构对照 mockups/Settings.html 页态 normal 的 settings-layout）。
 *
 * 分区（设计稿 nav 顺序）：General / Library / Playback / About。本批交付：
 *   · General —— 语言下拉（M0.1 仅 zh-CN 可选；English 项 disabled 附「0.5 提供」后缀，
 *     裁定③；mockup General 分区的「启动时打开上次页面」开关无 Settings 键支撑
 *     （§4.3-2 四键无此项），本批不渲染，留痕）。
 *   · Library —— T7.3 本体：目录列表（启用开关 + 行内确认删除）、添加目录（系统对话框）、
 *     「启动时自动扫描」开关、「全量重扫」+ 扫描进度条（详见下方 T7.3 块注）。
 *   · Playback —— 音量默认值**只读回显**（裁定②：实际音量控制在播放栏，此处不做修改
 *     控件、不扩 settings 键）；Metadata/Cache 分区不渲染占位（YAGNI，仅 About 声明规划）。
 *   · About —— 版本号（app:getVersion，T7.5 新增最小通道）+ §8 已知限制八条（逐条
 *     i18n）+ 技术栈致谢 + 0.5 规划声明。
 *
 * 状态形态取舍留痕：settings 数据为组件本地态 + 直调 api（**不建 settingsStore**——
 * 写操作低频、四键简单，zustand store 无第二个消费方；favoritesStore 先例是高频双向
 * 数据，此处不类比）。**确认回读**形态：以 `settings:set` 的返回值（settingsStore.set
 * 合并落盘后的完整 Settings）作为「写后确认」，一次 IPC 往返承担写+回读（handler 幂等、
 * 原子写见 settingsStore 留痕），不二次 get 往返。
 *
 * 锚点导航偏离留痕：设计稿 nav 为 `<a href="#general">` 页内锚点；本应用是 HashRouter
 * （URL hash 已被路由占用），`href="#x"` 会改写 location.hash 触发路由跳转/死链——
 * 故改为 button + scrollIntoView（aria-current 标记当前分区，对照 mockup 高亮形态）。
 */

/** 分区 id（section 元素 id + 导航滚动目标；设计稿锚点字面量）。 */
export const SETTINGS_SECTION_IDS = ['general', 'library', 'playback', 'about'] as const
export type SettingsSectionId = (typeof SETTINGS_SECTION_IDS)[number]

/** 扫描阶段 → i18n 键（phase 值域取 shared/types ScanProgress；'done' 收起进度条，不展示）。 */
const SCAN_PHASE_KEYS: Record<ScanProgress['phase'], string> = {
  stat: 'settings.library.phase.stat',
  parse: 'settings.library.phase.parse',
  cover: 'settings.library.phase.cover',
  done: 'settings.library.phase.done',
}

const SECTIONS: ReadonlyArray<{ id: SettingsSectionId; labelKey: string }> = [
  { id: 'general', labelKey: 'settings.section.general' },
  { id: 'library', labelKey: 'settings.section.library' },
  { id: 'playback', labelKey: 'settings.section.playback' },
  { id: 'about', labelKey: 'settings.section.about' },
]

export function Settings(): ReactElement {
  const { t } = useI18n()
  const [active, setActive] = useState<SettingsSectionId>('general')
  // settings null = 取数未落地（进度/版本位留空态）；版本号同理（'—' 兜底）。
  const [settings, setSettings] = useState<Settings | null>(null)
  const [version, setVersion] = useState('')
  // ---- T7.3 Library 分区状态 ----
  // folders null = 取数未落地（空态判断需区分「未拉到」与「确实零目录」）。
  const [folders, setFolders] = useState<FolderRow[] | null>(null)
  // scan 非 null = 扫描进行中（phase 'done' 即收起；驱动重扫按钮禁用与进度条展示）。
  const [scan, setScan] = useState<ScanProgress | null>(null)
  // 行内确认条：待确认移除的目录 id（null = 无确认条）。
  const [confirmingRemoveId, setConfirmingRemoveId] = useState<number | null>(null)
  const sectionRefs = useRef<Partial<Record<SettingsSectionId, HTMLElement | null>>>({})

  useEffect(() => {
    let cancelled = false
    api.settings
      .get()
      .then((s) => {
        if (!cancelled) setSettings(s)
      })
      .catch((err: unknown) => {
        if (!cancelled) console.warn('[settings] 读取设置失败', err)
      })
    api.app
      .getVersion()
      .then((v) => {
        if (!cancelled) setVersion(v)
      })
      .catch((err: unknown) => {
        if (!cancelled) console.warn('[settings] 读取版本失败', err)
      })
    api.library
      .listFolders()
      .then((rows) => {
        if (!cancelled) setFolders(rows)
      })
      .catch((err: unknown) => {
        if (!cancelled) console.warn('[settings] 读取目录列表失败', err)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // scan:progress 订阅：多播事件（webContents.send 广播），与 libraryStore 常驻订阅互不干扰；
  // 组件卸载退订（本页独占的进度 UI 状态随页面销毁）。
  useEffect(() => {
    return api.onScanProgress((p) => {
      setScan(p.phase === 'done' ? null : p)
    })
  }, [])

  // 行内确认条 3s 自动收回（PlaylistDetail 删除确认同款，防挂起误触）。
  useEffect(() => {
    if (confirmingRemoveId === null) return
    const timer = window.setTimeout(() => setConfirmingRemoveId(null), 3000)
    return () => {
      window.clearTimeout(timer)
    }
  }, [confirmingRemoveId])

  /** 重新拉取目录列表（目录增删/开关切换后调用）。 */
  async function refreshFolders(): Promise<void> {
    try {
      setFolders(await api.library.listFolders())
    } catch (err) {
      console.warn('[settings] 读取目录列表失败', err)
    }
  }

  /** 启用开关切换；成功后回读列表（folderRepo 权威值），失败仅记日志不抛进渲染层。 */
  async function handleToggleFolder(f: FolderRow): Promise<void> {
    try {
      await api.library.setFolderEnabled(f.id, !f.enabled)
      await refreshFolders()
    } catch (err) {
      console.warn('[settings] 切换目录启用状态失败', err)
    }
  }

  /** 添加目录（无参走系统对话框）；用户取消选择在 main 侧 throw，按取消静默处理。 */
  async function handleAddFolder(): Promise<void> {
    try {
      await api.library.addFolder()
      await refreshFolders()
    } catch (err) {
      console.info('[settings] 添加目录未完成（用户取消或失败）', err)
    }
  }

  /** 确认移除：移除后该目录下曲目在 main 侧立即标 missing（裁定口径），回读列表收起确认条。 */
  async function handleConfirmRemove(): Promise<void> {
    if (confirmingRemoveId === null) return
    try {
      await api.library.removeFolder(confirmingRemoveId)
      setConfirmingRemoveId(null)
      await refreshFolders()
    } catch (err) {
      console.warn('[settings] 移除目录失败', err)
    }
  }

  /**
   * 全量重扫：fire-and-forget（进度经 scan:progress 驱动 UI）；main 侧会先重置封面
   * 去重状态机再全量重解析。扫描中按钮已禁用（防重入第二道防线，见 T7.3 块注）。
   */
  async function handleRescanAll(): Promise<void> {
    try {
      await api.library.rescanAll()
    } catch (err) {
      console.warn('[settings] 触发全量重扫失败', err)
    }
  }

  /** 「启动时自动扫描」开关：settings:set + 返回值确认回读（同 General 语言下拉模式）。 */
  async function handleAutoScanToggle(): Promise<void> {
    if (!settings) return
    try {
      const confirmed = await api.settings.set({ autoScanOnStartup: !settings.autoScanOnStartup })
      setSettings(confirmed)
    } catch (err) {
      console.warn('[settings] 保存自动扫描设置失败', err)
    }
  }

  /** 锚点导航：滚动到分区并标记 aria-current（mockup 的页内锚点在 HashRouter 下的替代形态）。 */
  function goToSection(id: SettingsSectionId): void {
    setActive(id)
    sectionRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  /**
   * 语言变更（裁定③）：下拉仅 zh-CN 可选（English 项 disabled），onChange 理论上只会
   * 以 'zh-CN' 触发；仍以 settings:set 返回的完整 Settings（主进程合并+落盘后的确认
   * 回读）更新本地态，language 值域维持 'zh-CN' 不放宽。
   */
  async function handleLanguageChange(): Promise<void> {
    try {
      const confirmed = await api.settings.set({ language: 'zh-CN' })
      setSettings(confirmed)
    } catch (err) {
      console.warn('[settings] 保存语言失败', err)
    }
  }

  // 音量默认值只读回显（百分比四舍五入；settings 未落地时渲染 — 位）。
  const volumePercent = settings ? Math.round(settings.volume * 100) : null

  return (
    <div className="page-wrap browse-page settings-page">
      <div className="page-head">
        <div>
          <h2>{t('settings.title')}</h2>
          <p>{t('settings.subtitle')}</p>
        </div>
      </div>

      <div className="settings-layout">
        <nav className="settings-nav" aria-label={t('settings.navLabel')}>
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              aria-current={active === s.id ? 'true' : undefined}
              onClick={() => goToSection(s.id)}
            >
              {t(s.labelKey)}
            </button>
          ))}
        </nav>

        <div className="settings-content">
          {/* ---- General：语言（mockup 的「上次页面」开关无 settings 键支撑，不渲染，留痕）---- */}
          <section
            className="settings-section"
            id="general"
            ref={(el) => {
              sectionRefs.current.general = el
            }}
          >
            <h2>{t('settings.section.general')}</h2>
            <p>{t('settings.general.description')}</p>
            <div className="setting-row">
              <div className="setting-copy">
                <div className="setting-label">{t('settings.general.language')}</div>
                <div className="setting-help">{t('settings.general.languageHelp')}</div>
              </div>
              <select
                className="settings-select"
                aria-label={t('settings.general.language')}
                value="zh-CN"
                onChange={() => {
                  void handleLanguageChange()
                }}
              >
                {/* M0.1 值域锁 'zh-CN'（裁定③）：English 项 disabled，仅作占位提示。 */}
                <option value="zh-CN">{t('settings.general.language.zhCN')}</option>
                <option value="en" disabled>
                  {t('settings.general.language.enPlaceholder')}
                </option>
              </select>
            </div>
          </section>

          {/* ---- Library：T7.3 本体（目录列表 / 行内确认删除 / 添加 / 自动扫描 / 全量重扫+进度）---- */}
          <section
            className="settings-section"
            id="library"
            ref={(el) => {
              sectionRefs.current.library = el
            }}
          >
            <h2>{t('settings.section.library')}</h2>
            <p>{t('settings.library.description')}</p>
            {/* 目录列表（mockup folder-list/folder-row 样本）：folder 图标 + 真实路径 + 开关 + 删除 */}
            {folders !== null && folders.length === 0 && (
              <p className="muted" data-field="folder-empty">
                {t('settings.library.empty')}
              </p>
            )}
            <ul className="folder-list" data-field="folder-list">
              {(folders ?? []).map((f) => (
                <li className="folder-row" key={f.id}>
                  <Icon name="folder" size={16} />
                  <div className="folder-copy">
                    <span className="path" title={f.path}>
                      {f.path}
                    </span>
                    <span className="folder-status">
                      {t(f.enabled ? 'settings.library.enabled' : 'settings.library.disabled')}
                    </span>
                  </div>
                  <button
                    className="switch"
                    type="button"
                    role="switch"
                    aria-checked={f.enabled}
                    aria-label={t(f.enabled ? 'settings.library.disableAria' : 'settings.library.enableAria', {
                      path: f.path,
                    })}
                    data-field={`folder-switch-${f.id}`}
                    onClick={() => {
                      void handleToggleFolder(f)
                    }}
                  />
                  <button
                    className="icon-button"
                    type="button"
                    aria-label={t('settings.library.removeAria', { path: f.path })}
                    data-field={`folder-remove-${f.id}`}
                    onClick={() => setConfirmingRemoveId(f.id)}
                  >
                    <Icon name="trash-2" size={16} />
                  </button>
                </li>
              ))}
            </ul>
            {/* 行内确认条（对照 Settings.html 样本，禁系统弹窗；样式复用 playlists.css 全局 .inline-confirm） */}
            {confirmingRemoveId !== null &&
              (() => {
                const target = (folders ?? []).find((f) => f.id === confirmingRemoveId)
                if (!target) return null
                return (
                  <div className="inline-confirm" role="alert" data-field="remove-confirm">
                    <span>{t('settings.library.removeConfirm', { path: target.path })}</span>
                    <span className="inline-actions">
                      <button className="button button--quiet danger-text" type="button" onClick={() => { void handleConfirmRemove() }}>
                        {t('settings.library.confirmRemove')}
                      </button>
                      <button className="button button--quiet" type="button" onClick={() => setConfirmingRemoveId(null)}>
                        {t('settings.library.cancel')}
                      </button>
                    </span>
                  </div>
                )
              })()}
            <div className="inline-actions">
              <button className="button" type="button" data-field="add-folder" onClick={() => { void handleAddFolder() }}>
                <Icon name="folder-plus" size={16} />
                {t('settings.library.addFolder')}
              </button>
              {/* 扫描中禁用（防重入 UI 侧防线；scanService 另有 inFlight 守卫，双保险留痕） */}
              <button
                className="button button--quiet"
                type="button"
                data-field="rescan-all"
                disabled={scan !== null}
                onClick={() => {
                  void handleRescanAll()
                }}
              >
                <Icon name="refresh-cw" size={16} />
                {scan !== null ? t('settings.library.scanning') : t('settings.library.rescanAll')}
              </button>
            </div>
            {/* 「启动时自动扫描」开关（绑 settings.autoScanOnStartup，确认回读） */}
            <div className="setting-row">
              <div className="setting-copy">
                <div className="setting-label">{t('settings.general.autoScanOnStartup')}</div>
                <div className="setting-help">{t('settings.general.autoScanHelp')}</div>
              </div>
              <button
                className="switch"
                type="button"
                role="switch"
                aria-checked={settings?.autoScanOnStartup ?? false}
                aria-label={t('settings.general.autoScanOnStartup')}
                data-field="auto-scan-switch"
                disabled={settings === null}
                onClick={() => {
                  void handleAutoScanToggle()
                }}
              />
            </div>
            {/* 扫描进度条（mockup scan-status 样本：done/total + 阶段文案 + 百分比 + 进度槽） */}
            {scan !== null && (
              <div className="scan-status" data-field="scan-status">
                <div className="scan-line">
                  <span>
                    {t('settings.library.scanProgress', { done: scan.done, total: scan.total })} ·{' '}
                    {t(SCAN_PHASE_KEYS[scan.phase])}
                  </span>
                  <span className="numeric">{scan.total > 0 ? Math.round((scan.done / scan.total) * 100) : 0}%</span>
                </div>
                <div className="progress-track">
                  <div
                    className="progress-fill"
                    style={{ width: `${scan.total > 0 ? Math.round((scan.done / scan.total) * 100) : 0}%` }}
                  />
                </div>
              </div>
            )}
          </section>

          {/* ---- Playback：音量默认值只读回显（裁定②）；Metadata/Cache 不渲染占位（YAGNI）---- */}
          <section
            className="settings-section"
            id="playback"
            ref={(el) => {
              sectionRefs.current.playback = el
            }}
          >
            <h2>{t('settings.section.playback')}</h2>
            <p>{t('settings.playback.description')}</p>
            <div className="setting-row">
              <div className="setting-copy">
                <div className="setting-label">{t('settings.playback.volumeDefault')}</div>
                <div className="setting-help">{t('settings.playback.volumeDefaultHelp')}</div>
              </div>
              {/* 只读回显：无 input/slider 控件（实际音量在播放栏，见头注裁定②）。 */}
              <span className="pill numeric" data-field="volume-default">
                {volumePercent === null ? '—' : `${volumePercent}%`}
              </span>
            </div>
          </section>

          {/* ---- About：版本 + §8 已知限制八条 + 技术栈致谢 + 0.5 规划声明 ---- */}
          <section
            className="settings-section"
            id="about"
            ref={(el) => {
              sectionRefs.current.about = el
            }}
          >
            <h2>{t('settings.section.about')}</h2>
            <p>
              <span className="version" data-field="app-version">
                {version || '—'}
              </span>{' '}
              · {t('settings.about.tagline')}
            </p>
            <div className="section-heading">
              <h3>{t('settings.about.limitations')}</h3>
              <span className="count">{t('settings.about.limitationsScope')}</span>
            </div>
            {/* §8 八条逐条 i18n（finale-analysis.md §8 原文口径，版本标注保留在条目文案内）。 */}
            <ul className="about-list">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                <li key={n}>{t(`settings.about.limit${n}`)}</li>
              ))}
            </ul>
            <div className="section-heading">
              <h3>{t('settings.about.creditsHeading')}</h3>
            </div>
            <p>{t('settings.about.credits')}</p>
            <p className="muted">{t('settings.about.roadmap05')}</p>
          </section>
        </div>
      </div>
    </div>
  )
}

export default Settings
