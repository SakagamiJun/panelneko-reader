<div align="center">
  <img src="./build/appicon.png" width="128" alt="PanelNeko Logo" />
  <h1>PANELNEKO READER</h1>
  <p><strong>A Modern, Minimalist, and High-Performance Offline Manga Reader</strong></p>
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
    <a href="./README.zh-CN.md">中文</a> | <b>English</b>
  </p>
</div>

---

PanelNeko is a cross-platform desktop application engineered exclusively for local manga, comics, and artbooks. Built with Go, Wails v2, and React, it delivers a premium, zero-distraction reading experience wrapped in a cutting-edge glassmorphism aesthetic.

<div align="center">
  <img src="./Design.webp" alt="Application Interface" width="100%" />
</div>

## CORE CAPABILITIES

PanelNeko strips away unnecessary bloat in favor of native speed, extreme focus, and modern design principles.

* **Dual Reading Modes**
  Choose between continuous vertical scroll (Webtoon style) with smart pre-caching, or traditional side-by-side paged layouts.
* **Direct Archive Access**
  Natively unpacks and renders local chapter folders and `.zip` / `.cbz` archives without manual extraction.
* **Intelligent State Management**
  Powered by an embedded SQLite engine, the application automatically tracks and restores your exact reading progress on a per-book basis.
* **Fluid Interface**
  A cutting-edge UI featuring glassmorphism elements, adaptive system dark/light modes, and seamless micro-animations.
* **Global Support**
  Full internationalization including English, Simplified Chinese, and Japanese.

## TECHNICAL FOUNDATION

Built on a modern stack designed for speed and maintainability:

* **Core Backend:** [Go](https://go.dev/) + [Wails v2](https://wails.io/)
* **Database:** [SQLite](https://www.sqlite.org/) (via `go-sqlite3`)
* **Frontend Framework:** [React](https://reactjs.org/) + [TypeScript](https://www.typescriptlang.org/)
* **State & Data Fetching:** [TanStack Query](https://tanstack.com/query/latest)
* **Design System:** [Tailwind CSS](https://tailwindcss.com/)
* **Build Pipeline:** [Vite](https://vitejs.dev/)

## INSTALLATION & DEVELOPMENT

### Environment Requirements

* [Go](https://go.dev/doc/install) (1.21 or later)
* [Node.js](https://nodejs.org/) & [pnpm](https://pnpm.io/)
* [Wails CLI](https://wails.io/docs/gettingstarted/installation)

### Local Setup

Clone the repository and spin up the development server:

```bash
git clone https://github.com/SakagamiJun/panelneko-reader.git
cd panelneko-reader
wails dev
```

### Production Build

To compile a highly optimized, standalone executable for your target architecture:

```bash
wails build
```

Compiled binaries will be generated in the `build/bin` directory.

## ACKNOWLEDGEMENTS

* [Wails](https://wails.io/) - For the exceptional bridge connecting Go and Web technologies.
* [shadcn/ui](https://ui.shadcn.com/) - For the architectural inspiration behind the UI components.

## LICENSE

Distributed under the MIT License. See [LICENSE](LICENSE) for more information.
