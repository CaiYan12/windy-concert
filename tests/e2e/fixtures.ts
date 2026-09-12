import { test as base, expect, _electron, type ElectronApplication, type Page } from '@playwright/test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export type AppFixtures = {
  app: {
    electronApp: ElectronApplication
    firstWindow: Page
    page: Page
  }
}

export const test = base.extend<AppFixtures>({
  app: async ({}, use) => {
    // Unique, isolated user-data dir per launch (also used by main/index.ts
    // via WC_USER_DATA to setPath, enabling reproducible e2e / perf envs).
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wc-e2e-'))

    // Strip ELECTRON_RUN_AS_NODE and inject WC_USER_DATA for isolation.
    const env: Record<string, string> = { ...process.env, WC_USER_DATA: userDataDir } as Record<
      string,
      string
    >
    delete env.ELECTRON_RUN_AS_NODE

    const electronApp = await _electron.launch({
      args: ['out/main/index.js'],
      cwd: path.resolve(__dirname, '../../'),
      env
    })

    const firstWindow = await electronApp.firstWindow()
    const page = firstWindow

    await use({ electronApp, firstWindow, page })

    // Best-effort cleanup; ignore errors if the app already closed.
    try {
      await electronApp.close()
    } catch {
      /* noop */
    }
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true })
    } catch {
      /* noop */
    }
  }
})

export { expect }

/**
 * 以指定 userData 目录启动应用（T6.6 F6-3「完整重启持久化」用）。
 *
 * 与上方 app fixture 的唯一差别：userDataDir 由调用方持有——同一目录先后 launch 两次
 * 即「重启应用」，数据库/设置/歌单全部沿真实落盘状态恢复。close() 为 best-effort
 * （应用已退出时忽略），userData 目录的删除也由调用方负责（跨重启必须存活）。
 */
export interface LaunchedApp {
  electronApp: ElectronApplication
  firstWindow: Page
  page: Page
  close: () => Promise<void>
}

export async function launchWithUserData(userDataDir: string): Promise<LaunchedApp> {
  const env: Record<string, string> = { ...process.env, WC_USER_DATA: userDataDir } as Record<
    string,
    string
  >
  delete env.ELECTRON_RUN_AS_NODE

  const electronApp = await _electron.launch({
    args: ['out/main/index.js'],
    cwd: path.resolve(__dirname, '../../'),
    env
  })
  const firstWindow = await electronApp.firstWindow()
  return {
    electronApp,
    firstWindow,
    page: firstWindow,
    close: async () => {
      try {
        await electronApp.close()
      } catch {
        /* noop */
      }
    }
  }
}
