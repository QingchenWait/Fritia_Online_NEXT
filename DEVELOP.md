# DEVELOP.md — 芙提雅 Online NEXT 开发文档

## 项目概述

基于 Three.js 的静态网页 3D 角色互动应用，渲染 PMX 格式的芙提雅（Fritia）角色模型，
支持角色自动行为（走动、坐下、眨眼）、第一人称房间漫游、LLM 对话、换装等功能。

---

## 文件结构

```
fritia_online_v2/
├── index.html                    # 入口 HTML，包含所有 UI 元素
├── css/
│   └── style.css                 # 全局样式
├── js/
│   ├── main.js                   # 应用入口，初始化流程 & 主循环
│   ├── scene.js                  # Three.js 场景、相机、灯光、渲染器
│   ├── room.js                   # 房间几何体、家具、碰撞体、路径点
│   ├── character.js              # PMX 角色加载、材质转换、骨骼动画、状态机
│   ├── controls.js               # 第一人称控制器 & 移动端触摸支持
│   ├── dialogue.js               # LLM 对话系统（OpenAI 兼容 API 流式传输）
│   └── settings.js               # 用户设置持久化（localStorage）
├── src/
│   ├── _fritia_3d_model/         # 默认模型：毛绒派对
│   ├── _fritia_alterable_models/ # 可换装模型（4 套）
│   │   ├── sweety_straw/         # 草莓甜心
│   │   ├── cyan_leaf/            # 青叶密裹
│   │   ├── pool_guard/           # 泳池护卫
│   │   └── small_king/           # 国主驾到
│   └── _voices/                  # 语音文件（startup_*.wav）
├── package.json
└── LICENSE
```

---

## 模块功能详解

### `js/main.js` — 应用入口

| 功能 | 说明 |
|------|------|
| `init()` | 异步初始化流程：场景 → 房间 → 角色 → 控制 → 对话 → UI |
| `animate()` | 主渲染循环（requestAnimationFrame），更新控制、角色、渲染 |
| `onKeyDown()` | 全局键盘事件：F 交互、E 换画/换装、ESC 退出 |
| `initPainting()` | 挂画上传与 localStorage 持久化 |
| `openModelSelector()` / `closeModelSelector()` | 换装面板 UI |
| `selectModel()` | 调用 `swapModel()` 切换角色模型 |
| `playStartupVoice()` | 首次交互时播放随机语音 |

### `js/scene.js` — 场景初始化

| 元素 | 配置 |
|------|------|
| 渲染器 | WebGLRenderer, PCFSoftShadowMap, SRGBColorSpace |
| 相机 | PerspectiveCamera(65°), 初始位置 (0, 1.6, 1.5) |
| 环境光 | AmbientLight(0xfff0e0, 0.5) |
| 主光源 | DirectionalLight(0xfff5e6, 0.9), 投射阴影, 2048×2048 shadowMap |
| 台灯 | PointLight(0xffd080, 0.5, 5m), 投射阴影, 512×512 |
| 窗光 | RectAreaLight(0x88bbff, 0.4) |
| 背景 | 0x1a1a2e + 雾效 |

### `js/room.js` — 房间构建

- 6×5m 房间，四面墙 + 天花板 + 地板
- 家具：床（左侧）、书桌 + 椅子（右侧前）、书架（右侧后）、衣柜（右侧后）、窗户（后墙）、挂画（前墙）
- 碰撞系统：所有家具和墙壁生成 AABB 碰撞盒
- 路径点系统：6 个路径点（中心、窗户、门口、书架、床、椅子），其中床和椅子标记为 `isFurniture: true` 用于坐下逻辑

### `js/character.js` — 角色系统（核心模块）

#### PMX 加载与材质转换

- 使用 `MMDLoader` 加载 PMX 模型
- 将原始 PMX 材质转换为 `MeshToonMaterial`（卡通渲染风格）
- 材质转换策略（三种情况）：
  1. **AlphaTest 材质**（有 `alphaTest > 0`）：使用 `alphaTest` 硬边缘裁切，不透明
  2. **半透明材质**（`transparent = true` 或 `opacity < 1`）：启用 alpha blending，`depthWrite = false`，`DoubleSide` 渲染
  3. **不透明材质**：标准不透明渲染
- 头发材质（名称匹配 `hair`/`髪`/`头发`）：使用 `alphaTest` 裁切渲染，双面渲染

#### 骨骼系统

- 骨骼映射表 `BONE_MAP`：支持日文/英文骨骼名
- 支持的骨骼：中心、脊柱×2、头、左右肩、左右肩C、左右臂、左右肘、左右腿、左右膝、左右踝
- 每帧调用 `forceUpdate()` 强制更新骨骼矩阵

#### 角色状态机

| 状态 | 说明 |
|------|------|
| `IDLE` | 静止站立，呼吸动画，随机时间后切换到走路 |
| `WALKING` | 沿路径点行走，步行周期动画，碰撞检测 |
| `TURNING_TO_SIT` | 转身面向家具（0.8s） |
| `STAND_TO_SIT` | 站立→坐下姿态过渡（1.2s） |
| `SITTING` | 坐姿静止，呼吸动画，随机时间后起立 |
| `SIT_TO_STAND` | 坐下→站立过渡（1.2s） |
| `WAVING` | 挥手动画（首次点击时触发，2.5s） |
| `INTERACTING` | 对话模式：头部追踪玩家位置 |

#### 睡眠模式

- 触发：准星对准床按 E（通过 `isLookingAtBed()` 射线检测 `bedMesh`）
- 进入：`fadeToBlack()` → 保存相机状态 → 移动角色到床位置 → `applySleepingPose()` → 闭眼（`blinkIndex = 1.0`）→ 相机移到床边（近距离躺姿视角）→ `fadeFromBlack()`
- 退出：`fadeToBlack()` → 恢复相机状态 → 重置角色位置和姿态 → `applyIdlePose()` → 睁眼 → `fadeFromBlack()`
- 睡眠中：WASD 移动禁用（`controlsModule.update()` 跳过），仅允许鼠标视角旋转
- 睡眠姿态：脊柱大幅后仰 + 侧倾，双腿弯曲，头部侧偏，模拟侧躺

#### Morph Target

- 眨眼：搜索 `まばたき` / `blink` / `眨眼`，周期 2~6s 随机
- 微笑：搜索 `笑い` / `微笑み` / `smile` / `にっこり`，默认强度 0.3

### `js/controls.js` — 第一人称控制

- `PointerLockControls`：点击锁定鼠标，ESC 解锁
- WASD 移动 + 碰撞检测（0.25m 半径球体）
- 移动端支持：虚拟摇杆 + 触摸视角控制
- `isNearCharacter()`：距离判定（2.5m 阈值）

### `js/dialogue.js` — 对话系统

- OpenAI 兼容 API 流式调用（SSE）
- 系统 Prompt：芙提雅角色设定（可爱女友，简短口语回复）
- 上下文窗口：最近 30 条消息
- 参数：temperature=0.85, max_tokens=200

### `js/settings.js` — 设置管理

- 持久化存储：`localStorage` key = `fritia-settings`
- 配置项：`apiKey`, `baseUrl`, `model`
- 默认值：OpenAI API, gpt-4o-mini

---

## 技术栈

| 组件 | 版本/技术 |
|------|-----------|
| 渲染引擎 | Three.js r169 (CDN importmap) |
| 模型格式 | PMX (MikuMikuDance) |
| 加载器 | MMDLoader (three/addons) |
| 渲染风格 | MeshToonMaterial (卡通渲染) |
| 对话 API | OpenAI 兼容 (流式 SSE) |
| 部署方式 | 纯静态网页，无需后端 |

---

## 关键设计决策

### 材质转换策略

PMX 原始材质 → MeshToonMaterial 转换时，区分三种透明模式：
1. **AlphaTest**：原始 `alphaTest > 0` 时使用，适合树叶/蕾丝等镂空材质
2. **Alpha Blending**：原始 `transparent = true` 或 `opacity < 1` 时使用，适合头发等半透明材质
3. **不透明**：其他情况

头发半透明修复（2026-06-17）：
- 原 bug：MMDLoader 不设置 `transparent = true`（头发材质 #24 `头发`、#25 `头发1` 均为 `transparent: false, opacity: 1, alphaTest: 0`），导致头发纹理 alpha 通道未被使用
- 修复：通过材质名匹配（`/hair|髪|头发/i`）识别头发材质，使用 `alphaTest` 裁切渲染（PMX 头发纹理的 alpha 通道是二值的：头发丝 = 1.0，空隙 = 0.0）
- 修复2：添加 `setupTransparentShadows(mesh)` 函数，为使用 `alphaTest` 的材质创建自定义深度着色器（`customDepthMaterial`），使阴影贴图尊重 alpha 通道
- 修复3：自定义深度着色器使用 `#define USE_SKINNING` + Three.js 的 `skinning_pars_vertex` 实现骨骼动画支持
- 注意：Three.js 的 `depthPacking` 和 `skinning` 不是 ShaderMaterial 的属性，需要通过着色器 define 和 uniforms 手动处理

### 相机与交互

- 固定高度 1.6m（第一人称视角）
- PointerLock 控制，ESC 退出交互模式
- 距离阈值 2.5m 触发交互提示

### 模型自动行为

- 基于计时器的状态机，随机时间触发状态切换
- 坐下冷却 5s，防止反复坐下
- 骨骼动画：手动计算 rotation，非动画剪辑

---

## 构建与运行

```bash
# 本地开发（需要本地 HTTP 服务器，因为 ES modules）
npx serve .
# 或
python -m http.server 8000

# 打开 http://localhost:8000
```

无需构建步骤，直接浏览器打开（需 HTTP 服务器支持 importmap）。
