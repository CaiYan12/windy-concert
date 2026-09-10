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
