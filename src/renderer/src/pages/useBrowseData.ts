import { useEffect, useState, type DependencyList } from 'react'

/** 浏览页通用取数状态（T4.4）。
 *  详情/列表页数据经 IPC 取（albums / artists / 详情由各自通道返回），本 hook 统一封装
 *  loading / error / data 三态，供五个浏览页复用，避免每页重复 useEffect 样板。
 *  deps 控制重新取数（如详情页 id 变化）；loader 由调用方闭包捕获最新参数。 */
export interface BrowseAsyncState<T> {
  data: T | null
  loading: boolean
  error: string | null
}

export function useBrowseData<T>(loader: () => Promise<T>, deps: DependencyList): BrowseAsyncState<T> {
  const [state, setState] = useState<BrowseAsyncState<T>>({ data: null, loading: true, error: null })

  useEffect(() => {
    let cancelled = false
    setState({ data: null, loading: true, error: null })
    loader()
      .then((data) => {
        if (!cancelled) setState({ data, loading: false, error: null })
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState({ data: null, loading: false, error: err instanceof Error ? err.message : String(err) })
        }
      })
    return () => {
      cancelled = true
    }
    // loader 由调用方闭包捕获最新参数，deps 已表达取数依赖，故此处不重复列 loader。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return state
}
