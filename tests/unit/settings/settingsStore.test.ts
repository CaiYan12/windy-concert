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
});
