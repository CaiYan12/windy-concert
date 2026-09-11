import type { ReactElement } from 'react'

/**
 * Equalizer —— 播放中均衡器动画（设计稿 design-plan.md:107「3 柱均衡器，每柱 0.9s 错相循环，--accent 色」）。
 *
 * 落位结论（T5.4 核实，报告留痕）：
 *   设计稿将均衡器定义为「播放中行」指示（design-plan.md:203/209），其原生归属是曲目列表的当前播放行
 *   （T5.6 接线）。但 T5.4 播放栏是常驻的「正在播放」表面，且本任务要求「全应用唯一持续动画」——
 *   故将均衡器挂载在播放栏封面角标上，作为单一持续动画源，避免与 T5.6 列表行均衡器重复产生第二个
 *   无限动画（待 T5.6 裁定：列表行与播放栏二选一，或列表行改用静态 accent 指示，见报告）。
 * prefers-reduced-motion 下停动画：shell.css 全局规则（605 行）已把 animation 中性化为单次极短，
 *   此处再显式兜一次，确保「唯一持续动画」在该偏好下彻底静止。
 */
export function Equalizer(): ReactElement {
  return (
    <span className="equalizer" aria-hidden="true">
      <span className="equalizer-bar" />
      <span className="equalizer-bar" />
      <span className="equalizer-bar" />
    </span>
  )
}

export default Equalizer
