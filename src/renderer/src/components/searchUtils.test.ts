/**
 * searchUtils 单测（T4.5，jsdom project）——debounce 时序与 takeFirst 截断。
 *
 * 变异验证锚点（任务硬约束）：删除 debounce 等待（如把 setTimeout 去掉直接同步调用 fn，
 * 或 wait 恒为 0）会使「wait 期间不触发」断言（下文件第 1 个 it）变红——
 * 验证方法：临时改动 searchUtils.ts 后跑本文件，确认红、再还原（报告附输出）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { debounce, SEARCH_DEBOUNCE_MS, takeFirst } from './searchUtils'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('debounce（trailing-edge，等待期默认 SEARCH_DEBOUNCE_MS=200ms）', () => {
  it('等待期内不触发；静默 wait 毫秒后才以最后一次参数触发一次', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, SEARCH_DEBOUNCE_MS)

    debounced('a')
    debounced('ab')
    debounced('abc')

    // 变异验证关键断言：删除防抖等待后，此处会因 fn 已被（提前）调用而红。
    vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS - 1)
    expect(fn).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith('abc')
  })

  it('多次间隔调用：每次重置计时器，只在最后一次静默后触发', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, 200)

    debounced('第1次')
    vi.advanceTimersByTime(150)
    debounced('第2次') // 重置计时器
    vi.advanceTimersByTime(150) // 距第1次已 300ms，但距第2次仅 150ms
    expect(fn).not.toHaveBeenCalled()
    vi.advanceTimersByTime(50)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith('第2次')
  })

  it('cancel() 取消挂起调用（Escape 关闭下拉 / 卸载路径）', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, 200)

    debounced('x')
    debounced.cancel()
    vi.advanceTimersByTime(1000)
    expect(fn).not.toHaveBeenCalled()
  })

  it('触发后计时器被清空：可再次触发（状态不残留）', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, 200)

    debounced('1')
    vi.advanceTimersByTime(200)
    expect(fn).toHaveBeenCalledTimes(1)

    debounced('2')
    vi.advanceTimersByTime(199)
    expect(fn).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1)
    expect(fn).toHaveBeenCalledTimes(2)
    expect(fn).toHaveBeenLastCalledWith('2')
  })
})

describe('takeFirst（下拉分组截断，SEARCH_PREVIEW_LIMIT=5）', () => {
  it('取前 n 条', () => {
    expect(takeFirst([1, 2, 3, 4, 5, 6, 7], 5)).toEqual([1, 2, 3, 4, 5])
  })

  it('不足 n 条时全量返回', () => {
    expect(takeFirst([1, 2], 5)).toEqual([1, 2])
  })

  it('n ≤ 0 / 空数组 → 空数组（不抛错）', () => {
    expect(takeFirst([1, 2], 0)).toEqual([])
    expect(takeFirst([1, 2], -1)).toEqual([])
    expect(takeFirst([], 5)).toEqual([])
  })
})
