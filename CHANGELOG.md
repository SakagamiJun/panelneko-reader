# 更新日志 (Changelog)

## v0.11.0

[![macOS](https://img.shields.io/badge/macOS-Supported-000000?style=flat-square&logo=apple&logoColor=white)](https://apple.com)
[![Windows](https://img.shields.io/badge/Windows-Supported-0078D6?style=flat-square&logo=windows&logoColor=white)](https://microsoft.com)
[![Linux](https://img.shields.io/badge/Linux-Supported-FCC624?style=flat-square&logo=linux&logoColor=black)](https://kernel.org)
[![Version](https://img.shields.io/badge/Release-v0.11.0-10B981?style=flat-square)](https://github.com/SakagamiJun/panelneko-reader/releases)

> 本次更新带来全新的多漫画库源体系架构、多档缩略图画质阶梯与磁盘缓存池、重名合并与离线网络源弹性容错降级，并针对全屏沉浸阅读体验进行了深度优化。

### 更新内容

[新增功能]
- 多漫画库源架构：支持添加与管理多个本地或外部存储源，实现基于源 ID 的 SQLite 持久化隔离、复合资源 ID 与多源扫描路由机制。
- 缩略图画质分级与独立缓存：基于 Lanczos 算法实现 High / Medium / Low 三档画质渲染引擎与独立的磁盘持久化缓存池，兼顾画质细腻度与大图库渲染性能。
- 重名合并与来源消重模式：引入重名合并模式（Duplicate Merge Mode），支持同名漫画与合集跨源合并展示并维持本地文件优先；支持同名源路径自动排重与别名自定义。
- 扫库解耦与离线韧性容错：将物理磁盘扫描与库内容查询解耦，实现后台异步重扫；针对离线断连的外部或网络源自动隐藏失效项，并提供平滑的占位与重试降级。
- 离线状态混合通知体系：移除阻挡视线的旧版全局横幅，采用自动退避的浮动 Toast 结合顶栏常驻警告指示器的轻量化设计，兼顾静默防扰与直观状态感知。

[优化改进]
- 库源切换与设置面板演化：顶栏集成极简风格的多源快速切换下拉菜单；设置面板全面重构多源管理，增加画质分段选择器与弹窗关闭延迟重刷防抖机制。
- 三端适配器与国际化闭环：对齐前端 Wails 与 Mock 双适配器及底层 RPC 契约，新增中、英、日三语的完整多源与离线状态本地化字典。

[修复问题]
- 修复 macOS 在沉浸全屏模式下红绿灯按钮间距未动态折叠导致的顶部栏与阅读器左侧留白问题。
- 修复多源环境下合集封面与子项跨源状态污染，以及切换重名合并开关时卡片孤立状态未即时重置的问题。

---

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
