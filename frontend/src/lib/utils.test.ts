import { describe, expect, it } from "vitest";
import { formatBytes, formatBytesPerSecond, formatDateTime, formatSmartDate } from "@/lib/utils";

describe("formatBytes - boundary and invalid inputs", () => {
  it("handles zero, negative and fractional numbers safely", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(-1)).toBe("0 B");
    expect(formatBytes(-1048576)).toBe("0 B");
    expect(formatBytes(NaN)).toBe("0 B");
  });
});

describe("formatBytesPerSecond - boundary and invalid inputs", () => {
  it("handles zero, negative and NaN values safely", () => {
    expect(formatBytesPerSecond(0)).toBe("0 B/s");
    expect(formatBytesPerSecond(-10)).toBe("0 B/s");
    expect(formatBytesPerSecond(NaN)).toBe("0 B/s");
  });
});

describe("formatDateTime - invalid and boundary inputs", () => {
  it("returns dash for empty or whitespace inputs and raw string on invalid formats", () => {
    expect(formatDateTime("")).toBe("—");
    expect(formatDateTime("not-a-date")).toBe("not-a-date");
    expect(formatDateTime("2026-99-99T99:99:99Z")).toBe("2026-99-99T99:99:99Z");
  });
});

describe("formatSmartDate - invalid and relative boundary transitions", () => {
  const mockNow = new Date("2026-09-22T15:00:00.000Z");

  it("handles empty and corrupt inputs gracefully", () => {
    expect(formatSmartDate("")).toBe("—");
    expect(formatSmartDate("invalid-date")).toBe("invalid-date");
  });

  it("handles cross-year and relative yesterday boundaries", () => {
    const yesterday = new Date(mockNow.getFullYear(), mockNow.getMonth(), mockNow.getDate() - 1, 14, 0);
    expect(formatSmartDate(yesterday.toISOString(), "zh-CN", mockNow)).toBe("昨天");
    expect(formatSmartDate(yesterday.toISOString(), "en", mockNow)).toBe("yesterday");

    const lastYear = new Date(mockNow.getFullYear() - 1, 10, 5, 10, 0);
    expect(formatSmartDate(lastYear.toISOString(), "zh-CN", mockNow)).toBe("2025-11");
  });
});
