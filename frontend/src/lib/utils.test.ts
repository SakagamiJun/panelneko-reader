import { describe, expect, it } from "vitest";
import { formatBytes, formatBytesPerSecond, formatDateTime, formatSmartDate } from "@/lib/utils";

describe("formatBytes", () => {
  it("formats zero and negative values", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(-5)).toBe("0 B");
  });

  it("formats bytes, kilobytes, megabytes, and gigabytes", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(1048576)).toBe("1.0 MB");
    expect(formatBytes(1572864)).toBe("1.5 MB");
    expect(formatBytes(1073741824)).toBe("1.0 GB");
  });
});

describe("formatBytesPerSecond", () => {
  it("formats zero and negative values", () => {
    expect(formatBytesPerSecond(0)).toBe("0 B/s");
    expect(formatBytesPerSecond(-10)).toBe("0 B/s");
  });

  it("formats bytes, kilobytes, and megabytes", () => {
    expect(formatBytesPerSecond(500)).toBe("500 B/s");
    expect(formatBytesPerSecond(1024)).toBe("1.0 KB/s");
    expect(formatBytesPerSecond(1048576)).toBe("1.0 MB/s");
  });
});

describe("formatDateTime", () => {
  it("returns dash for empty values", () => {
    expect(formatDateTime("")).toBe("—");
  });

  it("returns original text for invalid date string", () => {
    expect(formatDateTime("not-a-date")).toBe("not-a-date");
  });

  it("formats valid date string", () => {
    const result = formatDateTime("2026-09-22T14:30:00Z");
    expect(result).not.toBe("—");
    expect(typeof result).toBe("string");
  });
});

describe("formatSmartDate", () => {
  const mockNow = new Date("2026-09-22T15:00:00.000Z");

  it("handles empty and invalid input", () => {
    expect(formatSmartDate("")).toBe("—");
    expect(formatSmartDate("invalid")).toBe("invalid");
  });

  it("formats same day as HH:mm", () => {
    // 2026-09-22 10:25 local time
    const today = new Date(mockNow.getFullYear(), mockNow.getMonth(), mockNow.getDate(), 10, 25);
    expect(formatSmartDate(today.toISOString(), "zh-CN", mockNow)).toBe("10:25");
  });

  it("formats yesterday with localized relative label", () => {
    const yesterday = new Date(mockNow.getFullYear(), mockNow.getMonth(), mockNow.getDate() - 1, 14, 0);
    expect(formatSmartDate(yesterday.toISOString(), "zh-CN", mockNow)).toBe("昨天");
    expect(formatSmartDate(yesterday.toISOString(), "en", mockNow)).toBe("yesterday");
    expect(formatSmartDate(yesterday.toISOString(), "ja", mockNow)).toBe("昨日");
  });

  it("formats same year date as MM-DD", () => {
    const earlierThisYear = new Date(mockNow.getFullYear(), 4, 12, 10, 0); // May 12
    expect(formatSmartDate(earlierThisYear.toISOString(), "zh-CN", mockNow)).toBe("05-12");
  });

  it("formats different year date as YYYY-MM", () => {
    const lastYear = new Date(mockNow.getFullYear() - 1, 10, 5, 10, 0); // Nov 5, 2025
    expect(formatSmartDate(lastYear.toISOString(), "zh-CN", mockNow)).toBe("2025-11");
  });
});
