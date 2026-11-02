import { describe, expect, it } from "vitest";
import { buildReaderSpreads, isNextSpreadOnLeft, type FlatReaderPage } from "@/components/reader-shared";

function createMockPage(globalIndex: number, chapterID = "c1"): FlatReaderPage {
  return {
    id: `p-${globalIndex}`,
    chapterID,
    chapterTitle: "Chapter 1",
    pageIndex: globalIndex,
    fileName: `page-${globalIndex}.jpg`,
    sourceURL: `http://localhost/page-${globalIndex}.jpg`,
    globalIndex,
    globalPage: globalIndex + 1,
  };
}

describe("buildReaderSpreads - pure algorithm & adversarial boundaries", () => {
  it("handles empty page array without crashing", () => {
    const { spreads, pageToSpreadIndex } = buildReaderSpreads([], {
      spreadMode: "double",
      coverSolo: true,
      allowDouble: true,
      metrics: {},
    });

    expect(spreads).toEqual([]);
    expect(pageToSpreadIndex).toEqual([]);
  });

  it("handles solitary single page with double spread mode enabled", () => {
    const pages = [createMockPage(0)];
    const { spreads, pageToSpreadIndex } = buildReaderSpreads(pages, {
      spreadMode: "double",
      coverSolo: true,
      allowDouble: true,
      metrics: {},
    });

    expect(spreads).toHaveLength(1);
    expect(spreads[0].isCover).toBe(true);
    expect(spreads[0].pages).toHaveLength(1);
    expect(pageToSpreadIndex).toEqual([0]);
  });

  it("handles coverSolo by making page 0 solitary, followed by paired spreads", () => {
    const pages = [
      createMockPage(0),
      createMockPage(1),
      createMockPage(2),
      createMockPage(3),
      createMockPage(4),
    ];
    const { spreads, pageToSpreadIndex } = buildReaderSpreads(pages, {
      spreadMode: "double",
      coverSolo: true,
      allowDouble: true,
      metrics: {},
    });

    // Spread 0: [P0] (cover)
    // Spread 1: [P1, P2]
    // Spread 2: [P3, P4]
    expect(spreads).toHaveLength(3);
    expect(spreads[0].isCover).toBe(true);
    expect(spreads[0].pages).toHaveLength(1);
    expect(spreads[1].pages).toHaveLength(2);
    expect(spreads[2].pages).toHaveLength(2);
    expect(pageToSpreadIndex).toEqual([0, 1, 1, 2, 2]);
  });

  it("isolates the first page of each chapter as cover when coverSolo is enabled", () => {
    const pages = [
      createMockPage(0, "c1"),
      createMockPage(1, "c1"),
      createMockPage(2, "c1"),
      createMockPage(3, "c2"),
      createMockPage(4, "c2"),
      createMockPage(5, "c2"),
    ];
    const { spreads, pageToSpreadIndex } = buildReaderSpreads(pages, {
      spreadMode: "double",
      coverSolo: true,
      allowDouble: true,
      metrics: {},
    });

    // Chapter 1:
    // Spread 0: [0] (cover of c1)
    // Spread 1: [1, 2] (paired)
    // Chapter 2:
    // Spread 2: [3] (cover of c2)
    // Spread 3: [4, 5] (paired)
    expect(spreads).toHaveLength(4);
    expect(spreads[0].isCover).toBe(true);
    expect(spreads[0].pages.map((p) => p.globalIndex)).toEqual([0]);
    expect(spreads[1].isCover).toBe(false);
    expect(spreads[1].pages.map((p) => p.globalIndex)).toEqual([1, 2]);

    expect(spreads[2].isCover).toBe(true);
    expect(spreads[2].pages.map((p) => p.globalIndex)).toEqual([3]);
    expect(spreads[3].isCover).toBe(false);
    expect(spreads[3].pages.map((p) => p.globalIndex)).toEqual([4, 5]);

    expect(pageToSpreadIndex).toEqual([0, 1, 1, 2, 3, 3]);
  });

  it("strictly isolates chapter boundaries preventing cross-chapter pairing on odd page counts", () => {
    const pages = [
      createMockPage(0, "c1"),
      createMockPage(1, "c1"),
      createMockPage(2, "c1"), // c1 has odd 3 pages
      createMockPage(3, "c2"),
      createMockPage(4, "c2"),
    ];
    const { spreads, pageToSpreadIndex } = buildReaderSpreads(pages, {
      spreadMode: "double",
      coverSolo: false,
      allowDouble: true,
      metrics: {},
    });

    // Spread 0: [0, 1]
    // Spread 1: [2] (alone because next is c2)
    // Spread 2: [3, 4]
    expect(spreads).toHaveLength(3);
    expect(spreads[0].pages.map((p) => p.globalIndex)).toEqual([0, 1]);
    expect(spreads[1].pages.map((p) => p.globalIndex)).toEqual([2]);
    expect(spreads[2].pages.map((p) => p.globalIndex)).toEqual([3, 4]);
    expect(pageToSpreadIndex).toEqual([0, 0, 1, 2, 2]);
  });

  it("handles corrupt, zero, or negative dimensions in metrics without NaN or infinite loop", () => {
    const pages = [createMockPage(0), createMockPage(1)];
    const corruptMetrics = {
      "p-0": { width: 0, height: 0 },
      "p-1": { width: -100, height: 100 },
    };

    const { spreads } = buildReaderSpreads(pages, {
      spreadMode: "double",
      coverSolo: false,
      allowDouble: true,
      metrics: corruptMetrics,
    });

    expect(spreads).toHaveLength(1);
    expect(spreads[0].pages).toHaveLength(2);
  });

  it("isolates wide landscape scans standalone in double page mode", () => {
    const pages = [createMockPage(0), createMockPage(1), createMockPage(2)];
    const metrics = {
      "p-1": { width: 1920, height: 1080 },
    };

    const { spreads } = buildReaderSpreads(pages, {
      spreadMode: "double",
      coverSolo: false,
      allowDouble: true,
      metrics,
    });

    expect(spreads).toHaveLength(3);
    expect(spreads[0].pages).toHaveLength(1);
    expect(spreads[1].pages).toHaveLength(1);
    expect(spreads[1].isWide).toBe(true);
    expect(spreads[2].pages).toHaveLength(1);
  });
});

describe("isNextSpreadOnLeft - condition calculation", () => {
  it("handles right_next, left_next and follow direction configurations", () => {
    expect(isNextSpreadOnLeft("rtl", "right_next")).toBe(false);
    expect(isNextSpreadOnLeft("ltr", "right_next")).toBe(false);

    expect(isNextSpreadOnLeft("rtl", "left_next")).toBe(true);
    expect(isNextSpreadOnLeft("ltr", "left_next")).toBe(true);

    expect(isNextSpreadOnLeft("rtl", "follow")).toBe(true);
    expect(isNextSpreadOnLeft("ltr", "follow")).toBe(false);
  });
});
