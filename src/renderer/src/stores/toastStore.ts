// T5.6 轻量 toast 状态源（zustand 单例）。
//
// 设计留痕：
//   · 与 playerStore 播放域解耦——toast 是纯展示通知（不可播提示等），不混入播放状态，
//     独立 store 便于单测（fake timers 只针对 ToastHost 的自动消失定时器）。
//   · 单例替换不堆叠：showToast 直接覆盖 message（同一时刻最多一条），新提示顶替旧提示；
//     不维护队列（留痕：M0.1 仅「暂不支持此格式」单一场景，无需堆叠）。
//   · 自动消失由 ToastHost 组件经 useEffect + setTimeout 兜底（~3s，见 Toast.tsx），
//     store 只持有 message 真相，便于测试直接断言 showToast/hideToast 对状态的改写。
import { useSyncExternalStore } from 'react'
import { create, type StoreApi } from 'zustand'

export interface ToastState {
  /** 当前展示文案；null = 无 toast。 */
  message: string | null
  /** 展示一条 toast（覆盖式，单例不堆叠）；传入非空文案即替换当前提示。 */
  showToast: (message: string) => void
  /** 立即收起当前 toast（message 置 null）。 */
  hideToast: () => void
}

let storeSingleton: StoreApi<ToastState> | null = null

/** 工厂：createToastStore(deps?) 注入形态保留，便于未来扩展（当前无依赖）。 */
export function createToastStore(): StoreApi<ToastState> {
  return create<ToastState>()((set) => ({
    message: null,
    showToast: (message) => set({ message }),
    hideToast: () => set({ message: null })
  }))
}

/** 应用单例：页面与 ToastHost 唯一消费入口。 */
export function getToastStore(): StoreApi<ToastState> {
  if (!storeSingleton) storeSingleton = createToastStore()
  return storeSingleton
}

export const useToastStore = getToastStore()

// ---------------------------------------------------------------------------
// 组件入口（useSyncExternalStore 适配，同 usePlayer / useI18n 形态）
// ---------------------------------------------------------------------------

export function useToast(): ToastState {
  const message = useSyncExternalStore(
    useToastStore.subscribe,
    useToastStore.getState,
    useToastStore.getState
  ).message
  return {
    message,
    showToast: useToastStore.getState().showToast,
    hideToast: useToastStore.getState().hideToast
  }
}
