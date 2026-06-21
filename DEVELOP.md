# Fritia Online NEXT 开发文档

更新时间：2026-06-22

本文是当前静态 Three.js 项目的开发事实源。项目不依赖后端服务，游戏数据、设置、历史、成就和造梦家具主要存储在浏览器 `localStorage` 中；自定义访客 PMX/人格文档与本地知识库数据存储在 IndexedDB，并通过前端 ZIP 存档机制迁移。

## 项目概览

Fritia Online NEXT 是一个纯静态网页 3D 互动应用：

- 渲染引擎：Three.js ES Modules。
- 角色模型：PMX/MMD，使用 `MMDLoader` 加载。
- 控制方式：桌面端 Pointer Lock 第一人称控制，移动端触控摇杆与视角滑动。
- 对话能力：复用设置面板中的 OpenAI 兼容 `chat/completions` API。
- 数据存储：`localStorage` + 访客资源/知识库 IndexedDB，导出/导入 ZIP（兼容旧 JSON 导入）。
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
├── UI_STYLE.md
├── README.md
├── index.html
├── package.json
├── css/
│   ├── tokens.css         # 设计令牌(:root 变量)
│   ├── base.css           # 基座 + 保留不变的 HUD(#game-status/#top-bar/#dream-object-controls)
│   ├── components.css     # 共享组件(.ui-overlay/.otome-panel/.btn/字段/chip/custom-select/滚动条)
│   ├── effects.css        # 动画与点燃光效
│   ├── panels.css         # 各浮层专属样式 + 浮层 z-index
│   ├── responsive.css     # 响应式与移动端
│   └── style.css          # 兼容入口(仅 @import 上述模块)
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
│   ├── dance_system.js
│   ├── bar_guest_system.js
│   ├── bartending_challenge.js
│   ├── roundtable_whispers.js
│   ├── deepseek_intimate_mode.js
│   ├── knowledge_base.js
│   ├── bar_performance.js
│   ├── zip_store.js
│   ├── game_state.js
│   ├── gift_system.js
│   ├── main.js
│   ├── room.js
│   ├── bar_scene.js
│   ├── scene.js
│   └── settings.js
└── src/
    ├── snowbreak_logo.png
    ├── sample_screenshot.png
    ├── _ui/                # UI 重制美术资源(原创手绘 SVG)：角标/分隔/光效/花瓣/火花/暖色头图标
    ├── _queries/
    │   ├── system_prompt.txt
    │   ├── date_prompt.txt
    │   └── deepseek_special_prompt.txt
    ├── _voices/
    │   ├── startup_1.wav
    │   ├── talk_1.mp3 ... talk_5.mp3
    │   ├── Cherno_welcome_1.wav ... Cherno_welcome_2.wav
    │   ├── sleep_mode_1.mp3 ... sleep_mode_2.mp3
    │   ├── sleep_whisper_1.mp3 ... sleep_whisper_5.mp3
    │   └── achievement_complete.mp3
    ├── _logos/
    │   ├── Profile_Fritia.png
    │   ├── achievement_*.svg / ach_*.svg
    │   ├── dream_*.svg
    │   └── license files
    ├── _maps/
    │   └── bar/              # 暖调闲聚 PMX 地图与贴图
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

- 初始化场景、房间、角色、控制器、对话、礼物、成就、造梦系统和调酒挑战。
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
- `currentPlayerRoomId`：`bedroom`、`dream` 或 `bar`。
- `isDreamDoorOpen`, `dreamDoorAnimating`：造梦空间推拉门状态。
- `isBarSceneActive`, `barTransitionInProgress`：暖调闲聚地图显示和黑屏转场状态。
- `dreamCinematic`：造梦家具生成后的特写过场状态；存在时暂停玩家普通操作，`E` 可跳过。
- `basePlayerColliders`, `bedroomColliders`, `dreamStaticColliders`：玩家和角色使用的基础碰撞体集合。

主要函数：

- `init()`：主初始化流程。按顺序初始化 `game_state`、`scene`、`room`、`character`、`controls`、对话系统、礼物系统、成就系统和造梦系统。
- `startLoadingResourceMonitor()` / `trackLiveLoadingResource()`：加载页资源体积统计。通过浏览器 Resource Timing 读取已完成资源传输大小，并叠加角色 PMX、暖调闲聚地图 PMX 的 XHR 实时进度，在 `#loading-size-text` 显示 `XX.XX MB / XX.XX MB`；总量显示单调不下降，避免 Resource Timing 和实时 XHR 切换时跳动。
- `onKeyDown(e)`：全局键盘交互。`E` 处理门、终端、家具、礼物、床、约会、挂画、衣柜、暖调闲聚准入/舞台/邀请/调酒挑战；`F` 处理角色互动和摸头；`1/2` 处理造梦家具样式修改确认/回退；看向造梦终端时 `1` 进入房间全景拍照模式；全景模式内 `E` / `Esc` / `1` 退出。
- `animate()`：主循环。更新游戏时间、控制器、角色、门动画、房间作用域、窗户天空色、交互提示、暖调闲聚准入浮窗投影并渲染场景。
- 开局欢迎闸门：加载完成但玩家尚未点击 `#click-to-play` 前，角色只保留眨眼，不切换 waypoint、不随机移动；首次点击后先执行面向玩家镜头的挥手欢迎，挥手结束再恢复正常行动。
- `updateInteractionPrompt()`：复用 `#painting-prompt` 和 `#interaction-prompt` 显示当前可用交互；造梦家具显示 `按 E 管理 [家具名]`；暖调闲聚准入浮窗显示时改为 `按 E 关闭`。
- 暖调闲聚舞台：看向 `BarDanceInvisiblePlane` 时显示 `按 E 观看跳舞`，打开 `#dance-panel`；舞蹈流程中 `updateDanceSystem(delta)` 接管 VMD 动作，暂停角色日常 AI，但玩家移动/视角仍由 `controls.js` 正常更新。
- 暖调闲聚调酒：看向 `BarBartendingChallengeInvisibleBox` 时显示 `按 E 请琴诺帮忙调酒`，打开 `#bartending-challenge-panel` 并释放控制模式；Escape 或关闭按钮退出并派发 `fritia-overlay-closed`。
- 暖调闲聚圆桌密语：看向 `BarRoundtableWhispersInvisibleBox1/2` 时显示 `按 E 加入圆桌密语`，打开 `#roundtable-whispers-panel` 并释放控制模式；面板关闭或离开酒吧时会清空圆桌请求队列并中断当前 LLM 请求。
- 进入暖调闲聚时 `#fade-overlay.is-bar-loading` 会显示全屏流星加载特效、底部进度条 `#bar-loading-progress` 和状态文案 `#bar-loading-text`；地图加载使用 PMX 真实 progress，访客加载使用阶段进度。
- `hasClearLineOfSight(targetPoint, targetDistance)`：按 E 交互视线遮挡判断。玩家视角到目标点之间如果被当前碰撞体阻挡，则不显示也不触发按 E 管理/交互。睡眠模式的 `按 E 起床` 不走这个规则。
- `isLookingAtTerminal()` / `isLookingAtDreamTerminal()` / `isLookingAtDreamDoor()` / `isLookingAtPainting()` 等：各类准星交互检测。
- `toggleDreamDoor()`：切换造梦空间推拉门开关状态，并刷新玩家/角色碰撞作用域。
- `updateDreamDoor(delta)`：用缓动插值滑动门板。门开启后移除门碰撞，门关闭后恢复门碰撞。
- `startDreamFurnitureCinematic(record, runtimeItem)` / `updateDreamFurnitureCinematic(delta)` / `skipDreamFurnitureCinematic()`：新家具生成后播放约 3 秒的特写拉远镜头，镜头起终点限制在造梦空间内，避免穿墙；播放前检测结束落点的玩家碰撞风险，必要时保持玩家视角 Y 轴高度并改用附近安全位置；过场期间只允许按 `E` 跳过。
- `initRoomPanorama()` / `enterRoomPanorama()` / `updateRoomPanorama()`：看向造梦终端时通过 `按 1 拍摄房间` 进入全景拍照模式。模式内固定相机到新旧房间斜上方，暂停玩家移动和普通交互，并通过黑屏淡入淡出切换视角。
- `refreshCharacterRoomScope(force)`：玩家进入新旧房间时，切换芙提雅导航作用域；优先让角色通过门步行进入对应房间，失败时才瞬移。
- `getActivePlayerColliders()`：当前玩家碰撞体。门关闭时包含 `dreamDoorCollider`，门打开时移除。
- `getActiveBedroomCharacterColliders()` / `getActiveDreamCharacterColliders()`：角色在不同房间的导航碰撞体。
- `tryEnterBarSceneWithAdmission()`：旧房间南侧门的暖调闲聚准入检查。需要完成 3 次日常对话、1 次约会、1 次睡觉模式、送出 1 件礼物和制造 1 件造梦家具；未完成时在门位置投影 `#bar-admission-panel`，隐藏进入提示并显示 `按 E 关闭`，全部完成后直接调用 `enterBarScene()`。
- `refreshActiveHistoryTab()`：打开历史对话浮层时按当前激活栏目刷新内容，确保停留在“暖调闲聚”页后再次打开也能看到最新访客/酒吧对话。
- `enterBarScene()` / `exitBarScene()`：通过黑屏转场进入/离开暖调闲聚；切换旧房间组显示、scene background/fog、玩家碰撞体和芙提雅导航作用域。
- `exitBarScene()` 会强制关闭圆桌密语并取消 overlay 自动恢复控制标记，避免转场结束后旧面板状态抢回 Pointer Lock。
- `enterBarScene()` 成功切入暖调闲聚后循环播放 `src/_voices/bar_bgm_min.mp3`，音量约 `0.28` 并淡入；`exitBarScene()` 淡出并停止该 BGM。
- `exitBarScene()` 在舞蹈流程未结束前会被拦截；出口提示保留但置灰且不携带 `data-prompt-key`，避免点击或按 E 触发返回。
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
- 礼物收藏柜、衣柜、床、书桌、约会门、挂画保持旧功能；约会门为静态触发门，视觉沿用造梦空间推拉门和门框样式，但不具备开关门状态，也不改变所在南侧墙面的厚度。

## 暖调闲聚地图：`js/bar_scene.js`

职责：

- 使用 `MMDLoader` 懒加载 `src/_maps/bar/酒吧.pmx`，贴图位于 `src/_maps/bar/textures/`。
- 将地图 PMX 转换为普通静态 `THREE.Mesh + MeshStandardMaterial`，隐藏原始 MMD 对象，避免静态地图继续触发 MMD 材质/骨骼相关渲染问题。
- 地图默认隐藏；进入暖调闲聚时显示，返回卧室时隐藏。
- 自动扫描地图三角面生成运行时 AABB 碰撞盒，并通过 `userData.walkableHeight` / `surfaceYAt` / `ignoreZones` 标记低台阶、平台和楼梯坡面。
- 提供不可见出口交互平面；酒吧内看向出口显示 `按 E 返回卧室`。
- 提供不可见舞台互动平面 `BarDanceInvisiblePlane`：范围固定为 `X=-4.0~4.0`、`Y=0.0~4.5`、`Z=32.5`，只用于准星命中检测，不加入碰撞体。
- 提供不可见邀请互动体 `BarInviteInvisibleBox`：范围固定为 `X=-1.0~1.0`、`Y=0.67~1.07`、`Z=46.5~49.1`，只用于准星命中检测，不加入碰撞体。
- 提供圆桌密语不可见互动体 `BarRoundtableWhispersInvisibleBox1/2`：两个范围固定为 `X=-5.3~-7.9`、`Y=0.5~0.8`、`Z=36.7~39.4` 和 `Z=42.6~45.2`，只用于准星命中检测，不加入碰撞体。

导出：

- `ensureBarScene(scene)`：加载并初始化暖调闲聚场景，返回地图组、bounds、waypoints、colliders、出口 mesh 和出生点。
- `setBarSceneVisible(visible)`：切换地图组显示。
- `getBarBounds()` / `getBarWaypoints()` / `getBarPlayerColliders()` / `getBarCharacterColliders()`：供 `main.js` 切换玩家与角色作用域。
- `getBarSpawn()`：返回玩家出生相机位置、看向点和芙提雅出生点；默认优先使用地图 X/Z 中央，若被碰撞体占用会搜索附近可站立点。
- `getBarExitInteractionMesh()`：返回出口不可见交互平面。
- `getBarDanceInteractionMesh()`：返回舞台不可见交互平面。
- `getBarInviteInteractionMesh()`：返回邀请不可见交互体。
- `getBarRoundtableInteractionMeshes()`：返回圆桌密语两个不可见交互体。

运行约定：

- `currentPlayerRoomId === "bar"` 时，旧房间/造梦房间普通交互检测会被禁用，仅保留角色对话、舞台跳舞入口和酒吧出口。
- 玩家控制器和角色导航都识别 `walkableHeight`，低平台/台阶作为脚下高度而不是水平阻挡。
- 酒吧 colliders 创建后会挂载 `barSpatialIndex`，只供酒吧场景下的玩家/角色碰撞候选查询使用；旧卧室和造梦空间仍走原本的线性碰撞路径。
- 可设置 `localStorage.setItem('fritia_bar_debug_colliders','1')` 开启酒吧碰撞盒调试显示。

## 暖调闲聚性能优化：`js/bar_performance.js`

职责：

- `createBarColliderSpatialIndex(colliders)`：按 X/Z 网格为酒吧 AABB 碰撞体建立空间索引，避免每帧遍历完整 PMX 碰撞体数组。
- `attachBarColliderSpatialIndex(colliders, index)`：把索引以不可枚举属性挂到酒吧 colliders 数组上；非酒吧数组没有该属性，原功能不受影响。
- `getBarCollisionCandidates(colliders, position, radius)`：玩家和芙提雅每次按当前位置实时查询附近碰撞候选，支持角色被瞬移到舞台等位置后立即按新位置查询。
- `createBarInteractionProbe()`：酒吧出口/舞台/邀请/调酒/圆桌密语准星检测降频缓存，默认约 90ms 刷新；按键触发时强制刷新，避免缓存延迟影响交互。

运行约定：

- 该模块只服务暖调闲聚，不改变旧卧室、造梦空间、造梦家具和普通 UI 的碰撞逻辑。
- 角色寻路的 A* 格子站立高度/阻挡结果缓存只在 colliders 带 `barSpatialIndex` 时启用，且只存在于单次寻路调用内。

## 舞蹈系统：`js/dance_system.js`

职责：

- 管理暖调闲聚舞台的 `#dance-panel` 舞曲选择浮层。
- 使用 `MMDLoader.loadAnimation()` 加载玩家临时导入的本地 `.vmd` 文件，使用 `MMDAnimationHelper` 播放到当前选择的芙提雅 PMX 模型上。
- 可临时导入本地音频文件并随 VMD 同步开始；VMD 播放结束时立即停止音频。
- 点击 `#dance-preset-stage`（`STAGE POSITION` 卡片）会加载项目内置 `Love Lee` 预设，资源位于 `src/_vmd/love_lee/love_lee.vmd` 和 `src/_vmd/love_lee/love_lee_bgm.wav`，仍只作为临时舞曲源，不写入存档。
- 舞蹈开始时把芙提雅放置到 `X=0, Z=35.6`，并使用 `js/dance_system.js` 顶部的 `DANCE_STAGE_Y_OFFSET` 作为舞蹈显示层脚底目标 Y；该值当前为 `0.52`，可独立手动微调。
- 舞蹈坐标与普通行动坐标隔离：VMD helper 每帧只在 `danceCoordinate.rawPosition` 上解算，显示时再临时加上舞蹈 Y 偏移；退出流程时丢弃 `danceCoordinate`，再由酒吧普通碰撞/导航重新计算角色站立高度。
- 播放期间 VMD 优先，角色可按动作序列四周移动并允许穿模；角色 `mesh.scale` 锁定为进入舞蹈时的游戏预设缩放，不改 VMD 骨骼动作解算。
- VMD 结束后显示 `#dance-curtain-bar`，按 `1` 或点左侧按钮重播，按 `2`、点右侧按钮或 5 秒无操作则结束舞蹈流程。

运行约定：

- VMD 文件、音频文件、object URL、AnimationClip 和 Audio 实例只保存在内存中，不写入 `localStorage`，也不进入导出/导入 JSON。
- 每次重新打开 `#dance-panel` 都会清空上次临时选择的 VMD/音频文件状态和文件名显示。
- 舞蹈流程中玩家移动和视角不锁定；角色日常 AI、F 对话和酒吧返回宿舍会被暂停，返回宿舍提示置灰。
- 关闭 `#dance-panel` 时派发 `fritia-overlay-closed`，并已加入 `controls.js` overlay 管理列表。

## 暖调闲聚调酒挑战：`js/bartending_challenge.js`

职责：

- 管理 `#bartending-challenge-panel` 调酒挑战浮层；看向酒吧内 `BarBartendingChallengeInvisibleBox` 时显示 `按 E 请琴诺帮忙调酒`。
- 入口体积位于 `X=6.8~8.3, Y=0.65~2.85, Z=40~45`，只用于准星 raycast，不加入玩家/角色 colliders，不阻挡移动。
- 每局初始 HP 为 `100`，必须喝满 `8` 杯；跳过本杯会揭示本杯完整调制结果，但不扣血、不回血，也不计入已喝杯数。跳过黑暗料理时结果右上角显示绿色 `危险回避`，跳过良好饮品时显示黄色 `错失良机`。
- 材料分为 `base/flavor/garnish` 三类，每类至少 6 个正常材料和 2 个古怪材料；玩家可使用预置卡片或自由输入，每类最终只取一个材料。
- 材料只作为风味灵感，不应稳定决定好坏；`buildBartendingRequestBody()` 每次生成随机调配动作，并要求 LLM 让琴诺临场动作比材料组合更影响最终结果。Prompt 使用字段协议描述 JSON，不在示例中固定 `darkLevel` / `hpDelta` 数字，避免模型复读固定伤害；预设调配动作只作为句式长度、夸张程度和叙事口吻参考，LLM 不应直接复述或同义改写，只有本地 fallback 会直接使用预设动作。
- 自定义材料输入在输入时即时预览到右侧组合槽，输入框 blur/change 时提交为本轮材料；点击预置材料会清空对应自定义输入和草稿。
- 自定义基酒/调味/装饰输入提交后会给输入框加 `has-custom-value`，使用暖白偏金色文字和轻金色边框，避免 blur 后文字变成浅红色难以辨认。
- `开始特调` 时只调用一次 OpenAI 兼容 `chat/completions`；饮用前只展示 `previewText` 外观/气味，饮用后才揭示 HP 变化、黑暗料理判定、酒名、调酒过程和标签。
- `previewText` 和 `processText` 超过默认展示长度时，不直接硬截断；前端会继续向后寻找下一个逗号或句号并在标点后截断，找不到合适标点时才回退到默认长度。
- LLM 调用复用 `settings.js#getSettings()` 的 `apiKey/baseUrl/model`，不新增后端和独立 API Key。
- 支持 SSE 与非 SSE 响应；模型返回非 JSON 时会尝试提取首个 JSON 对象，仍失败则使用本地 fallback 生成可玩的随机结果。
- 前端最终校验并钳制 `hpDelta`：良好饮品回血 `+8~+25`，HP ≥ 75 时单次最大回血 10；普通黑暗料理扣血 `-8~-28`，灾难级 `-40~-49` 低概率出现；HP ≤ 35 时单次最大扣血 25。
- 若 `isDarkCuisine` 与 `hpDelta` 符号矛盾，前端按黑暗料理/良好饮品语义修正符号和区间。
- 关闭面板会中断仍在进行的请求并丢弃本局状态；重新打开总是新局。

LLM JSON 协议：

```json
{
  "cocktailName": "悖谬草莓杯",
  "previewText": "粉色气泡闪烁，闻着很甜",
  "isDarkCuisine": true,
  "darkLevel": "1 到 5 的整数",
  "hpDelta": "整数，黑暗料理为负，良好饮品为正",
  "processText": "约 100 字的琴诺调酒过程。",
  "tags": ["琴诺特调", "黑暗料理"]
}
```

运行约定：

- 调酒挑战状态只保存在内存，不写入 `localStorage`，不进入导出/导入 JSON。
- 没有 API Key 时提示玩家先去设置填写；API 请求失败、空输出、非 JSON、字段类型异常都不会卡死，按 fallback 继续。
- 重复点击 `开始特调` 会被禁用，避免并发请求。
- `#bartending-challenge-panel` 已加入 `controls.js` overlay 管理列表；关闭时派发 `fritia-overlay-closed`，恢复控制模式。
- 窄屏/移动端下 `#bartending-challenge-panel` 自身允许纵向滚动，材料列表取消内部固定高度且保持每行 2 个材料；600px~980px 改为稳定单列流式布局，右侧结果栏位于材料栏下方，组合槽使用静态网格，避免右栏压到左栏；600px 以下目标标签固定排在标题说明下方，且可点击 `基酒/调味/装饰` 标题折叠对应材料栏。

## 暖调闲聚访客系统：`js/bar_guest_system.js`

职责：

- 管理 `#bar-guest-panel` 发起邀请浮层；看向 `BarInviteInvisibleBox` 时显示 `按 E 邀请其他人入场`。
- 内置候选角色 `芬妮`：PMX 位于 `src/_char_card/fenny/芬妮-澄意 夕晖蜜约.pmx`，人格设定位于 `src/_char_card/fenny/char_fenny_prompt.txt`。
- 特殊场景角色 `琴诺`：PMX 与贴图位于 `src/_char_card/Cherno/`，人格设定位于 `src/_char_card/Cherno/char_cherno_prompt.txt`；每次进入酒吧都会自动加载，固定在 `X=7.2, Y=0.668, Z=42.01`，不进入候选列表、不写入访客存档、不参与随机移动。
- 自定义角色通过本地 PMX 文件、同目录贴图/材质资源和人格设定文档导入；PMX 上传后在浮层中显示临时预览，读取期间显示圆形加载动画。浏览器无法仅凭单个本地文件授权枚举其目录；实现会扫描 PMX 内贴图文件名，并从用户同次选择的文件中自动匹配需要的贴图资源。
- 新角色运行时通过 `character.js#loadCharacterFromModel()` 复用芙提雅的缩放、行走、寻路和姿态逻辑，但角色数据、人格 prompt、对话配色和生命周期独立。
- 访客重新进入酒吧时会在地图中部 `BAR_GUEST_SPAWN_AREA` 内随机出生；初始 Y 轴由出生点脚下 walkable 碰撞盒高度动态计算，不使用固定 Y 偏移，也不改动角色移动时的 Y 轴逻辑。
- 访客只在 `currentPlayerRoomId === "bar"` 时加载、更新和互动；离开酒吧时卸载运行时资源。未保存的临时访客不会再次加载，已保存的访客下次进入酒吧自动加载。
- 琴诺接近玩家时会在固定点转身并让头部看向玩家镜头；玩家离开判定范围后，身体会平滑转回初始朝向；对话使用独立紫色主题。玩家按 `F` 与琴诺开始对话时，会在 `src/_voices/Cherno_welcome_1.wav` 与 `src/_voices/Cherno_welcome_2.wav` 中随机播放一段欢迎语，该语音仅限琴诺角色。
- 访客对话使用设置面板中的 OpenAI 兼容 `chat/completions` 配置，不新增后端和独立 API Key；请求不设置本地 `max_tokens` 硬上限，避免琴诺、芬妮和自定义访客回复被截断。
- 暖调闲聚访客对话开始后，全局 `F/E/1/2` 等功能键不再触发游戏交互，按键会保留给文本输入；访客对话只通过 `Esc` 或右上角关闭按钮手动结束。
- `getActiveBarGuestParticipants()` 提供当前已加载且可见访客的只读快照，供圆桌密语读取自定义参与者；只返回 `id/name/prompt/type/avatarText/isBuiltin/isSpecial`，不暴露 runtime、mesh、object URL 或 IndexedDB 句柄。

存储：

- `localStorage.fritia_bar_guest_cards`：自定义访客元数据，包含 `id/name/modelPath/promptPath/modelFileName/promptFileName/assetPaths/previewDataUrl/createdAt`。
- `localStorage.fritia_bar_guest_builtin_state`：内置访客保留状态，目前记录已邀请并应在重进酒吧时自动加载的内置角色 id，例如 `builtin:fenny`。
- `localStorage.fritia_bar_conversation_history`：暖调闲聚中访客对话历史；芙提雅在酒吧中的对话仍保存在 `fritia_chat_history`，但记录 `scene:"bar"` 并在历史 UI 中归入暖调闲聚。
- IndexedDB `fritia_bar_guest_assets/assets`：保存用户导入的 PMX 和人格文档 Blob，key 使用 JSON 中记录的相对路径，例如 `bar_guests/<id>/<file>.pmx`。

## 圆桌密语：`js/roundtable_whispers.js`

职责：

- 管理暖调闲聚多人 LLM 群聊浮层 `#roundtable-whispers-panel`；看向 `BarRoundtableWhispersInvisibleBox1/2` 时显示 `按 E 加入圆桌密语`。
- 第一步为邀请组局界面，玩家可选择芙提雅、琴诺、芬妮以及当前暖调闲聚已加载的自定义访客，并设置是否允许 bot 自动接话、是否允许 idle 主动搭话、玩家未回话时最多连续互聊次数。
- 第二步为群聊界面，显示参与者列表、消息流、不同头像/颜色气泡、玩家输入框和发送按钮；移动端折叠为单列布局。
- 窄屏下隐藏圆桌标题栏副标题，圆桌头部使用与调酒挑战一致的酒红/金色调；聊天界面的“当前圆桌”默认压缩为单行小头像和小型重新组局按钮，点击栏目标题或空白区域后展开成员卡片、邀请和移除按钮。
- 所有 API 调用复用 `settings.js#getSettings()` 中的 `apiKey/baseUrl/model`，不新增后端、不新增独立 Key。

角色来源：

- 芙提雅：`src/_queries/system_prompt.txt` + `src/_logos/Profile_Fritia.png`。
- 琴诺：`src/_char_card/Cherno/char_cherno_prompt.txt` + `src/_logos/Profile_Cherno.png`。
- 芬妮：`src/_char_card/fenny/char_fenny_prompt.txt` + `src/_logos/Profile_Fenny.png`。
- 自定义访客：通过 `getActiveBarGuestParticipants()` 读取当前已加载访客的名字和 prompt；头像使用名称首字。

调度规则：

- 所有 bot 发言必须经过本地中央调度器，任意时刻最多 1 个 LLM 请求。
- 两次 LLM 请求完成到下一次发起之间至少约 `4s` 硬冷却。
- 请求队列上限为 `3`；玩家消息优先，会丢弃或合并低优先级 idle/follow-up。
- 玩家消息默认触发 1 个主回复；玩家可在一句话里 `@` 多人、`@全体`，或用“大家/各位/都说说”等关键词召唤全体成员，被点名成员会按中央队列逐个回复。
- 玩家或 bot 文本中提到成员名字时，调度器会把被提到的成员加入回复队列；玩家批量 `@` 产生的 bot 回复正文如果点到其他成员，也会启动 bot-to-bot 互聊链；bot 提到自己的名字不会再次唤醒自己。
- bot 开头的 `@某人` 显示前缀默认会被忽略，但正文仍会扫描成员名；例如默认设置下 `@芬妮 早上好` 不唤醒芬妮，`@芬妮 芬妮早上好` 会唤醒芬妮。开启“bot 开头 @ 也触发回复”后，开头 `@芬妮` 也会唤醒芬妮。
- 预算充足且概率命中时，bot 回复后可追加自然 follow-up，默认概率约 `55%`；显式点名队列优先于随机 follow-up，只要未触发硬预算、API 错误或互聊上限，就不会被概率分支吞掉。
- bot-to-bot 互聊链可由系统主动 follow-up 或 bot 正文点名其他成员启动；互聊链启动后，模型过早输出 `handoff_to_player` 会被本地延后；默认互聊上限为 `3` 时，通常第 `2~3` 轮才会交还话题。达到上限前最后一轮会被本地强制为 handoff，让该轮主动把话题交还给分析员。
- idle 主动发言只在面板打开、仍在酒吧、已开启 idle、长时间无对话且预算允许时触发，默认间隔约 `45s`。
- 3 分钟滑动窗口预算：总调用 soft/hard 约为 `16/22`，粗略 token soft/hard 约为 `42000/68000`，soft limit 后禁用 idle/follow-up，idle 调用上限约 `3`。本地阻塞、冷却等待和 API 错误会在 console 输出 `[Roundtable]` / `[Roundtable][blocked]` / `[Roundtable][api-error]` 日志，便于区分本地调度限制和服务端错误。
- 遇到 `429/rate limit/too many requests` 会临时拉长冷却，并在状态栏提示“圆桌稍微放慢了语速”。
- 面板关闭、离开酒吧、设置缺失或预算超限时会清空队列、清空低优先级候选并 abort 当前请求。

bot 间对话债务：

- `interBotDebt` 记录玩家未回话时的连续 bot-to-bot 自主接话次数，默认上限为 `3`，玩家可在圆桌规则中调为 `1~6`。
- follow-up 视为 bot-to-bot 时增加 debt；达到玩家设定上限后排入 `handoff_to_player`，下一条 bot 消息必须把话题交还给分析员。
- handoff 后进入 `playerFloorLock`，玩家下一次发言只允许触发 1 个主回复，禁止额外 follow-up、idle 和 bot-to-bot 链。
- 玩家短回复如“嗯”“继续”“你们说”不会降低 debt；较明确的新话题只会逐步降低 debt，不会直接清零。

LLM 输出协议：

- 每次只选择一个 speaker 调用 LLM。
- 模型只允许输出一条 JSON 消息，字段为 `text/targetId/intent/emotion/wantsFollowUp/suggestedFollowUpTargetId/topicHint`。
- bot 文本必须以 `@回复对象` 开头，例如 `@分析员`、`@琴诺`；bot 不会直接 `@大家`，只有玩家输入 `@全体成员` 或“大家/各位/都说说”等关键词时才会让全体 bot 入队。本地会强制补齐或修正这个显示前缀。默认情况下该前缀不代表真实 @ 请求；玩家可在圆桌设置中开启“bot 开头 @ 也触发回复”。
- 本地会去掉 Markdown fence、角色名前缀和多余引号；JSON 解析失败、空文本、敌对关键词或超长文本会使用本地 fallback。
- `targetId/intent/emotion` 不合法会改为安全默认值；`handoff_to_player` 必须面向玩家且 `wantsFollowUp=false`。
- 禁止 `eval`、`new Function` 或执行任何 LLM 输出。
- 圆桌发起请求前调用 `buildRagReferenceMessage({ mode: "roundtable", ... })`，默认最多注入 5 条参考分块；该消息作为额外 system 消息插入，不写入 `fritia_roundtable_whispers`，并保持 JSON 输出协议不变。

持久化：

- localStorage key：`fritia_roundtable_whispers`。
- 保存最近 5 天内最多 240 条完整圆桌消息、`topicSummary`、参与者选择和圆桌设置（自动接话、空闲搭话、bot 开头 @ 是否触发回复、互聊上限）；“组建群聊”创建的临时空白窗口会在重新组局或关闭时迁移回完整上下文，“继续对话”直接打开完整上下文。
- 圆桌消息不写入 `fritia_bar_conversation_history`，避免污染访客一对一聊天上下文。
- 导出字段为 `roundtableWhispers`；导入时按消息 id 去重合并，旧存档缺失该字段时使用空默认数据。

## ZIP 存档：`js/zip_store.js`

职责：

- 导出文件改为 `.zip`，根目录包含 `save.json`，并包含自定义访客的 PMX/人格文档资源。
- `save.json` 记录访客资源相对路径，不直接内嵌大文件；内置访客是否已保留入场记录在 `barGuestBuiltinState.activeIds`。
- 导入 `.zip` 时读取 `save.json`，把访客资源写入 IndexedDB，再恢复 `barGuestCards` 和 `barGuestBuiltinState`；旧 `.json` 存档仍兼容导入，但不会携带自定义 PMX 资源。

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
- `cancelOverlayResume()`：取消 overlay 关闭后的自动恢复控制标记；离开酒吧强制关闭圆桌密语时使用，避免转场后抢回 Pointer Lock。
- `enterControlMode()`：只切换内部操作状态，用于触控或 Pointer Lock 已存在的场景。
- `forceEnterControlMode()`：主动请求 Pointer Lock 并恢复操作模式；造梦家具特写过场结束后使用该接口，避免出现可移动但鼠标未锁定的半激活状态。

overlay 管理列表：

- `dialogue-ui`
- `settings-panel`
- `history-panel`
- `model-selector`
- `dance-panel`
- `roundtable-whispers-panel`
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
- `startWaving(cd, options)`：触发挥手；`options.getLookTarget` 可选用于让欢迎动作期间身体和头部实时朝向目标点。
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
- `recordSleepModeEntered()` / `recordDanceWatched()` / `recordBartendingChallengeWin()`：分别记录睡眠模式进入次数、暖调闲聚舞蹈完整观看次数和琴诺调酒挑战胜利次数。
- `getBarAdmissionProgress()`：返回暖调闲聚入场券任务进度；任务为 3 次日常对话、1 次约会、1 次睡觉模式、1 件已送礼物和 1 件造梦家具。
- `addGift(gift)` / `getGifts()` / `mergeGifts(gifts)`：礼物库存。
- `exportGameState()` / `importGameState(data, options)`：存档导入导出。

存档规范化：

- 旧存档缺少 `stats`、`gifts`、`dreamFurniture` 等字段时使用默认值。
- `readDreamFurnitureSnapshot()` 会读取 `fritia_dream_furniture` 快照，方便导出兼容。
- `stats` 新增 `sleepModeCount`、`danceWatchCount`、`bartendingChallengeWins`；初始化时会从现有日常/约会历史折算对话统计，导入旧存档时按最大值合并。

## 设置系统：`js/settings.js`

localStorage key：`fritia-settings`

导出：

- `getSettings()`：读取设置，包含 `apiKey`、`baseUrl`、`model`、`mouseSensitivity`、`touchSensitivity`、`localizationSensitivity`、`deepseekIntimateMode`、`deepseekIntimateModeStartedAt`、`deepseekIntimateModeDisabledAt`。
- `saveSettings(settings)`：保存设置，并派发 `fritia-settings-updated`。
- `initSettings({ controlsModule })`：绑定设置面板 DOM 和按钮，并在打开/关闭设置页时处理控制模式恢复。

默认值：

- `baseUrl`: `https://api.openai.com/v1`
- `model`: `gpt-4o-mini`
- `mouseSensitivity`: `1`
- `touchSensitivity`: `1`
- `localizationSensitivity`: `0.5`
- `deepseekIntimateMode`: `false`
- `deepseekIntimateModeStartedAt`: `0`
- `deepseekIntimateModeDisabledAt`: `0`

所有 LLM 调用都复用这里的设置。

操作设置：

- `mouseSensitivity` 和 `touchSensitivity` 存在 `fritia-settings` 中，取值由 UI 滑块限制在 `0.35~2.5`，默认 `1.00x`。
- `localizationSensitivity` 存在 `fritia-settings` 中，取值由 UI 滑块限制在 `0.5~2`，步进 `0.05`，默认 `0.50x`，需要玩家手动调到 `1.00x` 才会满足亲密模式显示条件。
- `controls.js` 在处理 Pointer Lock 鼠标视角、手动拖拽视角和移动端触控视角时使用该设置；初始化时读取一次，保存设置后通过 `fritia-settings-updated` 事件刷新缓存，未保存或旧存档缺失字段时使用默认值。
- `deepseekIntimateMode` 只有在模型名称包含 `deepseek` 且 `localizationSensitivity === 1` 时可见且可生效；即使存档中为 true，只要条件不满足也不会参与 LLM 请求。
- `deepseekIntimateModeStartedAt` / `deepseekIntimateModeDisabledAt` 记录亲密模式有效状态切换时间，用于关闭后隔离亲密模式期间生成的 bot 上下文。

设置页结构：

- `#settings-panel` 是左右分组设置页；宽屏左侧为设置分组，右侧为当前详情。
- `data-settings-section="model"` / `data-settings-view="model"`：大模型设置，保留 `#api-key`、`#base-url`、`#model-name` 和 `#settings-save`。
- `data-settings-section="controls"` / `data-settings-view="controls"`：操作设置，包含 `#mouse-sensitivity`、`#touch-sensitivity`、`#localization-sensitivity` 及对应数值显示。
- `data-settings-section="knowledge"` / `data-settings-view="knowledge"`：知识库管理。
- 设置标题栏副标题会随分组切换；底栏作者文案为 `青尘工作室 | BiliBili @CyanDust_青尘`，宽屏显示 `#settings-site-link` 访问官网，窄屏隐藏。
- 大模型设置页提供 DeepSeek、MiMO、Qwen 千问、Kimi 的官方 API 入口按钮，仅打开外部控制台，不保存任何额外凭据。
- 自定义事件：`fritia-settings-updated`，保存设置后派发，detail 为 `getSettings()` 规范化后的设置对象；`controls.js` 用它同步灵敏度缓存。
- 窄屏先显示分组列表，点击分组后进入详情；详情内 `data-settings-back` 返回分组列表。
- 打开设置页时释放控制模式；关闭时派发 `fritia-overlay-closed`。

DeepSeek 亲密模式：`js/deepseek_intimate_mode.js`

- `buildDeepSeekIntimateUserMessage(settings)` 只在 `shouldUseDeepSeekIntimateMode(settings)` 为 true 时读取 `src/_queries/deepseek_special_prompt.txt`，返回一条 `{ role: "user", content: ... }`。
- 仅日常对话、约会进程和圆桌密语会调用该模块；造梦、礼物、调酒挑战、访客对话等其他 LLM 请求禁止附加该提示。
- 附加内容作为本轮额外 user 消息进入请求，不作为 system prompt，不写入普通对话历史。
- 亲密模式有效时生成的日常/约会 assistant 回复和圆桌 bot 回复会带 `deepseekIntimateMode: true` 标记；关闭亲密模式后，这些回复仍保留在 UI、历史和存档中，但不会再作为后续 LLM 请求上下文、圆桌 `topicSummary` 或 RAG 辅助上下文，避免旧回复继续放大亲密模式指令。

## 本地知识库 / BM25 RAG：`js/knowledge_base.js`

职责：

- 管理静态网页本地知识库、txt/md 上传解析、Markdown 清洗、分块、BM25 / 关键词倒排索引、RAG 检索、prompt 注入和存档迁移。
- 不使用 embedding、向量数据库、reranker、后端服务或独立 API Key。
- 知识库只为日常对话、约会进程、圆桌密语提供参考资料，不替代角色人格 prompt，不写入普通对话历史。

默认参数：

- 分块大小：`512` 字符。
- 分块重叠：`50` 字符。
- BM25 候选召回：`50`。
- 最终注入：默认 `6` 条；圆桌密语默认 `5` 条，避免挤压 JSON 输出合同。
- 单文件上传软限制：约 `1.5 MB`。

IndexedDB：

- DB：`fritia_knowledge_base_db`
- `knowledgeBases`：知识库元数据，keyPath `id`，字段含 `id/name/description/createdAt/updatedAt/fileCount/chunkCount`。
- `files`：文件元数据，keyPath `id`，索引 `kbId`，字段含 `id/kbId/name/type/size/createdAt/updatedAt/charCount/chunkCount`。
- `chunks`：分块正文，keyPath `id`，索引 `kbId/fileId`，字段含 `id/kbId/fileId/fileName/index/titlePath/text/tokenCount/createdAt`。
- `indexes`：每个知识库一条 BM25 索引，keyPath `kbId`，字段含 `algorithm/docCount/avgDocLength/documents/postings`。

localStorage key：

- `fritia_knowledge_base_state`：仅保存 `version/activeKbId/activeKbIds/updatedAt`，大文本和索引不写入 `localStorage`。`activeKbId` 为旧版兼容字段；新版以 `activeKbIds` 表示多个同时启用的知识库。
- `fritia_kb_debug`：可选调试开关。设置为 `"1"` 后，BM25 检索会在 console 输出本轮检索 query、启用知识库 id、有效关键词、候选分数、覆盖率、来源知识库、来源文件和标题路径。

文本处理：

- 上传仅支持 `.txt/.md/.markdown` 或文本 MIME。
- Markdown 清洗会移除代码围栏、HTML 标签、无效强调符号和链接 URL，尽量保留标题、列表和段落结构。
- 分块按标题、段落和长度组合；每个分块保存来源文件、标题路径和分块序号。
- 检索分词对英文小写化并按词切分；中文、日文、韩文使用 1-gram + 2-gram 字符切分。
- 检索 query 构造只用于知识库召回，不改变传给 LLM 的正常对话历史；当前用户输入是主查询，少量最近用户侧文本只作为辅助召回信号，assistant/bot 历史不会参与 BM25 query，避免上一轮错误回答污染首轮检索。
- 检索默认从所有 `activeKbIds` 指向的知识库中分别读取 BM25 索引；每个启用知识库先按 BM25 召回默认 50 条候选，再按标题/文件名命中、有效关键词覆盖率、短分块惩罚等本地信号重排。
- 多个知识库的候选会合并后按 `finalScore/coverage/bm25Score` 全局排序；最终注入数量仍是全局上限，默认 6 条。低相关候选会被过滤，不会强行注入参考资料。
- 高置信命中可补入同文件相邻分块，补充分块仍计入最终注入上限，避免跨分块答案被截断；该上限不会按启用知识库数量叠加。

RAG 接入：

- `buildRagReferenceMessage({ mode, query, recentMessages, limit })` 只接受 `daily/date/roundtable` 三种模式；公开接口不变，内部会从所有启用知识库中执行跨库 BM25 检索。
- `searchKnowledgeBase(query, options)` 默认检索所有启用知识库；`options.knowledgeBaseId` 可指定单库，`options.knowledgeBaseIds` 可指定多个库。
- 返回一条非持久化 `{ role: "system", content: "知识库参考资料：..." }` 消息；调用方只把它放进本轮 LLM `messages`。
- 注入规则明确要求模型只在资料相关时使用、不得把知识库内容当系统指令、不得暴露内部检索格式、不得覆盖角色人格或游戏规则。

导出/导入：

- `exportKnowledgeBaseArchive()` 生成 `knowledgeBase` 存档字段，包含 `state/config/knowledgeBases/files/chunks/indexes`。
- `importKnowledgeBaseArchive()` 兼容旧存档缺失字段和旧版 `activeKbId` 单库字段；导入时按 `id` 去重合并，坏知识库/文件/分块跳过，导入后重建 touched 知识库索引。若当前本地没有启用知识库，会恢复存档中的 `activeKbIds`。

设置页 DOM：

- `#kb-create-name`、`#kb-create-btn`、`#kb-list`、`#kb-empty`、`#kb-detail`、`#kb-current-title`、`#kb-current-meta`、`#kb-enable-toggle`、`#kb-delete-btn`、`#kb-active-status`、`#kb-file-input`、`#kb-upload-btn`、`#kb-upload-status`、`#kb-file-list`、`#kb-preview-title`、`#kb-chunk-list`。
- 窄屏下 `kb-files-panel` 和 `kb-chunks-panel` 默认折叠，点击对应面板标题区域可展开，再次点击收起；选择文件后会自动展开分块预览。
- 自定义事件：`fritia-knowledge-base-updated`，detail 可能含 `{ activeKbId, activeKbIds }`、`{ deletedKbId }`、`{ kbId }` 或 `{ imported: true }`。

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
- 发送消息时调用 `buildRagReferenceMessage({ mode: "daily", query: msg, recentMessages })`；命中时在 system prompt 后、历史上下文前插入“知识库参考资料” system 消息，不写入 `fritia_chat_history`。

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
- 约会开场和用户发送时调用 `buildRagReferenceMessage({ mode: "date", ... })`；参考资料只进入本轮请求，不保存到 `fritia_date_history`。

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
- 成就悬浮窗口每次打开时只刷新一次列表内容；后台 `evaluateAchievements()` 仍正常实时评估解锁和 toast，但不会在面板已打开时每秒重绘列表，避免闪烁。
- “布置爱巢”位于“比翼双飞”后方，读取 `fritia_dream_furniture` 当前记录数，造梦空间内自制家具达到 `5` 件时解锁，图标 `src/_logos/ach_dream_love_nest.svg`。
- “完美主义”位于“布置爱巢”后方，读取家具记录的 `revisionCount` 和 `stats.maxDreamFurnitureRevisionCount`，同一件造梦家具确认样式修改达到 `3` 次时解锁，图标 `src/_logos/ach_dream_perfectionist.svg`。
- “华丽入场”“霓裳羽衣”“安全撤离”位于“干什么！”后方；分别读取暖调闲聚入场券任务完成数、`stats.danceWatchCount` 和 `stats.bartendingChallengeWins`，图标分别为 `src/_logos/ach_bar_admission_ticket.svg`、`src/_logos/ach_neon_dancer.svg`、`src/_logos/ach_safe_evacuate.svg`。

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
- `renderDreamFurnitureTemplates()`：每次打开造梦终端时，从内置家具愿望模板中随机抽取 3 个显示在 `#dream-template-strip`；点击模板只填入 `#dream-furniture-description`，不自动制造。
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

打开造梦终端时，家具愿望输入框下方会随机显示 3 个预置模板胶囊按钮；点击后填入对应家具描述。

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
- 显示 `按 1 确认` 和 `按 2 回退`，按钮沿用场景按键提示圆角矩形样式；确认键帽为绿色，回退键帽为红色，触发时播放按键提示星光特效。
- 未确认/回退前，玩家可走动但不能触发其他交互，并被限制在造梦空间内。
- 按 `[1] 确认` 后，该家具 `revisionCount` 加 `1`，通过 `recordDreamFurnitureRevision()` 刷新“完美主义”成就统计，并主动恢复操作模式。
- 回退恢复修改前 spec，返还 `50` 数据金，并主动恢复操作模式。

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
- 顶部 `ROOM PANORAMA` 标识为紧凑宽度，窄屏时靠右显示以避开左上角状态栏；退出提示统一放在底部 `#room-panorama-close`，显示为 `按 E 退出`。按 `1` 也可退出全景，但不会点亮 `按 E 退出` 按钮。
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
8. 按 `E`、`Escape`、`1` 或点击底部 `按 E 退出` 按钮后，应黑屏恢复原玩家视角和操作模式；按 `1` 退出时不应触发 `按 E 退出` 按钮星光；窄屏下顶部 `ROOM PANORAMA` 标识不应遮挡左上角状态栏。

## DOM ID 清单

基础：

- `#game-canvas`
- `#loading-screen`, `#loading-progress`, `#loading-text`, `#loading-size-text`
- `#fade-overlay`
- `#hud`, `#crosshair`, `#game-status`
- `#game-time-display`, `#affinity-display`, `#affinity-value`, `#money-display`, `#salary-toast`
- `#interaction-prompt`, `#painting-prompt`
- `#bar-admission-panel`：运行时创建，锚定在旧房间南侧门位置的暖调闲聚准入任务小浮窗。
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
- `#settings-subtitle`
- `#api-key`
- `#base-url`
- `#model-name`
- `#deepseek-intimate-mode-card`
- `#deepseek-intimate-mode`
- `#mouse-sensitivity`
- `#mouse-sensitivity-value`
- `#touch-sensitivity`
- `#touch-sensitivity-value`
- `#localization-sensitivity`
- `#localization-sensitivity-value`
- `#settings-site-link`
- `#settings-save`
- `#settings-close`

历史：

- `#history-panel`
- `#history-list`
- `#bar-history-list`
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
- `#dream-template-strip`
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

暖调闲聚访客：

- `#bar-guest-panel`
- `#bar-guest-close`
- `#bar-guest-card-list`
- `#bar-guest-preview`
- `#bar-guest-name`
- `#bar-guest-pmx-file`
- `#bar-guest-prompt-file`
- `#bar-guest-pmx-pick`
- `#bar-guest-prompt-pick`
- `#bar-guest-pmx-name`
- `#bar-guest-prompt-name`
- `#bar-guest-status`
- `#bar-guest-save`
- `#bar-guest-invite`

暖调闲聚调酒挑战：

- `#bartending-challenge-panel`
- `#bartending-close`
- `#bartending-hp-value`
- `#bartending-hp-state`
- `#bartending-hp-bar`
- `#bartending-round-value`
- `#bartending-drink-count`
- `#bartending-base-list`
- `#bartending-flavor-list`
- `#bartending-garnish-list`
- `#bartending-base-custom`
- `#bartending-flavor-custom`
- `#bartending-garnish-custom`
- `#bartending-note`
- `#bartending-slot-base`
- `#bartending-slot-flavor`
- `#bartending-slot-garnish`
- `#bartending-loading`
- `#bartending-preview-panel`
- `#bartending-preview-text`
- `#bartending-preview-hint`
- `#bartending-drink-btn`
- `#bartending-skip-btn`
- `#bartending-reveal-panel`
- `#bartending-result-kind`
- `#bartending-result-name`
- `#bartending-result-delta`
- `#bartending-result-process`
- `#bartending-result-tags`
- `#bartending-next-btn`
- `#bartending-end-panel`
- `#bartending-end-title`
- `#bartending-end-text`
- `#bartending-restart-btn`
- `#bartending-status`
- `#bartending-start-btn`

圆桌密语：

- `#roundtable-whispers-panel`
- `#roundtable-whispers-close`
- `#roundtable-debt`
- `#roundtable-queue`
- `#roundtable-step-setup`
- `#roundtable-step-chat`
- `#roundtable-participant-list`
- `#roundtable-selected-count`
- `#roundtable-auto-talk`
- `#roundtable-idle-talk`
- `#roundtable-chain-limit`
- `#roundtable-chain-limit-value`
- `#roundtable-start`
- `#roundtable-continue`
- `#roundtable-back`
- `#roundtable-add-member`
- `#roundtable-remove-member`
- `#roundtable-member-picker`
- `#roundtable-mention-picker`
- `#roundtable-status`
- `#roundtable-chat-status`
- `#roundtable-participant-strip`
- `#roundtable-message-list`
- `#roundtable-input`
- `#roundtable-send`
- `#bar-loading-progress`
- `#bar-loading-text`

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

暖调闲聚舞蹈：

- `#dance-panel`
- `#dance-vmd-file`
- `#dance-audio-file`
- `#dance-vmd-pick`
- `#dance-audio-pick`
- `#dance-model-list`
- `#dance-start-btn`
- `#dance-status`
- `#dance-curtain-bar`
- `#dance-replay`
- `#dance-curtain`

换装和挂画：

- `#model-selector`
- `#model-list`
- `#model-close`
- `#painting-upload`

## localStorage Key

- `fritia-settings`：API 设置、操作灵敏度、亲密模式开关与 `deepseekIntimateModeStartedAt/deepseekIntimateModeDisabledAt` 切换时间。
- `fritia_game_state`：游戏时间、数据金、好感、统计、礼物；`stats` 包含入场券/成就用的 `sleepModeCount`、`danceWatchCount`、`bartendingChallengeWins`。
- `fritia_chat_history`：日常对话历史；亲密模式有效时生成的 assistant 回复可带 `deepseekIntimateMode: true`。
- `fritia_date_history`：约会对话历史；亲密模式有效时生成的 assistant 回复可带 `deepseekIntimateMode: true`。
- `fritia_bar_conversation_history`：暖调闲聚访客对话历史。
- `fritia_bar_guest_cards`：暖调闲聚自定义访客元数据；PMX/人格文档 Blob 存储于 IndexedDB `fritia_bar_guest_assets/assets`。
- `fritia_bar_guest_builtin_state`：暖调闲聚内置访客保留状态；当前用于记录芬妮是否应随酒吧场景自动加载。
- `fritia_roundtable_whispers`：圆桌密语完整消息历史 `fullMessages/messages`、`fullTopicSummary/topicSummary`、参与者选择、自动接话/idle 设置和 `botChainLimit`；消息仅保留最近 5 天内最多 240 条，旧存档的 `messages/topicSummary` 会自动迁移；亲密模式有效时生成的 bot 回复可带 `deepseekIntimateMode: true`。
- `fritia_achievements`：成就解锁与通知状态。
- `fritia_painting`：挂画图片 data URL。
- `fritia_dream_furniture`：造梦家具记录数组。

调酒挑战不新增 `localStorage` key；每局状态只存在于 `js/bartending_challenge.js` 内存中，关闭浮层后丢弃。

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
  - 调酒挑战关闭时 detail 为 `{ id: "bartending-challenge-panel" }`。
  - 圆桌密语关闭时 detail 为 `{ id: "roundtable-whispers-panel" }`；离开酒吧强制关闭时不派发该事件，并由 `controlsModule.cancelOverlayResume()` 清理恢复标记。
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
- `barConversations`
- `roundtableWhispers`
- `knowledgeBase`
- `barGuestBuiltinState`
- `barGuestCards`
- `painting`

导入策略：

- `gameState` 使用 `importGameState()` 规范化。
- `conversationHistory`、`dateConversationHistory` 覆盖式导入。
- `barConversations` 覆盖式导入；`roundtableWhispers` 按消息 id 去重合并；`knowledgeBase` 按知识库/文件/分块 id 去重合并并重建 BM25 索引；`barGuestBuiltinState` 覆盖式恢复内置访客保留状态；`barGuestCards` 按 id 合并并恢复 IndexedDB 资源。
- `dreamFurniture` 按 `id` 去重合并，坏 spec 或不安全摆放会跳过，不中断整体导入。
- `achievements` 合并 timestamp。
- `settings` 和 `painting` 若存在则导入。
- 调酒挑战无持久化字段，不参与导出/导入。
- 旧存档没有 `knowledgeBase` 时按空知识库处理，不报错。

## UI 和样式约定：模块化 CSS（暖色少女 Otome）

> 2026-06-19 起，UI 已完全重制为**暖色少女 Otome 风格**并拆分为模块化 CSS。
> 设计语言、令牌、组件、文件结构、点燃效果与 JS 耦合清单详见仓库根 **`UI_STYLE.md`**（接手必读）。

约定：

- CSS 拆分为 `tokens/base/components/effects/panels/responsive` 六个模块，`index.html` 按序 link（带 `?v=` 版本号）；`css/style.css` 仅作 `@import` 兼容入口。改主题只动 `tokens.css`。
- 浮层分两层表面：**亮面浮层**（奶油磨砂 + 深色文字，菜单类）与**场景层 HUD**（半透暖玻璃 + 浅色文字，如对话框/提示/全景/气泡），共用同一套玫瑰+金点缀系统。
- 新增浮层用统一骨架：外层保留 `id` 并加 `.ui-overlay`，内层用 `.otome-panel`（含头部 `__head/__icon/__titles/__kicker/__title/__close`、`__body`、可选 `__foot`）；按钮用 `.btn(--primary/--gold/--ghost/--danger)`。
- 打开 overlay 前释放控制模式，关闭时派发 `fritia-overlay-closed`；新浮层 `id` 必须加入 `controls.js` overlay 列表，并在 `panels.css` 设 `z-index`（沿用既有层级）。
- 移动端输入框字号不低于 `16px`（组件默认 16px）。
- 成就 toast 使用最高层级，覆盖其他 overlay。
- **保持不变**三处（视觉零改动，规则原样保留在 `base.css`/`responsive.css`）：`#top-bar`、`#game-status`、`#dream-object-controls`（造梦家具快捷圆形按钮）。
- `body.dream-revision-pending` 会禁用普通交互提示和非确认/回退 UI。
- 按键提示按钮统一加 `.kbd-prompt`；触发（按键或触控）时由 `main.js#ignitePrompt()` 播放「点燃」光效（辉光 + 火花 `src/_ui/spark.svg`）。
- 每个可触发提示通过 `data-prompt-key` 标记当前对应键位，`main.js#igniteForKey()` 只点亮键位匹配且可见的元素；例如仅有 `按 F 与芙提雅对话` 可见时，按 `E` 不应触发该按钮光效。
- **重构 HTML 时必须保留所有 `id` 和 JS 动态读写/生成的 class**（清单见 `UI_STYLE.md` 第 7 节），否则功能损坏。

## 资源约定

- `src/_ui/`：UI 重制（暖色 Otome）美术资源，全部为原创手绘 SVG（角标 `frame_corner`、分隔 `divider_heart`、柔光 `glow_soft`、背景 `bokeh`、纸纹 `panel_grain`、花瓣 `petal`、火花 `spark`、心标 `heart_motif`、关闭 `icon_close`、各浮层头图标 `icon_*`）。清单见 `src/_ui/README.md`，设计说明见 `UI_STYLE.md`。
- `src/_queries/system_prompt.txt`：芙提雅核心人格设定，日常对话和家具台词都应使用。
- `src/_queries/date_prompt.txt`：约会系统提示词。
- `src/_logos/dream_*.svg`：造梦终端、家具编辑、推拉门等图标。
- `src/_logos/achievement_*.svg`, `src/_logos/ach_*.svg`：成就系统图标；暖调闲聚新增成就图标使用 Google Noto Color Emoji 风格 SVG。
- `src/_voices/achievement_complete.mp3`：成就解锁音效。
- `src/_voices/talk_*.mp3`：日常互动语音。
- `src/_voices/Cherno_welcome_*.wav`：琴诺专用 F 对话欢迎语，进入琴诺对话时随机播放。
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
- 看向书桌：打开约会。
- 看向旧房间南侧门：进入暖调闲聚；如果入场券任务未完成，则在门位置显示准入任务浮窗，提示切换为 `按 E 关闭`，再次按 E 或触摸提示关闭浮窗。
- 暖调闲聚中看向出口平面：返回卧室。
- 暖调闲聚中看向舞台平面：打开舞曲选择；舞蹈流程未结束前返回卧室置灰不可用。
- 暖调闲聚中看向圆桌密语互动体：打开 `#roundtable-whispers-panel`，可选择参与者并进入多人群聊。
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

暖调闲聚：

1. 看向旧房间南侧门，提示应为 `按 E 进入暖调闲聚`。
2. 未完成入场券任务时按 E 不转场，门位置显示 `完成以下任务获取入场券` 小浮窗；任务进度显示 3 次日常对话、1 次约会、1 次睡觉、1 件礼物和 1 件造梦家具，完成项为绿色，未完成项为灰色，此时提示切换为 `按 E 关闭`，按 E 或触摸提示后关闭浮窗并恢复进入提示。
3. 完成全部入场券任务后按 E 黑屏转场进入暖调闲聚，旧卧室/造梦空间组隐藏，玩家和芙提雅都出现在酒吧地图内。
4. 酒吧内 WASD 可移动，高物体阻挡；低台阶、低平台和出口楼梯不会把玩家或芙提雅卡住。
5. 酒吧内接近芙提雅仍可按 F 对话。
6. 酒吧内看向出口区域提示 `按 E 返回卧室`，按 E 黑屏回到旧房间南侧门附近。
7. 返回卧室后，购物终端、礼物收藏柜、造梦门、书桌约会、睡觉、换装、挂画仍可正常触发。
8. 酒吧内看向 `X=-4.0~4.0, Y=0.0~4.5, Z=32.5` 舞台平面，提示 `按 E 观看跳舞`，按 E 打开 `#dance-panel`。
9. 在舞曲选择中导入本地 `.vmd`，可选导入音频并选择芙提雅模型；点击开始后浮层关闭，玩家仍可 WASD 移动和转动视角，芙提雅从 `X=0, Z=35.6` 且脚底目标 Y 为 `DANCE_STAGE_Y_OFFSET` 的位置开始播放 VMD。
10. 舞蹈期间看向出口时 `按 E 返回宿舍` 灰色不可点击，按 E 不返回，也不触发提示星光；VMD 结束时音频停止，并为“霓裳羽衣”计入 1 次完整观看。
11. VMD 结束后显示绿色 `1 再来一次` 和粉色 `2 喝彩谢幕`；按 1 或点左侧按钮重播，按 2、点右侧按钮或等待 5 秒后结束舞蹈流程，移除舞台 Y 偏移并恢复角色自由行动。
12. 酒吧内看向 `X=-1.0~1.0, Y=0.67~1.07, Z=46.5~49.1` 邀请体，提示 `按 E 邀请其他人入场`，按 E 打开 `#bar-guest-panel`。
13. 在邀请面板中可直接选择内置芬妮入场；首次邀请芬妮后会写入内置访客保留状态，退出并重新进入酒吧、刷新页面或导入导出存档后仍会自动加载；导入 PMX 和人格文档后可临时邀请，保存后加入候选列表，删除按钮可删除自定义角色但不能删除芬妮。
14. 每次进入酒吧时，琴诺应自动出现在 `X=7.2, Y=0.668, Z=42.01`，不会移动；玩家接近时身体和头部看向玩家镜头，离开判定范围后身体平滑转回初始朝向，按 F 可互动，对话框和发送按钮为紫色主题，并随机播放一段 `Cherno_welcome_*.wav` 欢迎语。
15. 酒吧内看向 `X=6.8~8.3, Y=0.65~2.85, Z=40~45` 调酒挑战体，提示 `按 E 请琴诺帮忙调酒`，按 E 打开 `#bartending-challenge-panel` 并释放控制模式。
16. 调酒挑战未配置 API Key 时，点击 `开始特调` 显示设置提示，不跳转、不弹 alert、不进入卡死状态。
17. 调酒挑战中选择预置材料或填写自定义材料后开始特调；LLM 返回前按钮禁用并显示加载动画。
18. 调酒挑战 LLM 输出非法、空输出或 API 请求失败时，应使用本地 fallback 结果继续显示杯前观察。
19. 饮用前只显示外观和气味；点击 `闭眼喝下` 后才揭示 HP 变化、是否黑暗料理、酒名、约 100 字过程和 tags。
20. 游戏胜利或失败进入结算阶段时，右栏三类材料组合板隐藏，`#bartending-end-panel` 显示在 `#bartending-reveal-panel` 上方。
21. 点击 `这杯先放过我` 不改变 HP、不增加已饮用杯数，可无限跳过；本杯仍会揭示调制结果，黑暗料理显示 `危险回避`，正常饮品显示 `错失良机`，再点 `下一杯` 回到材料选择。
22. HP ≤ 0 时显示失败文案；喝满 8 杯且 HP > 0 时显示成功文案，并为“安全撤离”计入 1 次胜利；点击重新挑战重置为 HP 100。
23. 调酒挑战进行中点击右上关闭或按 Escape，会关闭浮层、丢弃本局状态、恢复控制模式；请求仍在进行时应中断或忽略结果。
24. 酒吧内看向 `X=-5.3~-7.9, Y=0.5~0.8, Z=36.7~39.4` 或 `Z=42.6~45.2` 圆桌密语互动体，提示 `按 E 加入圆桌密语`，按 E 打开 `#roundtable-whispers-panel` 并释放控制模式。
25. 圆桌密语邀请界面应显示芙提雅、琴诺、芬妮和当前已加载的自定义访客；可勾选角色自动接话和 idle 主动搭话，并调整玩家未回话时连续互聊上限。
26. 点击 `组建群聊` 会进入空白临时群聊窗口；点击 `继续对话` 会先迁移上次临时窗口内容，再打开完整群聊上下文。
27. 当前圆桌侧栏提供圆形 `+` 添加成员、`-` 删除成员、`↩` 重新组局按钮；点击 `+` 在按钮上方打开成员邀请小浮窗，点击成员卡片加入；点击 `-` 进入移除模式，每个当前成员卡片显示红色圆形 `-`，点击后移出对应成员。
28. 圆桌成员头像可点击并把 `@成员名` 补入输入框；输入框内键入 `@` 会在上方打开成员选择浮窗，点击后同样补齐 `@成员名`。
29. 圆桌密语聊天界面中，玩家发送消息后只发起中央调度队列；`@角色名`、`@全体`、包含多个成员名或“大家/各位/都说说”等全体关键词时，被点名成员会按队列逐个回复。
30. bot 不会直接 `@大家`，bot 的 `@` 前缀只指向分析员或某个具体成员；bot 开头 `@某人` 前缀默认不触发对方，开启设置后可触发；正文中再次提到其他成员名字会确定性触发对方排队回复；bot-to-bot follow-up 概率高于初版，但达到玩家设定互聊上限后下一条 bot 消息应把话题交还给分析员，并进入 `playerFloorLock`。
31. 窄屏下圆桌标题栏不显示副标题，“当前圆桌”默认压缩为一行小头像和小型 `↩`；点击标题或空白区域后展开角色卡片、`+` 和 `-`。
32. 圆桌密语任意时刻最多 1 个 LLM 请求；快速连续输入不会积压大量低优先级请求；429/rate limit 后状态栏提示放慢语速。
33. 圆桌密语未配置 API Key 时不会卡死，会插入本地系统提示；LLM 输出非法、敌对争风吃醋内容或 JSON 解析失败时使用本地 fallback。
34. 关闭圆桌密语或离开酒吧时，请求队列清空，正在进行的请求被中断；返回卧室后不会继续后台调用 LLM。
35. 刷新页面后圆桌密语可恢复最近完整消息、topicSummary 和开关设置；导出/导入存档包含 `roundtableWhispers` 并按消息 id 去重合并。
36. 访客只在酒吧内移动和对话；离开酒吧后临时访客卸载，已保存访客和已保留的内置访客下次进入酒吧自动加载。
37. 酒吧内芙提雅对话和访客对话都显示在历史面板的“暖调闲聚”页；芙提雅在卧室/造梦空间的对话仍显示在“日常对话”页。圆桌密语使用独立存储，不污染访客一对一对话上下文。
38. 导出生成 `.zip`，包含 `save.json`、圆桌密语数据与自定义访客资源；导入 ZIP 后可恢复自定义访客和圆桌历史并在酒吧重新加载；调酒挑战不新增导出字段。

知识库：

1. 点击右上角系统设置应释放控制模式；关闭设置后派发 `fritia-overlay-closed` 并恢复控制模式。
2. 宽屏设置页左侧显示“大模型设置 / 操作设置 / 知识库”分组，右侧显示详情；窄屏先显示分组列表，点击分组后进入详情并可返回。
3. 大模型设置保留 `API Key / Base URL / 模型名称`，保存后仍写入 `fritia-settings`；API 入口按钮可新标签打开 DeepSeek、MiMO、Qwen 千问和 Kimi 控制台。
4. 操作设置可调鼠标、触控和本地化灵敏度；本地化灵敏度默认 `0.50x`，手动调为 `1.00x` 且模型名包含 `deepseek` 时，大模型设置页显示亲密模式开关。
5. 亲密模式开启后，只有日常对话、约会和圆桌密语会以额外 user 消息追加 `src/_queries/deepseek_special_prompt.txt`；本地化灵敏度不为 `1.00x`、模型名不是 DeepSeek 或其他 LLM 玩法均不得追加该提示。
6. 在知识库页创建知识库后，可启用/停用该知识库；启用状态写入 `fritia_knowledge_base_state`。
7. 上传 `.txt` 和 `.md` 文件后显示构建进度，文件列表出现新文件，分块预览可查看标题路径和片段正文。
8. 窄屏知识库页中，文件列表和详细分块默认折叠，点击对应面板可展开/收起。
9. 空文件、非 txt/md 文件、超过限制的大文件应显示失败提示，不留下不可用半成品。
10. 删除文件会确认并重建索引；删除知识库会确认并清空其文件、分块和索引。
11. 启用知识库后，日常对话、约会开场/发送、圆桌密语会自动检索相关分块并注入本轮 LLM 请求；未启用知识库时原行为不变。
12. 知识库参考资料不应出现在历史面板、日常/约会历史或圆桌消息列表中。
13. 导出 ZIP 后重新导入，知识库、文件、分块和启用状态可恢复，并能继续检索；导入旧存档缺少 `knowledgeBase` 字段时不报错。

旧功能回归：

1. 购物终端可打开礼物系统。
2. 礼物收藏柜可打开收藏列表。
3. 日常对话、约会、换装、睡觉、挂画仍可用。
4. “华丽入场”进度应跟随入场券任务完成数变化；“霓裳羽衣”在每次 VMD 完整结束后计数；“安全撤离”在调酒挑战胜利时计数。
5. 成就解锁 toast 位于最顶层并播放音效。
6. 导出再导入不破坏旧功能。

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
