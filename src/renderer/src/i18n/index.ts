// T3.5 渲染层 i18n 运行时 —— zustand 语言 store + t(key, params?) 翻译函数。
//   · 资源来源：window.api.i18n.getMessages（preload，main 侧按磁盘读 resources/locales/{lang}.json）。
//     **禁止 import electron**；也不 import node:fs——renderer bundle 不得出现 node 内建模块。
//   · node 可测性留痕：loadMessages 的取数经 getApi() 兜底读 globalThis.window?.api——
//     node 测试环境无 window，单测在 globalThis 挂 window.api 桩（读真实 resources/locales/zh-CN.json）
//     注入取数通道，保证 i18n/index.ts 本体可在 vitest node project 直接 import（任务书建议路径）。
//   · 整树重渲染：useI18n() 经 zustand 订阅 messages/language，资源更新（切换语言重新拉取）即重渲染。
//   · M0.1 单语言：shared/types.ts Settings.language 仅 'zh-CN'；setLanguage API 保留，
//     非 'zh-CN' 入参忽略并告警（留痕）。
import { useCallback, useSyncExternalStore } from 'react';
import { create } from 'zustand';

export type Language = 'zh-CN';
export const DEFAULT_LANGUAGE: Language = 'zh-CN';

/** 取数通道最小结构（结构性类型，不依赖 preload 具体导出——node 测试环境亦可用，留痕）。 */
interface I18nApi {
  i18n: { getMessages(lang: string): Promise<Record<string, string>> };
}

function getApi(): I18nApi | undefined {
  return (globalThis as unknown as { window?: { api?: I18nApi } }).window?.api;
}

interface I18nState {
  language: Language;
  messages: Record<string, string>;
  loaded: boolean;
  loadMessages: (lang: Language) => Promise<void>;
  setLanguage: (lang: Language) => void;
}

export const useI18nStore = create<I18nState>((set) => ({
  language: DEFAULT_LANGUAGE,
  messages: {},
  loaded: false,

  loadMessages: async (lang) => {
    const api = getApi();
    if (!api) {
      // node 测试环境 / preload 未就绪：不抛错，messages 保持空（t 回退 key），可经 ensureLoaded 重试（留痕）。
      console.warn('[i18n] window.api 不可用，跳过资源拉取');
      return;
    }
    try {
      const messages = await api.i18n.getMessages(lang);
      set({ language: lang, messages, loaded: Object.keys(messages).length > 0 });
    } catch (err) {
      // 拉取失败同样保持空表可重试，不阻塞 UI（留痕）。
      console.warn('[i18n] 语言资源拉取失败', err);
    }
  },

  setLanguage: (lang) => {
    if (lang !== DEFAULT_LANGUAGE) {
      // M0.1 单语言：仅 'zh-CN' 有效（留痕）。
      console.warn(`[i18n] M0.1 仅支持 ${DEFAULT_LANGUAGE}，忽略 setLanguage("${lang}")`);
      return;
    }
    void useI18nStore.getState().loadMessages(lang); // 切换语言重新拉取并整树重渲染
  },
}));

// ---------------------------------------------------------------------------
// 翻译核心（纯函数，t() 与 useI18n() 共用）
// ---------------------------------------------------------------------------

/** 查表翻译：key 缺失返回 key 本身（留痕）；params 以 {name} 形态插值。 */
function translateWith(
  messages: Record<string, string>,
  key: string,
  params?: Record<string, string | number>
): string {
  const raw = messages[key];
  const text = raw ?? key;
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match
  );
}

/** React 外可用的全局 t（读 store 当前快照；组件内请用 useI18n() 以获得响应式）。 */
export function t(key: string, params?: Record<string, string | number>): string {
  return translateWith(useI18nStore.getState().messages, key, params);
}

// ---------------------------------------------------------------------------
// 模块级初始化与 hook
// ---------------------------------------------------------------------------

let pendingLoad: Promise<void> | null = null;

/** 幂等加载：首次调用触发 loadMessages('zh-CN')；并发调用共享同一 promise；
    失败（loaded 仍 false）后可再次调用重试（留痕）。 */
export function ensureLoaded(): Promise<void> {
  if (useI18nStore.getState().loaded) return Promise.resolve();
  if (!pendingLoad) {
    pendingLoad = useI18nStore
      .getState()
      .loadMessages(DEFAULT_LANGUAGE)
      .finally(() => {
        pendingLoad = null;
      });
  }
  return pendingLoad;
}

// 模块级初始化：renderer bundle 加载即拉取 zh-CN；失败不阻塞（Phase 4 App 挂载时仍可 ensureLoaded 重试）。
void ensureLoaded();

export interface UseI18n {
  t: (key: string, params?: Record<string, string | number>) => string;
  language: Language;
  setLanguage: (lang: Language) => void;
}

/** 组件用 i18n 入口：经 useSyncExternalStore 订阅 zustand store——messages/language 变更
    即触发使用方整树重渲染（zustand 订阅，留痕）。不用 useI18nStore(selector) 直接作 hook：
    zustand v5 在 server 快照下回退 getInitialState()（初始空表），显式 getState() 快照保证
    行为一致且 node SSR 可测（实测留痕）。 */
export function useI18n(): UseI18n {
  const getMessages = () => useI18nStore.getState().messages;
  const getLanguage = () => useI18nStore.getState().language;
  const messages = useSyncExternalStore(useI18nStore.subscribe, getMessages, getMessages);
  const language = useSyncExternalStore(useI18nStore.subscribe, getLanguage, getLanguage);
  const translate = useCallback(
    (key: string, params?: Record<string, string | number>) => translateWith(messages, key, params),
    [messages]
  );
  const setLanguage = useCallback((lang: Language) => {
    useI18nStore.getState().setLanguage(lang);
  }, []);
  return { t: translate, language, setLanguage };
}
