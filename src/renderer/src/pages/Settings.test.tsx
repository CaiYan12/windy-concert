/**
 * Settings 页单测（T7.1~T7.5，jsdom project）——哨兵 i18n + 客户端挂载（无 @testing-library）。
 *
 * 覆盖（任务验收点）：
 *   · 四分区渲染：nav 四项 + general/library/playback/about 四个 section；
 *   · 锚点导航：click 导航项 → aria-current 迁移 + scrollIntoView 定位（HashRouter 下
 *     以 button+scrollIntoView 替代页内锚点，见 Settings.tsx 头注留痕）；
 *   · 语言下拉：zh-CN 选中 + English 项 disabled（裁定③）；change → settings:set 接线，
 *     以 set 返回值确认回读更新本地态；
 *   · Playback：音量默认值只读回显（pill 百分比；分区零 input/slider 修改控件——裁定②）；
 *   · About：app:getVersion 版本号渲染 + §8 已知限制八条 + 致谢 + 0.5 规划声明；
 *   · Library（T7.3）：目录列表渲染（folder 图标行 + 原值路径 + 开关 + trash-2）、
 *     开关 → setFolderEnabled 接线、行内确认条（确认/取消/移除接线）、添加按钮 →
 *     addFolder 无参调用、「启动时自动扫描」开关 → settings:set 确认回读、
 *     「全量重扫」→ rescanAll + 进度事件驱动（进行中禁用、done 收起、退订）。
 *
 * api 桩：browseFixtures 的 apiStub 为 no-op Proxy，逐键覆写 settings / app / library /
 *   onScanProgress 四处。
 */
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ScanProgress, Settings as SettingsModel } from '../../../shared/types'
import { installSentinelI18n, mountPage } from './browseFixtures'
import { Settings } from './Settings'

const BASE_SETTINGS: SettingsModel = {
  language: 'zh-CN',
  autoScanOnStartup: true,
  volume: 0.8,
  muted: false,
}

/** 目录行桩（T7.3；形态对齐 folderRepo FolderRow）。 */
interface FolderRowStub {
  id: number
  path: string
  enabled: boolean
  recursive: boolean
}

let getSettingsResult: SettingsModel = BASE_SETTINGS
let setCalls: Array<Partial<SettingsModel>> = []
let setReturn: SettingsModel = BASE_SETTINGS
let versionResult = ''
let failGet = false
let getCalls = 0
let getVersionCalls = 0

// ---- T7.3 library 通道桩状态 ----
let foldersResult: FolderRowStub[] = []
let listFoldersCalls = 0
let setFolderEnabledCalls: Array<{ id: number; enabled: boolean }> = []
let removeFolderCalls: number[] = []
let addFolderCalls = 0
let scanCalls = 0
let rescanAllCalls = 0
let failListFolders = false

// ---- onScanProgress 订阅桩 ----
let scanProgressCb: ((p: ScanProgress) => void) | null = null
let unsubscribeCalls = 0

/** 覆写 apiStub 的 settings / app / library / onScanProgress（Recent.test 的 installHistoryApi 同款手法）。 */
function installSettingsApi(): void {
  const w = globalThis.window as unknown as { api: Record<string, unknown> }
  w.api.settings = {
    get: async (): Promise<SettingsModel> => {
      getCalls += 1
      if (failGet) return Promise.reject(new Error('settings failed'))
      return getSettingsResult
    },
    set: async (partial: Partial<SettingsModel>): Promise<SettingsModel> => {
      setCalls.push(partial)
      return setReturn
    },
  }
  w.api.app = {
    getVersion: async (): Promise<string> => {
      getVersionCalls += 1
      return versionResult
    },
  }
  w.api.library = {
    listFolders: async (): Promise<FolderRowStub[]> => {
      listFoldersCalls += 1
      if (failListFolders) return Promise.reject(new Error('listFolders failed'))
      return foldersResult
    },
    addFolder: async (): Promise<{ id: number }> => {
      addFolderCalls += 1
      return { id: 99 }
    },
    scan: async (): Promise<void> => {
      scanCalls += 1
    },
    removeFolder: async (id: number): Promise<void> => {
      removeFolderCalls.push(id)
    },
    setFolderEnabled: async (id: number, enabled: boolean): Promise<void> => {
      setFolderEnabledCalls.push({ id, enabled })
    },
    rescanAll: async (): Promise<void> => {
      rescanAllCalls += 1
    },
  }
  w.api.onScanProgress = (cb: (p: ScanProgress) => void): (() => void) => {
    scanProgressCb = cb
    return () => {
      unsubscribeCalls += 1
    }
  }
}

beforeEach(() => {
  installSentinelI18n()
  installSettingsApi()
  getSettingsResult = BASE_SETTINGS
  setReturn = BASE_SETTINGS
  setCalls = []
  versionResult = ''
  failGet = false
  getCalls = 0
  getVersionCalls = 0
  foldersResult = []
  listFoldersCalls = 0
  setFolderEnabledCalls = []
  removeFolderCalls = []
  addFolderCalls = 0
  scanCalls = 0
  rescanAllCalls = 0
  failListFolders = false
  scanProgressCb = null
  unsubscribeCalls = 0
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'info').mockImplementation(() => {})
  // jsdom 无滚动几何：scrollIntoView 未实现，桩记录调用即可（定位正确性由 ref 接线保证）。
  Element.prototype.scrollIntoView = vi.fn()
})

afterEach(() => {
  vi.restoreAllMocks()
  // @ts-expect-error 测试桩清理（还原原型，避免跨文件污染）
  delete Element.prototype.scrollIntoView
})

async function mountSettings(): Promise<{ container: HTMLElement; unmount: () => void }> {
  const page = mountPage(<Settings />)
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
  return page
}

describe('Settings 页骨架（T7.1）', () => {
  it('四分区渲染：nav 四项 + general/library/playback/about 四个 section', async () => {
    const { container, unmount } = await mountSettings()
    const nav = container.querySelector('.settings-nav')!
    const navButtons = [...nav.querySelectorAll('button')]
    expect(navButtons).toHaveLength(4)
    expect(navButtons.map((b) => b.textContent)).toEqual([
      '«settings.section.general»',
      '«settings.section.library»',
      '«settings.section.playback»',
      '«settings.section.about»'
    ])
    for (const id of ['general', 'library', 'playback', 'about']) {
      expect(container.querySelector(`section.settings-section#${id}`)).not.toBeNull()
    }
    unmount()
  })

  it('挂载即拉 settings:get 与 app:getVersion 各一次（StrictMode 之外的 mount 期单次取数）', async () => {
    await mountSettings()
    expect(getCalls).toBe(1)
    expect(getVersionCalls).toBe(1)
  })

  it('锚点导航：点击导航项 → aria-current 迁移 + scrollIntoView 定位该分区', async () => {
    const { container, unmount } = await mountSettings()
    const navButtons = [...container.querySelectorAll('.settings-nav button')] as HTMLButtonElement[]
    expect(navButtons[0].getAttribute('aria-current')).toBe('true')

    const aboutSection = container.querySelector('section#about')!
    act(() => {
      navButtons[3].click()
    })
    expect(navButtons[3].getAttribute('aria-current')).toBe('true')
    expect(navButtons[0].getAttribute('aria-current')).toBeNull()
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled()
    // 桩形式是原型方法，无法直接取 this——以 ref 挂载正确性佐证：about section 存在且为最后分区。
    expect(aboutSection.querySelector('.about-list')).not.toBeNull()
    unmount()
  })
})

describe('General 分区（T7.2，裁定③）', () => {
  it('语言下拉：zh-CN 选中；English 项 disabled 且为占位提示键', async () => {
    const { container, unmount } = await mountSettings()
    const select = container.querySelector('select.settings-select') as HTMLSelectElement
    expect(select.value).toBe('zh-CN')
    const options = [...select.options]
    expect(options).toHaveLength(2)
    expect(options[1].disabled).toBe(true)
    expect(options[1].textContent).toBe('«settings.general.language.enPlaceholder»')
    expect(options[1].value).toBe('en')
    unmount()
  })

  it('语言 change → settings:set({language:"zh-CN"})，以返回值确认回读更新本地态', async () => {
    const confirmed: SettingsModel = { ...BASE_SETTINGS, volume: 0.5 }
    setReturn = confirmed
    const { container, unmount } = await mountSettings()
    const select = container.querySelector('select.settings-select') as HTMLSelectElement
    await act(async () => {
      select.dispatchEvent(new Event('change', { bubbles: true }))
      await Promise.resolve()
    })
    expect(setCalls).toEqual([{ language: 'zh-CN' }])
    // 确认回读：pill 从 get 的 80% 更新为 set 返回的 50%（本地态被主进程确认值覆盖）。
    const pill = container.querySelector('[data-field="volume-default"]')!
    expect(pill.textContent).toBe('50%')
    unmount()
  })
})

describe('Library 分区（T7.3）', () => {
  /** 目录行桩便捷构造。 */
  const mkFolder = (id: number, path: string, enabled: boolean): FolderRowStub => ({
    id,
    path,
    enabled,
    recursive: true,
  })

  it('目录列表渲染：folder 行 + 原值路径 + 启用/停用状态 + 开关与删除 aria 接线', async () => {
    foldersResult = [mkFolder(1, 'D:\\Music', true), mkFolder(2, 'E:\\Archive\\Concert', false)]
    const { container, unmount } = await mountSettings()
    const rows = [...container.querySelectorAll('#library .folder-row')]
    expect(rows).toHaveLength(2)
    // 路径原值展示（folderRepo 存储形态）+ title 悬停全文
    const paths = rows.map((r) => r.querySelector('.path')!.textContent)
    expect(paths).toEqual(['D:\\Music', 'E:\\Archive\\Concert'])
    expect(rows[0].querySelector('.path')!.getAttribute('title')).toBe('D:\\Music')
    // 状态文案：哨兵键区分启用/停用
    expect(rows[0].querySelector('.folder-status')!.textContent).toBe('«settings.library.enabled»')
    expect(rows[1].querySelector('.folder-status')!.textContent).toBe('«settings.library.disabled»')
    // 开关 aria-checked 与删除按钮 aria-label（含 path 插值）
    const switch1 = rows[0].querySelector('[role="switch"]')!
    expect(switch1.getAttribute('aria-checked')).toBe('true')
    expect(switch1.getAttribute('aria-label')).toBe('«settings.library.disableAria»')
    const switch2 = rows[1].querySelector('[role="switch"]')!
    expect(switch2.getAttribute('aria-checked')).toBe('false')
    expect(switch2.getAttribute('aria-label')).toBe('«settings.library.enableAria»')
    const removeBtn = rows[0].querySelector('.icon-button')!
    expect(removeBtn.getAttribute('aria-label')).toBe('«settings.library.removeAria»')
    unmount()
  })

  it('零目录空态：渲染空态文案而非空列表', async () => {
    const { container, unmount } = await mountSettings()
    expect(container.querySelector('[data-field="folder-empty"]')!.textContent).toBe(
      '«settings.library.empty»'
    )
    expect(container.querySelectorAll('.folder-row')).toHaveLength(0)
    unmount()
  })

  it('启用开关 → setFolderEnabled(id,!enabled) + 列表重新拉取', async () => {
    foldersResult = [mkFolder(1, 'D:\\Music', true)]
    const { container, unmount } = await mountSettings()
    expect(listFoldersCalls).toBe(1)
    // jsdom/nwsapi 怪癖规避：跨用例多次挂载后，「#id + 两级后代」长选择器偶发失配
    // （DOM 已验证正确，DBG 实证）；统一用「先取行、行内再查」的作用域模式（与上例一致）。
    const row = container.querySelector('.folder-row')!
    const switch1 = row.querySelector('[role="switch"]') as HTMLButtonElement
    await act(async () => {
      switch1.click()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(setFolderEnabledCalls).toEqual([{ id: 1, enabled: false }])
    expect(listFoldersCalls).toBe(2) // 回读刷新
    unmount()
  })

  it('删除：trash-2 点击 → 行内确认条出现；确认 → removeFolder 接线并收起；取消 → 仅收起', async () => {
    foldersResult = [mkFolder(7, 'E:\\Archive\\Concert', true)]
    const { container, unmount } = await mountSettings()
    // 初始无确认条
    expect(container.querySelector('[data-field="remove-confirm"]')).toBeNull()
    // 作用域查询（同上例 jsdom 怪癖规避留痕）
    const removeBtn = container.querySelector('.folder-row .icon-button') as HTMLButtonElement
    await act(async () => {
      removeBtn.click()
    })
    const confirmBar = container.querySelector('[data-field="remove-confirm"]')!
    expect(confirmBar).not.toBeNull()
    // 确认条文案：removeConfirm 哨兵（path 插值由真值翻译承担，哨兵形态仅锚定键）
    expect(confirmBar.textContent).toContain('«settings.library.removeConfirm»')
    expect(confirmBar.textContent).toContain('«settings.library.confirmRemove»')
    expect(confirmBar.textContent).toContain('«settings.library.cancel»')
    // 取消：收起且不调用 removeFolder
    const buttons = [...confirmBar.querySelectorAll('button')] as HTMLButtonElement[]
    await act(async () => {
      buttons[1].click()
      await Promise.resolve()
    })
    expect(container.querySelector('[data-field="remove-confirm"]')).toBeNull()
    expect(removeFolderCalls).toEqual([])
    // 再开确认条 → 确认：removeFolder(7) + 列表刷新 + 收起
    await act(async () => {
      removeBtn.click()
    })
    const confirmBar2 = container.querySelector('[data-field="remove-confirm"]')!
    const confirmBtn = [...confirmBar2.querySelectorAll('button')][0] as HTMLButtonElement
    await act(async () => {
      confirmBtn.click()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(removeFolderCalls).toEqual([7])
    expect(listFoldersCalls).toBe(2)
    expect(container.querySelector('[data-field="remove-confirm"]')).toBeNull()
    unmount()
  })

  it('添加按钮 → addFolder() 无参调用（main 侧走系统对话框）+ 列表重新拉取', async () => {
    const { container, unmount } = await mountSettings()
    const addBtn = container.querySelector('[data-field="add-folder"]') as HTMLButtonElement
    await act(async () => {
      addBtn.click()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(addFolderCalls).toBe(1)
    expect(scanCalls).toBe(1) // T7.3 收尾评审 Critical：添加成功后显式触发扫描
    expect(listFoldersCalls).toBe(2)
    unmount()
  })

  it('「启动时自动扫描」开关 → settings:set({autoScanOnStartup}) 确认回读翻转', async () => {
    const { container, unmount } = await mountSettings()
    const autoSwitch = container.querySelector('[data-field="auto-scan-switch"]') as HTMLButtonElement
    expect(autoSwitch.getAttribute('aria-checked')).toBe('true') // BASE_SETTINGS.autoScanOnStartup=true
    setReturn = { ...BASE_SETTINGS, autoScanOnStartup: false }
    await act(async () => {
      autoSwitch.click()
      await Promise.resolve()
    })
    expect(setCalls).toEqual([{ autoScanOnStartup: false }])
    // 确认回读：开关以 set 返回值渲染为 false
    expect(
      (container.querySelector('[data-field="auto-scan-switch"]') as HTMLButtonElement).getAttribute(
        'aria-checked'
      )
    ).toBe('false')
    unmount()
  })

  it('全量重扫：按钮 → rescanAll 接线；进度事件 → 按钮禁用 + done/total + 阶段文案 + fill 宽度；done 收起', async () => {
    const { container, unmount } = await mountSettings()
    const rescanBtn = container.querySelector('[data-field="rescan-all"]') as HTMLButtonElement
    expect(rescanBtn.disabled).toBe(false)
    await act(async () => {
      rescanBtn.click()
      await Promise.resolve()
    })
    expect(rescanAllCalls).toBe(1)
    // 进度事件（parse 阶段 3/7）：按钮禁用 + 进度条出现
    await act(async () => {
      scanProgressCb?.({ phase: 'parse', done: 3, total: 7, elapsedMs: 10 })
    })
    const rescanBtn2 = container.querySelector('[data-field="rescan-all"]') as HTMLButtonElement
    expect(rescanBtn2.disabled).toBe(true)
    const status = container.querySelector('[data-field="scan-status"]')!
    expect(status.textContent).toContain('«settings.library.scanProgress»')
    expect(status.textContent).toContain('«settings.library.phase.parse»')
    expect(status.querySelector('.numeric')!.textContent).toBe('43%') // round(3/7*100)
    const fill = status.querySelector('.progress-fill') as HTMLElement
    expect(fill.style.width).toBe('43%')
    // done 相位：进度条收起 + 按钮恢复可用
    await act(async () => {
      scanProgressCb?.({ phase: 'done', done: 7, total: 7, elapsedMs: 20 })
    })
    expect(container.querySelector('[data-field="scan-status"]')).toBeNull()
    expect((container.querySelector('[data-field="rescan-all"]') as HTMLButtonElement).disabled).toBe(false)
    unmount()
  })

  it('卸载时退订 onScanProgress（组件独占订阅随页面销毁）', async () => {
    const { unmount } = await mountSettings()
    expect(scanProgressCb).not.toBeNull()
    expect(unsubscribeCalls).toBe(0)
    unmount()
    expect(unsubscribeCalls).toBe(1)
  })

  it('listFolders 失败 → 静默降级（不白屏，目录区无行、无空态误报）', async () => {
    failListFolders = true
    const { container, unmount } = await mountSettings()
    expect(container.querySelectorAll('.folder-row')).toHaveLength(0)
    expect(container.querySelector('[data-field="folder-empty"]')).toBeNull() // 未拉到 ≠ 零目录
    unmount()
  })
})

describe('Playback 分区（T7.4，裁定②）', () => {
  it('音量默认值只读回显：volume 0.8 → 「80%」pill；分区零修改控件', async () => {
    const { container, unmount } = await mountSettings()
    const section = container.querySelector('section#playback')!
    const pill = section.querySelector('[data-field="volume-default"]')!
    expect(pill.textContent).toBe('80%')
    // 只读硬约束：无 input / role=slider / button（回显位不是控件）。
    expect(section.querySelectorAll('input, [role="slider"], button')).toHaveLength(0)
    unmount()
  })

  it('settings 未落地（get 失败）→ pill 渲染 — 位，不白屏不抛错', async () => {
    failGet = true
    const { container, unmount } = await mountSettings()
    const pill = container.querySelector('[data-field="volume-default"]')!
    expect(pill.textContent).toBe('—')
    unmount()
  })
})

describe('About 分区（T7.5）', () => {
  it('版本号渲染 app:getVersion 返回值；已知限制八条逐条渲染；致谢与 0.5 规划声明在位', async () => {
    versionResult = '1.2.3-test'
    const { container, unmount } = await mountSettings()
    const section = container.querySelector('section#about')!
    expect(section.querySelector('[data-field="app-version"]')!.textContent).toBe('1.2.3-test')

    const items = [...section.querySelectorAll('.about-list li')]
    expect(items).toHaveLength(8)
    // 哨兵 i18n：每条独立 i18n 键（settings.about.limit1..8），非拼接/非重复。
    expect(items.map((li) => li.textContent)).toEqual(
      Array.from({ length: 8 }, (_, i) => `«settings.about.limit${i + 1}»`)
    )
    expect(section.textContent).toContain('«settings.about.credits»')
    expect(section.textContent).toContain('«settings.about.roadmap05»')
    unmount()
  })

  it('版本未落地（getVersion 未 resolve 前）→ 版本位渲染 — 占位', async () => {
    const { container, unmount } = await mountSettings()
    expect(container.querySelector('[data-field="app-version"]')!.textContent).toBe('—')
    unmount()
  })
})
