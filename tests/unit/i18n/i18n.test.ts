// T3.5 i18n 运行时单测（node project）——
//   取数通道留痕：i18n/index.ts 经 getApi() 读 globalThis.window?.api；node 环境无 window，
//   此处在动态 import 前挂 window.api 桩（读真实 resources/locales/zh-CN.json），
//   即「真实资源经 mock window.api 注入」路径——不往 renderer 源码引 node:fs。
//   注意 vitest node project 的 cwd 可能是大写盘符（D:\），路径统一由 import.meta.dirname 推导。
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

// window.api 桩须在 i18n 模块静态 import 前就位（模块级 ensureLoaded() 随 import 触发）——
// vi.hoisted 先于 import 执行；node:fs 在桩函数调用时动态取得（不污染模块顶层，留痕）。
// 动态 import / beforeAll 内 import i18n 模块均触发 vitest runner 丢失（实测留痕），故用 hoisted + 静态 import。
const ROOT = path.resolve(import.meta.dirname, '../../..');
const LOCALE_FILE = path.join(ROOT, 'resources', 'locales', 'zh-CN.json');

vi.hoisted(() => {
  type Messages = Record<string, string>;
  const localeFile = new URL('../../../resources/locales/zh-CN.json', import.meta.url);
  (globalThis as unknown as { window: unknown }).window = {
    api: {
      i18n: {
        getMessages: async (lang: string): Promise<Messages> => {
          if (lang !== 'zh-CN') return {};
          const fs = (await import('node:fs')) as typeof import('node:fs');
          return JSON.parse(fs.readFileSync(localeFile, 'utf-8')) as Messages;
        },
      },
    },
  };
});

// i18n 模块（含模块级 ensureLoaded）在此 import，届时 window.api 桩已就位。
import * as i18n from '../../../src/renderer/src/i18n/index';

describe('i18n 资源完整性（resources/locales/zh-CN.json）', () => {
  it('文件可 JSON.parse 且键值全为非空 string', () => {
    const raw = readFileSync(LOCALE_FILE, 'utf-8');
    const messages: unknown = JSON.parse(raw);
    expect(messages).toBeTypeOf('object');
    expect(messages).not.toBeNull();
    for (const [key, value] of Object.entries(messages as Record<string, unknown>)) {
      expect(key, 'key 必须非空字符串').toBeTruthy();
      expect(value, `值必须为 string：${key}`).toBeTypeOf('string');
      expect(value as string, `值必须非空：${key}`).not.toBe('');
    }
  });
});

describe('i18n 运行时', () => {
  it('ensureLoaded 后 messages 非空（真实资源经 window.api 桩注入）', () => {
    const { messages, loaded, language } = i18n.useI18nStore.getState();
    expect(loaded).toBe(true);
    expect(language).toBe('zh-CN');
    expect(Object.keys(messages).length).toBeGreaterThan(0);
  });

  it('t 已加载 key 返回中文文案', () => {
    expect(i18n.t('nav.songs')).toBe('歌曲');
    expect(i18n.t('track.missing')).toBe('文件缺失');
    expect(i18n.t('track.unplayableTooltip')).toBe('此格式 M0.1 暂不支持播放，0.5 版恢复');
  });

  it('t 缺 key 返回 key 本身', () => {
    expect(i18n.t('no.such.key')).toBe('no.such.key');
    expect(i18n.t('also.missing', { name: 'x' })).toBe('also.missing');
  });

  it('t 带 params 按 {name} 形态插值', () => {
    expect(i18n.t('songs.total', { count: 42 })).toBe('共 42 首');
    expect(i18n.t('playlists.deleteConfirm', { name: '夜行' })).toBe('确认删除歌单「夜行」？');
    expect(i18n.t('hires.kbps', { value: 1411 })).toBe('1411 kbps');
  });

  it('t 插值时未知占位符原样保留、params 覆盖任意位置', () => {
    expect(i18n.t('songs.total', { other: 1 })).toBe('共 {count} 首');
    expect(i18n.t('toast.addedToPlaylist', { name: 'Morning' })).toBe('已添加到歌单「Morning」');
  });

  it('setLanguage 非 zh-CN 被忽略（M0.1 单语言，留痕）', async () => {
    const before = i18n.useI18nStore.getState();
    i18n.useI18nStore.getState().setLanguage('en-US' as never);
    await new Promise((r) => setTimeout(r, 0));
    const after = i18n.useI18nStore.getState();
    expect(after.language).toBe('zh-CN');
    expect(after.messages).toBe(before.messages);
  });

  it('useI18n 返回 { t, language, setLanguage } 且 t 可翻译', () => {
    // hook 不可在 node 中裸调（dispatcher 为 null，实测留痕）——经 react-dom/server SSR 渲染函数组件触发。
    let captured: ReturnType<typeof i18n.useI18n> | undefined;
    const Probe = (): null => {
      captured = i18n.useI18n();
      return null;
    };
    renderToStaticMarkup(createElement(Probe));
    const { t, language, setLanguage } = captured!;
    expect(typeof t).toBe('function');
    expect(language).toBe('zh-CN');
    expect(typeof setLanguage).toBe('function');
    expect(t('player.play')).toBe('播放');
  });
});
