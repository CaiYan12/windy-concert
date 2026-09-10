// PLAYABLE = Chromium 可直接播放的扩展名；SCANNABLE = 可扫描入库的扩展名（含不可播格式）
export const PLAYABLE: ReadonlySet<string> = new Set([
  'mp3',
  'flac',
  'wav',
  'ogg',
  'opus',
  'm4a',
])

export const SCANNABLE: ReadonlySet<string> = new Set([
  ...PLAYABLE,
  'ape',
  'wma',
  'aiff',
  'aif',
  'dsf',
  'dff',
  'wv',
  'tta',
  'ac3',
  'mka',
])
