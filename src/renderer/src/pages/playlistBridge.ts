import { useCallback, useEffect } from 'react'
import type { PlaylistSummary, TrackRow } from '../../../shared/types'
import { useI18n } from '../i18n'
import { ensurePlaylistsLoaded, usePlaylists, usePlaylistsStore } from '../stores/playlistsStore'
import { useToastStore } from '../stores/toastStore'

/**
 * 歌单接线桥（T6.2）——「添加到歌单」右键子菜单的唯一接线点。
 *
 * 背景：TrackList / TrackContextMenu 自 T4.3 起就带 `playlists` + `onAddToPlaylist` +
 * `onCreatePlaylist` 三个 props，但当时没有歌单数据源，各页一律省略 → 子菜单永远只有
 * 「新建歌单」一项、点了也没反应（T4.3 注释留痕「本任务无 playlist store，缺省空」）。
 * T6.2 落地 playlistsStore 后，由本桥把这三件事接通，各页只需 `{...usePlaylistMenu()}`：
 *   · playlists：读切片（**未加载时给空数组**，宁少不假——列表就绪后自然补齐）；
 *   · onAddToPlaylist：addTracks(playlistId, [trackId]) → 成功/失败 toast；
 *   · onCreatePlaylist：以默认名「未命名歌单」建单并立即把该曲目加入（一步到位，与设计稿
 *     mockup.js 的空名回退一致），之后可在歌单详情页改名。
 *
 * 与 playerBridge 同定位：调用方（Songs / AlbumDetail / ArtistDetail / Liked / PlaylistDetail）
 * 只依赖本文件的 hook，不直接 import playlistsStore 的取数细节。
 */
export interface PlaylistMenuWiring {
  /** 子菜单歌单数据源（未加载时为 []，不伪造）。 */
  playlists: readonly PlaylistSummary[]
  onAddToPlaylist: (track: TrackRow, playlistId: number) => void
  onCreatePlaylist: (track: TrackRow) => void
}

export function usePlaylistMenu(): PlaylistMenuWiring {
  const { t } = useI18n()
  const { playlists, listLoaded } = usePlaylists()

  // 幂等建立歌单列表（AppShell 启动亦已调用；此处兜底覆盖直接深链进详情页的场景）。
  useEffect(() => {
    ensurePlaylistsLoaded()
  }, [])

  const onAddToPlaylist = useCallback(
    (track: TrackRow, playlistId: number) => {
      void (async () => {
        const store = usePlaylistsStore.getState()
        const name = store.playlists.find((p) => p.id === playlistId)?.name
        const ok = await store.addTracks(playlistId, [track.id])
        useToastStore
          .getState()
          .showToast(
            ok
              ? t('toast.addedToPlaylist', { name: name ?? '' })
              : t('toast.actionFailed')
          )
      })()
    },
    [t]
  )

  const onCreatePlaylist = useCallback(
    (track: TrackRow) => {
      void (async () => {
        const store = usePlaylistsStore.getState()
        // 默认名取自既有资源键（设计稿 mockup.js 的空名回退即「未命名歌单」）。
        const row = await store.create(t('nav.playlists.untitled'))
        if (!row) {
          useToastStore.getState().showToast(t('toast.actionFailed'))
          return
        }
        const ok = await store.addTracks(row.id, [track.id])
        useToastStore
          .getState()
          .showToast(
            ok
              ? t('toast.addedToPlaylist', { name: row.name })
              : t('toast.actionFailed')
          )
      })()
    },
    [t]
  )

  return {
    playlists: listLoaded ? playlists : [],
    onAddToPlaylist,
    onCreatePlaylist
  }
}
