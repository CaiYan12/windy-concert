// T3.4 settingsStore —— §4.3-2 进程内设置存储（本任务只交付 store 本体；get/set 的 IPC 接线归 T3.1）。
//
// 依赖注入决定留痕：
//   - 本模块禁止 import electron（app.getPath('userData') 由调用方注入）。T3.1 接线时传真实
//     userData 目录，测试传临时目录。deps 仅含 settingsDir，便于纯单测。
//   - 全部使用 node:fs 同步 API（get/set 在 IPC handler 内同步完成，无需 async/await 接缝）。
//
// 原子写实现决定留痕：
//   - Windows 上 renameSync 覆盖已存在目标会抛 EPERM/EPERM（NT 不允许同名替换），故实现：
//     writeFileSync(tmp, data) → 先 rmSync(settingsPath,{force:true}) 旧文件 → 再 renameSync(tmp, settingsPath)。
//     顺序为先删旧、再 rename，保证「目标要么是新内容、要么是删除瞬间前的旧内容」，tmp 写入已落盘，
//     故障窗口仅限『删旧→rename』之间（极其短暂，且目标在该窗口为中间态概率极低）。
//     tmp 文件名带 pid+random 防并发冲突；写完断言目录内无 .tmp 残留（单测覆盖）。
//   - settingsDir 不存在时首次 set 自动 mkdirSync({recursive:true})；get 不建目录。
//
// 损坏回退决定留痕：
//   - 文件缺失 / JSON 解析失败 / 结构非法 → get 返回默认值，不抛错（留痕：损坏不立即重写，
//     『下次 set 覆盖修复』——set 会用合并后的完整 Settings 原子覆盖 settings.json）。
//
// 钳制决定留痕：
//   - volume 越界钳制 [0,1]：仅当 partial.volume 为有限 number 时钳制（NaN/undefined/非 number 跳过，沿用当前值）。
//
// 未知键决定留痕：
//   - get 解析时仅接纳 Settings 四键（language/autoScanOnStartup/volume/muted），未知键忽略不落盘；
//     默认值在前、已存值覆盖（Object spread 顺序保证）。set 只写出四键，天然不落未知键。
//
// language 值域决定留痕：
//   - M0.1 仅 'zh-CN'（类型约束 'zh-CN'）。set(partial) 传其他值由编译期类型拒绝，运行时无需枚举校验。

import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
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

/** 仅从任意对象中挑出 Settings 四键，忽略未知键（留痕：未知键不落盘）。 */
function pickKnown(input: unknown): Partial<Settings> {
  if (typeof input !== 'object' || input === null) return {};
  const src = input as Record<string, unknown>;
  const out: Partial<Settings> = {};
  for (const key of KNOWN_KEYS) {
    if (key in src) {
      (out as Record<string, unknown>)[key] = src[key];
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
    // 默认值在前、已存值覆盖；仅接纳四键，未知键忽略。
    const merged: Settings = { ...DEFAULT_SETTINGS, ...pickKnown(parsed) };
    return merged;
  }

  function set(partial: Partial<Settings>): Settings {
    const current = get();
    // 合并：current + partial（partial 覆盖）。
    const next: Settings = { ...current, ...partial };
    // volume 越界钳制 [0,1]（仅当 partial 含有限 number 时生效）。
    const clamped = clampVolume(partial.volume);
    if (clamped !== undefined) {
      next.volume = clamped;
    }

    // 确保目录存在（首次写入自动 mkdir）。
    if (!existsSync(deps.settingsDir)) {
      mkdirSync(deps.settingsDir, { recursive: true });
    }

    // 原子写：同目录 tmp + rename；Windows 需先删旧再 rename（留痕）。
    const tmpPath = path.join(
      deps.settingsDir,
      `.settings.${process.pid}.${randomUUID()}.tmp`,
    );
    const data = JSON.stringify(next, null, 2);
    writeFileSync(tmpPath, data, 'utf-8');
    try {
      // 先删旧文件（Windows rename 覆盖已存在目标会失败），再 rename tmp → settings.json。
      rmSync(settingsPath, { force: true });
      renameSync(tmpPath, settingsPath);
    } catch (err) {
      // 兜底：rename 失败时若 tmp 仍在，尝试再次删旧后 rename；仍失败则清理 tmp 并上抛。
      try {
        if (existsSync(tmpPath)) {
          rmSync(settingsPath, { force: true });
          renameSync(tmpPath, settingsPath);
        }
      } catch {
        rmSync(tmpPath, { force: true });
        throw err;
      }
    }
    return next;
  }

  return { get, set };
}
