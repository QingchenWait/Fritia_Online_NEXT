# 芙提雅 Online NEXT 开发手册

最后同步日期：2026-06-18

本文档是给后续二次开发和 Codex 新会话接手用的项目事实源。改动功能、状态结构、存档字段、模块接口、DOM id、资源路径、核心交互规则时，必须同步更新本文件。

## 项目定位

这是一个纯静态网页 3D 互动游戏，核心是 Three.js 房间场景、PMX 芙提雅模型、第一人称操作、LLM 日常对话、约会对话、换装、睡觉摸头、游戏时间、数据金、礼物、好感度和成就系统。

项目没有后端。所有配置、聊天记录、游戏状态、成就、挂画都存储在浏览器 `localStorage` 或用户导出的 JSON 文件中。LLM API 使用用户在设置界面填写的 OpenAI 兼容 `chat/completions` 服务。

## 运行方式

项目使用 ES modules 和 importmap，不能直接用 `file://` 可靠运行，需要本地 HTTP 服务器。

```bash
npm run dev
```

等价脚本见 `package.json`：

```bash
npx serve . -p 3000 --cors
```

入口页面是 `index.html`，主入口脚本是：

```html
<script type="module" src="js/main.js?v=20260618-gift-stream"></script>
```

依赖通过 CDN importmap 加载：

- `three` -> jsDelivr Three.js r169
- `three/addons/` -> jsDelivr Three.js examples

## 目录结构

```text
fritia_online_v2/
├── index.html
├── css/
│   └── style.css
├── js/
│   ├── main.js
│   ├── scene.js
│   ├── room.js
│   ├── character.js
│   ├── controls.js
│   ├── dialogue.js
│   ├── date_dialogue.js
│   ├── gift_system.js
│   ├── game_state.js
│   ├── achievements.js
│   └── settings.js
├── src/
│   ├── snowbreak_logo.png
│   ├── sample_screenshot.png
│   ├── _queries/
│   │   ├── system_prompt.txt
│   │   └── date_prompt.txt
│   ├── _voices/
│   │   ├── startup_*.wav/mp3/ogg
│   │   ├── talk_1.mp3 ... talk_5.mp3
│   │   ├── sleep_mode_1.mp3 ... sleep_mode_2.mp3
│   │   └── sleep_whisper_1.mp3 ... sleep_whisper_5.mp3
│   ├── _logos/
│   │   ├── Profile_Fritia.png
│   │   ├── achievement_*.svg
│   │   └── ach_*.svg
│   ├── _fritia_3d_model/
│   │   └── 驰掣-毛绒派对.pmx
│   └── _fritia_alterable_models/
│       ├── sweety_straw/
│       ├── cyan_leaf/
│       ├── pool_guard/
│       └── small_king/
├── README.md
├── DEVELOP.md
├── package.json
└── LICENSE
```

## 初始化和主循环

`js/main.js` 是应用总调度。

初始化顺序：

1. `initGameState()` 从 `localStorage` 加载时间、金钱、好感、礼物、统计。
2. `initScene(canvas)` 创建 Three.js scene/camera/renderer/lights。
3. `createRoom(scene)` 创建房间、家具、碰撞盒、路径点和可交互 mesh。
4. `loadCharacter(scene, room.waypoints, room.colliders, onProgress)` 加载默认 PMX。
5. `initControls(camera, renderer.domElement, room.playerColliders)` 初始化第一人称/触摸控制。
6. `initDialogue()` 加载日常对话 prompt 和历史。
7. `initDateDialogue()` 加载约会 prompt 和历史。
8. `initSettings()` 绑定设置面板。
9. `initGiftSystem()` 绑定购物终端和礼物收藏。
10. `initAchievements()` 初始化成就系统。
11. `initPainting()` 初始化挂画上传。
12. 绑定键盘、导入导出、历史面板、提示按钮。
13. 显示 `click-to-play`，第一次点击后播放启动语音、挥手，并弹出启动时待显示的成就。

主循环 `animate()` 每帧执行：

- `updateGameTime(delta)` 推进游戏内时间。
- 必要时 `updateGameHud()` 和 `evaluateAchievements()`。
- `updateWindowSky()` 根据游戏时间改变窗户天空色。
- 非睡觉模式下 `controlsModule.update(delta)`。
- 非睡觉模式下 `updateCharacter(charData, delta)`。
- `updateInteractionPrompt()` 更新准星交互提示。
- `renderer.render(scene, camera)`。

## 入口 DOM 和 UI 面板

所有主要 UI 都写在 `index.html`，样式集中在 `css/style.css`。

核心 DOM：

- `#game-canvas`：Three.js canvas。
- `#loading-screen`：加载页。
- `#hud`：准星、左上状态、交互提示、成就 toast。
- `#game-status`：左上角时间、好感度、数据金、日薪提示。
- `#interaction-prompt`：`F` 对话/摸头相关提示。
- `#painting-prompt`：所有 `E` 交互提示，包括挂画、换装、约会、睡觉、购物终端、收藏柜。
- `#top-bar`：右上按钮，顺序为成就、历史、导出、导入、设置。
- `#dialogue-ui`：日常对话浮层。
- `#date-panel`：今日约会行程浮层。
- `#gift-terminal-panel`：购物终端浮层。
- `#gift-collection-panel`：礼物收藏柜浮层。
- `#achievements-panel`：成就列表浮层。
- `#settings-panel`：模型 API 设置浮层。
- `#history-panel`：历史对话浮层。
- `#model-selector`：换装浮层。
- `#sleep-ui`：睡觉模式摸头/起床按钮。
- `#touch-controls`：移动端虚拟摇杆和触摸按钮。

通用隐藏类是 `.hidden`。不要随意改 DOM id；各模块大量通过 `document.getElementById()` 直接绑定。

## 场景和房间

`js/scene.js` 导出：

- `initScene(canvas)`

场景参数：

- `PerspectiveCamera(65, aspect, 0.1, 50)`，初始位置 `(0, 1.6, 1.5)`。
- `WebGLRenderer`，开启阴影，`PCFSoftShadowMap`，`SRGBColorSpace`。
- 环境光、方向光、台灯点光、窗户 RectAreaLight。
- resize 时更新 camera aspect 和 renderer size。

`js/room.js` 导出：

- `createRoom(scene)`

返回对象：

```js
{
  colliders,
  playerColliders,
  waypoints,
  painting,
  paintingLabel,
  paintingZone,
  wardrobeMesh,
  bedMesh,
  bedBlanket,
  deskMesh,
  doorMesh,
  windowMesh,
  terminalMesh,
  collectionCabinetMesh
}
```

房间尺寸约 6m x 5m。家具包括床、桌椅、书架/收藏柜、衣柜、门、窗、挂画、墙上 Snowbreak logo、购物终端。

交互对象：

- 挂画：`painting`，按 `E` 上传本地图片，存入 `localStorage.fritia_painting`。
- 衣柜：`wardrobeMesh`，按 `E` 打开换装。
- 床：`bedMesh`，按 `E` 进入睡觉模式，小小老师模型禁用。
- 桌子/门：`deskMesh` / `doorMesh`，按 `E` 打开约会。
- 购物终端：`terminalMesh`，按 `E` 打开购物终端。
- 收藏柜：`collectionCabinetMesh`，按 `E` 打开礼物收藏。

路径点 `waypoints`：

```js
[
  { name: 'center', isFurniture: false },
  { name: 'window', isFurniture: false },
  { name: 'door', isFurniture: false },
  { name: 'bookshelf', isFurniture: false },
  { name: 'bed_sit', isFurniture: true, furnitureType: 'bed' },
  { name: 'chair_sit', isFurniture: true, furnitureType: 'chair' }
]
```

`colliders` 给角色走路碰撞用，`playerColliders` 额外包含墙体给玩家移动碰撞用。

## 控制系统

`js/controls.js` 导出：

- `initControls(camera, domElement, colliders)`

返回：

```js
{
  controls,
  state,
  update,
  isNearCharacter,
  releaseControlMode,
  resumeControlMode
}
```

PC 端优先使用 `PointerLockControls`。移动端或不支持 pointer lock 时使用触摸控制。

`state` 关键字段：

- `moveForward/moveBackward/moveLeft/moveRight`
- `speed: 3.0`
- `isLocked`
- `useTouchControls`

覆盖层恢复策略：

- 打开浮层前调用 `releaseControlMode({ resumeOnClose: true })`。
- 浮层关闭时派发 `fritia-overlay-closed`。
- `main.js` 监听后调用 `controlsModule.resumeControlMode()`。
- iOS/Android 触摸模式会直接恢复操作模式；支持 pointer lock 的浏览器会尝试重新请求 pointer lock。
- `click-to-play` 的显示由控制模块根据浮层、锁定状态和恢复状态统一同步。

移动端操作：

- `#joystick-move` 控制移动。
- canvas 触摸滑动控制视角。
- `#btn-interact` 派发 `fritia-action`，映射为 `KeyF`。

## 角色系统

`js/character.js` 负责 PMX 加载、材质转换、骨骼姿态、自动行为状态机、睡姿、互动追踪、换装。

导出：

- `loadCharacter(scene, waypoints, colliders, onProgress)`
- `updateCharacter(cd, delta)`
- `updateBlink(cd, delta)`
- `startWaving(cd)`
- `applyIdlePose(cd)`
- `applySleepingPose(cd)`
- `forceStandUp(cd)`
- `setSittingEnabled(cd, enabled)`
- `getCharacterPosition(cd)`
- `startInteraction(cd, getPlayerPos)`
- `endInteraction(cd)`
- `swapModel(scene, cd, modelPath)`

默认模型：

```js
src/_fritia_3d_model/驰掣-毛绒派对.pmx
```

换装模型列表在 `main.js`：

- 默认 - 毛绒派对
- 草莓甜心
- 青叶密裹
- 泳池护卫
- 国主驾到 (小小老师)

`国主驾到 (小小老师)` 特殊规则：

- `isSmallTeacherModel()` 通过路径中 `国主驾到` 或 `small_king` 判断。
- 切到该模型前后调用 `setSittingEnabled(charData, false)`。
- 如果切换时角色正在坐下/坐着/起身，会 `forceStandUp()`。
- 小小老师模型禁用睡觉交互。
- 从该模型切回其他模型后可恢复坐下。

角色状态机：

```text
IDLE
WALKING
TURNING_TO_SIT
STAND_TO_SIT
SITTING
SIT_TO_STAND
WAVING
INTERACTING
```

关键行为：

- `IDLE` 随机 3-8 秒后选择 waypoint。
- `WALKING` 使用手写步行动作，支持碰撞提前结束。
- 家具 waypoint 会触发坐下流程。
- 坐下流程：`TURNING_TO_SIT` -> `STAND_TO_SIT` -> `SITTING`。
- 坐一段时间后：`SITTING` -> `SIT_TO_STAND` -> 继续选 waypoint。
- `SIT_COOLDOWN = 5.0` 秒，刚站起后不会立刻再次坐下。
- 当前边界修复：站起时记录 `lastStoodFromFurnitureWaypointName`，冷却期内 waypoint 选择只避开刚离开的同一个家具点，其他家具点仍可选择。
- `INTERACTING` 中头部会朝向玩家位置。

PMX 和材质注意点：

- 使用 `MMDLoader`。
- 原 PMX 材质统一转换成 `MeshToonMaterial`。
- 头发/透明材质需要 alpha test 和自定义深度材质处理阴影。
- `setupTransparentShadows(mesh)` 使用自定义 depth shader，并启用 skinning。
- 骨骼名存在乱码/日文/英文候选，`BONE_MAP` 不要轻易删除旧候选。
- 骨骼动画是手写 rotation，不是 MMD 动画剪辑。

## 交互键位和准星检测

`main.js` 的 `onKeyDown(e)` 是键盘/触摸动作总入口。

`KeyF`：

- 若对话/约会/礼物浮层打开，忽略。
- 睡觉中：摸头。
- 正在日常互动：结束互动。
- 距离角色 2.5m 内：进入日常对话。

`KeyE`：

- 若日常互动、日常对话、约会、礼物浮层打开，忽略。
- 睡觉中：起床。
- 看向购物终端：打开购物终端。
- 看向收藏柜：打开礼物收藏。
- 看向床且不是小小老师模型：睡觉。
- 看向桌子或门：打开约会。
- 看向挂画：上传图片。
- 看向衣柜：换装。

`Escape`：

- 依次关闭礼物浮层、成就、约会、日常对话、换装。

准星检测：

- 普通 mesh 用 `raycaster.intersectObject()`。
- 终端和收藏柜有 fallback：`isLookingAtPoint(target, radius, maxDistance)`，使用 `userData.interactionCenter`，这是为了移动端/iOS 上提示按钮更稳定。

## 睡觉模式

睡觉模式逻辑在 `main.js`，姿态在 `character.js`。

进入：

1. `fadeToBlack()`
2. `isSleeping = true`
3. 保存相机位置和朝向
4. 移动角色到床上
5. `applySleepingPose(charData)`
6. 设置眨眼/微笑 morph
7. 隐藏被子 `bedBlanket`
8. 相机移到床边近距离视角
9. 显示 `#sleep-ui`
10. `fadeFromBlack()`
11. 播放 `sleep_mode_*.mp3`

摸头：

- `petFritiaHead()`
- 每次 `addAffinity(1)`，`recordHeadPat()`。
- 播放 `sleep_whisper_*.mp3`。
- 临时提高微笑 morph。

退出：

- 停止睡觉 BGM。
- 恢复相机。
- 角色回到 `(0, baseY, 0)` 和 idle 姿态。
- 显示被子。
- 隐藏 `#sleep-ui`。

## 日常对话

`js/dialogue.js` 导出：

- `initDialogue()`
- `showDialogue()`
- `hideDialogue()`
- `isDialogueVisible()`
- `getConversationHistory()`
- `importConversationHistory(data)`

存储：

- `localStorage.fritia_chat_history`

Prompt：

- `src/_queries/system_prompt.txt`
- 每次请求会追加 `getGameTimeContext()`，让 LLM 可自然参考游戏时间、日期、节日。

API：

- `POST ${settings.baseUrl}/chat/completions`
- `Authorization: Bearer ${settings.apiKey}`
- `stream: true`
- `temperature: 0.85`
- `max_tokens: 200`

上下文：

- 手写 `estimateTokens()`，总窗口约 8000 估算 token。
- 从历史末尾向前截取。

成功条件：

- 用户发言入历史。
- 流式生成 assistant bubble，逐 chunk 自动滚动到底部。
- LLM 有非空回复时：`addAffinity(1)` 和 `recordDialogueInteraction('daily', fullText)`。

错误处理：

- 未配置 API Key 时在对话 UI 显示系统消息。
- 网络/CORS 问题提示用户检查 API Key、Base URL、服务 CORS。

关闭：

- `hideDialogue()` abort 当前请求并派发 `fritia-overlay-closed`。

## 约会系统

`js/date_dialogue.js` 导出：

- `initDateDialogue()`
- `openDatePanel()`
- `closeDatePanel()`
- `isDatePanelVisible()`
- `getDateConversationHistory()`
- `importDateConversationHistory(data)`
- `getDateLocations()`

存储：

- `localStorage.fritia_date_history`

Prompt：

- `src/_queries/date_prompt.txt`
- `{location}` 替换成地点名。
- 同样追加 `getGameTimeContext()`。

12 个约会地点：

- cinema 电影院
- amusement 游乐场
- mall 商场
- park 公园
- aquarium 水族馆
- beach 海边
- museum 科技馆
- karaoke KTV
- zoo 动物园
- cafe 猫咖
- bookstore 书店
- nightmarket 夜市

历史结构：

- `dateConversationHistory[locationId]` 存当前地点当日对话。
- 若再次进入地点发现不是同一天，会把旧消息归档到 `${locationId}_archive`。
- `getDateConversationHistory()` 返回时会把 archive 合并进对应地点，方便历史列表和成就统计。

LLM：

- 首次选择地点时，如果无历史，会 `startDateConversation(loc)` 生成开场白。
- 玩家发送后走 `handleDateSend()`。
- `stream: true`，`temperature: 0.9`，`max_tokens: 300`。

成功条件：

- 玩家消息和 bot 回复均入历史。
- bot 非空回复时：`addAffinity(1)` 和 `recordDialogueInteraction('date', fullText, currentLocationId)`。

错误处理：

- 未配置 API Key 或 API 不可用时，会在约会聊天 UI 中显示提示消息。

## 设置系统

`js/settings.js` 导出：

- `getSettings()`
- `saveSettings(settings)`
- `initSettings()`

存储：

- `localStorage.fritia-settings`

字段：

```js
{
  apiKey: '',
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4o-mini'
}
```

设置面板标题下有固定提示：

```text
数据仅本地存储，不会上传云端
```

## 游戏状态、时间、金钱、好感度和礼物数据

`js/game_state.js` 是共享状态源。

导出：

- `initGameState()`
- `updateGameTime(realDeltaSeconds)`
- `getGameTimeInfo(options)`
- `formatGameDateTime(options)`
- `getGameTimeContext()`
- `getMoney()`
- `getAffinity()`
- `formatMoney(amount)`
- `addAffinity(amount)`
- `getStats()`
- `getAllModelPaths()`
- `recordGiftEstimate(amount)`
- `recordDialogueInteraction(type, assistantText, locationId)`
- `recordModelUsed(path)`
- `recordHeadPat()`
- `canAfford(amount)`
- `spendMoney(amount)`
- `addGift(gift)`
- `getGifts()`
- `mergeGifts(gifts)`
- `exportGameState()`
- `importGameState(data, options)`

存储：

- `localStorage.fritia_game_state`

初始值：

- 游戏时间：第 1 年 1 月 1 日 12:00，对应 `gameMinutes = 720`。
- 时间流速：真实 1 秒 = 游戏 5 分钟，即游戏 1 分钟 = 真实 0.2 秒。
- 显示粒度：每 5 游戏分钟变化一次。
- 初始数据金：40000。
- 每天 0 点日薪：4000。
- 初始好感度：124。
- 好感度无上限，不会降低。

`state` 结构：

```js
{
  gameMinutes,
  money,
  affinity,
  lastSalaryDay,
  gifts,
  stats
}
```

`stats` 结构：

```js
{
  moneySpent,
  fiveStarGiftCount,
  maxGiftEstimate,
  dailyUserMessages,
  dailyBotMessages,
  dateUserMessages,
  dateBotMessages,
  dateInteractionLocations,
  usedModelPaths,
  smallTeacherStartsWithGanShenme,
  headPatCount
}
```

游戏时间：

- `getGameTimeInfo({ quantize: 5 })` 给 HUD 用。
- `getGameTimeInfo({ quantize: 1 })` 给 prompt、导出、礼物记录、窗外天空用。
- 节日映射包含新年、情人节、白色情人节、520、儿童节、国庆节、平安夜、圣诞节。

HUD：

- `#game-time-display` 显示 `M月D日 HH:mm`。
- `#affinity-display` 显示 `好感度 | ❤️ XXX/100`。
- `#money-display` 显示 `数据金 | 🪙 XX,XXX`。
- `#salary-toast` 显示 `[陶董] 发放日薪：+ 4000`。
- 好感度增加时派发 `fritia-affinity-updated`，`main.js` 在好感度行后挂一个 `.affinity-pop` 冒泡，不应影响卡片宽度。

导入规则：

- 金钱使用导入值覆盖。
- 好感度取本地和导入的较高值。
- 礼物增量合并，避免重复。
- stats 取各类计数的最大值，列表去重合并。

## 礼物系统

`js/gift_system.js` 导出：

- `initGiftSystem()`
- `openGiftTerminal()`
- `closeGiftTerminal()`
- `openGiftCollection()`
- `closeGiftCollection()`
- `isGiftOverlayVisible()`
- `renderGiftCollection()`

购物终端交互入口：

- 房间右墙上的科幻终端机。
- 准星命中 `terminalMesh` 或命中 `interactionCenter` 附近时显示 `按 E 打开购物终端`。

礼物收藏入口：

- 房间书架/柜子作为收藏柜。
- 准星命中 `collectionCabinetMesh` 或命中 `interactionCenter` 附近时显示 `按 E 打开礼物收藏`。

评估流程：

1. 玩家在 `#gift-description` 描述礼物。
2. `handleEvaluateGift()` 检查 API Key。
3. `requestGiftEvaluation(detail, settings)` 调用 LLM。
4. 先用 strict 模式，失败后用 conversational 模式。
5. 解析 `AMOUNT/SCORE/COMMENT`，也兼容 JSON、中文字段和松散文本。
6. `recordGiftEstimate(amount)` 用于隐藏成就“高奢定制”。
7. 显示付款按钮 `支付 X 数据金`。
8. 余额不足时按钮 disabled，并显示余额不足提示。

LLM 请求：

- OpenAI 兼容 `chat/completions`。
- 支持 SSE 流式和直接 JSON 响应。
- strict 模式要求三行纯文本：

```text
AMOUNT=整数金额
SCORE=1到5的整数
COMMENT=芙提雅口吻的简短评价
```

低质量输出判断：

- 空输出、不可解析金额、明显乱码、ASCII 噪声占比过高且无有效字段时，判定失败。
- 当前实现不做本地估价兜底；评估失败会提示检查 API/模型配置。

购买流程：

1. `canAfford(amount)` 检查余额。
2. `spendMoney(amount)` 扣钱并累计 `stats.moneySpent`。
3. `addGift(gift)` 归档礼物。
4. 分数加好感：
   - 3 心：+1
   - 4 心：+2
   - 5 心：+4
5. `renderPurchasedResult(gift)` 显示芙提雅头像 `src/_logos/Profile_Fritia.png`、评论和心数。
6. 派发 `fritia-game-state-updated` 刷新 HUD、收藏柜、成就。

礼物记录字段：

```js
{
  id,
  gameDateTime,
  gameMinutes,
  detail,
  amount,
  comment,
  score,
  createdAt
}
```

收藏柜展示：

- 日期时间
- `🪙 XXX`
- 红心评分
- 礼物详情
- 芙提雅评论用 blockquote 引述格式

## 成就系统

`js/achievements.js` 是独立模块。新增成就优先改 `ACHIEVEMENTS` 数组，不要把条件散落到 UI 代码里。

导出：

- `initAchievements()`
- `openAchievementsPanel()`
- `closeAchievementsPanel()`
- `isAchievementsPanelVisible()`
- `evaluateAchievements(options)`
- `flushStartupAchievementToasts()`
- `refreshAchievementsFromImport()`
- `exportAchievements()`
- `importAchievements(data)`

存储：

- `localStorage.fritia_achievements`

状态：

```js
{
  unlocked: { [achievementId]: timestamp },
  notified: { [achievementId]: timestamp },
  pendingStartup: []
}
```

成就定义字段：

```js
{
  id,
  title,
  desc,
  hidden,
  icon,
  target,
  progress,
  complete
}
```

提示规则：

- 新获得成就时，右下角 `#achievement-toast-host` 上浮 toast。
- 每个成就只 toast 一次，由 `notified` 控制。
- 游戏初始化时已满足的成就不会立刻弹，`initAchievements()` 会 `queueStartup`，第一次点击进入操作模式后 `flushStartupAchievementToasts()` 再弹。
- 导入数据后调用 `refreshAchievementsFromImport()`，只刷新列表，不弹 toast。

展示规则：

- 完成：浅蓝背景/边框。
- 未完成：灰色背景，并显示 `progress/target`。
- 隐藏未完成：只显示锁和“隐藏成就”，不显示进度。
- 隐藏完成：显示真实标题、描述和图标。
- 成就图标来自 `src/_logos/ach_*.svg`，按钮奖杯来自 `src/_logos/achievement_trophy.svg`。

当前 15 个成就：

- 坠入爱河：好感度 >= 100。
- 以恋结缘：好感度 >= 200。
- 十世眷侣：好感度 >= 300。
- 五星好评：五心礼物次数 >= 1。
- 心有灵犀：五心礼物次数 >= 10。
- 持家高手：数据金余额 >= 80000。
- 绝望温度：数据金余额 <= 500。
- 无话不谈：日常 + 约会中玩家和 bot 对话进度 >= 100。
- 比翼双飞：12 个约会地点均有玩家和 bot 对话。
- 更衣人偶：使用过全部模型。
- 干什么！：LLM 回复以“干什么”开头次数 >= 1。
- 隐藏 一毛不拔：前 10 游戏天未花钱。
- 隐藏 资深宅友：前 10 游戏天未进行约会对话。
- 隐藏 高奢定制：LLM 礼物估价 >= 999999。
- 隐藏 薅秃粉毛：睡觉摸头 >= 30。

统计来源：

- 好感、金钱、礼物、stats 来自 `game_state.js`。
- 对话历史来自 `dialogue.js`。
- 约会历史和地点来自 `date_dialogue.js`。

新增成就建议：

1. 优先在 `game_state.js` 增加必要统计字段和记录函数。
2. 在触发行为处调用记录函数。
3. 在 `achievements.js` 的 `ACHIEVEMENTS` 添加定义。
4. 准备统一风格图标，放入 `src/_logos/`。
5. 确认导入导出能保留或推导该统计。

## 历史、导入和导出

历史面板逻辑在 `main.js`：

- `initHistoryPanel()`
- `renderHistory(dateFilter)`
- `renderDateHistory(dateFilter)`

日常历史按现实日期分组，约会历史按现实日期和地点分组。

导出函数：

- `exportData()` in `main.js`

导出 JSON 结构：

```js
{
  version: 2,
  exportedAt,
  exportedGameTime,
  gameState,
  money,
  affinity,
  stats,
  achievements,
  gifts,
  settings,
  conversations,
  dateConversations
}
```

导入函数：

- `importData()`
- `handleImportFile(e)`

导入流程：

1. 读取 JSON。
2. 若有 `settings`，写入 `localStorage.fritia-settings`。
3. 导入日常对话。
4. 导入约会对话。
5. `importGameState(data, { suppressEvent: true })`。
6. `importAchievements(data.achievements)`。
7. `refreshAchievementsFromImport()`。
8. `updateGameHud(true)`。
9. `renderGiftCollection()`。
10. alert 导入成功和新增礼物数。

注意：导入设置后提示刷新页面，因为设置面板 DOM 已经填了旧值。

## 样式和视觉约定

`css/style.css` 是单文件样式。当前 UI 风格是深色半透明玻璃面板、浅蓝/粉色点缀、游戏浮层风格。

重要样式区域：

- HUD：`#game-status`、`#interaction-prompt`、`#painting-prompt`、`#click-to-play`
- 日常对话：`#dialogue-ui`、`#dialogue-box`、`.chat-row`、`.chat-bubble`
- 顶栏：`#top-bar`
- 成就：`#achievement-toast-host`、`.achievement-toast`、`#achievements-panel`、`.achievement-card`
- 设置：`#settings-panel`
- 换装：`#model-selector`
- 睡觉：`#sleep-ui`
- 历史：`#history-panel`
- 礼物：`#gift-terminal-panel`、`#gift-collection-panel`
- 约会：`#date-panel`
- 移动端：`@media` 后的响应式规则、`#touch-controls`

移动端/iOS 注意：

- `input` 字体至少 16px，避免 iOS Safari 聚焦输入框自动放大。
- 浮层关闭后要派发 `fritia-overlay-closed`，让控制模块恢复操作模式。
- 准星提示按钮要支持 `click` 和 `touchend`，并使用 `{ passive: false }` 阻止默认触摸行为。
- 对新浮层要加入 `controls.js` 的 `overlayIds`，否则 `click-to-play` 和恢复逻辑会错。

## 本地存储键

```text
fritia-settings          设置
fritia_game_state        游戏时间、金钱、好感、礼物、统计
fritia_achievements      成就解锁/通知状态
fritia_chat_history      日常对话历史
fritia_date_history      约会对话历史
fritia_painting          用户上传挂画 data URL
```

## 事件约定

模块间通过 DOM CustomEvent 松耦合：

- `fritia-action`
  - 来源：触摸按钮。
  - detail: `{ code: 'KeyF' | 'KeyE' }`
  - `main.js` 转给 `onKeyDown()`。

- `fritia-overlay-closed`
  - 来源：各浮层关闭函数。
  - detail: `{ id }`
  - `main.js` 负责结束对话状态和恢复控制模式。

- `fritia-game-state-updated`
  - 来源：`game_state.js` 中 stats/金钱/礼物变化，礼物购买后也会派发。
  - `main.js` 刷新 HUD、收藏柜、成就。

- `fritia-affinity-updated`
  - 来源：`addAffinity()`。
  - detail: `{ delta, value }`
  - `main.js` 刷新 HUD、显示好感冒泡、评估成就。

新增模块如果会打开浮层，必须：

1. 在打开前释放控制模式：`controlsModule.releaseControlMode({ resumeOnClose: true })`。
2. 关闭时派发 `fritia-overlay-closed`。
3. 把浮层 id 加进 `controls.js` 的 `overlayIds`。
4. 在 `onKeyDown()` 中防止与其他浮层冲突。

## 常见修改位置

新增 PMX 换装：

1. 把模型和贴图放到 `src/_fritia_alterable_models/<name>/`。
2. 在 `main.js` 的 `ALTERABLE_MODELS` 添加 `{ name, path }`。
3. 在 `game_state.js` 的 `DEFAULT_MODELS` 添加路径，否则“更衣人偶”统计不完整。
4. 如果模型有特殊尺寸/动作限制，在 `isSmallTeacherModel()` 或新增判断中处理。

新增房间交互物：

1. 在 `room.js` 创建 mesh/group。
2. 给需要 fallback 的对象设置 `userData.interactionCenter`。
3. 从 `createRoom()` 返回该 mesh。
4. 在 `main.js` 保存到模块变量。
5. 添加 `isLookingAtX()`。
6. 在 `updateInteractionPrompt()` 显示提示。
7. 在 `onKeyDown(KeyE)` 执行动作。
8. 如打开浮层，遵循浮层事件约定。

新增 LLM 功能：

1. 使用 `getSettings()` 读取 API。
2. 统一请求 `${baseUrl}/chat/completions`。
3. 尽量兼容 SSE 和 JSON 非流式响应，参考 `gift_system.js`。
4. 没有 API Key 或请求失败时必须在对应 UI 中显示可见提示。
5. 若会影响好感/成就/统计，走 `game_state.js` 的记录函数。

新增存档字段：

1. 在 `game_state.js` 增加默认值。
2. 在 load/import 中 normalize。
3. 在 export 中输出。
4. 在 import 中定义合并策略。
5. 更新本文档的存档结构。

新增 UI 面板：

1. 在 `index.html` 添加 DOM。
2. 在 `style.css` 添加样式，保持现有游戏浮层风格。
3. 在模块中绑定打开/关闭。
4. 在 `controls.js` 的 `overlayIds` 注册。
5. 关闭时派发 `fritia-overlay-closed`。
6. 如果有输入框，字号保持 >= 16px 以避免 iOS Safari 输入放大。

## 已知平台坑和历史修复

iOS Safari 浮层显示：

- 曾出现日常对话、换装、约会浮层无法显示，设置/历史正常。
- 相关修复集中在浮层显隐、pointer/touch、viewport 和 CSS 层级上。
- 新增浮层时不要只依赖 keyboard；移动端必须有可点击/touch 的提示按钮。

iOS Safari 输入框缩放：

- 输入框聚焦时 Safari 会自动放大小字号输入。
- 对话、约会、礼物、设置里的 input/textarea 字号不要低于 16px。

浮层关闭后的操作模式恢复：

- 不能删除或绕过 `click-to-play` 规则。
- 正确策略是 `releaseControlMode({ resumeOnClose: true })` + `fritia-overlay-closed` + `resumeControlMode()`。

角色坐下边界：

- `SIT_COOLDOWN` 防止起身后立刻坐下。
- 站起后记录 `lastStoodFromFurnitureWaypointName`。
- 冷却期内只避免再次选择同一个家具 waypoint，不屏蔽其他家具 waypoint。

礼物 LLM 评估：

- 不能用本地估价假装模型成功。
- strict/conversational 两轮都失败时，明确提示 API/模型配置问题。
- 解析逻辑要兼容 OpenAI SSE、JSON 响应、部分代理的非标准 SSE 行。

## 开发维护要求

后续每次开发如果涉及下列任一项，必须同步更新本文件：

- 新增/删除/重命名文件或资源目录。
- 新增模块导出函数或改变调用链。
- 改变 DOM id、CSS 关键类、浮层生命周期。
- 改变 `localStorage` key、存档 JSON、导入合并规则。
- 改变游戏时间、金钱、好感度、礼物、成就规则。
- 改变键位、准星检测、移动端触摸行为。
- 改变模型路径、动作状态机、坐下/睡觉/换装特殊规则。
- 改变 LLM prompt、API 请求格式、错误处理策略。

建议开发流程：

1. 先用 `rg` 搜索现有调用点，确认模块边界。
2. 小范围修改对应模块。
3. 跑 `node --check js/<changed>.js` 检查语法。
4. 对 UI/交互改动用本地服务器手动验证。
5. 更新 `DEVELOP.md`。
6. 在最终说明中列出修改文件和验证结果。
