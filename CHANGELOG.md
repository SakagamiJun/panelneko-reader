# 更新日志 (Changelog)

## v0.10.0

[![macOS](https://img.shields.io/badge/macOS-Supported-000000?style=flat-square&logo=apple&logoColor=white)](https://apple.com)
[![Windows](https://img.shields.io/badge/Windows-Supported-0078D6?style=flat-square&logo=windows&logoColor=white)](https://microsoft.com)
[![Linux](https://img.shields.io/badge/Linux-Supported-FCC624?style=flat-square&logo=linux&logoColor=black)](https://kernel.org)
[![Version](https://img.shields.io/badge/Release-v0.10.0-10B981?style=flat-square)](https://github.com/SakagamiJun/panelneko-reader/releases)

> 本次更新聚焦于渲染性能优化、流式缓冲池机制、封面缩略图磁盘缓存以及全局国际化闭环。

### 更新内容

[新增功能]
- 缩略图缓存系统：新增封面缩略图自适应衍生引擎与磁盘持久化缓存池，支持在设置面板中查看占用体积并一键清理缓存。
- 版本更新检查：设置面板新增手动检查更新按钮与应用图标展示，支持启动时静默检查更新并弹出反馈通知。
- 零拷贝流式缓冲池：基于 sync.Pool 实现 64KB 资源流式传输缓冲复用，消除高频翻页时的瞬时内存抖动。

[优化改进]
- 界面组件重构：拆分并精简 MangaCard 与 LibraryGrid 独立组件，增强微交互与单像素边框渲染质感。
- 契约完备性守卫：为 Wails 导出方法、前端 Mock/Wails 适配器以及国际化文案添加编译期与运行时双重反射守卫测试。
- 外部链接引导：关于面板新增 GitHub 仓库跳转与问题反馈入口。

[修复问题]
- 修复阅读器顶部栏、空状态提示以及相对日期的本地化文案回落问题。
- 修复设置面板深层选项在特定语言下的排版溢出与文案未对齐问题。

---

## v0.9.0

[![macOS](https://img.shields.io/badge/macOS-Supported-000000?style=flat-square&logo=apple&logoColor=white)](https://apple.com)
[![Windows](https://img.shields.io/badge/Windows-Supported-0078D6?style=flat-square&logo=windows&logoColor=white)](https://microsoft.com)
[![Linux](https://img.shields.io/badge/Linux-Supported-FCC624?style=flat-square&logo=linux&logoColor=black)](https://kernel.org)
[![Version](https://img.shields.io/badge/Release-v0.9.0-10B981?style=flat-square)](https://github.com/SakagamiJun/panelneko-reader/releases)

> 本次更新集中在 Wails 导出安全收敛与跨平台构建链路稳定化。

### 更新内容

[优化改进]
- 收敛内部服务方法，将 assetHandler 与辅助处理函数转为非导出，保障前端 TypeScript 绑定生成的确定性。
- 升级跨平台 CI 打包配置，优化 Linux WebKitGTK 依赖检测。
