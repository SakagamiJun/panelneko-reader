import { describe, expect, it } from 'bun:test';
import {
  extractChangelogSection,
} from './generate-release-notes';

describe('generate-release-notes - changelog parser', () => {
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

  it('能够准确提取指定版本段落并隔离后续版本内容 (兼容 v 前缀)', () => {
    const section1 = extractChangelogSection(sampleChangelog, 'v0.10.0');
    expect(section1).toContain('测试摘要内容 0.10.0');
    expect(section1).toContain('- 功能 A');
    expect(section1).not.toContain('测试摘要内容 0.9.0');

    const section2 = extractChangelogSection(sampleChangelog, '0.9.0');
    expect(section2).toContain('测试摘要内容 0.9.0');
    expect(section2).toContain('- 功能 C');
  });

  it('当找不到版本或输入畸形时能够抛出错误起到熔断拦截作用', () => {
    expect(() => {
      extractChangelogSection(sampleChangelog, 'v9.9.9');
    }).toThrow('CHANGELOG.md 中未找到版本 v9.9.9 的更新记录');

    expect(() => {
      extractChangelogSection('', 'v0.10.0');
    }).toThrow('CHANGELOG.md 中未找到版本 v0.10.0 的更新记录');
  });
});
