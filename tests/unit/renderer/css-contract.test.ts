/**
 * renderer CSS 契约静态守卫（node project）。
 *
 * 存在的理由（T4.3 复审 I1 立案）：
 *   jsdom 单测用 renderToStaticMarkup 只能证明「DOM 上有某个类名」，**不能**证明「该类名有对应
 *   的 CSS 规则」。T4.3 两次踩到同一失效模式——
 *     ① I3：e2e 注释声称「双击拦截由单测锚定」，但 grep 零命中（锚点根本不存在）；
 *     ② I1：`.track-list-error*` / `.is-sort-degraded` 规则缺失，而单测因只断言类名
 *        仍全绿（错误条无样式、表头压暗不生效，测试却报通过）。
 *
 *   本文件把「组件会渲染的类名」与「样式文件里必须存在的选择器」之间的对应关系**显式登记**，
 *   并以源码文本断言落地。写测试时不必再靠人眼核对 CSS，删规则会让测试红。
 *
 * 子串盲点教训（2026-09-11 二轮复审 I2 立案）：
 *   toContain('.track-list-error') 会被 `.track-list-error-title` / `-hint` 的**子规则**满足——
 *   容器规则缺失时守卫照样绿，恰好放走了 I1 缺口本身。故登记表引入 strict 语义：
 *   strict 条目要求「选择器 + 花括号」的规则原文（正则 `\s*\{` 结尾），子规则不再能顶替父规则。
 *   对存在 descendant 形态规则的选择器（如 .track-row.is-playing 只以 `.track-row.is-playing .track-title`
 *   形式出现）不能用 strict——那是登记错误，不是守卫严格。
 *
 * 边界（重要，避免本文件变成什么都管的杂物间）：
 *   · 只登记**语义关键**的类名——即「缺了样式会造成功能/状态不可见或误读」的那些。装饰性类名、
 *     纯布局类名、会被后续任务替换的临时类名（如 `.tracklist-page`）不登记。
 *   · 断言的是「选择器出现过」这一事实，不是样式值。值层面的验收靠设计稿并排走查 + e2e 截图，
 *     静态文本断言管不了层叠与优先级（opacity 数值一类关键值单独锚定，见文件尾）。
 *   · 不引入 CSS 解析器（项目无 postcss/CSSTree 依赖，为一个守卫测试引依赖不划算）；
 *     用「去注释后的原文是否包含子串/匹配规则原文」判定——选择器若被改写会红，
 *     这正是期望行为：改动样式选择器时同步更新此处登记。
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(import.meta.dirname, '../../..');

/** 待检样式文件（相对仓库根）。 */
const STYLE_FILES = [
  'src/renderer/src/styles/tracklist.css',
  'src/renderer/src/styles/cover.css',
  'src/renderer/src/styles/browse.css',
  'src/renderer/src/styles/search.css',
  'src/renderer/src/styles/shell.css'
] as const;

/** 去掉 CSS 注释（/* ... *\/），避免「注释里提到过这个选择器」造成假绿。 */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

function readStyles(): string {
  return STYLE_FILES.map((rel) =>
    stripComments(readFileSync(path.join(ROOT, rel), 'utf-8'))
  ).join('\n')
}

/** 正则元字符转义（选择器里的 . 等不能当通配符）。 */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * 「组件渲染出的类名 → 必须存在的选择器」登记表。
 * strict: true → 要求「选择器 + {」的规则原文（防子规则子串顶替）；仅当该选择器
 * 以裸规则（非 descendant 前缀）形式存在于样式文件时才可标 strict。
 * 每条的 guards 注明它守护的是哪个行为，便于后续维护时判断能否删除。
 */
const REQUIRED_SELECTORS: ReadonlyArray<{
  selector: string
  guards: string
  strict?: boolean
}> = [
  // --- T4.3 I1：error 与数据并存 ---
  {
    selector: '.track-list-error',
    guards: '数据非空 + error 时的非阻塞错误条容器（二轮复审立案：曾被子规则子串顶替而假绿）',
    strict: true
  },
  {
    selector: '.track-list-error-title',
    guards: '错误条标题段（t("songs.error")）'
  },
  {
    selector: '.track-list-error-hint',
    guards: '错误条详情段（具体 error 文本）'
  },
  {
    selector: '.track-row--head.is-sort-degraded',
    guards: '排序指示降级（setSort 后 refresh 失败时表头压暗，削弱「箭头可信」的暗示）',
    strict: true
  },
  // --- T4.3 C1 同族：封面占位 ---
  {
    selector: '.cover--placeholder',
    guards: '占位封面底（--bg-elevated）',
    strict: true
  },
  {
    selector: '.cover--placeholder .library-icon',
    guards: '占位图标 58% 盒尺寸 + .38 不透明度（复审 C1 同族：曾被 .cover-icon 类击穿致 100% 白）'
  },
  // --- T4.3 六态与交互 ---
  {
    // 注意：该状态类只有 descendant 形态规则（.track-title / .track-cell--index 着色），
    // 不可标 strict——strict 会要求不存在的裸规则，属登记错误。
    selector: '.track-row.is-playing',
    guards: '播放态文字着色（标题/序号走 --accent）'
  },
  {
    selector: '.track-row.is-missing',
    guards: '缺失态弱化（裸规则：opacity .62）',
    strict: true
  },
  {
    // 不可播态的规则均为 descendant 形态（subtitle/row-play 弱化），不可标 strict。
    selector: '.track-row.is-unavailable',
    guards: '不可播态弱化（含 row-play 图标 .25 不透明度）'
  },
  {
    selector: '.track-row.is-selected',
    guards: '选中态底色（--row-active）',
    strict: true
  },
  {
    selector: '.is-playing-icon',
    guards: '播放图标尺寸盒（accent 变体由文件名承担，此处只管盒）',
    strict: true
  },
  // --- T4.4 浏览页（browse.css）语义关键类 ---
  {
    selector: '.browse-page',
    guards: '五个浏览页容器：flex 列 + 确定高度，是 react-virtuoso 拿到虚拟滚动高度的必要前提；缺则曲目表塌陷不可见',
    strict: true
  },
  {
    selector: '.album-card',
    guards: '专辑卡片：position:relative 是 .card-play 绝对定位锚点，兼卡片外观；缺则播放钮错位、卡片无样式',
    strict: true
  },
  {
    selector: '.browse-state',
    guards: '五页共用的空/加载/错误态容器（缺则降级为无样式流式 div，状态不可辨识）',
    strict: true
  },
  {
    selector: '.card-play',
    guards: '卡片 hover 播放钮：定位/尺寸/显隐（opacity 0→1）；缺则按钮不可见不可点',
    strict: true
  },
  {
    selector: '.artist-row',
    guards: '艺术家列表行：网格布局 + hover 底色锚点；缺则行塌陷、hover 态丢失',
    strict: true
  },
  {
    selector: '.round-action',
    guards: '详情页播放/随机圆形钮盒（尺寸/圆角/边框）；缺则按钮无尺寸不可点',
    strict: true
  },
  {
    selector: '.hero--album',
    guards: '全项目唯一允许的渐变（§3.7 / T4.4）；缺则 Hero 平涂，违背视觉契约',
    strict: true
  },
  // --- T4.5 搜索（search.css）语义关键类 ---
  {
    selector: '.search-anchor',
    guards: 'SearchBox 包裹层：position:relative 是 .search-preview 绝对定位的参照锚；缺则下拉漂出视口',
    strict: true
  },
  {
    selector: '.search-preview',
    guards: 'SearchBox 下拉面板容器：绝对定位/z-index/底色；缺则预览以流式 div 落在顶栏下方，遮挡页面且无浮层',
    strict: true
  },
  {
    selector: '.search-preview-item',
    guards: '下拉预览行：网格布局（copy + 尾随）与 hover 底色锚点；缺则行无布局、标题溢出不省略',
    strict: true
  },
  {
    selector: '.search-preview-empty',
    guards: '下拉四组全空时的空态文案容器（无结果可见性）；缺则空态降级为无样式文本',
    strict: true
  },
  {
    selector: '.search-results-grid',
    guards: '全结果页四段式网格容器（gap 28）；缺则四段贴叠不可辨读',
    strict: true
  },
  {
    selector: '.result-group',
    guards: '结果页单分组段容器（min-width:0 防表格撑破网格）；缺则段溢出',
    strict: true
  },
  {
    selector: '.result-group-head',
    guards: '分组头（标题+计数+查看全部）flex 布局；缺则三元素纵向堆叠',
    strict: true
  },
  {
    selector: '.track-table--compact',
    guards: '搜索结果紧凑曲目表：min-width 覆盖（tracklist.css 的 900px 不适用于 6 列紧凑表）',
    strict: true
  },
  {
    // descendant 形态（覆盖 .track-table .track-row 的 10 列格），不可标 strict。
    selector: '.track-table--compact .track-row',
    guards: '紧凑表 6 列格覆盖（mockup.css:760）；缺则 6 格行套 10 列模板，列错位不可读'
  },
  // --- T4.9 Songs 翻页（browse.css）语义关键类 ---
  {
    selector: '.songs-pagination',
    guards: 'Songs 页脚翻页控件容器（flex 居中布局）；缺则控件塌陷为无样式流式文本',
    strict: true
  },
  {
    selector: '.songs-pagination-button:disabled',
    guards: '翻页禁用态（首页禁上一页/末页禁下一页——禁假总数约束下唯一的边界反馈）；缺则越界不可见',
    strict: true
  },
  // --- T4.11 侧栏 nav-badge（shell.css）语义关键类 ---
  {
    selector: '.nav-badge',
    guards: '侧栏「歌曲」导航计数徽标（library:getStats 真实总数，右推布局 margin-left:auto）；缺则徽标降级为无样式文本',
    strict: true
  }
]

describe('renderer CSS 契约（类名 → 选择器存在性）', () => {
  const css = readStyles()

  it('待检样式文件均非空（路径写错时立刻暴露，而不是静默全绿）', () => {
    for (const rel of STYLE_FILES) {
      const content = readFileSync(path.join(ROOT, rel), 'utf-8')
      expect(content.length, `${rel} 内容为空`).toBeGreaterThan(0)
    }
  })

  it.each(REQUIRED_SELECTORS)('$selector 有样式规则（守护：$guards）', ({ selector, strict }) => {
    if (strict) {
      // 严格形态：必须是「选择器 + 花括号」的规则原文，子规则/前缀类名不能顶替。
      const rule = new RegExp(`${escapeRegex(selector)}\\s*\\{`)
      expect(css, `缺少选择器 ${selector} 的裸规则——组件会渲染这个类名但无任何样式规则`).toMatch(
        rule
      )
    } else {
      expect(css, `缺少选择器 ${selector}——组件会渲染这个类名但无任何样式规则`).toContain(
        selector
      )
    }
  })

  it('占位图标不透明度为 .38（设计稿 mockup.css:728 的设计意图，非 100% 白）', () => {
    // 只锚定 `.cover--placeholder .library-icon` 这条规则体内出现了 0.38；
    // 若规则被删，上一条 it.each 已报错，此处再锁定数值，防止「规则在但透明度被改回 1」。
    const coverCss = stripComments(
      readFileSync(path.join(ROOT, 'src/renderer/src/styles/cover.css'), 'utf-8')
    )
    const rule = coverCss.match(/\.cover--placeholder\s+\.library-icon\s*\{([^}]*)\}/)
    expect(rule, '未找到 .cover--placeholder .library-icon 规则体').not.toBeNull()
    expect(rule![1]).toContain('opacity: 0.38')
  })
})
