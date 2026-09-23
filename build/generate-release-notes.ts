import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

export interface ReleaseNotesOptions {
  tag: string;
  outputPath?: string;
  changelogPath?: string;
  repo?: string;
}

export function extractChangelogSection(changelogContent: string, version: string): string {
  const normalizedVersion = version.startsWith('v') ? version.slice(1) : version;
  const escapedVersion = normalizedVersion.replace(/\./g, '\\.');

  // 匹配对应版本的二级标题行 (如 ## v0.10.0 或 ## 0.10.0)
  const headingRegex = new RegExp(`^##\\s+v?${escapedVersion}(?:\\b|\\s|$)`, 'm');
  const match = headingRegex.exec(changelogContent);

  if (!match || match.index === undefined) {
    throw new Error(`CHANGELOG.md 中未找到版本 ${version} 的更新记录`);
  }

  const startIndex = match.index + match[0].length;
  const remaining = changelogContent.slice(startIndex);

  // 查找下一个二级标题 ##
  const nextHeadingMatch = remaining.match(/^##\s+/m);
  const sectionContent =
    nextHeadingMatch && nextHeadingMatch.index !== undefined
      ? remaining.slice(0, nextHeadingMatch.index)
      : remaining;

  // 去除章节末尾可能用于分隔版本的多余水平分割线 (---)
  const cleaned = sectionContent.replace(/\n*---+\s*$/, '').trim();
  if (!cleaned) {
    throw new Error(`CHANGELOG.md 中未找到版本 ${version} 的更新记录`);
  }

  return cleaned;
}

export function generateDownloadTable(tag: string, repo: string = 'SakagamiJun/panelneko-reader'): string {
  const normalizedTag = tag.startsWith('v') ? tag : `v${tag}`;
  const downloadBase = `https://github.com/${repo}/releases/download/${normalizedTag}`;

  return `### 软件下载 (Downloads)

请根据您的操作系统与硬件芯片架构选择对应版本：

| 操作系统 / 芯片架构 | 安装包类型 | 下载地址 |
| :--- | :--- | :--- |
| ![macOS Apple Silicon](https://img.shields.io/badge/macOS-Apple_Silicon-000000?style=flat-square&logo=apple&logoColor=white) | 便携应用包 (.zip) | [panelneko-reader-macos-arm64.zip](${downloadBase}/panelneko-reader-macos-arm64.zip) |
| ![macOS Intel](https://img.shields.io/badge/macOS-Intel_x64-0071C5?style=flat-square&logo=apple&logoColor=white) | 便携应用包 (.zip) | [panelneko-reader-macos-amd64.zip](${downloadBase}/panelneko-reader-macos-amd64.zip) |
| ![Windows x64](https://img.shields.io/badge/Windows-x64-0078D6?style=flat-square&logo=windows&logoColor=white) | 绿色压缩包 (.zip) | [panelneko-reader-windows-amd64.zip](${downloadBase}/panelneko-reader-windows-amd64.zip) |
| ![Linux x64](https://img.shields.io/badge/Linux-x64-FCC624?style=flat-square&logo=linux&logoColor=black) | 归档包 (.tar.gz) | [panelneko-reader-linux-amd64.tar.gz](${downloadBase}/panelneko-reader-linux-amd64.tar.gz) |

> 提示：macOS 用户亦可通过 Homebrew 进行安装：\`brew install sakagamijun/tap/panelneko\``;
}

export function buildReleaseNotes(options: ReleaseNotesOptions): string {
  const {
    tag,
    changelogPath = resolve(process.cwd(), 'CHANGELOG.md'),
    repo = process.env.GITHUB_REPOSITORY || 'SakagamiJun/panelneko-reader',
  } = options;

  if (!existsSync(changelogPath)) {
    throw new Error(`未找到更新日志文件: ${changelogPath}`);
  }

  const changelogContent = readFileSync(changelogPath, 'utf-8');
  const sectionContent = extractChangelogSection(changelogContent, tag);
  const downloadTable = generateDownloadTable(tag, repo);

  return `## 更新内容\n\n${sectionContent}\n\n---\n\n${downloadTable}\n`;
}

// 命令行直接执行入口
if (import.meta.main) {
  const [cliTag, cliOutput = 'release-notes.md'] = process.argv.slice(2);

  if (!cliTag) {
    console.error('用法: bun build/generate-release-notes.ts <tag> [outputPath]');
    process.exit(1);
  }

  try {
    const finalContent = buildReleaseNotes({
      tag: cliTag,
      outputPath: cliOutput,
    });

    writeFileSync(resolve(process.cwd(), cliOutput), finalContent, 'utf-8');
    console.log(`成功生成发布说明文档: ${cliOutput}`);
  } catch (error) {
    console.error(`发布流程拦截: ${(error as Error).message}`);
    process.exit(1);
  }
}
