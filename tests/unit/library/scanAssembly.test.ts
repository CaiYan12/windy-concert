import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const mainIndexSource = readFileSync(
  fileURLToPath(new URL('../../../src/main/index.ts', import.meta.url)),
  'utf8',
)

describe('production scan assembly', () => {
  it('passes the app user-data logs directory to createScanService', () => {
    expect(mainIndexSource).toMatch(/logDir:\s*join\(userData,\s*['"]logs['"]\)/)
  })
})
