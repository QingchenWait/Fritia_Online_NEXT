# 造梦系统开发 Agent 工作流

本项目是纯静态 Three.js 网页游戏。造梦系统必须继续使用浏览器 `localStorage`、现有导入/导出 JSON 机制，以及设置面板中的 OpenAI 兼容 `chat/completions` 配置；不得新增后端服务或独立 API Key。

当前 Codex 环境如果支持 subagent，可将下面阶段拆给互不冲突的 worker/explorer；若不支持，则在同一 Codex 会话中按顺序执行这些角色化阶段。任何阶段都不得使用 `eval`、`new Function` 或让 LLM 输出可执行 JavaScript。

## 1. Game Design Architect

- 审阅现有玩法、房间交互、数据金、好感度、礼物、约会、换装、睡觉、挂画、成就、历史记录和导入导出。
- 输出最小可行技术方案，确认新模式不会破坏旧功能。
- 明确造梦系统成本：家具成功部署后才扣除 500 数据金；任何失败路径不扣钱。

## 2. Three.js Scene Engineer

- 在旧房间右侧（`+X`）创建造梦房间，面积约为旧房间 2 倍。
- 用墙体分段实现新旧房间连接门洞，确保玩家碰撞体不会堵住门。
- 创建新房间地板、墙、天花板、窗户、连接门视觉元素、造梦终端、房间 bounds、门口清空区、colliders 和 waypoints。
- 确保动态家具生成后拥有 mesh/group、AABB collider、交互中心和角色 waypoint。

## 3. LLM Contract Engineer

- 设计严格 JSON 协议，只允许 LLM 输出结构化家具规格，不允许输出代码或外部贴图 URL。
- 实现 prompt、SSE/非 SSE 响应解析、JSON 提取、schema 校验、字段 clamp、颜色校验、材质 preset 映射、失败错误提示。
- 家具 LLM 调用必须复用 `settings.js` 中的 `apiKey/baseUrl/model`。
- 家具相关恋爱台词调用必须带冷却，同一家具默认至少 10 分钟现实时间。

## 4. UI/UX Engineer

- 实现 `#dream-terminal-panel` 的“家具布置”浮层：家具描述、多行输入、摆放位置、制造按钮、阶段进度、成功/失败提示。
- 实现 `#dream-furniture-editor-panel` 的家具管理浮层：重命名、移动、旋转、重置、删除。
- 打开浮层前释放控制模式；关闭浮层时派发 `fritia-overlay-closed`。
- 新浮层 id 必须加入 `controls.js` overlay 管理列表。
- 移动端输入框字号不得低于 16px。

## 5. Game State & Persistence Engineer

- 使用 `fritia_dream_furniture` 存储家具列表。
- 每条家具记录包含 `id/name/category/description/spec/pose/createdAt/gameDateTime/lastDialogueAt`。
- 页面刷新后自动恢复家具；导出 JSON 时包含家具；导入 JSON 时按 id 去重合并，坏家具跳过。
- 新增字段或 localStorage key 必须同步记录到 `DEVELOP.md`。

## 6. Character Behavior Engineer

- 增加最小导航作用域接口，支持旧房间和造梦房间 waypoints/colliders/bounds 切换。
- 玩家进入造梦房间时，芙提雅切换到造梦房间并只在造梦房间内移动；玩家回旧房间时切回旧房间。
- 动态家具 waypoint 只在造梦房间作用域中生效。
- 到达动态家具 waypoint 时派发 `fritia-dream-furniture-visited`，由造梦系统按冷却生成轻量恋爱台词。
- 保持“小小老师”等特殊模型禁用坐下/睡觉的既有规则。

## 7. QA Reviewer

- 检查 JavaScript 语法、ES module 导入、Pointer Lock 恢复、移动端浮层、旧房交互、家具失败路径和存档兼容。
- 手动测试至少覆盖：未配置 API Key、余额不足、LLM 输出非法、生成成功扣费、家具刷新恢复、导出导入、家具管理、房间切换、动态台词冷却。
- `DEVELOP.md` 必须在完成时同步更新新增模块、DOM id、localStorage key、导入导出字段、事件名和测试方法。
