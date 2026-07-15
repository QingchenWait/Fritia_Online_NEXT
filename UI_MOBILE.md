# 芙提雅 ONLINE NEXT — 移动端横屏 UI 设计文档

更新时间：2026-06-26

本文是「移动端横屏专用交互逻辑」的设计事实源。**接手相关功能、或要为新浮层补横屏适配时，先读本文，再动样式。**

本系统与桌面端 / 移动端竖屏完全解耦：它是一套**独立、可一键移除**的样式层，只在「触屏设备 + 横屏」时叠加生效，其余情况零影响。设计语言 / 令牌 / 组件仍沿用 `UI_STYLE.md`，本文只讲**横屏下如何重排尺寸与位置**。

---

## 1. 总体思路

### 1.1 为什么需要它
- 所有悬浮窗口（otome 浮层 + 战术考核 HUD）的标题栏/底栏在桌面尺度下很高；移动端原本**没有针对横屏的缩放/重排机制**。
- 在 17:9 以上比例的横屏手机上，浮层内容被挤成很窄一条，几乎无法操作。
- 战术考核（卡牌模式）底部按钮用 `left: calc(50% ± 478px)` 这类**中心偏移**绝对定位，窄屏手机上会被推到屏幕外 → 「奇奇怪怪的布局」。

### 1.2 两个文件 = 一套闭环
| 文件 | 职责 |
| --- | --- |
| `js/mobile_landscape.js` | 唯一检测入口。判定「触屏 + 横屏」后给 `<html>` 挂 class，并把真实视口尺寸写入 CSS 变量；同时承载少量 CSS 无法表达的横屏专用 DOM/事件适配。**不直接改任何浮层布局。** |
| `css/mobile_landscape.css` | 全部横屏布局。**每条规则**都以 `html.ml-active` 开头，最后 link 加载。 |

> 一键还原：删掉 `index.html` 里这两行引用即可。任何现有 CSS/JS 的布局逻辑都未被改写；少量横屏专用 DOM/事件适配见 §4，均由 `ml-active` 限定。

### 1.3 根 class 契约（JS ↔ CSS 的唯一接口）
`js/mobile_landscape.js` 在 `<html>` 上维护：

| class | 含义 | 触发条件 |
| --- | --- | --- |
| `ml-active` | 移动端横屏模式开启 | 触屏设备（`(pointer: coarse)` 或 touch+移动 UA）**且**横屏 |
| `ml-short` | 矮屏，进一步压缩 | `ml-active` 且视口高度 ≤ 400px |
| `ml-ultrawide` | 超宽（≈19:9 以上） | `ml-active` 且宽高比 ≥ 2.1 |

并写入 CSS 变量（解决移动浏览器 100vh 抖动）：`--ml-h` / `--ml-w`（真实视口 px）、`--ml-vh` / `--ml-vw`（1% px）。
切换时派发 `window` 事件 `ml-mode-changed { active }`。对外只读接口 `window.FritiaMobileLandscape.isActive()`。

### 1.4 调试开关（桌面对照测试用）
- URL 参数 `?ml=1` 强制开启 / `?ml=0` 强制关闭；
- `localStorage.fritia_force_ml` = `'1'`/`'0'` 同义（优先级低于 URL）。

### 1.5 令牌（仅 ml-active 作用域）
| 令牌 | 公式 | 用途 |
| --- | --- | --- |
| `--ml-panel-h` | `calc(var(--ml-h) - 10px)` | 浮层最大高度（真实视口高度减小边距） |
| `--ml-safe-*` | `env(safe-area-inset-*)` | 刘海/挖孔屏安全区 |
| `--ml-dream-wish-height` | `clamp(110px, calc(var(--ml-h) - 320px), 290px)` | 造梦终端「家具愿望」输入框高度；调大/调小此变量即可 |

> 浮层内的尺寸基本用固定值 + `calc(var(--ml-h) - Npx)` 直接随高约束（如各列表 `max-height`），不再引入额外缩放变量，便于阅读与维护。战术考核**不引入本系统的缩放变量**——其缩放完全由既有 `--side-combat-ui-scale`（responsive.css）负责。

### 1.6 特异性策略
- 每条规则 `html.ml-active …` 比对应原规则多 1 个 class（`.ml-active`）的特异性；文件最后加载，平手时凭加载顺序取胜；
- 战术考核只做"尺寸微调"，定位不碰；既有 `--side-combat-ui-scale` 是 JS 内联变量，本系统不依赖它、也不覆盖它。

---

## 2. 浮层骨架通用压缩（§1，所有 `.otome-panel` 共用）

目标：把标题栏从 ~96px 压到 ~52px，底栏/内边距同步收紧，让正文在矮横屏里仍有可用高度。

| 元素 | 桌面 | 横屏（`ml-active`） | 矮屏附加（`ml-short`） |
| --- | --- | --- | --- |
| `.ui-overlay` 内边距 | 24px | 6px | — |
| `.otome-panel` 限高 | `min(86vh,880px)` | `--ml-panel-h` | — |
| 角标 `::before/::after` | 58px | 32px | — |
| `.otome-panel__head` 内边距 | `22px 28px` | `8px 16px` | `6px 14px` |
| `.otome-panel__icon` | 52px | 38px | 32px |
| `.otome-panel__title` | `--fs-xl`(1.6rem) | 1.12rem | 1rem |
| `.otome-panel__sub` | 0.8rem，多行 | 0.72rem，限 2 行 | 隐藏 |
| `.otome-panel__kicker` | 0.72rem | 0.6rem | 隐藏 |
| `.otome-panel__close` | 38px | 34px | — |
| `.otome-panel__body`（非 flush） | 28px | `12px 16px` | — |
| `.otome-panel__foot` | `16px 28px` | `8px 16px` | — |
| `.btn` 最小高 | — | 40px | 36px |

约束：
- **flush 主体**（`.otome-panel__body--flush`，自管滚动：settings/roundtable/bartending/history/date）**不套通用内边距**，改由 §3.2 各自处理。
- **输入框字号保持 ≥16px**（防 iOS 自动放大），只压高度/内边距，不压字号。

---

## 3. 逐窗口专属布局（§2 + §3，具体问题具体分析）

### 3.1 普通 otome 浮层

| 浮层 | 关键调整 |
| --- | --- |
| `#model-selector` 换装 | 宽 `min(560px,92vw)`；列表 gap 收紧。 |
| `#settings-panel` 系统设置 | 侧栏 150→112px、nav-item 64→46px；view-head 内边距压缩；保证底栏「保存」可见。大模型连接、操作设置、知识库、更多资源分别见专项。 |
| `#roundtable-whispers-panel` 圆桌密语 | 见下「圆桌密语专项」。 |
| `#bartending-challenge-panel` 调酒挑战 | 见下「调酒挑战专项（完全重制）」。 |
| `#bar-guest-panel` 邀请角色（发起邀请） | 见下「发起邀请专项」。 |
| `#dream-terminal-panel` 造梦终端 | 愿望/锻造双栏；家具愿望 textarea 用 `--ml-dream-wish-height` 随高 clamp。 |
| `#dream-furniture-editor-panel` / `#dream-placement-editor-panel` | 样式/位置 textarea `min-height` 随高 clamp。 |
| `#history-panel` 历史 | tab 工具条内边距压缩。 |
| `#date-panel` 约会 | 地点网格内边距/gap 压缩；聊天区/输入行压缩。 |
| `#gift-terminal-panel` / `#gift-collection-panel` | 描述 textarea 随高 clamp；收藏列表 gap 收紧。 |
| `#achievements-panel` 成就 | 网格 minmax 280→220px、卡片 min-height 140→112px。 |
| `#dance-panel` 舞曲 | 宽 `min(880px,96vw)`；**左栏底部说明文字 `#dance-status` 用 `order:-1` + `grid-column:1/-1` 提到顶部整行显示**；舞台卡去掉固定 min-height/跨行。 |

#### 圆桌密语专项
- **设置步**（`#roundtable-step-setup`）：保留副标题与底栏；邀请/规则双栏保留；中间 `#roundtable-participant-list` 加 `max-height`（随高）+ **自绘滚动条**（`scrollbar-width:thin` + `::-webkit-scrollbar` 玫瑰金渐变 thumb）。
- **群聊步**（`#roundtable-step-chat`，JS 给面板加 `.ml-rt-chat`）：
  1. 输入栏 `#roundtable-input` 压成**一行**（`height:40px; resize:none`），与 `#roundtable-send` 同行；
  2. **取消底栏** `.roundtable-foot`（`display:none`，回收高度）；
  3. 「圆桌密语进行中」状态 `#roundtable-chat-status` 由 JS **搬到标题区**当副标题（同时隐藏原副标题）；
  4. 底栏右下的时间/电量/警告 `.roundtable-foot-timebar`（含错误浮窗）由 JS **搬到左栏**（`.roundtable-roster`）的 `+/-/返回` 按钮组下方。
  - 搬移与还原逻辑在 `js/mobile_landscape.js`（见 §4），退出群聊或关闭横屏模式时原样还原。

#### 调酒挑战专项（双栏 + 收紧）
目标是**调酒区(左) + 结果区(右) 左右双栏**（如桌面/图1），但更紧凑：
- `.bartending-grid` 强制 `display:grid` + `grid-template-columns: minmax(0,1.32fr) minmax(0,1fr)`——**覆盖 `@media(max-width:980px)` 把它改成 `display:flex` 单列的规则**（否则窄横屏会变上下堆叠）；
- **HP 与 ROUND 同一行**：`.bartending-status-deck` 强制 `grid-template-columns: minmax(0,1fr) auto`（覆盖 ≤980 单列堆叠）；
- `.bartending-mixer-panel` `repeat(3,1fr)` 三栏材料；`.bartending-ingredient-list` 强制 `display:flex;flex-direction:column`（覆盖 ≤980 的 2 列网格）+ `max-height` 随高 + **自绘滚动条**；
- **隐藏材料类型标签** `.bartending-ingredient small`（「标准材料/异常材料」）；
- **材料按钮高度 ≈ 文字行高的 1.3 倍**（原 `min-height:56px` 含两行；去标签后只剩单行名称）：关键是 `.bartending-ingredient { flex: 0 0 auto; min-height:0; padding:2px 11px; line-height:1.3 }`——**`flex:0 0 auto` 必不可少**，否则列表过长时按钮被 column-flex 压扁（padding 失效、塌成 ~17px）；想再高/再矮就调这里的 `padding`；
- 状态台/HP 台/结果区 padding、`otome-section-label` 行距全部收紧。

#### 发起邀请专项
- 右栏**删除顶部 PMX 预览方框** `.bar-guest-preview`（`display:none`），`.bar-guest-preview-wrap` 改单列，只保留「新角色配置」标题；说明 `.bar-guest-copy` 压成**一行**；
- **候选角色** `.bar-guest-card` 缩矮（`padding:8px 11px; min-height:0`），左栏 `.bar-guest-card-list` 加 `max-height` + **自绘滚动条**（候选很多时可滚）；
- **取消** `#bar-guest-status` 说明条（`display:none`，即「XX 已选中，可直接邀请入场」）；
- 整体更紧凑：`otome-section-label`/`otome-field-label` 行距收紧、`#bar-guest-name` 与文件卡更矮、底栏按钮 `min-height:38px`。

#### 系统设置 · 大模型连接专项
- **目标**：横屏下让“大模型设置”一屏内更容易完成 API Key / Base URL / 模型名称输入，不改变桌面端和竖屏布局。
- **三项共享外框**：`.settings-form-grid` 本身变成一个无标题圆角矩形框，API Key / Base URL / 模型名称三行都放在里面；行与行之间只用细分隔线，不再给每项单独画圆角框。
- **固定三行高度**：外框使用 `--ml-model-field-row-h: 52px` 和 `--ml-model-form-h: calc(var(--ml-model-field-row-h) * 3 + 2px)`，并设置 `flex:0 0 var(--ml-model-form-h)` / `height` / `min-height`；它必须始终完整展示 3 个配置项，不能被 API 获取卡片、亲密模式卡片或底栏挤压变矮。需要整体调高/调矮时只改 `--ml-model-field-row-h`。
- **行式表单**：每个 `.otome-field` 是两列，左侧标签固定 `96px`，右侧输入框 `height/min-height:34px`、`font-size:16px`。不显示变量名，也不加子项类别标题。
- **API 获取卡片横向压缩**：`.settings-api-card` 改成左右两列，左侧说明、右侧按钮组；按钮 `min-height:28px`、gap 收紧。卡片保持正常文档流，不允许固定在底部或覆盖三项外框。
- **亲密模式卡片**：`.settings-intimate-card` 改成左侧标题 + 正常说明小字、右侧开关；`min-height:64px`，避免出现时被压成窄条。隐藏/显示逻辑仍由原 `.hidden` 与设置逻辑控制，出现时也保持正常文档流。
- **亲密模式滚动保护**：移动 WebView 点击隐藏 checkbox 时可能自动把 1px 输入控件滚入视野，导致整页内容上移。横屏层在 `.settings-intimate-card` 上禁用滚动锚定，并由 `js/mobile_landscape.js` 在点击/切换前后恢复 `settings-body`、当前 model view、左侧 nav 和 window 的滚动位置；普通桌面和竖屏不生效。
- **边界**：这些选择器全部限定在 `html.ml-active #settings-panel .settings-view[data-settings-view="model"]` 下，普通模式与竖屏模式继续使用 `panels.css` / `responsive.css`。

#### 系统设置 · 操作设置专项
- **目标**：让“操作设置”也变成与“高级设置”一致的行式配置界面：三项灵敏度共用一个无标题圆角矩形框，不显示变量名，也不加类别标题。
- **标题-数值-滑块**：`.settings-control-panel` 作为共享外框；每个 `.settings-slider-row` 使用两列两行，左列跨两行放标题与说明，右列第一行放当前数值，右列第二行放滑块，和高级设置的子项结构一致。
- **紧凑尺寸**：每行 `padding:9px 11px`，行与行之间只用分隔线；标题/说明字号降到 `0.8rem / 0.67rem`，适配横屏高度。
- **边界**：选择器全部限定在 `html.ml-active #settings-panel .settings-view[data-settings-view="controls"]` 下，桌面端与竖屏保持原样。

#### 系统设置 · 知识库专项
- **症结**：桌面用 `.knowledge-workbench → .kb-main → .kb-detail → .kb-management-grid → .kb-*-panel` 一条 `flex:1 + overflow:hidden` 的层层裁剪链；短横屏下 head/上传台占满高度，把 management-grid 裁成 0，只剩 FILES/CHUNKS 标题、看不到文件名/删除键/分块内容。
- **修法**：固定 `.knowledge-workbench` 高度 `calc(var(--ml-h)-150px)`；右栏详情链改成"自然高度 + 整体滚动"——`.kb-main { display:block; overflow-y:auto }`、`.kb-detail / .kb-management-grid { display:block 或 flex:none; overflow:visible }`、`.kb-*-panel { overflow:visible }`；FILES/CHUNKS 列表 `#kb-file-list`/`#kb-chunk-list` 各自 `max-height + overflow-y:auto`。
- **三处独立自绘滚动条**：左栏 `.kb-list`（flex:1）、右栏 `.kb-main`、以及详情内 `#kb-file-list` / `#kb-chunk-list`，都挂玫瑰金渐变 `::-webkit-scrollbar`。
- **底栏压到 ~70%**：`.settings-foot` padding `5px 16px`、右下角按钮 `min-height:30px` 且收紧上下 padding（实测 foot ~42px / 按钮 ~31px）。

#### 系统设置 · 更多资源（INFO）专项
- **目标**：桌面是「LOGO + 标题 + 副标题 + 制作信息 + 4 个资源按钮」居中单列；横屏改成左右两栏，左栏只承载 LOGO + `芙提雅 ONLINE NEXT`，右栏承载副标题、制作信息和 2×2 资源按钮。
- **列比例**：`.settings-resources-page` 使用 `minmax(220px,0.56fr) minmax(0,1.44fr)`，比上一版继续缩小左栏、扩大右栏，给 `Copyright` 首行更多横向空间，减少换行。
- **左栏居中**：不改 DOM、不加包裹层；`.settings-resources-logo-wrap` 和 `.settings-resources-title` 都跨 `grid-row:1/4`，分别用 `align-self:center` 与 `translateY(-30px / 58px)` 组成一个垂直居中的视觉组，避免标题歪到左栏底部。
- **右栏**：`.settings-resources-subtitle` / `#settings-about-text` / `.settings-resource-links` 分别占右栏 1/2/3 行；制作信息字号 `0.73rem`、行高 `1.56`；资源按钮强制 `display:grid; grid-template-columns:1fr 1fr`，即 2×2，按钮 `min-height:34px`。
- **想调比例/大小**：改 `grid-template-columns`、`--ml-resources-logo-size`、两个 `translateY(...)`、制作信息字号/行高、按钮 `gap`。只动本段，不影响桌面/竖屏。

#### 造梦终端专项
- 左右双栏整体压缩、保证全部内容在窗口内可见（`.otome-panel__body` 仍可滚作兜底）：
  - 左栏家具愿望 `#dream-furniture-description` 用 **`flex:none` + `height: var(--ml-dream-wish-height)`**——覆盖既有 `flex:1` 撑满整列的行为（否则文本框会占掉半屏）；
  - `--ml-dream-wish-height` 当前是 **`clamp(110px, calc(var(--ml-h) - 320px), 290px)`**，这是控制愿望栏变大/变小的唯一参数；要增大就调高中间公式或上下限，要缩小就调低；
  - 右栏"打造参数"：`.dream-compose` 间距、`otome-field-label` 行距、`#dream-placement-input` 高度、`.dream-forge-card` padding、进度条间距全部收紧。

| `#dialogue-box` 场景对话（高频） | 内边距压缩；正文区 `max-height` 30vh（矮屏 26vh）；输入行压矮。 |

### 3.2 战术考核 `#side-scroller-adventure`（§3）

> **背景**：战术考核整体骨架（顶栏/路线/生命 HUD/敌方/侧边钮/弹窗）沿用既有 `css/responsive.css` 三层方案
> （`@media(max-height:540px)` 固定块 + `.is-side-combat-compact-wide` 线性缩放 + `.is-side-combat-extreme-wide` 生命 HUD 居中）。
> 本系统只接管少量明确目标控件，其余一律不碰（更不碰 Canvas 人物——早期改人物缩放导致占满屏，已彻底回退，`side_scroller_*.js` 与本系统无关）。
>
> ⚠️ 历史教训：不要在本系统里**整体重排**战术考核定位（会与三层方案叠加打架）。只允许像下面这样**精准接管个别控件**。

**(0) 左上角标题卡片**：
- `html.ml-active #side-scroller-adventure.is-side-combat-active .side-scroller-title { display:none; }`，移动横屏卡牌模式隐藏左上角 `SNOWFIELD / 战术考核` 标题卡片，释放左上视野。
- 只隐藏标题卡片，不隐藏 `.side-scroller-close` 返回按钮；桌面端、竖屏和非卡牌模式不生效。

**(a) 手牌两侧 4 个控件贴到卡牌旁**（核心修复）：既有方案用 `left:calc(50% ± 340/396px)` 等中心偏移定位牌库/刷新/弃牌/出牌数，在宽横屏上离卡牌太远、离角落按钮太近。改为**锚定到手牌左右边缘**：
- 本系统接管手牌宽度 `--ml-hand-w: min(660px, calc(100vw - 300px))`（两侧各留 ~150px）、`min-width:0`；
- 左簇（刷新下/牌库上）`right: calc(50% + var(--ml-hand-w)/2 + var(--ml-fbtn-gap))`；右簇（弃牌下/出牌数上）`left: calc(50% + var(--ml-hand-w)/2 + var(--ml-fbtn-gap))`。`--ml-fbtn-gap` 当前为 **14px**，用于控制圆形控件离手牌边缘的距离；调大更远，调小更近；
- 两簇竖向抬到 `bottom: 74px / 128px`，**位于底部角按钮（信息/结束回合，bottom≈16px）之上**，故即使水平接近也不相撞；
- 窄屏/超宽（`ml-short`/`ml-ultrawide`）把 `--ml-hand-w` 收到 `min(600px,100vw-280px)`、夹层钮 46→**42px**、下沿 74→66px，**杜绝超出卡片或撞到角按钮**。

**(b) 卡牌大小与字号（多轮迭代后定稿，约为"放大版"的 70%）**：
- 手牌宽度 `--ml-hand-w: min(470px, 100vw-300px)`（窄屏 `min(430px,100vw-280px)`）；卡牌宽 `clamp(80px, (var(--ml-hand-w)-30px)/4, 124px)`、高 `×1.26`——宽屏下约 **119×146**；缩小手牌宽度的同时夹层控件仍贴着卡牌外缘 8px。
- **卡牌字号用 §0 的 CSS 变量，手牌与"拖动幽灵"各一套、互相独立**：
  - 手牌：`--ml-card-title-fs`(0.69rem) / `--ml-card-desc-fs`(0.62rem) / `--ml-card-top-fs`(0.56rem) / `--ml-card-value-fs`(0.82rem)
  - 拖动幽灵：`--ml-ghost-title-fs` / `--ml-ghost-desc-fs` / `--ml-ghost-top-fs` / `--ml-ghost-value-fs`（默认与手牌相同值）
  - 两套默认相同，所以现在看不出差别；要单独调"手牌数值"改 `--ml-card-value-fs`，要单独调"拖动中卡片数值"改 `--ml-ghost-value-fs`，互不影响。
- **拖动幽灵 `.side-combat-card.is-drag-ghost`**：JS 把卡牌 `cloneNode` 到 `<body>`（不在 `#side-scroller-adventure` 内），故必须用**不带 `#side-scroller-adventure` 前缀**的 `html.ml-active .side-combat-card.is-drag-ghost …` 规则、引用 `--ml-ghost-*-fs` + 相同 padding——否则拖动瞬间字号会回落到桌面大字号"突然变大"。
- 调整大小只需改 `--ml-hand-w`（卡牌与两侧控件一起缩放）；字号改对应变量。

**(c) 本轮卡池弹窗（点击左侧牌库列表按钮）**：
- 桌面原始 `.side-combat-tooltip--deck` 宽 `min(360px,100vw-32px)`、列表 `max-height:360px`；横屏专用层改为 `--ml-deck-popover-w: min(240px, calc(100vw - 32px))`，约为原宽度的 2/3。
- 列表高度不再使用固定 px。`js/mobile_landscape.js` 在 `ml-active` 且卡池弹窗出现时，动态测量当前渲染出的前 4 张 `.side-combat-deck-item` 真实高度，加上实际 `row-gap`、边框和 `DECK_LIST_EXTRA_PX` 余量，再写入 `#side-scroller-adventure` 的 `--ml-deck-list-h`；CSS 只用这个变量限制 `.side-combat-deck-list` 的 `max-height`。
- 横屏专用层不再覆盖 `.side-combat-deck-item`、标题、描述、gap、padding 或字体，卡池里的剩余手牌卡片高度与原始 `css/panels.css` 保持一致；缩放、字体或响应式变化会通过 JS 重新测量自动适配。
- 想手动调窗口宽度改 `--ml-deck-popover-w`；想调可见卡牌数量改 JS 常量 `DECK_VISIBLE_CARD_COUNT`；想调“加一点边框距离”的余量改 `DECK_LIST_EXTRA_PX`。

其余仅尺寸略增（不动定位）：信息/侧边/技能钮 48–50px、结束回合 min-height 50px、路线/生命数字、开局弹窗字体/按钮。

> 经验：要动战术考核定位时，**像 (a) 那样精准锚定到某个参照（手牌边缘）并把竖向错开角按钮**，配窄屏兜底缩小；不要整体平移所有控件。

---

## 4. 系统内的 JS（除检测外）

`js/mobile_landscape.js` 仍是横屏专用入口；除检测/写变量外，只保留 CSS 不能完成的两类适配，且都必须由 `ml-active` 限定。

### 4.1 圆桌密语群聊 DOM 搬移

CSS 无法把节点重新挂载到另一个父级，故圆桌密语群聊步的两处搬移由 `js/mobile_landscape.js` 完成（仅 `ml-active` + 群聊步生效，退出即原样还原）：

1. `#roundtable-chat-status`（"圆桌密语进行中"）→ 搬入 `.otome-panel__titles` 当副标题；
2. `.roundtable-foot-timebar`（时间/电量/警告）+ `#roundtable-bug-popover` → 搬入 `.roundtable-roster`（`+/-/返回` 下方）；
3. 给 `#roundtable-whispers-panel` 加 `.ml-rt-chat`，CSS 据此隐藏底栏、让位副标题。

实现要点：搬移前记录每个节点的 `{parent, nextSibling}`，还原时逆序 `insertBefore` 放回；用 `MutationObserver` 监听 `#roundtable-step-chat` 与面板的 class 变化（设置↔群聊切换不一定伴随 resize）。

### 4.2 造梦家具圆形按钮防误触

`#dream-object-controls` 的视觉布局仍沿用既有 `base.css` / `responsive.css`，横屏模块不重新排布按钮。但移动端横屏下，点击左/右移动按钮会让家具投影中心横向位移；浏览器随后派发的合成 `click` 可能落到重新定位后的中心确认按钮上，表现为“点一下左/右就自动关闭”。

修法放在 `js/mobile_landscape.js`，不改 `dream_system.js` 的普通逻辑：
- 仅在 `ml-active` 下监听 `#dream-object-move-left` / `#dream-object-move-right` 的 `pointerdown/pointerup`；
- 移动逻辑仍由原按钮的 `pointerup` 执行，横屏模块只记录“刚刚点过横向移动”；
- 在约 360ms 内吞掉落在 `#dream-object-controls` 内的下一次合成 `click`，防止误触 `#dream-object-close`；
- 上/下移动、旋转、重置、编辑、删除、自动摆放等按钮不进入这条保护路径；普通模式和竖屏模式不生效。

> **战术考核不再改任何 JS**——早期为人物贴图加的 `drawFritia()`/`isCompactCombatViewport()` 分支**已回退**，`js/side_scroller_adventure.js` 与本系统无关。

---

## 5. 保持不变
- 三处保留区域 `#top-bar` / `#game-status` / `#dream-object-controls` 不接管布局；`#dream-object-controls` 仅增加 §4.2 的横屏防误触事件保护。
- 既有竖屏拦截 `#side-scroller-orientation-blocker`（`isMobilePortraitViewport()`）保留：竖屏仍提示「请切换横屏」。
- 现有 `responsive.css` / `panels.css` / 各浮层 id 与 JS 生成 class 均未改写。

---

## 6. 测试与扩展

### 测试
1. 桌面 Chrome → DevTools 设备模拟选横屏手机（如 915×412、19.5:9），或加 `?ml=1` 强制开启；
2. 逐一打开各浮层：标题栏/底栏变矮、内容完整、按钮可点、底栏主操作可见；
3. 造梦终端：家具愿望栏应比旧版更高，仍不挤掉模板按钮、提示条和右侧打造参数；需要调高度时只改 `--ml-dream-wish-height`；
4. 造梦家具管理：横屏真机或 `?ml=1` 下连续点击左/右移动按钮，按钮层不应自动关闭；点击中心确认按钮仍应正常退出；
5. 系统设置 → 大模型设置：API Key / Base URL / 模型名称在同一个无标题圆角框内，左标签、右输入，标签列很窄；这个圆角框必须固定显示完整 3 行，不能被“主流模型 API 获取”、亲密模式或底栏挤压到只剩 1 行；亲密模式出现时高度正常，并显示说明小字；普通桌面/竖屏对照不变；
6. 系统设置 → 操作设置：鼠标/触控/本地化灵敏度在同一个无标题圆角框内，每行是左标题说明、右上数值、右下滑块，不出现高级设置的类别标题和变量名；
7. 系统设置 → 更多资源：左栏 LOGO + 标题整体居中，右栏更宽；`Copyright` 首行在 915×412 一类横屏宽度下尽量不换行，资源按钮保持 2×2；
8. 战术考核：移动横屏卡牌模式下左上角 `SNOWFIELD / 战术考核` 标题卡片隐藏、右上角返回按钮保留；整体仍是既有横屏布局（手牌居中、人物居中、敌方在右），但**手牌两侧 4 控件（牌库/刷新/弃牌/出牌数）贴在卡牌左右并略留空隙、夹在卡牌与角落按钮之间且互不重叠**；卡池窗口约为桌面 2/3 宽，列表视窗由 JS 按当前实际渲染的 4 张原始高度剩余手牌动态计算，并保留滚动条，不改变卡池条目的高度、padding、gap 或字体；手牌区卡牌更大、标题/描述更小而底部数值不缩小。**若 4 控件离卡牌太近/太远，调 `--ml-fbtn-gap`；若仍撞角按钮，调 `--ml-hand-w` / `--ml-fbtn` / `--ml-fbtn-b1`，不要整体平移**；
9. `?ml=0` 与桌面宽高比对照：浮层与战术考核外观应与现状**完全一致**（无回归）；
10. 真机（Android WebView APP / 手机浏览器）横屏抽测。

### 给新浮层补横屏适配
1. 新浮层若复用 `.otome-panel` 骨架，§1 通用压缩**自动生效**，通常无需额外工作；
2. 仅当其正文有特殊网格/列表/`--flush` 自管滚动时，在 `css/mobile_landscape.css` §2 追加 `html.ml-active #新浮层id …` 一段；
3. 切忌在其它 CSS 文件写横屏规则——所有横屏逻辑必须留在本系统内，保持「一键移除」。
