# `src/_ui/` — Otome UI 美术资源

本目录存放「芙提雅 ONLINE NEXT」UI 重制（暖色少女 Otome 风格）所使用的界面美术资源。
详见仓库根目录 `UI_STYLE.md`。

## 来源与许可

全部资源均为本项目**原创手绘 SVG**（无外部下载位图），与游戏代码同许可（见仓库根 `LICENSE`）。
选择纯 SVG 的原因：矢量可缩放、可通过 `currentColor` 主题化、体积小、离线与 GitHub Pages 友好、无第三方版权风险。

## 资源清单

| 文件 | 用途 |
| --- | --- |
| `frame_corner.svg` | 浮层四角的香槟金角标花纹（CSS 翻转复用四角） |
| `divider_heart.svg` | 区块标题/分区的爱心金线分隔 |
| `glow_soft.svg` | 暖色柔光 bloom，置于标题/强调点之后 |
| `bokeh.svg` | 共享 overlay 背景的暖色柔焦光斑底 |
| `panel_grain.svg` | 极淡纸纹噪点叠层，给亮面浮层一点触感 |
| `petal.svg` | 环境飘落花瓣装饰 |
| `spark.svg` | 按键提示「点燃」效果的四角星火花 sprite |
| `heart_motif.svg` | 通用玫瑰心标记（kicker、列表项、名牌） |
| `icon_close.svg` | 统一关闭按钮图标（`currentColor`） |
| `icon_date / gift / dream / settings / history / wardrobe / terminal / achievement.svg` | 各浮层头部暖色线性图标（主体 `currentColor` + 金/玫瑰点缀） |

## 约定

- 暖色头图标主体使用 `currentColor`，由所在 `.otome-panel__icon` 的色值驱动；金 `#e6c178` / 玫瑰 `#e58aa6` 为固定点缀色。
- 装饰类（角标、分隔、光斑、纸纹）通过 CSS `background-image` 或 `<img>` 引入，避免写死在 JS。
- `src/_logos/dream_*.svg` 等旧图标仍服务于**保持不变**的家具圆形浮层 `#dream-object-controls`，不要替换。
