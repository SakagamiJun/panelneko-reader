<div align="center">
  <img src="./build/appicon.png" width="128" alt="PanelNeko Logo" />
  <h1>PANELNEKO READER</h1>
  <p><strong>一款极简、现代且高性能的本地漫画阅读器</strong></p>
  <img alt="Go" src="https://img.shields.io/badge/Go-1.21+-00ADD8?style=flat-square&logo=go" />
  <img alt="Wails" src="https://img.shields.io/badge/Framework-Wails_v2-ED2024?style=flat-square" />
  <img alt="React" src="https://img.shields.io/badge/Frontend-React-61DAFB?style=flat-square&logo=react&logoColor=black" />
  <img alt="i18n" src="https://img.shields.io/badge/i18n-zh--Hans%20%7C%20en%20%7C%20ja-34C759?style=flat-square" />
  <img alt="License" src="https://img.shields.io/badge/License-MIT-blue?style=flat-square" />
  <img alt="Release" src="https://img.shields.io/github/v/release/SakagamiJun/panelneko-reader?style=flat-square&color=F05138" />
  <img alt="Platforms" src="https://img.shields.io/badge/Platforms-macOS%20%7C%20Windows%20%7C%20Linux-lightgray?style=flat-square" />
  <img alt="Size" src="https://img.shields.io/github/repo-size/SakagamiJun/panelneko-reader?style=flat-square" />
  <br /><br />
  <p>
    <b>中文</b> | <a href="./README.md">English</a>
  </p>
</div>

---

PanelNeko 是一款专为本地漫画与画集深度定制的跨平台桌面阅读器。本项目基于 Go、Wails v2 与 React 构建，摒弃了所有繁杂的冗余设计，致力于在极致的性能表现下，为您提供沉浸式的无广告阅读体验以及前沿的磨砂玻璃视觉美学。

<div align="center">
  <img src="./Design.webp" alt="Application Interface" width="100%" />
</div>

## 核心架构与功能

PanelNeko 聚焦于性能优化与视觉表现，将最纯粹的阅读体验交还给用户。

* **双轨渲染引擎**
  提供带有智能预缓存的连续垂直卷轴模式（条漫风格），以及传统的左右翻页模式，随时无缝切换。
* **原生资源解析**
  支持直接加载本地图片目录，同时原生支持实时解压并渲染 `.zip` 与 `.cbz` 压缩包内容，无需提前解压。
* **无感状态同步**
  底层集成 SQLite 高性能引擎，自动且精准地持久化追踪您在每一本漫画中的阅读进度，下次打开瞬间恢复。
* **流体交互界面**
  深度应用现代磨砂玻璃 (Glassmorphism) 材质，支持跟随系统的深色/浅色自适应模式，并融合了极具质感的微交互动效。
* **全球化多语言**
  原生提供英文、简体中文与日文支持。

## 技术底座

建立在旨在提供极速编译与长期可维护性的现代技术栈之上：

* **核心后端:** [Go](https://go.dev/) + [Wails v2](https://wails.io/)
* **本地数据:** [SQLite](https://www.sqlite.org/) (基于 `go-sqlite3`)
* **前端框架:** [React](https://reactjs.org/) + [TypeScript](https://www.typescriptlang.org/)
* **状态调度:** [TanStack Query](https://tanstack.com/query/latest)
* **样式系统:** [Tailwind CSS](https://tailwindcss.com/)
* **构建管道:** [Vite](https://vitejs.dev/)

## 部署与开发

### 环境依赖

* [Go](https://go.dev/doc/install) (1.21 或更高版本)
* [Node.js](https://nodejs.org/) & [pnpm](https://pnpm.io/)
* [Wails CLI](https://wails.io/docs/gettingstarted/installation)

### 唤醒本地环境

克隆代码库并启动热重载开发服务器：

```bash
git clone https://github.com/SakagamiJun/panelneko-reader.git
cd panelneko-reader
wails dev
```

### 生产级编译

针对您的目标系统架构，编译并生成经过深度优化的独立可执行程序：

```bash
wails build
```

编译产出物将被统一放置于 `build/bin` 目录中。

## 鸣谢与致敬

* [Wails](https://wails.io/) - 搭建了连接 Go 底层与现代 Web 渲染层之间令人赞叹的桥梁。
* [shadcn/ui](https://ui.shadcn.com/) - 提供了极具启发的架构级 UI 设计思路。

## 协议

本项目基于 MIT 协议进行开源分发。详见 [LICENSE](LICENSE) 文件获取完整条款。
