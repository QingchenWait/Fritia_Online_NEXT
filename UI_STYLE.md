# 芙提雅 ONLINE NEXT — UI 设计风格指南

更新时间：2026-06-19

本文是「芙提雅 ONLINE NEXT」界面（HUD 与各悬浮窗口）的设计事实源。
**接手本项目并开启新会话时，先读本文，再动 UI。** 所有新增/修改的浮层都必须沿用这里的设计语言、令牌与组件，避免风格割裂。

---

## 1. 设计语言：暖色少女 Otome · 扁平化

- 风格：温暖、柔和、恋爱养成（otome）气质的 3A 游戏界面，**扁平化**为主，辅以柔光、暖色投影、爱心/花纹点缀。
- 主色：奶油 `--c-cream` 底、玫瑰 `--c-rose` 主点缀、香槟金 `--c-gold` 次点缀、暖李子棕 `--c-ink` 文字。
- 货币金、好感粉沿用既有暖色。
- 字体**全局不变**：`'Microsoft YaHei','PingFang SC','Hiragino Sans GB',sans-serif`。令牌里只有字号/字重/字距，没有字体族。

### 双层表面（统一点缀，两种底）
3A 游戏常见做法：菜单亮、场景内 HUD 半透。两层共用同一套**点缀系统**（玫瑰+金、爱心/花瓣、角标、圆角、按钮、动画），只是底色不同：

| 层 | 用途 | 底 | 文字 |
| --- | --- | --- | --- |
| 亮面浮层 | settings / history / date / gift / dream / achievements / model | 奶油磨砂 `--panel-bg` | 深色 `--c-ink` |
| 场景层 HUD | 对话框 / 按键提示 / sleep / 全景 / toast / 角色气泡 / 触控 | 半透暖玻璃 `--hud-bg(-strong)` | 浅色 `--hud-text` |

---

## 2. 文件结构

```text
index.html              按序 link 6 个 CSS 模块（带 ?v= 版本号）
css/
├── tokens.css          设计令牌(:root 变量)：色/渐变/阴影/圆角/间距/模糊/字号/动效
├── base.css            reset、body、canvas、加载屏、准星、淡出层，以及
│                       「保持不变」三区域原样迁移：#game-status / #top-bar / #dream-object-controls
├── components.css      共享组件：.ui-overlay、.otome-panel 框架、.btn 族、字段、
│                       .otome-card、.otome-section-label、.otome-divider、.otome-chip、
│                       .custom-select、统一暖色滚动条
├── effects.css         动画与光效：入场、msg-in、爱心脉动、花瓣、点燃 ignite、进度扫描
├── panels.css          各浮层专属布局/配色（含 JS 动态生成内容的样式）+ 浮层 z-index
├── responsive.css      响应式（≤820 折叠双栏，≤600 移动端单列）
└── style.css           兼容入口：仅 @import 上述模块（旧引用安全网）

src/_ui/                UI 美术资源（原创手绘 SVG，详见 src/_ui/README.md）
```

> 维护原则：改主题只动 `tokens.css`；加通用控件进 `components.css`；某个浮层的专属样式进 `panels.css`；动画/光效进 `effects.css`。**勿在 base.css 堆业务样式，勿改三区域保留规则。**

---

## 3. 设计令牌（节选，全集见 `css/tokens.css`）

- 颜色：`--c-cream / --c-blush / --c-rose / --c-rose-deep / --c-rose-ink / --c-gold / --c-gold-deep / --c-ink / --c-ink-soft / --c-ink-faint / --c-danger / --c-success`
- 表面：`--panel-bg / --panel-card / --panel-line / --field-bg / --field-border`；HUD：`--hud-bg(-strong) / --hud-line / --hud-text(-soft)`
- 渐变：`--grad-rose / --grad-gold / --grad-title / --grad-blush`
- 阴影/光：`--shadow-panel / --shadow-card / --shadow-soft / --shadow-hud / --glow-rose / --glow-gold`
- 圆角：`--r-xs..--r-xl / --r-pill`；间距：`--sp-1..--sp-7`；模糊：`--blur-panel/-overlay/-hud`
- 字号：`--fs-kicker..--fs-title`；动效：`--ease-out / --ease-soft / --t-fast/-mid/-slow`

---

## 4. 组件：如何拼一个统一风格的浮层

所有亮面浮层都用同一套骨架。**外层保留原 panel 的 `id`（JS 靠它 toggle `.hidden`）并加 `.ui-overlay`；内层用 `.otome-panel`。**

```html
<div id="xxx-panel" class="ui-overlay hidden">
  <div class="otome-panel otome-panel--md">            <!-- --sm/--md/--lg/--xl 控宽度 -->
    <div class="otome-panel__head">
      <div class="otome-panel__icon"><img src="src/_ui/icon_xxx.svg" alt=""></div>
      <div class="otome-panel__titles">
        <span class="otome-panel__kicker">KICKER</span> <!-- 自带爱心前缀 -->
        <h2 class="otome-panel__title">标题</h2>         <!-- 自带金玫瑰渐变文字 -->
        <p class="otome-panel__sub">副标题</p>
      </div>
      <div class="otome-panel__actions">                <!-- 可选：chip 等 -->
        <span class="otome-chip">…</span>
      </div>
      <button class="otome-panel__close" aria-label="关闭"><img src="src/_ui/icon_close.svg" alt=""></button>
    </div>
    <div class="otome-panel__body">                     <!-- 默认带内边距+滚动；--flush 交给内部自管滚动 -->
      <section class="otome-card">
        <div class="otome-section-label">区块标题</div>
        …字段 / 内容…
      </section>
    </div>
    <div class="otome-panel__foot">                     <!-- 可选页脚 -->
      <button class="btn btn--primary">主操作</button>
    </div>
  </div>
</div>
```

组件速查：
- 按钮：`.btn` + `.btn--primary`（玫瑰渐变主操作）/ `.btn--gold`（香槟金，付费/确认）/ `.btn--ghost`（次要）/ `.btn--danger`（删除）。
- 字段：`.otome-panel` 内的 `input/textarea` 自动套用统一样式；标签用 `.otome-field-label`，行距用 `.otome-field`。
- 卡片：`.otome-card`（中性）/ `.otome-card--rose`（玫瑰强调）。
- 小药丸：`.otome-chip`（金，余额）/ `.otome-chip--rose`。
- 模板建议：造梦终端的 `.dream-template-btn` 使用胶囊圆角、小高度、半透明亮面按钮样式，只承载 emoji + 简短模板标题；点击后填入文本框，不直接触发主操作。
- 分隔：`.otome-divider`（爱心金线）。
- 头部角标花纹与对角金角标由 `.otome-panel` 的伪元素自动绘制，无需额外标签。

新增浮层别忘了：
1. 外层 `id` 加进 `js/controls.js` 的 overlay 管理列表；关闭时派发 `fritia-overlay-closed`。
2. 在 `panels.css` 给新 `id` 设 `z-index`（沿用既有层级关系）。
3. 移动端输入框字号 ≥16px（组件已默认 16px）。

---

## 5. 按键提示「点燃」effect

- 提示按钮统一加 `.kbd-prompt` class（如 `#interaction-prompt / #painting-prompt / #dream-painting-prompt`），并用 `data-prompt-key` 标记当前真实键位。
- 触发（物理按键或触控点击均经 `onKeyDown`）时，`js/main.js#ignitePrompt()` 会：
  1. 给可见的对应提示加 `.igniting`（按钮自身金/玫瑰辉光）；
  2. 在按钮中心生成独立 `.ignite-burst`（扩散光环 + `src/_ui/spark.svg` 四角星火花），即使按钮随即隐藏也能完整播放。
- 按键→提示映射见 `igniteForKey()`（F→对话/摸头，E→交互/起床/全景退出，1→替换图片/样式确认，2→样式回退）；只允许点亮键位匹配的可见提示，避免按 E 误触发 F 提示。全景内按 `1` 可退出，但不点亮 `按 E 退出`。
- 动画与样式在 `css/effects.css`（`ignite-glow / ignite-ring / ignite-spark`）。

---

## 6. 保持不变的三处（勿改其视觉）

- 右上角圆形按钮组 `#top-bar`
- 左上角游戏状态 `#game-status`
- 家具编辑圆形浮层 `#dream-object-controls`（及其 `src/_logos/dream_*.svg` 图标）

它们的规则原样保留在 `base.css`（移动端规则在 `responsive.css`），改动 UI 时请绕开。

---

## 7. 关键约束（与 JS 的耦合）

重构 HTML 时**必须保留所有 `id` 和 JS 动态读写/生成的 class**，否则功能损坏。典型：

- 流式对话逐字写入 `.msg-text`；聊天用 `.chat-row/.chat-bubble/.assistant-bubble/.user-bubble/.chat-name/.msg-text/.system-msg/.thinking`（对话框与约会按容器分主题）。
- 成就 `.achievement-card(+unlocked/locked/secret)/...`、`.achievement-toast`；礼物 `.gift-record*/.gift-result*/.gift-empty`、`#gift-status[data-kind]`、`#gift-pay-btn[data-disabled-reason]`；约会 `.date-location-*`；换装 `.model-item(+active)/.model-name/.model-path`。
- `#dream-balance` 必须内含 `<span>`；`#dream-status/#dream-editor-status[data-kind]`、`.dream-style-progress.active` 触发扫描动画；`.dream-character-bubble/.dream-line-toast`。
- 历史 `.history-tab[data-tab]`、`#history-date-filter` 内的 `.select-selected/.select-options/.select-option`。

`#dream-status` 等的状态色键 `data-kind`：`warn`(金)/`ok`(绿)/`loading`(紫)。
