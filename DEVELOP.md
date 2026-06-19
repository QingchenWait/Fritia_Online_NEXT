# Fritia Online NEXT 开发文档

更新时间：2026-06-19

本文是当前静态 Three.js 项目的开发事实源。项目不依赖后端服务，所有游戏数据、设置、历史、成就和造梦家具都存储在浏览器 `localStorage` 中，并通过前端导出/导入 JSON 机制迁移。

## 项目概览

Fritia Online NEXT 是一个纯静态网页 3D 互动应用：

- 渲染引擎：Three.js ES Modules。
- 角色模型：PMX/MMD，使用 `MMDLoader` 加载。
- 控制方式：桌面端 Pointer Lock 第一人称控制，移动端触控摇杆与视角滑动。
- 对话能力：复用设置面板中的 OpenAI 兼容 `chat/completions` API。
- 数据存储：`localStorage`，导出/导入 JSON。
- 启动方式：`npm run dev`，默认等价于 `npx serve . -p 3000 --cors`。

禁止事项：

- 不新增后端服务。
- 不新增独立 API Key 配置。
- 不执行 LLM 输出，不使用 `eval`、`new Function` 或动态执行字符串。
- LLM 只能返回结构化文本或 JSON，前端必须本地校验和构建 Three.js 实体。

## 文件结构

```text
fritia_online_v3/
├── AGENTS.md
├── DEVELOP.md
├── README.md
├── index.html
├── package.json
├── css/
│   └── style.css
├── js/
│   ├── achievements.js
│   ├── character.js
│   ├── controls.js
│   ├── date_dialogue.js
│   ├── dialogue.js
│   ├── dream_furniture_factory.js
│   ├── dream_llm.js
│   ├── dream_system.js
│   ├── room_panorama.js
│   ├── game_state.js
│   ├── gift_system.js
│   ├── main.js
│   ├── room.js
│   ├── scene.js
│   └── settings.js
└── src/
    ├── snowbreak_logo.png
    ├── sample_screenshot.png
    ├── _queries/
    │   ├── system_prompt.txt
    │   └── date_prompt.txt
    ├── _voices/
    │   ├── startup_1.wav
    │   ├── talk_1.mp3 ... talk_5.mp3
    │   ├── sleep_mode_1.mp3 ... sleep_mode_2.mp3
    │   ├── sleep_whisper_1.mp3 ... sleep_whisper_5.mp3
    │   └── achievement_complete.mp3
    ├── _logos/
    │   ├── Profile_Fritia.png
    │   ├── achievement_*.svg / ach_*.svg
    │   ├── dream_*.svg
    │   └── license files
    ├── _fritia_3d_model/
    └── _fritia_alterable_models/
```

## 运行方式

```bash
npm run dev
```

本项目使用浏览器原生 ES module/importmap，必须通过 HTTP 服务访问，不能直接双击打开 HTML。

## 入口与主循环：`js/main.js`

职责：

- 初始化场景、房间、角色、控制器、对话、礼物、成就、造梦系统。
- 管理主循环 `animate()`。
- 统一处理 `E/F/Escape/1/2` 键位。
- 更新 HUD、时间、昼夜窗户颜色、房间作用域。
- 统一导出/导入项目数据。
- 统一处理按 E 交互提示和视线遮挡判断。

关键状态：

- `scene`, `camera`, `renderer`：Three.js 基础对象。
- `controlsModule`：`controls.js` 返回的控制器接口。
- `charData`：`character.js` 返回的角色运行态。
- `isInteracting`：日常对话状态。
- `isSleeping`：睡眠模式状态。
- `currentPlayerRoomId`：`bedroom` 或 `dream`。
- `isDreamDoorOpen`, `dreamDoorAnimating`：造梦空间推拉门状态。
- `dreamCinematic`：造梦家具生成后的特写过场状态；存在时暂停玩家普通操作，`E` 可跳过。
- `basePlayerColliders`, `bedroomColliders`, `dreamStaticColliders`：玩家和角色使用的基础碰撞体集合。

主要函数：

- `init()`：主初始化流程。按顺序初始化 `game_state`、`scene`、`room`、`character`、`controls`、对话系统、礼物系统、成就系统和造梦系统。
- `onKeyDown(e)`：全局键盘交互。`E` 处理门、终端、家具、礼物、床、约会、挂画、衣柜；`F` 处理角色互动和摸头；`1/2` 处理造梦家具样式修改确认/回退；看向造梦终端时 `1` 进入房间全景拍照模式。
- `animate()`：主循环。更新游戏时间、控制器、角色、门动画、房间作用域、窗户天空色、交互提示并渲染场景。
- 开局欢迎闸门：加载完成但玩家尚未点击 `#click-to-play` 前，角色只保留眨眼，不切换 waypoint、不随机移动；首次点击后先执行挥手欢迎，挥手结束再恢复正常行动。
- `updateInteractionPrompt()`：复用 `#painting-prompt` 和 `#interaction-prompt` 显示当前可用交互；造梦家具显示 `按 E 管理 [家具名]`。
- `hasClearLineOfSight(targetPoint, targetDistance)`：按 E 交互视线遮挡判断。玩家视角到目标点之间如果被当前碰撞体阻挡，则不显示也不触发按 E 管理/交互。睡眠模式的 `按 E 起床` 不走这个规则。
- `isLookingAtTerminal()` / `isLookingAtDreamTerminal()` / `isLookingAtDreamDoor()` / `isLookingAtPainting()` 等：各类准星交互检测。
- `toggleDreamDoor()`：切换造梦空间推拉门开关状态，并刷新玩家/角色碰撞作用域。
- `updateDreamDoor(delta)`：用缓动插值滑动门板。门开启后移除门碰撞，门关闭后恢复门碰撞。
- `startDreamFurnitureCinematic(record, runtimeItem)` / `updateDreamFurnitureCinematic(delta)` / `skipDreamFurnitureCinematic()`：新家具生成后播放约 3 秒的特写拉远镜头，镜头起终点限制在造梦空间内，避免穿墙；播放前检测结束落点的玩家碰撞风险，必要时保持玩家视角 Y 轴高度并改用附近安全位置；过场期间只允许按 `E` 跳过。
- `initRoomPanorama()` / `enterRoomPanorama()` / `updateRoomPanorama()`：看向造梦终端时通过 `按 1 拍摄房间` 进入全景拍照模式。模式内固定相机到新旧房间斜上方，暂停玩家移动和普通交互，并通过黑屏淡入淡出切换视角。
- `refreshCharacterRoomScope(force)`：玩家进入新旧房间时，切换芙提雅导航作用域；优先让角色通过门步行进入对应房间，失败时才瞬移。
- `getActivePlayerColliders()`：当前玩家碰撞体。门关闭时包含 `dreamDoorCollider`，门打开时移除。
- `getActiveBedroomCharacterColliders()` / `getActiveDreamCharacterColliders()`：角色在不同房间的导航碰撞体。
- `exportData()`：导出设置、游戏状态、日常对话、约会对话、成就、礼物、造梦家具、挂画。
- `handleImportFile(e)`：导入 JSON，兼容旧存档，导入后刷新 HUD、成就、礼物、造梦家具。

## 场景初始化：`js/scene.js`

导出：

- `initScene(canvas)`：创建 `Scene`、`PerspectiveCamera`、`WebGLRenderer`、基础光照和窗口 resize 逻辑。

当前光照：

- `AmbientLight(0xfff0e0, 0.5)`
- `DirectionalLight(0xfff5e6, 0.9)`
- 桌灯附近 `PointLight`
- 老房间窗户附近 `RectAreaLight`

注意：当前版本没有对新旧房间使用渲染 layer 或独立光照隔离。此前错误的光照实验已经回退。

## 房间与静态几何：`js/room.js`

导出：

- `createRoom(scene)`：构建旧卧室、造梦空间、静态家具、碰撞体、交互对象、角色 waypoint，并把房间组加入场景。

内部 helper：

- `makeBox(w, h, d, color, x, y, z, castShadow)`：创建常规盒子 mesh。
- `makeAABB(cx, cy, cz, hw, hh, hd)`：创建以中心点和半尺寸定义的 `Box3`。
- `makeCollider(minX, minY, minZ, maxX, maxY, maxZ)`：创建直接坐标定义的 `Box3`。
- `addSharedWallBlock(zMin, zMax, yMin, yMax)`：创建新旧房间共享厚墙分段。

坐标约定：

- 旧卧室：`X [-3, 3]`，`Z [-2.5, 2.5]`，高度 `Y [0, 3]`。
- 造梦空间：在旧房间右侧 `+X`，`X [3, 13]`，`Z [-3, 3]`，高度 `Y [0, 3]`。
- 连接门洞：共享墙 `X≈3`，门洞 `Z [0.05, 1.25]`，中心 `Z=0.65`，门洞高度 `2.25m`。
- 共享墙厚度：卧室侧面几乎贴齐 `X=2.995`，额外厚度向造梦空间方向增长到 `X=3.30`。这样旧卧室侧不会遮挡购物终端，新房间侧提供足够厚度容纳推拉门。

共享墙实现：

- 不再使用“平面墙 + 额外口袋块”叠加方案。
- 共享墙由三个厚墙块组成：
  - 门洞负 Z 侧：`Z [-3, 0.05]`，`Y [0, 3]`
  - 门洞正 Z 侧：`Z [1.25, 3]`，`Y [0, 3]`
  - 门洞上方：`Z [0.05, 1.25]`，`Y [2.25, 3]`
- 视觉墙体和碰撞体使用同一套坐标，避免墙体突起、门顶透明和碰撞不一致。

造梦推拉门：

- `dreamDoorMesh`：深色实木风格推拉门，使用 CanvasTexture 生成竖向木纹，并贴 `src/_logos/dream_wood_mark.svg`。
- `dreamDoorClosedPosition`：门关闭时位于门洞中心。
- `dreamDoorOpenPosition`：门打开时沿负 Z 滑入共享墙负 Z 段内部。
- `dreamDoorInteractionMesh`：透明交互体。即使门打开也保留在门洞区域，使准星对门的交互优先于门后实体。
- `dreamDoorCollider`：门关闭时加入玩家和角色碰撞；门打开后由 `main.js` 从当前碰撞作用域中移除。

房间返回值：

- `colliders`：旧卧室静态家具碰撞体。
- `playerColliders`：玩家初始碰撞体，包含墙体、旧家具、关闭的造梦门。
- `waypoints`：旧卧室角色 waypoint。
- `oldRoomBounds` / `dreamRoomBounds`：房间范围。
- `dreamRoomColliders`：新房间静态角色碰撞体，目前主要由主流程组合墙体和门状态。
- `dreamRoomWaypoints`：新房间基础 waypoint。
- `doorClearanceZone`：造梦家具禁止堵塞的门口清空区。
- `dreamDoorMesh`, `dreamDoorInteractionMesh`, `dreamDoorCollider`, `dreamDoorClosedPosition`, `dreamDoorOpenPosition`：推拉门运行对象。
- `painting`, `paintingLabel`, `wardrobeMesh`, `bedMesh`, `deskMesh`, `doorMesh`, `windowMesh`, `terminalMesh`, `dreamTerminalMesh`, `dreamWindowMesh`, `collectionCabinetMesh`：交互对象。

静态交互：

- 购物终端：旧卧室右侧墙，远离造梦空间门。
- 造梦终端：新房间窗户对面的墙上，靠近入口，玩家从旧房间进门后容易看到。
- 礼物收藏柜、衣柜、床、书桌、约会门、挂画保持旧功能。

## 控制系统：`js/controls.js`

导出：

- `initControls(camera, domElement, colliders)`：初始化桌面 Pointer Lock 和移动端触控控制。

返回接口：

- `controls`：Three.js `PointerLockControls` 实例。
- `state`：控制状态，包括移动键、碰撞体、锁定状态、移动端状态。
- `update(delta)`：每帧更新玩家位置并执行碰撞检测。
- `isNearCharacter(charPos, threshold)`：判断玩家是否接近芙提雅。
- `addColliders(colliders)` / `removeColliders(colliders)` / `setColliders(colliders)`：动态更新玩家碰撞体。
- `resolveCameraCollisions(radius)`：如果家具移动到玩家脚下，把相机水平推出碰撞体，避免卡住。
- `setMovementLocked(locked)`：锁定玩家移动，但保留视角旋转，家具快捷编辑时使用。
- `rotateView(deltaX, deltaY)`：家具快捷编辑时在非 Pointer Lock 状态下拖动视角。
- `releaseControlMode({ resumeOnClose })`：打开 overlay 前释放控制模式。
- `resumeControlMode()`：overlay 关闭后恢复控制模式。
- `enterControlMode()`：只切换内部操作状态，用于触控或 Pointer Lock 已存在的场景。
- `forceEnterControlMode()`：主动请求 Pointer Lock 并恢复操作模式；造梦家具特写过场结束后使用该接口，避免出现可移动但鼠标未锁定的半激活状态。

overlay 管理列表：

- `dialogue-ui`
- `settings-panel`
- `history-panel`
- `model-selector`
- `sleep-ui`
- `date-panel`
- `gift-terminal-panel`
- `gift-collection-panel`
- `achievements-panel`
- `dream-terminal-panel`
- `dream-furniture-editor-panel`
- `dream-placement-editor-panel`
- `dream-object-controls`

## 角色系统：`js/character.js`

职责：

- 加载 PMX 模型。
- 修正材质和透明阴影。
- 实现站立、行走、坐下、睡眠、挥手、互动状态机。
- 根据房间作用域和碰撞体进行 waypoint 导航。
- 支持动态家具 waypoint 和碰撞体。

导出：

- `loadCharacter(scene, waypoints, colliders, onProgress)`：加载默认 PMX，返回角色运行态 `cd`。
- `updateCharacter(cd, delta)`：每帧更新角色状态机。
- `updateBlink(cd, delta)`：眨眼 morph 更新。
- `startWaving(cd)`：触发挥手。
- `applyIdlePose(cd)`：应用站立姿势。
- `applySleepingPose(cd)`：应用睡眠姿势。
- `forceStandUp(cd)`：强制从坐下状态起身。
- `setSittingEnabled(cd, enabled)`：启用/禁用家具坐下逻辑；小小老师等特殊模型会禁用坐下/睡觉。
- `setCharacterNavigationScope(cd, scope)`：完整切换导航作用域，包含 `roomId`、`bounds`、`waypoints`、`colliders`。
- `refreshCharacterNavigationData(cd, scope)`：刷新 waypoint/collider，不重置整个角色状态；`scope.forceRepath` 为 true 时会丢弃当前路径并回到 idle，家具形态/碰撞体变化确认或回退后使用，避免芙提雅继续沿旧路径穿过新碰撞体。
- `moveCharacterToWaypoint(cd, waypoint, options)`：强制角色走向指定 waypoint，支持 `nextWaypoints` 队列。
- `forceCharacterIntoRoom(cd, roomId, spawnPosition)`：寻路失败时作为兜底，把角色迁移到房间内安全位置。
- `getCharacterPosition(cd)`：获取角色当前位置。
- `startInteraction(cd, getPlayerPos)` / `endInteraction(cd)`：日常对话互动模式。
- `swapModel(scene, cd, modelPath)`：换装。

关键内部逻辑：

- `checkCollision(cd, pos)`：角色 capsule 近似碰撞。
- `buildPathAroundColliders(cd, start, target)`：房间局部网格 A* 寻路，绕开家具。
- `isSegmentClear(cd, start, end)`：采样检测线段是否被碰撞体阻挡。
- `beginWalkToWaypoint(cd, waypoint)`：把 semantic waypoint 转成实际行走路径。
- `getSitApproachPosition(waypoint)` / `getFurnitureSitPose(cd, waypoint)`：根据床/椅子的 `sitCollider` 自动计算坐下边缘，避免坐在空气中或过深。
- `finishWalking(cd)`：到达动态家具 waypoint 时派发 `fritia-dream-furniture-visited`。

导航规则：

- 玩家在旧卧室时，芙提雅只使用旧卧室 waypoint 和旧卧室碰撞体。
- 玩家进入造梦空间时，芙提雅切换到造梦空间 waypoint + 动态家具 waypoint。
- 动态家具碰撞体加入造梦空间角色导航，家具修改后会刷新。
- 如果行走路径碰撞边缘导致卡住，角色允许短暂穿模继续移动，优先避免状态机永久停住。

## 游戏状态：`js/game_state.js`

localStorage key：`fritia_game_state`

导出：

- `initGameState()`：加载并规范化存档。
- `updateGameTime(realDeltaSeconds)`：推进游戏时间，跨天发放日薪。
- `getGameTimeInfo(options)`：返回量化后的时间信息。
- `formatGameDateTime(options)`：格式化游戏内日期时间。
- `getGameTimeContext()`：给 LLM 使用的时间上下文。
- `getMoney()` / `getAffinity()`：读取数据金和好感。
- `formatMoney(amount)`：格式化数据金。
- `addAffinity(amount)`：增加好感并派发 `fritia-affinity-updated`。
- `canAfford(amount)`：余额判断。
- `spendMoney(amount)`：扣除数据金并派发 `fritia-game-state-updated`。
- `addMoney(amount, reason)`：增加数据金，HUD 可显示 `+amount`。
- `recordGiftEstimate(amount)` / `recordDialogueInteraction(type, assistantText, locationId)` / `recordModelUsed(path)` / `recordHeadPat()`：统计数据。
- `recordDreamFurnitureRevision(count)`：记录单件造梦家具已确认的最大样式修改次数，用于“完美主义”成就。
- `addGift(gift)` / `getGifts()` / `mergeGifts(gifts)`：礼物库存。
- `exportGameState()` / `importGameState(data, options)`：存档导入导出。

存档规范化：

- 旧存档缺少 `stats`、`gifts`、`dreamFurniture` 等字段时使用默认值。
- `readDreamFurnitureSnapshot()` 会读取 `fritia_dream_furniture` 快照，方便导出兼容。

## 设置系统：`js/settings.js`

localStorage key：`fritia-settings`

导出：

- `getSettings()`：读取设置，包含 `apiKey`、`baseUrl`、`model`。
- `saveSettings(settings)`：保存设置。
- `initSettings()`：绑定设置面板 DOM 和按钮。

默认值：

- `baseUrl`: `https://api.openai.com/v1`
- `model`: `gpt-4o-mini`

所有 LLM 调用都复用这里的设置。

## 日常对话：`js/dialogue.js`

localStorage key：`fritia_chat_history`

导出：

- `initDialogue()`：加载人格设定、历史记录并绑定 UI。
- `showDialogue()` / `hideDialogue()` / `isDialogueVisible()`：日常对话 overlay 控制。
- `getConversationHistory()`：导出当前日常聊天历史。
- `importConversationHistory(data)`：导入历史。

关键内部逻辑：

- `loadSystemPrompt()`：加载 `src/_queries/system_prompt.txt`。
- `buildSystemPrompt()`：组合人格设定、游戏时间和造梦家具上下文。
- `getContextMessages()`：截取近期消息作为上下文。
- `handleSend()`：调用 OpenAI 兼容 API，并以 SSE 方式流式更新回复。

造梦家具上下文：

- `dialogue.js` 会读取 `getDreamFurnitureDialogueContext()`。
- 玩家提到已创建家具时，芙提雅可以基于家具名称和玩家原始描述回答。

## 约会系统：`js/date_dialogue.js`

localStorage key：`fritia_date_history`

导出：

- `initDateDialogue()`：初始化约会面板。
- `openDatePanel()` / `closeDatePanel()` / `isDatePanelVisible()`：约会 overlay 控制。
- `getDateLocations()`：约会地点配置。
- `getDateConversationHistory()` / `importDateConversationHistory(data)`：约会历史导入导出。

关键内部逻辑：

- `loadDatePrompt()`：加载 `src/_queries/date_prompt.txt`。
- `buildDateSystemPrompt(locationName)`：组合地点和人设。
- `startDateConversation(loc)`：进入约会聊天。
- `handleDateSend()`：发送约会消息并记录好感。

## 礼物系统：`js/gift_system.js`

职责：

- 购物终端 overlay。
- LLM 估价和好感评分。
- 礼物支付、库存、收藏柜展示。

导出：

- `initGiftSystem()`
- `openGiftTerminal()` / `closeGiftTerminal()`
- `openGiftCollection()` / `closeGiftCollection()`
- `isGiftOverlayVisible()`
- `renderGiftCollection()`

关键内部逻辑：

- `handleEvaluateGift()`：检查输入和 API 设置，调用 LLM 评估礼物。
- `requestGiftEvaluation(detail, settings)`：请求 LLM。
- `buildGiftRequestBody(detail, settings, mode)`：构造 OpenAI 兼容请求体。
- `fetchGiftCompletionStream(settings, body)`：兼容 SSE 流式响应。
- `parseGiftEvaluation(content)`：解析礼物名称、价格、评分、理由。
- `handlePurchaseGift()`：扣款、加好感、加入礼物库存。

## 成就系统：`js/achievements.js`

localStorage key：`fritia_achievements`

导出：

- `initAchievements()`
- `openAchievementsPanel()` / `closeAchievementsPanel()` / `isAchievementsPanelVisible()`
- `evaluateAchievements(options)`
- `flushStartupAchievementToasts()`
- `refreshAchievementsFromImport()`
- `exportAchievements()` / `importAchievements(data)`

行为：

- 成就卡片显示在最顶层，覆盖普通 overlay；`#achievement-toast-host` 初始化时会从 `#hud` 提升到 `document.body` 直下，并使用极高 `z-index` 和独立 stacking context，避免被 overlay 的高斯模糊背景遮住。
- 解锁时播放 `src/_voices/achievement_complete.mp3`。
- 成就状态包含 `unlocked` 和 `notified`，导入时按时间戳合并。
- “布置爱巢”位于“比翼双飞”后方，读取 `fritia_dream_furniture` 当前记录数，造梦空间内自制家具达到 `5` 件时解锁，图标 `src/_logos/ach_dream_love_nest.svg`。
- “完美主义”位于“布置爱巢”后方，读取家具记录的 `revisionCount` 和 `stats.maxDreamFurnitureRevisionCount`，同一件造梦家具确认样式修改达到 `3` 次时解锁，图标 `src/_logos/ach_dream_perfectionist.svg`。

## 造梦系统总览

造梦系统由三个模块组成：

- `dream_system.js`：运行时、UI、存档、摆放、交互、角色台词。
- `dream_furniture_factory.js`：确定性家具 JSON 规范化、校验、mesh 和 collider 构建。
- `dream_llm.js`：OpenAI 兼容 LLM 请求和响应解析。

核心规则：

- 制造家具花费 `500` 数据金，只在部署成功并保存成功后扣费。
- 每成功制造一件新家具，增加 `5` 好感度。
- 样式修改花费 `100` 数据金，只在预览部署成功后扣费。
- 样式修改回退返还 `50` 数据金。
- 删除造梦家具返还 `400` 数据金。
- 家具数据存储在 `fritia_dream_furniture`。
- 玩家可以自然语言描述家具和摆放位置，但最终坐标和碰撞由本地确定性代码决定。

## 家具工厂：`js/dream_furniture_factory.js`

导出：

- `DREAM_FURNITURE_SCHEMA_VERSION`：当前 schema 版本，值为 `1`。
- `normalizeFurnitureSpec(rawSpec)`：规范化 LLM 输出，补默认值、截断文本、限制尺寸、过滤非法 primitive/material/color。
- 坐标约定：组件 `position` 是家具局部坐标中的组件中心点，`+Y` 向上，家具原点位于地面中心。规范化时先计算所有组件的整体包围范围；如果 LLM 把家具中心当作局部原点导致最低点低于地面，会整体上移所有组件，保留桌面、桌腿、桌上物体之间的相对上下关系。
- 样式修改时如果 LLM 新增了桌面电脑、灯具等上方物体但忘记扩大 `dimensions.height`，规范化逻辑会先根据组件包围范围扩展 `dimensions`，再 clamp 组件位置，避免上方物体被压到桌面下方。
- `validateFurnitureSpec(rawSpec)`：校验顶层对象、名称、类别、尺寸、组件数组、颜色、材质、朝向等。
- `createFurnitureFromSpec(rawSpec)`：根据规范化 spec 创建 Three.js `Group`。
- `applyFurniturePose(group, placement)`：应用家具位置和 Y 轴旋转。
- `applyFurniturePose()` 会保留 `pose.position.y`，用于 `anchor:"wall"` 的悬挂式家具；普通地面家具仍以 `y=0` 存档和摆放。
- 悬挂式家具渲染时以家具中心作为墙面高度锚点；`cylinder/cone` 等默认 Y 轴圆盘会在渲染层旋转到墙面平面，避免挂钟、墙饰与地板平行。
- 悬挂式家具会在应用墙面 pose 后，用真实渲染 AABB 二次贴合墙内侧，避免因 LLM 尺寸深度和实际几何厚度不一致而与墙面留缝。
- `estimateFurnitureAABB(group)`：估计家具整体 AABB。
- `createFurnitureCollider(group)`：创建整体 AABB collider，用于 UI 投影等。
- `createFurnitureColliders(group)`：创建组件级 collider，用于玩家和角色碰撞。样式修改后可增加/减少实体碰撞区域。
- `serializeFurniture(furniture)` / `deserializeFurniture(data)`：存档序列化和旧数据兼容。

支持 primitive：

- `box`
- `cylinder`
- `sphere`
- `cone`
- `torus`
- `plane`

支持类别：

- 地面家具：`seat/table/bed/storage/lighting/decor/plant/toy/custom`
- 悬挂家具：`hanging`，必须配合 `anchor:"wall"` 使用。只有玩家明确要求“挂在墙上、壁挂、悬挂、挂钟、墙饰”等语义时，本地才允许生成；否则即使 LLM 输出 `anchor:"wall"` 也会被改回地面家具。

支持材质 preset：

- `wood`
- `metal`
- `glass`
- `fabric`
- `plastic`
- `stone`
- `emissive`
- `default`

渲染细节：

- 对不透明组件使用轻量 `polygonOffset` 分层，减少 LLM 生成组件重叠时的 z-fighting 闪烁。
- 不改变几何、碰撞和存档，只优化渲染观感。

## 造梦 LLM：`js/dream_llm.js`

导出：

- `requestDreamFurnitureSpec({ description, placementText, roomContext, existingFurniture, settings })`：根据玩家家具愿望生成严格家具 JSON。
- `requestDreamFurnitureRevision({ furniture, instruction, roomContext, settings })`：根据现有家具 JSON 和玩家自然语言修改要求生成新的家具 JSON。
- `requestFurnitureRomanticLine({ furniture, gameTimeContext, settings })`：为芙提雅访问家具生成一句恋爱向短台词。

关键内部逻辑：

- `normalizeBaseUrl(baseUrl)`：规范化 API 地址。
- `loadCharacterPrompt()`：加载并缓存 `src/_queries/system_prompt.txt`，家具台词使用同一人格设定。
- `stripCodeFence(text)`：去除 Markdown 代码块。
- `extractJsonObject(text)`：从 LLM 文本中提取第一个完整 JSON object。
- `fetchChatCompletion(settings, body)`：兼容流式和非流式 OpenAI 响应。
- `fetchChatCompletionJson(settings, body)`：请求并解析 JSON。
- 家具制造和样式修改请求不设置本地 `max_tokens` 硬上限，避免复杂家具 JSON 被截断；解析时由 `extractJsonObject()` 找到完整 JSON object 的结尾并忽略后续解释文本。
- `buildFurniturePrompt(...)`：构造家具制造 prompt。
- `buildFurnitureRevisionPrompt(...)`：构造家具样式修改 prompt。
- `cleanRomanticLine(content)`：清理家具台词，去除引号、JSON 包装、说话人前缀。
- `shouldRetryRomanticLine(json, line)`：reasoning 模型因 token 太少只返回 reasoning 时，自动重试一次更高 token。

家具 JSON 协议重点：

```json
{
  "name": "星光阅读沙发",
  "category": "seat",
  "description": "适合两人靠坐的柔软沙发。",
  "dimensions": { "width": 1.8, "height": 0.9, "depth": 0.85 },
  "frontDirection": "+Z",
  "anchor": "floor",
  "components": [
    {
      "type": "box",
      "name": "seat_base",
      "position": { "x": 0, "y": 0.35, "z": 0 },
      "rotation": { "x": 0, "y": 0, "z": 0 },
      "size": { "x": 1.8, "y": 0.3, "z": 0.8 },
      "color": "#d9a7c7",
      "material": "fabric"
    }
  ],
  "interaction": {
    "waypoint": {
      "enabled": true,
      "offset": { "x": 0, "y": 0, "z": 1.0 },
      "furnitureType": "seat",
      "dialogueTags": ["沙发", "休息"]
    }
  },
  "placement": {
    "intent": "靠近窗边，但不要挡住门",
    "preferredWall": "window",
    "avoidDoor": true
  }
}
```

## 造梦运行时：`js/dream_system.js`

导出：

- `initDreamSystem(options)`：初始化造梦系统，绑定 DOM、加载本地家具、注册事件。
- `openDreamPanel()` / `closeDreamPanel()` / `isDreamOverlayVisible()`：造梦终端 overlay。
- `isDreamRevisionPending()`：是否处于家具样式修改确认/回退状态。
- `constrainPendingRevisionPlayer()`：样式修改待确认时限制玩家留在造梦空间。
- `isLookingAtDreamTerminal(camera)`：造梦终端准星检测，带视线遮挡判断。
- `isLookingAtDreamFurniture(camera)` / `getLookingDreamFurniture(camera)`：造梦家具管理目标检测。
- `openDreamFurnitureEditor(furnitureId)` / `closeDreamFurnitureEditor()`：打开/关闭家具快捷编辑。
- `confirmPendingDreamRevision()` / `rollbackPendingDreamRevision()`：确认或回退样式修改预览。
- `getDreamFurnitureInteractables()`：家具交互对象列表。
- `getDreamFurnitureColliders()`：动态家具组件级碰撞体列表。
- `getDreamFurnitureWaypoints()`：动态家具 waypoint 列表。
- `getDreamFurnitureLabel(furnitureId)`：家具名称，用于提示 `按 E 管理 [名称]`。
- `getDreamFurnitureDialogueContext()`：给日常对话注入的家具背景。
- `exportDreamFurniture()` / `importDreamFurniture(data)`：导出/导入造梦家具。
- `refreshDreamFurnitureAfterImport()`：导入后刷新运行时家具。

关键内部逻辑：

- `handleCreateFurniture()`：制造家具主流程。
- `findSafePlacement(group, spec, placementText, excludeId)`：本地寻找安全摆放点。
- `findSafeWallPlacement(group, spec, placementText, excludeId)`：悬挂式家具专用摆放逻辑，只在墙面上寻找位置，并保存 `pose.position.y`、`pose.wall` 和 `pose.anchor`。
- `hasExplicitWallMountIntent(text)`：本地判断玩家是否明确要求墙挂/悬挂；未命中时禁止新家具变成悬挂式。
- `alignHangingAttachmentsOnFurniture(spec, instruction)`：普通家具样式修改时，如果玩家要求在柱子、柜体等竖直表面挂钟/挂饰，会把疑似挂件组件贴到普通家具的竖直表面；整件家具仍保持 `anchor:"floor"`。
- `buildCandidatePositions(spec, placementText, placement)`：根据自然语言关键词、LLM placement intent、墙/窗/门位置生成候选坐标。
- `validateRuntimePlacement(group, excludeId)`：检查边界、门口清空区、窗户清空区、已有家具碰撞。
- `rotateTowardInterior(pos, spec, baseRotation)`：靠墙家具自动面向房间内部。
- `deployRecord(record)`：创建家具 mesh、整体 collider、组件 collider、waypoint，并加入场景。
- `refreshRecordRuntime(record, options)`：家具移动/旋转/样式修改后刷新 mesh/collider/waypoint；`options.forceCharacterRepath` 会通知主流程强制刷新芙提雅路径。
- `onFurnitureCreated(record, runtimeItem)`：家具制造成功后通知 `main.js` 播放特写过场；样式修改、导入恢复不会触发该过场。
- `bindMoveHold(id, intent)` / `bindRotateHold(id, amount)`：快捷按钮短按与长按连续移动/旋转。
- `getEditMoveDelta(intent, amount)`：家具编辑方向基于玩家视角动态贴近世界 X/Z 轴；坐标轴本身不变。
- `handleStyleRevision()`：样式修改流程。LLM 返回新 spec 后，本地校验、预览部署、扣费、进入确认/回退状态。
- `handleFurnitureVisited(event)`：芙提雅到达动态家具 waypoint 后，按冷却和概率触发家具台词；显示气泡前会先让角色平滑转身面向对应家具。
- `waitForCharacterFacingFurniture(record, duration)`：取家具 runtime collider/group 中心点，缓动角色 yaw 到面向家具的方向。
- `showCharacterSpeechBubble(line)`：显示固定宽度的家具台词气泡；芙提雅在视野内时贴在头顶，离开视野时停留在离屏方向的屏幕边缘。
- `getFallbackFurnitureLine()`：LLM 失败或跳过时选择本地兜底台词。

制造家具阶段：

1. 检查余额与 API 设置。
2. 正在解析家具愿望。
3. 正在生成家具结构。
4. 正在寻找安全摆放位置。
5. 正在部署到房间。
6. 完成。

失败不扣钱：

- 未配置 API Key。
- 数据金不足。
- LLM 请求失败。
- LLM 输出不是合法 JSON。
- schema 校验失败。
- 家具尺寸过大。
- 无安全摆放位置。
- localStorage 保存失败。
- 未知异常。

家具快捷管理：

- 看向家具按 `E` 不直接打开大 overlay，而是在家具实体中心投影 `#dream-object-controls`。
- 前/后/左/右按钮移动家具，短按一步 `0.25m`，长按超过 `0.5s` 后平滑连续移动。
- 左转/右转按钮短按 `15°`，长按超过 `0.5s` 后平滑连续旋转。
- 悬挂式家具的前/后按钮表示沿墙面向天花板/地板移动，左右按钮表示沿所在墙面水平移动；旋转按钮禁用。
- 悬挂式家具的左右按钮会根据玩家当前视角在墙面切线上的投影实时决定方向，保证屏幕上的左/右和移动方向一致。
- 悬挂式家具移动到天花板、地板或墙面边缘时会回滚，并用屏幕气泡提示。
- 中央绿色按钮确认退出快捷编辑。
- 重置按钮在左转按钮下方。
- 编辑、重新自动摆放、删除三个按钮位于右侧同一列。
- 删除保留 `confirm()` 二次确认并退还 `400` 数据金。

样式修改：

- 在家具编辑 overlay 的“家具样式修改”中输入自然语言要求。
- 悬挂式家具无法样式修改；编辑 overlay 会禁用样式输入框和“样式变更”按钮，并显示提示。
- 普通家具样式修改会强制保留原 `anchor/category`，不能通过 LLM 变成悬挂式家具；但允许新增贴在普通家具竖直表面的挂件组件。
- 成功后退出 overlay，进入主界面预览状态。
- 显示 `[1] 确认` 和 `[2] 回退`。
- 未确认/回退前，玩家可走动但不能触发其他交互，并被限制在造梦空间内。
- 按 `[1] 确认` 后，该家具 `revisionCount` 加 `1`，并通过 `recordDreamFurnitureRevision()` 刷新“完美主义”成就统计。
- 回退恢复修改前 spec，并返还 `50` 数据金。

家具台词：

- 事件来源：`character.js` 到达动态家具 waypoint 后派发 `fritia-dream-furniture-visited`。
- 同一家具冷却：`20 * 1000` ms 现实时间。
- LLM 调用概率：当前为 `0.5`，未调用或失败时使用本地兜底台词。
- 台词气泡使用固定宽度，并会把完整气泡限制在可视区域内；芙提雅离开画面时气泡保留在离屏边缘，回到画面后立即恢复为头顶悬浮。
- 台词气泡出现前，芙提雅会先在约 `0.46s` 内平滑转身，让身体正面面向对应家具。
- 日常对话、约会、礼物、造梦 overlay、睡眠、非操作模式中不会触发家具台词。

## 房间全景拍照：`js/room_panorama.js`

职责：
- 看向造梦终端时，`#dream-painting-prompt` 会显示 `按 1 拍摄房间`。
- `Digit1` / `Numpad1` 或触控该提示按钮进入全景拍照模式。
- 全景模式固定相机到新旧房间整体地图斜上方，暂停玩家移动、角色行动和普通交互。
- 进入、退出、切换视角复用 `fadeToBlack()` / `fadeFromBlack()` 黑屏缓入缓出。
- 模式内左/右按钮调用 `switchPanoramaView(direction)` 切换四个斜上方视角。
- 支持鼠标滚轮缩放；触控屏支持双指缩放。缩放只改变全景相机到目标点的距离，不修改玩家相机或世界坐标。`#room-panorama-ui` 会接管整屏 pointer/wheel/touch 事件，避免输入穿透到底层画布。
- 拍照模式使用 `body.room-panorama-active` 强制隐藏准星，进入时释放普通操作模式，模式内点击屏幕不会重新请求 Pointer Lock；退出完成后恢复操作模式。
- 拍照模式会隐藏 `#top-bar` 右上角按钮；退出完成后由 `body.room-panorama-active` 移除自动恢复显示。
- 拍照模式临时调整 `scene.background`、`scene.fog`、`renderer.toneMappingExposure`，并克隆房间地板/墙体/天花板材质做轻量美化；退出时恢复原状态。
- 天花板始终透明；当前视角正对的 1-2 面外墙，以及这些墙上的系统挂件和造梦悬挂家具，会临时透明。
- 截图按钮调用 `captureRoomPanorama()`，隐藏 HTML 拍照 UI 一帧后读取 WebGL canvas 并下载 `fritia_room_panorama_*.png`。

关键实现：
- `scene.js` 的 renderer 使用 `preserveDrawingBuffer: true`，保证 `renderer.domElement.toDataURL('image/png')` 可以稳定导出。
- `room.js` 通过 `userData.panoramaLayer` 和 `userData.panoramaWall` 标记天花板、墙体、窗户、挂画、门等可透明对象。
- `dream_system.js` 部署 `anchor: 'wall'` 的动态家具时写入 `userData.panoramaLayer = 'wallDecor'` 与 `userData.panoramaWall`。
- `room_panorama.js` 临时克隆材质做透明化，退出或切换视角时恢复原材质，避免污染共用墙体材质。
- `updateRoomPanorama()` 在进入/退出/切换黑屏过渡期间不会重写相机位置，避免退出时把玩家留在全景相机坐标。
- `controls.js` overlay 列表包含 `room-panorama-ui`，且在 `body.room-panorama-active` 时屏蔽 `click-to-play` 与全局点击 Pointer Lock 入口，避免拍照模式中重新抢回普通操作模式。

DOM ID：
- `#room-panorama-ui`
- `#room-panorama-prev`
- `#room-panorama-next`
- `#room-panorama-capture`
- `#room-panorama-close`

手动测试：
1. 看向造梦终端时，应同时显示 `按 E 打开造梦终端` 和 `按 1 拍摄房间`。
2. 按 `1` 或触控 `按 1 拍摄房间` 后，应黑屏淡入全景拍照模式。
3. 拍照模式下玩家不能自由移动或转动镜头，旧房间、新房间、家具和芙提雅都应在画面范围内。
4. 点击左右按钮应黑屏切换视角，并同步透明化对应墙体和墙面挂件。
5. 鼠标滚轮或双指手势应能放大/缩小房间全景。
6. 拍照模式中鼠标不应处于普通操作模式，准星不可见。
7. 点击拍摄按钮应下载 PNG，截图中不包含 HTML 按钮。
8. 按 `E`、`Escape` 或点击退出按钮后，应黑屏恢复原玩家视角和操作模式。

## DOM ID 清单

基础：

- `#game-canvas`
- `#loading-screen`, `#loading-progress`, `#loading-text`
- `#fade-overlay`
- `#hud`, `#crosshair`, `#game-status`
- `#game-time-display`, `#affinity-display`, `#affinity-value`, `#money-display`, `#salary-toast`
- `#interaction-prompt`, `#painting-prompt`
- `#click-to-play`

顶部按钮：

- `#btn-achievements`
- `#btn-history`
- `#btn-export`
- `#btn-import`
- `#settings-toggle`
- `#import-file`

对话：

- `#dialogue-ui`
- `#dialogue-box`
- `#dialogue-name`
- `#dialogue-text`
- `#dialogue-input`
- `#dialogue-send`
- `#dialogue-close`

设置：

- `#settings-panel`
- `#api-key`
- `#base-url`
- `#model-name`
- `#settings-save`
- `#settings-close`

历史：

- `#history-panel`
- `#history-list`
- `#date-history-list`
- `#history-date-filter`
- `#history-close`

约会：

- `#date-panel`
- `#date-close`
- `#date-locations`
- `#date-chat`
- `#date-chat-title`
- `#date-chat-area`
- `#date-input`
- `#date-send-btn`
- `#date-back-btn`
- `#date-new-topic-btn`

礼物：

- `#gift-terminal-panel`
- `#gift-terminal-close`
- `#gift-balance`
- `#gift-description`
- `#gift-evaluate-btn`
- `#gift-status`
- `#gift-pending`
- `#gift-pay-btn`
- `#gift-result`
- `#gift-collection-panel`
- `#gift-collection-close`
- `#gift-collection-list`

成就：

- `#achievements-panel`
- `#achievements-close`
- `#achievement-summary`
- `#achievement-list`
- `#achievement-toast-host`

造梦终端：

- `#dream-terminal-panel`
- `#dream-terminal-close`
- `#dream-balance`
- `#dream-furniture-description`
- `#dream-placement-input`
- `#dream-create-button`
- `#dream-progress`
- `#dream-progress-fill`
- `#dream-status`

家具快捷编辑：

- `#dream-object-controls`
- `#dream-object-move-forward`
- `#dream-object-move-back`
- `#dream-object-move-left`
- `#dream-object-move-right`
- `#dream-object-rotate-left`
- `#dream-object-rotate-right`
- `#dream-object-reset`
- `#dream-object-delete`
- `#dream-object-placement`
- `#dream-object-edit`
- `#dream-object-close`
- `#dream-screen-toast`

家具编辑 overlay：

- `#dream-furniture-editor-panel`
- `#dream-editor-close`
- `#dream-editor-title`
- `#dream-editor-meta`
- `#dream-editor-name`
- `#dream-editor-save-name`
- `#dream-editor-style-balance`
- `#dream-editor-style-instruction`
- `#dream-editor-style-apply`
- `#dream-editor-style-progress`
- `#dream-editor-style-progress-fill`
- `#dream-editor-status`

家具位置 overlay：

- `#dream-placement-editor-panel`
- `#dream-placement-editor-close`
- `#dream-editor-placement`
- `#dream-editor-auto-place`

样式修改确认：

- `#dream-revision-confirm-bar`
- `#dream-revision-confirm`
- `#dream-revision-rollback`

移动端：

- `#touch-controls`
- `#joystick-move`
- `#joystick-move-knob`
- `#btn-interact`
- `#btn-look`

睡眠：

- `#sleep-ui`
- `#btn-pet`
- `#btn-wake`

换装和挂画：

- `#model-selector`
- `#model-list`
- `#model-close`
- `#painting-upload`

## localStorage Key

- `fritia-settings`：API 设置。
- `fritia_game_state`：游戏时间、数据金、好感、统计、礼物。
- `fritia_chat_history`：日常对话历史。
- `fritia_date_history`：约会对话历史。
- `fritia_achievements`：成就解锁与通知状态。
- `fritia_painting`：挂画图片 data URL。
- `fritia_dream_furniture`：造梦家具记录数组。

造梦家具记录：

```json
{
  "id": "dream_xxx",
  "name": "星光阅读沙发",
  "category": "seat",
  "description": "规范化描述",
  "playerDescription": "玩家制造时输入的原始描述",
  "spec": {},
  "pose": {
    "position": { "x": 8, "y": 0, "z": 1 },
    "rotationY": 0,
    "wall": "",
    "anchor": ""
  },
  "createdAt": "ISO 时间",
  "gameDateTime": "游戏内日期时间",
  "revisionCount": 0,
  "lastDialogueAt": 0
}
```

## 自定义事件

- `fritia-action`
  - 来源：移动端触控按钮。
  - detail：`{ code }`，例如 `KeyE`、`KeyF`。
- `fritia-overlay-closed`
  - 来源：各 overlay 关闭。
  - detail：`{ id }`。
  - 用途：恢复控制模式和清理互动状态。
- `fritia-game-state-updated`
  - 来源：数据金变化、统计变化、礼物变化。
  - detail 可包含 `{ moneyDelta, reason }`。
- `fritia-affinity-updated`
  - 来源：好感变化。
  - detail：`{ delta }`。
- `fritia-dream-furniture-visited`
  - 来源：角色到达动态家具 waypoint。
  - detail：`{ furnitureId, name, description, category, dialogueTags }`。

## 导出/导入 JSON

导出字段：

- `version`
- `exportedAt`
- `exportedGameTime`
- `gameState`
- `money`
- `affinity`
- `stats`
- `achievements`
- `gifts`
- `dreamFurniture`
- `settings`
- `conversationHistory`
- `dateConversationHistory`
- `painting`

导入策略：

- `gameState` 使用 `importGameState()` 规范化。
- `conversationHistory`、`dateConversationHistory` 覆盖式导入。
- `dreamFurniture` 按 `id` 去重合并，坏 spec 或不安全摆放会跳过，不中断整体导入。
- `achievements` 合并 timestamp。
- `settings` 和 `painting` 若存在则导入。

## UI 和样式约定：`css/style.css`

约定：

- overlay 使用深色半透明玻璃质感。
- 打开 overlay 前释放控制模式，关闭时派发 `fritia-overlay-closed`。
- 移动端输入框字号不低于 `16px`，避免 iOS 自动放大。
- 成就 toast 使用最高层级，覆盖其他 overlay。
- 造梦家具快捷按钮是投影到 3D 实体中心的轻量圆形按钮。
- `body.dream-revision-pending` 会禁用普通交互提示和非确认/回退 UI。

主要样式区域：

- 基础 HUD、准星、提示按钮。
- 设置、历史、日常对话、约会、礼物、成就 overlay。
- 造梦终端大型面板。
- 造梦家具快捷控制。
- 家具编辑、位置调整、样式修改确认条。
- 芙提雅头顶气泡。
- 移动端适配媒体查询。

## 资源约定

- `src/_queries/system_prompt.txt`：芙提雅核心人格设定，日常对话和家具台词都应使用。
- `src/_queries/date_prompt.txt`：约会系统提示词。
- `src/_logos/dream_*.svg`：造梦终端、家具编辑、推拉门等图标。
- `src/_logos/achievement_*.svg`, `src/_logos/ach_*.svg`：成就系统图标。
- `src/_voices/achievement_complete.mp3`：成就解锁音效。
- `src/_voices/talk_*.mp3`：日常互动语音。
- `src/_voices/sleep_*`：睡眠模式音频。

## 交互规则

按 E：

- 睡眠模式：起床，不受视线遮挡规则影响。
- 看向造梦空间推拉门：开门/关门。
- 看向造梦终端：打开造梦终端。
- 看向造梦家具：打开家具快捷编辑。
- 看向购物终端：打开礼物终端。
- 看向礼物收藏柜：打开礼物收藏。
- 看向床：进入睡眠。
- 看向书桌或约会门：打开约会。
- 看向挂画：上传图片。
- 看向衣柜：换装。

视线遮挡：

- 除睡眠起床外，旧房间 E 交互实体、新房间造梦终端、造梦家具和造梦门均要求玩家视角能直接看到目标。
- 目标和玩家之间如有碰撞体阻挡，不显示提示，也不触发。

按 F：

- 接近芙提雅并处于操作模式：进入日常对话。
- 睡眠模式：摸头。
- 已在日常互动中：退出互动。

Escape：

- 优先关闭造梦、礼物、成就、约会、日常对话、换装面板。

## 手动测试清单

基础：

1. `npm run dev` 启动并进入游戏。
2. 旧卧室正常显示，床、桌、椅、衣柜、挂画、窗户、购物终端可见。
3. HUD 中时间、好感度、数据金分行显示。
4. 鼠标锁定和移动端触控基础操作可用。
5. 未点击开局界面前，芙提雅停在初始位置不随机移动；点击进入操作模式后先完成挥手欢迎，再开始后续行动。
6. 打开任意 overlay 时触发成就，成就卡片应显示在所有窗口和高斯模糊背景之上。

共享墙和门：

1. 新旧房间之间的共享墙应是一整面厚墙分段，不再出现额外凸出的墙块。
2. 门洞上方有墙体，不透明，不漏空。
3. 共享墙高度顶到天花板，Z 方向覆盖造梦空间完整宽度。
4. 旧房间侧墙面只轻微加厚，不遮挡购物终端。
5. 推拉门关闭时阻挡玩家和角色。
6. 推拉门打开时门板滑入负 Z 侧墙体内部，玩家和角色可通过。
7. 门打开后准星对准门洞仍能按 E 关门，且不会穿透触发门后实体。

旧功能回归：

1. 购物终端可打开礼物系统。
2. 礼物收藏柜可打开收藏列表。
3. 日常对话、约会、换装、睡觉、挂画仍可用。
4. 成就解锁 toast 位于最顶层并播放音效。
5. 导出再导入不破坏旧功能。

造梦家具：

1. 看向造梦终端按 E 打开“造梦-家具打造终端”。
2. 未配置 API Key 时制造失败且不扣钱。
3. 余额不足时不调用 LLM 且不扣钱。
4. 合法 LLM JSON 生成家具后，扣除 500 数据金、增加 5 好感度并刷新 HUD。
5. 新生成的桌、床、柜等家具上下关系正确；桌腿不会被整体倒扣到桌面上方。
6. 复杂家具 JSON 不应因本地 `max_tokens` 上限被截断。
7. 家具生成成功后播放约 3 秒特写拉远镜头；镜头完整展示家具、不穿墙，过场期间玩家不能移动，按 E 可跳过。
8. 家具不穿墙、不堵门、不挡窗、不与已有家具重叠。
9. 明确输入“挂在墙上的时钟”等语义时，生成 `hanging`/`anchor:"wall"` 家具并贴在墙面；未明确要求悬挂时，家具仍默认落地。
10. 悬挂式家具编辑时，前/后沿墙面上下移动，左右沿墙面水平移动，旋转按钮禁用，样式修改禁用。
11. 普通家具样式修改中要求“在柱子上挂一个时钟”时，挂件作为普通家具组件贴到竖直表面，整件家具仍保持普通家具。
12. 刷新页面后家具恢复。
13. 导出/导入后家具恢复。
14. 看向家具按 E 显示快捷编辑按钮。
15. 移动、旋转、重置、删除流程可用。
16. 删除家具退回 400 数据金并在 HUD 显示 `+400`。
17. 样式修改成功后显示 `[1] 确认` 和 `[2] 回退`。
18. 确认样式修改后该家具 `revisionCount` 增加，连续 3 次确认可触发“完美主义”。
19. 回退样式恢复原 spec 并退回 50 数据金。
20. 样式修改后玩家和芙提雅碰撞体同步更新。
21. 造梦空间内存在家具达到 5 件时触发“布置爱巢”。

角色：

1. 玩家进入造梦空间后，芙提雅通过门步行进入新房间；寻路失败时才瞬移。
2. 玩家回旧房间后，芙提雅回到旧房间并只在旧房间 waypoint 中移动。
3. 芙提雅能绕开动态家具。
4. 芙提雅访问动态家具时，若在视野内且满足冷却/概率，会先平滑转身面向家具，再在头顶显示家具台词气泡。
5. 床和椅子的坐姿位于正确边缘，不悬空、不突然长距离滑移。

## 已知限制

- 造梦家具由基础 primitive 程序化构建，不支持外部贴图 URL 或任意模型导入。
- LLM 可能返回不稳定 JSON；当前策略是严格校验并提示玩家重试。
- 造梦家具摆放是本地候选点搜索，不是完整物理引擎。
- 芙提雅寻路是轻量网格 A*，复杂迷宫家具可能仍需要短暂穿模兜底。
- 浏览器端直接调用 OpenAI 兼容 API 会受 CORS 限制；需要服务商 API 支持浏览器跨域访问。

## 2026-06-19 造梦家具分类互动补充

- `dream_furniture_factory.js`
  - `ALLOWED_CATEGORIES` 新增 `painting`。
  - `serializeFurniture()` / `deserializeFurniture()` 新增 `customTexture` 字段，用于保存 painting 类家具的本地图片 data URL。

- `dream_llm.js`
  - 家具生成 prompt 允许 `painting` 分类。
  - 当玩家明确要求“挂画、相框、照片框、展示框、墙画”等墙面矩形边框家具时，引导 LLM 输出 `anchor:"wall"` 与 `category:"painting"`。

- `dream_system.js`
  - `SEAT_INTERACTION_RATE` 控制造梦 `seat` 家具触发坐下动作的概率。
  - `BED_INTERACTION_RATE` 控制造梦 `bed` 家具触发平躺动作的概率。
  - 当前二者默认都是 `0.42`。需要调高或调低交互频率时，直接修改这两个常量，取值范围建议为 `0` 到 `1`。
  - `findSafePlacement()` 会先尝试玩家语义位置，再追加全房间地面网格兜底候选；每个地面候选点会尝试多个朝向，避免一个朝向挡窗/挡门就直接失败。
  - `findSafeWallPlacement()` 会在四面墙和多个高度上做网格兜底扫描，悬挂家具不会只因首选窗边墙失败就停止。
  - `createWaypoint()` 为 `seat` / `bed` 造梦家具生成 `isFurniture` waypoint，并写入 `frontVector`，该向量来自家具 `frontDirection` 和当前摆放旋转。
  - `hasEditableDreamPainting()`：判断当前正在管理的造梦家具是否为 `painting`。
  - `isDreamPaintingFurniture(furnitureId)`：判断指定造梦家具是否为 `painting`，供主界面提示和快捷键入口使用。
  - `requestDreamPaintingTextureUpload()`：请求从本地选择图片替换 painting 类家具内容。
  - `consumeDreamPaintingTextureFile(file)`：复用 `#painting-upload` 的文件选择结果，若当前挂起的是造梦 painting 家具，则把本地图片应用到画框内侧展示面并保存。

- `character.js`
  - `seat` 类造梦家具在抵达 waypoint 后按 `interactionRate` 决定是否触发坐下。触发时不会派发 `fritia-dream-furniture-visited`，因此不会同时出现家具台词气泡。
  - `bed` 类造梦家具在抵达 waypoint 后按 `interactionRate` 决定是否触发平躺。触发时同样不会显示家具台词气泡。
  - 旧房间床的睡眠仍使用 `applySleepingPose(cd)` 和固定旧床位置；造梦床使用 `applyDreamBedPose(cd)`，由 `estimateDreamBedSurfaceY()` 优先识别床垫/床面等宽大水平组件作为躺倒高度，再叠加 `DREAM_BED_LIE_Y_OFFSET` 偏移量，身体与地面平行并面向天花板。
  - 坐下/平躺的边缘选择优先使用 waypoint 的 `frontVector`，避免继续硬编码到某一条世界坐标边。
  - 若 `seat` / `bed` 的碰撞盒尺寸明显不支持对应动作，会跳过动作并在 console 输出提示。

- `main.js`
  - 在管理 `painting` 类造梦家具时，按 `1` / 小键盘 `1` 会打开本地图片选择。
  - 在普通操作模式下看向 `painting` 类造梦家具时，提示会显示 `1 替换图片`，按 `1` 可直接替换图片。
  - `#dream-painting-prompt` 是独立的 `1 替换图片` 提示按钮；当同时出现 `F`、`E`、`1` 时，三者按 F/E/1 自上而下排列，移动端可分别点击。
  - 当焦点位于 `input`、`textarea`、`select` 或可编辑元素中时，不会触发该快捷键，避免输入文字时误打开文件选择。

- `room.js`
  - 造梦终端在墙面上的位置由 `dreamTerminalGroup.position.set(x, y, z)` 控制；当前为 `(5.25, 1.5, 2.955)`。
  - 终端交互点需要同步修改 `dreamTerminalMesh.userData.interactionCenter`。
  - 芙提雅在造梦终端附近的巡逻点为 `dream_terminal` waypoint。

- `character.js`
  - 旧房间床坐下深度由 `STATIC_BED_SIT_EDGE_INSET` 控制；数值越大，角色坐得越往床里面；数值越小，越靠外。
  - 造梦床平躺的进入深度由 `DREAM_BED_LIE_EDGE_INSET` 控制，和旧房间床坐姿分开。
