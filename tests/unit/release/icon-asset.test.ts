import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const resourcesDir = resolve(process.cwd(), 'resources')

describe('release icon assets', () => {
  it('contains the expected multi-size ICO and local derivative SVG', () => {
    const ico = readFileSync(resolve(resourcesDir, 'icon.ico'))
    expect(ico.subarray(0, 4)).toEqual(Buffer.from([0x00, 0x00, 0x01, 0x00]))
    expect(ico.readUInt16LE(4)).toBe(4)

    const widths = Array.from({ length: 4 }, (_, index) => ico[6 + index * 16])
    expect(widths).toEqual([16, 32, 48, 0])

    const svg = readFileSync(resolve(resourcesDir, 'icon.svg'), 'utf8')
    expect(svg).toContain('windy-concert-local-derivative')
    expect(svg).not.toContain('icon.png')
  })
})
