// T3.4 settingsStore —— §4.3-2 进程内设置存储（本任务只交付 store 本体；get/set 的 IPC 接线归 T3.1）。
//
// 依赖注入决定留痕：
//   - 本模块禁止 import electron（app.getPath('userData') 由调用方注入）。T3.1 接线时传真实
//     userData 目录，测试传临时目录。deps 仅含 settingsDir，便于纯单测。
//   - 全部使用 node:fs 同步 API（get/set 在 IPC handler 内同步完成，无需 async/await 接缝）。
//
// 原子写实现决定留痕：
//   - try-rename-first：先直接 renameSync(tmp, settingsPath)（libuv 映射 MOVEFILE_REPLACE_EXISTING，
//     NTFS 覆盖同名目标通常成功）；仅在 rename 抛错（如 EPERM——目标文件被占用）时才降级为
//     rmSync 旧文件 + rename 兜底。先试 rename、失败才删旧，崩溃窗口最小化：
//     目标要么是新内容（rename 成功）、要么是删旧瞬间前的旧内容。
//     tmp 文件名带 pid+random 防并发冲突；写完断言目录内无 .tmp 残留（单测覆盖）。
//   - settingsDir 不存在时首次 set 自动 mkdirSync({recursive:true})；get 不建目录。
//
// 损坏回退决定留痕：
//   - 文件缺失 / JSON 解析失败 / 结构非法 → get 返回默认值，不抛错（留痕：损坏不立即重写，
//     『下次 set 覆盖修复』——set 会用合并后的完整 Settings 原子覆盖 settings.json）。
//   - 结构非法按键校验：四键逐键 typeof 校验（language string、autoScanOnStartup boolean、
//     volume number、muted boolean），类型不符的键回退该键默认值，其余合法键保留。
//
// 钳制决定留痕：
//   - volume 越界钳制 [0,1]：仅当 partial.volume 为有限 number 时钳制（NaN/undefined/非 number 跳过，沿用当前值）。
//
// 未知键决定留痕：
//   - get 解析时仅接纳 Settings 四键（language/autoScanOnStartup/volume/muted），未知键忽略不落盘；
//     默认值在前、已存值覆盖（Object spread 顺序保证）。set 只写出四键，天然不落未知键。
//   - 运行时来源不可信（T3.1 IPC 后 renderer 传参不带类型保护）：get/set 共用 pickKnown，
//     除过滤未知键外还逐键 typeof 校验，类型不符的键被丢弃（get 中经 spread 落回默认值；
//     set 中保留当前值），类型非法值不落盘。
//
// language 值域决定留痕：
//   - M0.1 仅 'zh-CN'（类型约束 'zh-CN'）。set(partial) 传其他值由编译期类型拒绝，运行时无需枚举校验。

import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Settings } from '../../shared/types';

/** 默认值（§4.3-2 / T3.4 计划原文）。language 仅 'zh-CN'（M0.1）。 */
const DEFAULT_SETTINGS: Settings = {
  language: 'zh-CN',
  autoScanOnStartup: true,
  volume: 0.8,
  muted: false,
};

/** Settings 仅接受的四个键（未知键忽略不落盘，留痕）。 */
const KNOWN_KEYS: ReadonlyArray<keyof Settings> = [
  'language',
  'autoScanOnStartup',
  'volume',
  'muted',
];

/** settingsStore 依赖：仅需调用方注入的 settings 目录（不依赖 electron）。 */
export interface SettingsStoreDeps {
  /** settings.json 所在目录；不存在时首次 set 自动创建（测试传临时目录）。 */
  settingsDir: string;
}

/** settingsStore 句柄（T3.4 交付）。get/set 同步完成，供 T3.1 IPC handler 调用。 */
export interface SettingsStore {
  /** 读取完整 Settings：文件缺失/损坏 → 默认值；否则默认值合并（已存值覆盖未知键已忽略）。 */
  get(): Settings;
  /** 合并 partial 并原子写回；volume 钳制 [0,1]；返回更新后完整 Settings。 */
  set(partial: Partial<Settings>): Settings;
}

/** 各键运行时校验（typeof 防线；volume 额外要求有限 number，NaN 不可用作音量）。 */
const KEY_VALIDATORS: Record<keyof Settings, (v: unknown) => boolean> = {
  language: (v) => typeof v === 'string',
  autoScanOnStartup: (v) => typeof v === 'boolean',
  volume: (v) => typeof v === 'number' && Number.isFinite(v),
  muted: (v) => typeof v === 'boolean',
};

/** 仅从任意对象中挑出类型合法的 Settings 四键，忽略未知键与类型非法值（留痕：不落盘）。 */
function pickKnown(input: unknown): Partial<Settings> {
  if (typeof input !== 'object' || input === null) return {};
  const src = input as Record<string, unknown>;
  const out: Partial<Settings> = {};
  for (const key of KNOWN_KEYS) {
    const v = src[key];
    if (v !== undefined && KEY_VALIDATORS[key](v)) {
      (out as Record<string, unknown>)[key] = v;
    }
  }
  return out;
}

/** volume 越界钳制 [0,1]：仅有限 number 参与钳制（留痕）。 */
function clampVolume(v: unknown): number | undefined {
  if (typeof v !== 'number' || !Number.isFinite(v)) return undefined;
  return Math.min(1, Math.max(0, v));
}

export function createSettingsStore(deps: SettingsStoreDeps): SettingsStore {
  const settingsPath = path.join(deps.settingsDir, 'settings.json');

  function get(): Settings {
    if (!existsSync(settingsPath)) {
      // 文件缺失 → 默认值（不建目录、不写文件，留痕）。
      return { ...DEFAULT_SETTINGS };
    }
    let raw: string;
    try {
      raw = readFileSync(settingsPath, 'utf-8');
    } catch {
      // 读取失败（权限等）→ 默认值不抛错。
      return { ...DEFAULT_SETTINGS };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // JSON 损坏 → 默认值不抛错（留痕：下次 set 覆盖修复）。
      return { ...DEFAULT_SETTINGS };
    }
    // 默认值在前、已存值覆盖；pickKnown 已过滤未知键与类型非法值，
    // 类型不符的键自然落回默认值（兑现「结构非法 → 默认值」承诺，其余合法键保留）。
    const merged: Settings = { ...DEFAULT_SETTINGS, ...pickKnown(parsed) };
    // volume 校验通过后仍走钳制 [0,1]。
    const clamped = clampVolume(merged.volume);
    if (clamped !== undefined) {
      merged.volume = clamped;
    }
    return merged;
  }

  function set(partial: Partial<Settings>): Settings {
    const current = get();
    // 运行时不可信来源（T3.1 IPC 后 renderer 传参不带类型保护）：
    // partial 先过 pickKnown 过滤未知键与类型非法值，再合并，未知键不得落盘。
    const known = pickKnown(partial);
    // 合并：current + known（known 覆盖）。
    const next: Settings = { ...current, ...known };
    // volume 越界钳制 [0,1]（仅当 partial 含有限 number 时生效）。
    const clamped = clampVolume(known.volume);
    if (clamped !== undefined) {
      next.volume = clamped;
    }

    // 确保目录存在（首次写入自动 mkdir）。
    if (!existsSync(deps.settingsDir)) {
      mkdirSync(deps.settingsDir, { recursive: true });
    }

    // 原子写：同目录 tmp + rename（try-rename-first，留痕）。
    const tmpPath = path.join(
      deps.settingsDir,
      `.settings.${process.pid}.${randomUUID()}.tmp`,
    );
    const data = JSON.stringify(next, null, 2);
    try {
      writeFileSync(tmpPath, data, 'utf-8');
    } catch (err) {
      // tmp 写入失败：best-effort 清理残留 tmp 后上抛。
      try {
        unlinkSync(tmpPath);
      } catch {
        // 清理失败忽略，以上抛的原始错误为准。
      }
      throw err;
    }
    try {
      // try-rename-first：libuv 用 MOVEFILE_REPLACE_EXISTING，NTFS 覆盖同名目标通常成功。
      renameSync(tmpPath, settingsPath);
    } catch (err) {
      // 兜底：仅当 rename 失败（如 EPERM——目标文件被占用）时，删旧文件再 rename；
      // 仍失败则清理 tmp 并上抛。
      try {
        rmSync(settingsPath, { force: true });
        renameSync(tmpPath, settingsPath);
      } catch {
        rmSync(tmpPath, { force: true });
        throw err;
      }
    }
    return next;
  }

  return { get, set };
}
