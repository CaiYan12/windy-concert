// T6.5 formatRelative 单测（node project）——相对时间分段与边界。
//
// 可测性设计：now 由调用方注入（真实时钟漂移不影响断言）；文案经注入的 t 取用——
// 本文件用「与 resources/locales/zh-CN.json 逐键比对的内联字典」构造 t：既让分段断言
// 用真实中文文案（可读），又防字典与资源文件漂移（首条用例锁死一致性）。
//
// 时区无关性（重要）：parsePlayedAt 把 SQLite datetime('now') 形态按 **UTC** 解析，
// 因此测试输入一律经 toSqliteUtc(本地 Date) 推导（而非手写字面量——那会随机器时区
// 漂移产生假绿/假红），断言期望值以本地时区表达。任意时区的机器上结果一致。
// 注意 vitest node project 的 cwd 可能是大写盘符（D:\），路径统一由 import.meta.dirname 推导。
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { formatRelative, parsePlayedAt } from '../../../src/renderer/src/i18n/formatRelative';
import type { TranslateFn } from '../../../src/renderer/src/i18n/formatRelative';

const ROOT = path.resolve(import.meta.dirname, '../../..');

/** recent.time.* 文案字典（须与 resources/locales/zh-CN.json 一致，首条用例守卫）。 */
const DICT: Record<string, string> = {
  'recent.time.justNow': '刚刚',
  'recent.time.minutesAgo': '{n} 分钟前',
  'recent.time.today': '{time}',
  'recent.time.yesterday': '昨天 {time}',
  'recent.time.date': '{m} 月 {d} 日',
  'recent.time.dateYear': '{y} 年 {m} 月 {d} 日',
  'recent.time.unknown': '—'
};

/** 与 i18n/index.ts translateWith 同规则的插值 t（{name} 替换）。 */
const t: TranslateFn = (key, params) => {
  const text = DICT[key] ?? key;
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match
  );
};

const pad = (v: number): string => String(v).padStart(2, '0');

/** 本地 Date → SQLite datetime('now') 形态字符串（UTC）。 */
function toSqliteUtc(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

/** 固定「当前时刻」（本地时区 2026-09-12 10:30:00），分段基准。 */
const NOW = new Date(2026, 8, 12, 10, 30, 0);

/** now 往回推 ms 毫秒的 SQLite 字符串（本地语义 = now - ms）。 */
function utcAgo(ms: number, from: Date = NOW): string {
  return toSqliteUtc(new Date(from.getTime() - ms));
}

const MIN = 60_000;

describe('formatRelative 与资源文件一致性', () => {
  it('内联字典与 resources/locales/zh-CN.json 的 recent.time.* 逐键一致（防漂移）', () => {
    const locale = JSON.parse(
      readFileSync(path.join(ROOT, 'resources', 'locales', 'zh-CN.json'), 'utf-8')
    ) as Record<string, string>;
    for (const [key, value] of Object.entries(DICT)) {
      expect(locale[key], `zh-CN.json 缺键或不一致：${key}`).toBe(value);
    }
  });
});

describe('parsePlayedAt（SQLite datetime 形态按 UTC 解析）', () => {
  it('"YYYY-MM-DD HH:MM:SS" 按 UTC 组装（时区无关断言）', () => {
    expect(parsePlayedAt('2026-09-12 02:30:00')!.getTime()).toBe(
      Date.UTC(2026, 8, 12, 2, 30, 0)
    );
  });

  it('ISO 形态交给原生解析；空/乱串返回 null', () => {
    expect(parsePlayedAt('2026-09-12T02:30:00Z')!.getTime()).toBe(
      Date.UTC(2026, 8, 12, 2, 30, 0)
    );
    expect(parsePlayedAt(null)).toBeNull();
    expect(parsePlayedAt('')).toBeNull();
    expect(parsePlayedAt('not-a-date')).toBeNull();
  });
});

describe('formatRelative 分段（now 注入固定值）', () => {
  it('刚刚：diff < 60s（59_000ms 边界——SQLite datetime 仅秒精度，59_999ms 截断后恰为 60s）', () => {
    expect(formatRelative(utcAgo(0), NOW, t)).toBe('刚刚');
    expect(formatRelative(utcAgo(59_000), NOW, t)).toBe('刚刚');
  });

  it('分钟前：60s ≤ diff < 60min（含 60s 下界与 59min 上界）', () => {
    expect(formatRelative(utcAgo(60_000), NOW, t)).toBe('1 分钟前');
    expect(formatRelative(utcAgo(5 * MIN), NOW, t)).toBe('5 分钟前');
    expect(formatRelative(utcAgo(59 * MIN), NOW, t)).toBe('59 分钟前');
  });

  it('今天（HH:mm）：同自然日且 ≥ 60min——「小时」时段按计划原文并入今天的具体时刻', () => {
    // 61 分钟前：仍在今天（本地 09:29）
    expect(formatRelative(utcAgo(61 * MIN), NOW, t)).toBe('09:29');
    // 同日更早（本地今天 00:15）
    const earlierToday = new Date(NOW);
    earlierToday.setHours(0, 15, 0, 0);
    expect(formatRelative(toSqliteUtc(earlierToday), NOW, t)).toBe('00:15');
  });

  it('昨天：日历昨天', () => {
    const yesterdayLate = new Date(NOW);
    yesterdayLate.setDate(yesterdayLate.getDate() - 1);
    yesterdayLate.setHours(23, 59, 0, 0);
    // 距今 ≥ 11 小时（不在分钟段内），日历昨天 → 「昨天 HH:mm」
    expect(formatRelative(toSqliteUtc(yesterdayLate), NOW, t)).toBe('昨天 23:59');
  });

  it('跨日不足 60min：分钟段优先于日历段（时长感知优先，不显示「昨天」）', () => {
    // now = 今天 00:10；播放于昨天 23:55（15 分钟前）
    const lateNight = new Date(2026, 8, 12, 0, 10, 0);
    const played = new Date(lateNight);
    played.setDate(played.getDate() - 1);
    played.setHours(23, 55, 0, 0);
    expect(formatRelative(toSqliteUtc(played), lateNight, t)).toBe('15 分钟前');
  });

  it('日期：同年不同日 → M 月 D 日', () => {
    const sep1 = new Date(2026, 8, 1, 8, 0, 0);
    const jan2 = new Date(2026, 0, 2, 8, 0, 0);
    expect(formatRelative(toSqliteUtc(sep1), NOW, t)).toBe('9 月 1 日');
    expect(formatRelative(toSqliteUtc(jan2), NOW, t)).toBe('1 月 2 日');
  });

  it('跨年：Y 年 M 月 D 日（无年份的 M 月 D 日会产生歧义）', () => {
    const lastYear = new Date(2025, 11, 31, 23, 0, 0);
    expect(formatRelative(toSqliteUtc(lastYear), NOW, t)).toBe('2025 年 12 月 31 日');
  });

  it('无法解析 → 占位「—」；未来时间（时钟回拨防御）→ 刚刚', () => {
    expect(formatRelative(null, NOW, t)).toBe('—');
    expect(formatRelative('garbage', NOW, t)).toBe('—');
    const future = new Date(NOW.getTime() + 60_000);
    expect(formatRelative(toSqliteUtc(future), NOW, t)).toBe('刚刚');
  });
});
