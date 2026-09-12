// T3.6 preload 契约类型锁——用 expectTypeOf 把 window.api（Api）形状锁死，防后续漂移。
// 策略留痕：
//  - `import type { Api }`（纯类型、零运行时）：preload/index.ts 顶层 import electron
//    （contextBridge/ipcRenderer 带副作用），node 测试环境不可运行时引入；import type 在
//    tsc/esbuild 两侧均被擦除，vitest 运行时永不 require('electron')（可行性已核实）。
//  - 本文件已纳入 tsconfig.node.json include（T3.6 收口）：`npm run typecheck` 即本类型测试
//    的验证门——expectTypeOf 不匹配会在 typecheck 阶段报错暴露；vitest 运行时仅保留冒烟
//    断言（类型测试运行时形态按 vitest 惯例）。
//  - settings 往返与默认值合并的运行时覆盖见 tests/unit/settings/settingsStore.test.ts
//    （T3.4 交付，9 用例），本文件不重复。
import { describe, expect, expectTypeOf, it } from 'vitest'
import type { Api } from '../../src/preload/index'
import type { IpcPayloads } from '../../src/shared/ipc'
import type {
  CoversReady,
  ScanProgress,
  SearchResult,
  Settings,
  TrackRow,
} from '../../src/shared/types'

describe('window.api 契约类型锁（expectTypeOf）', () => {
  it('顶层分组齐全：9 个键（7 方法分组 + 2 事件订阅）逐一锁定（T7.5 起 +app）', () => {
    expectTypeOf<keyof Api>().toEqualTypeOf<
      | 'library'
      | 'favorites'
      | 'playlists'
      | 'history'
      | 'settings'
      | 'i18n'
      | 'app'
      | 'onScanProgress'
      | 'onCoversReady'
    >()
    // 冒烟：类型测试运行时形态（vitest 惯例）——以上断言编译期已通过
    expect(true).toBe(true)
  })

  it('library：listSongs / getStats / getTrack / search 代表签名', () => {
    expectTypeOf<Api['library']['listSongs']>().toEqualTypeOf<
      (params: IpcPayloads['library:listSongs']) => Promise<TrackRow[]>
    >()
    // T4.11：getStats 只读聚合（零 payload，返回三类实体总数）。
    expectTypeOf<Api['library']['getStats']>().toEqualTypeOf<
      () => Promise<{ tracks: number; albums: number; artists: number }>
    >()
    expectTypeOf<Api['library']['getTrack']>().toEqualTypeOf<
      (id: string) => Promise<TrackRow | null>
    >()
    expectTypeOf<Api['library']['search']>().toEqualTypeOf<(q: string) => Promise<SearchResult>>()
    expect(true).toBe(true)
  })

  it('favorites：set / list 代表签名', () => {
    expectTypeOf<Api['favorites']['set']>().toEqualTypeOf<
      (trackId: string, favorite: boolean) => Promise<void>
    >()
    expectTypeOf<Api['favorites']['list']>().toEqualTypeOf<
      (sortBy: string) => Promise<TrackRow[]>
    >()
    expect(true).toBe(true)
  })

  it('playlists：reorder / addTracks 代表签名（排序参数为 id + trackIds 数组）', () => {
    expectTypeOf<Api['playlists']['reorder']>().toEqualTypeOf<
      (id: number, trackIds: string[]) => Promise<void>
    >()
    expectTypeOf<Api['playlists']['addTracks']>().toEqualTypeOf<
      (id: number, trackIds: string[]) => Promise<void>
    >()
    expect(true).toBe(true)
  })

  it('history：recordPlay 返回 { historyId } / listRecent 代表签名', () => {
    expectTypeOf<Api['history']['recordPlay']>().toEqualTypeOf<
      (trackId: string) => Promise<{ historyId: number }>
    >()
    expectTypeOf<Api['history']['listRecent']>().toEqualTypeOf<
      (limit: number) => Promise<TrackRow[]>
    >()
    expect(true).toBe(true)
  })

  it('settings：set 参数 Partial<Settings> 返回 Settings / get 返回 Settings', () => {
    expectTypeOf<Api['settings']['get']>().toEqualTypeOf<() => Promise<Settings>>()
    expectTypeOf<Api['settings']['set']>().toEqualTypeOf<
      (partial: Partial<Settings>) => Promise<Settings>
    >()
    expect(true).toBe(true)
  })

  it('i18n：getMessages 返回 Record<string, string>（分组唯一方法）', () => {
    expectTypeOf<Api['i18n']['getMessages']>().toEqualTypeOf<
      (lang: string) => Promise<Record<string, string>>
    >()
    expect(true).toBe(true)
  })

  it('app：getVersion 只读返回 string（T7.5 About 分区版本号渲染用）', () => {
    expectTypeOf<Api['app']['getVersion']>().toEqualTypeOf<() => Promise<string>>()
    expect(true).toBe(true)
  })

  it('事件订阅：onScanProgress / onCoversReady 返回 () => void（unsubscribe）', () => {
    expectTypeOf<Api['onScanProgress']>().toEqualTypeOf<
      (cb: (p: ScanProgress) => void) => () => void
    >()
    expectTypeOf<Api['onCoversReady']>().toEqualTypeOf<
      (cb: (p: CoversReady) => void) => () => void
    >()
    expect(true).toBe(true)
  })

  it('分组键存在性锁（防方法删除/改名漂移——评审建议）', () => {
    expectTypeOf<keyof Api['library']>().toEqualTypeOf<
      | 'addFolder'
      | 'removeFolder'
      | 'setFolderEnabled'
      // T7.3：目录列表只读通道（Settings Library 分区数据源）。
      | 'listFolders'
      | 'scan'
      | 'rescanAll'
      | 'listSongs'
      | 'getStats'
      | 'getTrack'
      | 'listAlbums'
      | 'getAlbum'
      | 'listArtists'
      | 'getArtist'
      | 'search'
    >()
    expectTypeOf<keyof Api['favorites']>().toEqualTypeOf<'set' | 'list'>()
    expectTypeOf<keyof Api['playlists']>().toEqualTypeOf<
      | 'list'
      | 'get'
      | 'create'
      | 'rename'
      | 'delete'
      | 'addTracks'
      | 'removeTrack'
      | 'reorder'
    >()
    expectTypeOf<keyof Api['history']>().toEqualTypeOf<
      'recordPlay' | 'updatePlayOutcome' | 'listRecent'
    >()
    expectTypeOf<keyof Api['settings']>().toEqualTypeOf<'get' | 'set'>()
    expectTypeOf<keyof Api['i18n']>().toEqualTypeOf<'getMessages'>()
    expectTypeOf<keyof Api['app']>().toEqualTypeOf<'getVersion'>()
    expect(true).toBe(true)
  })

  it('search 返回结构与 TrackRow 的归属关系（toMatchTypeOf 抽查）', () => {
    expectTypeOf<SearchResult>().toMatchTypeOf<{ tracks: TrackRow[] }>()
    expectTypeOf<Api>().not.toBeAny()
    expect(true).toBe(true)
  })
})
