import { describe, expect, it } from 'bun:test';
import {
  extractChangelogSection,
  generateDownloadTable,
  buildReleaseNotes,
} from './generate-release-notes';
import { resolve } from 'node:path';

describe('generate-release-notes', () => {
  const sampleChangelog = `
# 更新日志 (Changelog)

## v0.10.0

> 测试摘要内容 0.10.0

### 更新内容
- 功能 A
- 修复 B

---

## v0.9.0

> 测试摘要内容 0.9.0

### 更新内容
- 功能 C
`.trim();

  it('能够准确提取指定版本段落 (带 v 前缀与不带 v 前缀)', () => {
    const section1 = extractChangelogSection(sampleChangelog, 'v0.10.0');
    expect(section1).toContain('测试摘要内容 0.10.0');
    expect(section1).toContain('- 功能 A');
    expect(section1).not.toContain('测试摘要内容 0.9.0');

    const section2 = extractChangelogSection(sampleChangelog, '0.9.0');
    expect(section2).toContain('测试摘要内容 0.9.0');
    expect(section2).toContain('- 功能 C');
  });

  it('当找不到版本时能够抛出错误起到熔断拦截作用', () => {
    expect(() => {
      extractChangelogSection(sampleChangelog, 'v9.9.9');
    }).toThrow('CHANGELOG.md 中未找到版本 v9.9.9 的更新记录');
  });

  it('能正确生成多平台分类下载表格', () => {
    const table = generateDownloadTable('v0.10.0', 'SakagamiJun/panelneko-reader');
    expect(table).toContain('panelneko-reader-macos-arm64.zip');
    expect(table).toContain('panelneko-reader-macos-amd64.zip');
    expect(table).toContain('panelneko-reader-windows-amd64.zip');
    expect(table).toContain('panelneko-reader-linux-amd64.tar.gz');
    expect(table).toContain('https://github.com/SakagamiJun/panelneko-reader/releases/download/v0.10.0');
  });

  it('能够结合真实 CHANGELOG.md 成功组装完整发布文档', () => {
    const realChangelog = resolve(import.meta.dir, '..', 'CHANGELOG.md');
    const result = buildReleaseNotes({
      tag: 'v0.10.0',
      changelogPath: realChangelog,
      repo: 'SakagamiJun/panelneko-reader',
    });

    expect(result).toContain('## 更新内容');
    expect(result).toContain('缩略图缓存系统');
    expect(result).toContain('### 软件下载 (Downloads)');
    expect(result).toContain('panelneko-reader-macos-arm64.zip');
  });
});
