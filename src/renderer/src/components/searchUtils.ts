/**
 * SearchBox / SearchResults 共享纯函数（T4.5）。
 *
 * debounce 独立成文件的原因：任务硬约束「debounce 逻辑必须有单测并做变异验证
 * （删 debounce → 测试红）」——纯函数形态可在 jsdom 环境用假计时器直接驱动，
 * 不必挂载组件即可锚定时序；SearchBox 组件层再用集成测试覆盖「输入 → 取数」链路。
 */

export interface Debounced<A extends unknown[]> {
  /** 触发防抖调用（重置计时器）。 */
  (...args: A): void
  /** 取消尚未触发的调用（卸载 / Escape 关闭下拉时使用）。 */
  cancel(): void
}

/** 防抖等待（ms）。单值单源：组件与单测都引用此处，避免两处漂移。 */
export const SEARCH_DEBOUNCE_MS = 200

/**
 * trailing-edge 防抖：停止调用 wait 毫秒后才真正执行最后一次的参数。
 * 不引入 lodash（项目无此依赖，一个函数不值得加依赖，留痕）。
 */
export function debounce<A extends unknown[]>(fn: (...args: A) => void, wait: number): Debounced<A> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const wrapped = (...args: A): void => {
    if (timer !== undefined) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = undefined
      fn(...args)
    }, wait)
  }
  wrapped.cancel = (): void => {
    if (timer !== undefined) {
      clearTimeout(timer)
      timer = undefined
    }
  }
  return wrapped
}

/** 下拉分组预览每组最多条数（components.html：「下拉面板四组各前 5 条」）。 */
export const SEARCH_PREVIEW_LIMIT = 5

/** 纯函数：任取数组前 n 条（n ≤ 0 / 空数组返回空数组），供下拉分组截断（可单测）。 */
export function takeFirst<T>(items: readonly T[], n: number): T[] {
  return items.slice(0, Math.max(0, n))
}
