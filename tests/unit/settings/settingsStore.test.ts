// T3.4 settingsStore 单测。
// 策略：settingsDir 用临时目录（os.tmpdir 下 mkdtempSync）；不依赖 electron。
// 覆盖：缺文件默认值 / set-get 往返 / volume 钳制 / 损坏 JSON 回退 / 原子写无 .tmp 残留 / 未知键忽略。
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createSettingsStore } from '../../../src/main/settings/settingsStore';

/** 取临时 settings 目录并在 afterEach 清理。 */
const tmpRoots: string[] = [];
function makeSettingsDir(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'windy-settings-'));
  tmpRoots.push(dir);
  return dir;
}

afterEach(() => {
  while (tmpRoots.length) {
    const dir = tmpRoots.pop()!;
    rmSync(dir, { recursive: true, force: true });
  }
});

/** 列出目录下所有文件名。 */
function listNames(dir: string): string[] {
  // 目录可能已被消费方删除，安全返回空。
  if (!existsSync(dir)) return [];
  return readdirSync(dir);
}

describe('settingsStore', () => {
  it('缺文件 get → 默认值四字段逐个断言', () => {
    const store = createSettingsStore({ settingsDir: makeSettingsDir() });
    const s = store.get();
    expect(s.language).toBe('zh-CN');
    expect(s.autoScanOnStartup).toBe(true);
    expect(s.volume).toBe(0.8);
    expect(s.muted).toBe(false);
  });

  it('set 后 get 往返一致', () => {
    const store = createSettingsStore({ settingsDir: makeSettingsDir() });
    const updated = store.set({ muted: true, volume: 0.3 });
    expect(updated.muted).toBe(true);
    expect(updated.volume).toBe(0.3);
    // 默认值未覆盖字段保持不变
    expect(updated.language).toBe('zh-CN');
    expect(updated.autoScanOnStartup).toBe(true);
    // 重新读取一致
    const reread = store.get();
    expect(reread).toEqual(updated);
  });

  it('volume 越界钳制：1.5 → 1，-0.2 → 0', () => {
    const store = createSettingsStore({ settingsDir: makeSettingsDir() });
    expect(store.set({ volume: 1.5 }).volume).toBe(1);
    expect(store.set({ volume: -0.2 }).volume).toBe(0);
    // 区间内值不变
    expect(store.set({ volume: 0.42 }).volume).toBe(0.42);
  });

  it('损坏 JSON（写入 "not-json"）get → 默认值不抛错', () => {
    const dir = makeSettingsDir();
    writeFileSync(path.join(dir, 'settings.json'), 'not-json', 'utf-8');
    const store = createSettingsStore({ settingsDir: dir });
    const s = store.get();
    expect(s).toEqual({
      language: 'zh-CN',
      autoScanOnStartup: true,
      volume: 0.8,
      muted: false,
    });
    // 损坏不立即重写：文件内容保持损坏（留痕：下次 set 覆盖修复）
    expect(readFileSync(path.join(dir, 'settings.json'), 'utf-8')).toBe('not-json');
  });

  it('原子性：set 后目录内无 .tmp 残留文件', () => {
    const dir = makeSettingsDir();
    const store = createSettingsStore({ settingsDir: dir });
    store.set({ muted: true });
    store.set({ volume: 0.5 });
    const leftover = listNames(dir).filter((n) => n.endsWith('.tmp'));
    expect(leftover).toEqual([]);
    // 正式文件存在且为合法 JSON
    expect(existsSync(path.join(dir, 'settings.json'))).toBe(true);
    expect(() => JSON.parse(readFileSync(path.join(dir, 'settings.json'), 'utf-8'))).not.toThrow();
  });

  it('未知键写入后 get 不含未知键', () => {
    const dir = makeSettingsDir();
    // 手工写入含未知键的文件（模拟外部手动编辑）
    writeFileSync(
      path.join(dir, 'settings.json'),
      JSON.stringify({
        language: 'zh-CN',
        autoScanOnStartup: false,
        volume: 0.9,
        muted: true,
        theme: 'dark',
        unknownField: 123,
      }),
      'utf-8',
    );
    const store = createSettingsStore({ settingsDir: dir });
    const s = store.get();
    expect(Object.keys(s)).toEqual(['language', 'autoScanOnStartup', 'volume', 'muted']);
    expect((s as Record<string, unknown>).theme).toBeUndefined();
    expect((s as Record<string, unknown>).unknownField).toBeUndefined();
    // set 写回后磁盘文件也不含未知键
    store.set({ muted: false });
    const onDisk = JSON.parse(readFileSync(path.join(dir, 'settings.json'), 'utf-8'));
    expect(Object.keys(onDisk)).toEqual(['language', 'autoScanOnStartup', 'volume', 'muted']);
  });

  it('类型非法 JSON：类型不符的键回退默认值，合法键保留', () => {
    const dir = makeSettingsDir();
    // 手工写入类型错误 JSON（模拟外部手动编辑 / 旧版本脏数据）
    writeFileSync(
      path.join(dir, 'settings.json'),
      JSON.stringify({
        language: 42, // 应为 string → 回退 'zh-CN'
        autoScanOnStartup: 1, // 应为 boolean → 回退 true
        volume: '0.8', // 应为 number → 回退 0.8
        muted: 'yes', // 应为 boolean → 回退 false
      }),
      'utf-8',
    );
    const store = createSettingsStore({ settingsDir: dir });
    const s = store.get();
    // 四键全部类型非法 → 全部回退默认值
    expect(s).toEqual({
      language: 'zh-CN',
      autoScanOnStartup: true,
      volume: 0.8,
      muted: false,
    });
  });

  it('类型非法 JSON（部分键）：非法键回退默认值，合法键保留', () => {
    const dir = makeSettingsDir();
    writeFileSync(
      path.join(dir, 'settings.json'),
      JSON.stringify({
        language: 'zh-CN', // 合法 → 保留
        autoScanOnStartup: false, // 合法 → 保留
        volume: '0.8', // 类型非法 → 回退默认 0.8
        muted: true, // 合法 → 保留
      }),
      'utf-8',
    );
    const store = createSettingsStore({ settingsDir: dir });
    const s = store.get();
    expect(s.language).toBe('zh-CN');
    expect(s.autoScanOnStartup).toBe(false);
    expect(s.muted).toBe(true);
    expect(s.volume).toBe(0.8);
  });

  it('set 传含未知键的 partial（模拟 renderer as any）→ 落盘文件不含未知键', () => {
    const dir = makeSettingsDir();
    const store = createSettingsStore({ settingsDir: dir });
    // 运行时不可信来源：T3.1 IPC 后 renderer 传参不带类型保护，用 as any 模拟
    const malicious = { muted: true, theme: 'dark', injected: 'x' } as unknown as Parameters<
      typeof store.set
    >[0];
    const updated = store.set(malicious);
    // 合法键生效
    expect(updated.muted).toBe(true);
    // 返回值不含未知键
    expect(Object.keys(updated)).toEqual(['language', 'autoScanOnStartup', 'volume', 'muted']);
    // 落盘文件不含未知键
    const onDisk = JSON.parse(readFileSync(path.join(dir, 'settings.json'), 'utf-8'));
    expect(Object.keys(onDisk)).toEqual(['language', 'autoScanOnStartup', 'volume', 'muted']);
    expect(onDisk.theme).toBeUndefined();
    expect(onDisk.injected).toBeUndefined();
  });
});
