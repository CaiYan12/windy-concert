import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sourcePath = resolve(projectRoot, 'resources/icon.svg')
const pngPath = resolve(projectRoot, 'resources/icon.png')
const icoPath = resolve(projectRoot, 'resources/icon.ico')
const sizes = [16, 32, 48, 256]

if (!existsSync(sourcePath)) {
  throw new Error(`Icon source is unavailable: ${sourcePath}`)
}
if (!existsSync(dirname(pngPath)) || !existsSync(dirname(icoPath))) {
  throw new Error('Icon output directory is unavailable')
}

const source = readFileSync(sourcePath)
const png = await sharp(source).resize(512, 512).png().toBuffer()
const entries = await Promise.all(
  sizes.map(async (size) => ({
    size,
    png: await sharp(source).resize(size, size).png().toBuffer(),
  })),
)

const headerSize = 6
const directorySize = 16 * entries.length
let offset = headerSize + directorySize
const directory = Buffer.alloc(directorySize)
const payloads = []

entries.forEach(({ size, png: payload }, index) => {
  const entryOffset = index * 16
  directory[entryOffset] = size === 256 ? 0 : size
  directory[entryOffset + 1] = size === 256 ? 0 : size
  directory.writeUInt16LE(1, entryOffset + 4)
  directory.writeUInt16LE(32, entryOffset + 6)
  directory.writeUInt32LE(payload.length, entryOffset + 8)
  directory.writeUInt32LE(offset, entryOffset + 12)
  payloads.push(payload)
  offset += payload.length
})

const ico = Buffer.concat([
  Buffer.from([0x00, 0x00, 0x01, 0x00]),
  Buffer.from([entries.length, 0x00]),
  directory,
  ...payloads,
])

writeFileSync(pngPath, png)
writeFileSync(icoPath, ico)

console.log(`Generated ${pngPath} (${png.length} bytes)`)
console.log(`Generated ${icoPath} (${ico.length} bytes; sizes ${sizes.join(', ')})`)
