import { useEffect, useRef, useState, type ReactElement } from 'react'
import { api } from '../ipc/client'
import { useI18n } from '../i18n'
import type { Settings } from '../../../shared/types'

/**
 * Settings 页（T7.1~T7.5，结构对照 mockups/Settings.html 页态 normal 的 settings-layout）。
 *
 * 分区（设计稿 nav 顺序）：General / Library / Playback / About。本批交付：
 *   · General —— 语言下拉（M0.1 仅 zh-CN 可选；English 项 disabled 附「0.5 提供」后缀，
 *     裁定③；mockup General 分区的「启动时打开上次页面」开关无 Settings 键支撑
 *     （§4.3-2 四键无此项），本批不渲染，留痕）。
 *   · Library —— T7.3 才做本体（目录管理/扫描进度）；本批渲染区头 + 一行占位文案
 *     （比整区留空多一句「何时可用」的如实告知，取舍留痕）。
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
    return () => {
      cancelled = true
    }
  }, [])

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

          {/* ---- Library：T7.3 填充本体（目录管理/扫描进度），本批仅区头 + 占位文案 ---- */}
          <section
            className="settings-section"
            id="library"
            ref={(el) => {
              sectionRefs.current.library = el
            }}
          >
            <h2>{t('settings.section.library')}</h2>
            <p>{t('settings.library.description')}</p>
            <p className="muted">{t('settings.library.placeholder')}</p>
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
