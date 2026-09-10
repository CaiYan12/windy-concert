// T3.3 渲染层 IPC 薄封装 —— 不做多余抽象：
//   api 直接 re-export preload 暴露的 window.api（类型来自 env.d.ts 的 Api 推导）。
//   toErrorMessage 用于 invoke reject 时的错误信息归一，供 Phase 4 UI toast 使用。
export const api = window.api

/** 从 unknown 异常中提取可展示的错误信息（invoke reject 通常是 Error）。 */
export function toErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message
  if (typeof e === 'string') return e
  return String(e)
}
