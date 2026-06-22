<div align="center">

# 芙提雅 Online NEXT

*_✨ [**芙提雅 AI Bot**](https://qingchenwait.github.io/fritia_online_guide) 次世代进化版&emsp;/&emsp;AI 驱动的 3D 恋爱养成游戏 ✨_*

[![Powered by Three.js](https://img.shields.io/badge/Powered_by-Three.js-blue.svg)](https://threejs.org/)
![Coding by GPT & MiMO](https://img.shields.io/badge/Coding_by-GPT_&_MiMO-orange.svg)
[![GitHub](https://img.shields.io/badge/作者-青尘工作室-cyan)](https://space.bilibili.com/385556208/)

*_💖 对你的爱，跨越空间 💖_*

<img src="./src/sample_screenshot.png" width="80%">

</div>

## 核心功能

- **🎮 3D 小老师全面进化**：芙提雅 ONLINE NEXT，现已升级为第一人称 3D 互动世界！互动、对话、约会，与小老师度过难忘的恋爱时光吧 ~
- **💕 LLM 驱动的恋爱日常**：聊天对话、约会赠礼、内置小游戏，事件和进程均由 LLM 即兴生成。每次回应，都是专属于你的剧情展开。
- **🌙 造梦系统自由造物**：在造梦空间里，使用 LLM 自由生成家具、移动位置、修改样式，自定义你和小老师的爱巢！
- **🍸 暖调闲聚全新地图**：尘白宿舍场景复刻，更多天启者入场互动，一起聊出千变万化的恋爱喜剧。
- **🏆 成就与存档**：人格数据与知识库全面载入游戏，支持导入更多的人物、知识和数据，可一键导入导出备份，随时跨设备游玩。

## 游玩方法

### 方法一：网页版在线游玩

打开下面的网址，等待加载完成后即可游玩：

[https://game.qingchen.de](https://game.qingchen.de)

**注意**：即使在同一台设备中，也不能换浏览器进行游戏，因为**存档数据只保存在浏览器内部**！

开始游戏前，请先点击右上角 [设置] 按钮，配置本游戏中使用的 LLM 大模型：

- 需要**自行获取大模型 API**，并充值额度。可使用 [DeepSeek](https://platform.deepseek.com/api_keys)、[MiMO](https://platform.xiaomimimo.com/console/api-keys) 等模型。
- 在设置中，填写 OpenAI 兼容 API 的 `API Key`、`Base URL` 和模型名称。

### 方法二：下载客户端

为了方便大家本地部署，我们将源码打包成了客户端。

可以在 [GitHub Release](https://github.com/QingchenWait/Fritia_Online_NEXT/releases) 页面查看最新版本并下载。

**注意**：客户端的版本更新速度，可能落后于网页版。如果希望游玩最新版本，建议优先选择网页版，或下载最新源码本地部署。

### 方法三：下载源码本地部署

如果希望在你的本地电脑中，部署芙提雅 ONLINE NEXT，请参考以下教程，配置本地网页服务器并运行源码：

#### Windows

1. 安装 Node.js LTS：
   https://nodejs.org/

2. 下载源码：

   - 如果你的本地电脑里安装了 Git，可以运行：

     ```bash
     git clone https://github.com/QingChenWait/Fritia_Online_NEXT.git
     cd Fritia_Online_NEXT
     ```

   - 如果没有安装 Git，也可以在 GitHub 页面点击 `Code` -> `Download ZIP`，解压后进入项目文件夹。

     随后，打开项目文件夹的**根目录** (可以看到 `index.html`、`README.md` 等文件)，点击鼠标右键，选择 “在终端中打开”。

3. 启动本地服务器：

   ```bash
   npm run start
   ```

4. 浏览器打开：

   ```text
   http://localhost:3000
   ```

#### macOS

1. 安装 Node.js LTS：
   https://nodejs.org/

2. 下载源码：

   - 如果你的本地电脑里安装了 Git，可以打开“终端”运行：

     ```bash
     git clone https://github.com/QingChenWait/Fritia_Online_NEXT.git
     cd Fritia_Online_NEXT
     ```

   - 如果没有安装 Git，也可以在 GitHub 页面点击 `Code` -> `Download ZIP`，解压后进入项目文件夹。

     随后，打开项目文件夹的**根目录** (可以看到 `index.html`、`README.md` 等文件)，在该文件夹中打开终端。

3. 启动本地服务器：

   ```bash
   npm run start
   ```

4. 浏览器打开：

   ```text
   http://localhost:3000
   ```

首次运行 `npm run start` 时，系统可能会提示下载 `serve` 工具，输入 `y` 确认即可。

## 游戏存档备份、导入和导出

游戏数据默认保存在运行游戏的浏览器里面。

**注意**：即使在同一台设备中，也不能换浏览器进行游戏，因为存档数据不会直接跨浏览器保存！

**导出备份**：

1. 点击右上角“导出”按钮。
2. 浏览器会下载一个 `fritia_backup_日期时间.json` 文件。
3. 请把这个文件保存到安全的位置。

**导入备份**：

1. 点击右上角“导入”按钮。
2. 选择之前导出的 `fritia_backup_*.json` 文件。
3. 页面提示导入成功后，建议刷新网页，让设置完整生效。

**注意事项**：

- 不同浏览器、不同设备的本地存档互不共享，需要手动导出和导入。
- **清理浏览器网站数据可能会删除本地存档**，请提前导出备份。
- 导入存档时，礼物记录会增量合并；好感度会保留本地和导入文件中更高的数值。