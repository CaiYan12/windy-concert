// T6.5 相对时间格式化（i18n 工具模块）——Recent 页「播放时间」列的呈现收口点。
//
// 设计依据：任务书 T6.5「显示时间相对格式（i18n 内做 formatRelative）」+ 设计稿
// mockups/Recent.html 时间列（「3 分钟前」形态）。分段取计划原文列出的五段
// （刚刚 / N 分钟前 / HH:mm / 昨天 / M 月 D 日），另补「跨年 Y 年 M 月 D 日」一段，
// 保证跨年记录不退化为无年份的 M 月 D 日（歧义呈现）。
//
// 分段取舍留痕：任务书实现要求里还提到「小时」——「N 小时前」与「今天 HH:mm」对
// 「同日超过 1 小时」的呈现语义重叠（二者只能取其一作为该时段的呈现）。本实现按
// 计划原文取「今天 HH:mm」（信息量更高，且与设计稿「相对段只到分钟」不冲突），
// 「小时」边界由单测在 59 分钟 → 61 分钟的跨段锚定覆盖。若主会话裁定要独立
// 「N 小时前」段，只需在 minutesAgo 分支后插入一段，单测锚点已备好。
//
// 纯函数可测：now 由调用方注入（避免真实时钟漂移导致测试脆弱）；文案经注入的
// 翻译函数 t 取用（messages 键集中在 resources/locales/zh-CN.json，哨兵/真实
// 资源均可注入，node 项目可直接测）。

/** 翻译函数最小结构（与 useI18n().t 同形；node 测试可注入查表桩）。 */
export type TranslateFn = (
  key: string,
  params?: Record<string, string | number>
) => string;

/**
 * 解析播放时间字符串为 Date。
 *
 * 主要输入是 SQLite `datetime('now')` 的产物 "YYYY-MM-DD HH:MM:SS"——该形态是
 * **UTC** 时间，但 JS `new Date("YYYY-MM-DD HH:MM:SS")` 会按**本地时区**解析
 * （非 ISO 形态的规范外行为），不补时区直接解析会整体偏移时区差。故对这一形态
 * 显式按 UTC 组装；带 T/ISO 形态（含时区）交给原生解析。
 * 无法解析（空 / null / 乱串）返回 null，由调用方呈现占位符。
 */
export function parsePlayedAt(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/.exec(raw);
  if (m) {
    return new Date(
      Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6]))
    );
  }
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** 本地时区的 HH:mm（补零）。 */
function formatHm(date: Date): string {
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

/** 本地时区的日历日键（比较「同一天 / 昨天」用，不受时刻影响）。 */
function dayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

/**
 * 相对时间分段（自上而下首个命中即输出）：
 *   1. 无法解析 → recent.time.unknown（占位「—」）；
 *   2. 未来时间（时钟回拨 / 时钟漂移）→ recent.time.justNow（防御性归入「刚刚」，
 *      不渲染负数分钟误导用户）；
 *   3. diff < 60s → recent.time.justNow（刚刚）；
 *   4. diff < 60min → recent.time.minutesAgo（{n} 分钟前）；
 *   5. 同一自然日 → recent.time.today（{time} = HH:mm，本地时区）；
 *   6. 日历昨天 → recent.time.yesterday（昨天 {time}）；
 *   7. 同年 → recent.time.date（{m} 月 {d} 日）；
 *   8. 跨年 → recent.time.dateYear（{y} 年 {m} 月 {d} 日）。
 */
export function formatRelative(
  playedAt: string | null | undefined,
  now: Date,
  t: TranslateFn
): string {
  const played = parsePlayedAt(playedAt);
  if (!played) return t('recent.time.unknown');

  const diffMs = now.getTime() - played.getTime();
  if (diffMs < 60_000) {
    // 含未来时间（diff < 0）：时钟回拨防御，统一按「刚刚」呈现。
    return t('recent.time.justNow');
  }
  if (diffMs < 3_600_000) {
    return t('recent.time.minutesAgo', { n: Math.floor(diffMs / 60_000) });
  }
  const hm = formatHm(played);
  if (dayKey(played) === dayKey(now)) {
    return t('recent.time.today', { time: hm });
  }
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (dayKey(played) === dayKey(yesterday)) {
    return t('recent.time.yesterday', { time: hm });
  }
  if (played.getFullYear() === now.getFullYear()) {
    return t('recent.time.date', { m: played.getMonth() + 1, d: played.getDate() });
  }
  return t('recent.time.dateYear', {
    y: played.getFullYear(),
    m: played.getMonth() + 1,
    d: played.getDate()
  });
}
