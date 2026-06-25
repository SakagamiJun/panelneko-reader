# PanelNeko Reader (本地漫画阅读器)
[English](./README.md)
---------------------

PanelNeko Reader 是一款简单、轻量的跨平台桌面本地漫画与画集阅读器。它致力于提供纯粹、极简且无广告的本地阅读体验，开箱即用，无需复杂的配置。本项目采用 Go、Wails v2 和 React 构建，为您提供高端、丝滑的离线漫画阅读体验与现代化的磨砂玻璃美学设计。

![应用展示](./Design.webp)

## 功能特性

- **集成阅读器**：
  - **卷轴模式**：连续垂直滚动阅读（条漫风格），支持智能后台预缓存页。
  - **翻页模式**：传统的左右翻页阅读。
  - 支持直接打开本地漫画文件夹以及包含漫画图片的 `.zip` / `.cbz` 压缩包。
  - 自动记录并复原每本漫画的阅读历史与页码进度。
- **本地书架**：只需在设置中配置您的“漫画库目录”，应用便可自动扫描其中的漫画与压缩包，并通过嵌入式 SQLite 数据库保存阅读进度状态。
- **精致美学**：使用现代化磨砂玻璃滤镜、自适应系统暗黑/浅色模式、流畅的微交互动效。
- **多语言支持**：完整支持英文、简体中文和日文。

## 技术栈

- **后端**: [Go](https://go.dev/) + [Wails v2](https://wails.io/) (桌面应用框架)
- **数据库**: [SQLite](https://www.sqlite.org/) (通过 `go-sqlite3`)
- **前端**: [React](https://reactjs.org/) + [TypeScript](https://www.typescriptlang.org/)
- **状态管理**: [TanStack Query](https://tanstack.com/query/latest)
- **样式**: [Tailwind CSS](https://tailwindcss.com/)
- **构建工具**: [Vite](https://vitejs.dev/)

## 快速入门

### 环境准备

- [Go](https://go.dev/doc/install) (1.21 或更高版本)
- [Node.js](https://nodejs.org/) & [pnpm](https://pnpm.io/)
- [Wails CLI](https://wails.io/docs/gettingstarted/installation)

### 开发模式

1. 克隆仓库：
   ```bash
   git clone https://github.com/sakagamijun/panelneko-reader.git
   cd panelneko-reader
   ```

2. 启动开发环境：
   ```bash
   wails dev
   ```

### 生产构建

编译适用于您当前操作系统的独立可执行文件：

```bash
wails build
```
编译产物将位于 `build/bin` 目录下。

## 鸣谢

- [Wails](https://wails.io/)：感谢它为 Go 和 Web 技术之间搭建的优秀桥梁。
- [shadcn/ui](https://ui.shadcn.com/)：提供了出色的 UI 设计灵感和基础组件。
- 感谢所有支持本项目开发的开源库。

## 开源协议

本项目采用 MIT 协议开源 - 详情请参阅 [LICENSE](LICENSE) 文件。
