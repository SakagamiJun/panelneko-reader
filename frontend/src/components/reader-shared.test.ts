import { describe, expect, it } from "vitest";
import { buildReaderSpreads, type FlatReaderPage } from "@/components/reader-shared";

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

describe("buildReaderSpreads", () => {
  it("creates single page spreads when spreadMode is single", () => {
    const pages = [createMockPage(0), createMockPage(1), createMockPage(2)];
    const { spreads, pageToSpreadIndex } = buildReaderSpreads(pages, {
      spreadMode: "single",
      coverSolo: true,
      allowDouble: true,
      metrics: {},
    });

    expect(spreads).toHaveLength(3);
    expect(spreads[0].pages).toHaveLength(1);
    expect(spreads[1].pages).toHaveLength(1);
    expect(spreads[2].pages).toHaveLength(1);
    expect(pageToSpreadIndex).toEqual([0, 1, 2]);
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
    expect(spreads[0].pages[0].globalIndex).toBe(0);

    expect(spreads[1].pages).toHaveLength(2);
    expect(spreads[1].pages[0].globalIndex).toBe(1);
    expect(spreads[1].pages[1].globalIndex).toBe(2);

    expect(spreads[2].pages).toHaveLength(2);
    expect(spreads[2].pages[0].globalIndex).toBe(3);
    expect(spreads[2].pages[1].globalIndex).toBe(4);

    expect(pageToSpreadIndex).toEqual([0, 1, 1, 2, 2]);
  });

  it("does not pair pages across chapter boundaries", () => {
    const pages = [
      createMockPage(0, "c1"),
      createMockPage(1, "c1"),
      createMockPage(2, "c2"),
      createMockPage(3, "c2"),
    ];
    const { spreads, pageToSpreadIndex } = buildReaderSpreads(pages, {
      spreadMode: "double",
      coverSolo: false,
      allowDouble: true,
      metrics: {},
    });

    expect(spreads).toHaveLength(2);
    expect(spreads[0].pages.map((p) => p.globalIndex)).toEqual([0, 1]);
    expect(spreads[1].pages.map((p) => p.globalIndex)).toEqual([2, 3]);
    expect(pageToSpreadIndex).toEqual([0, 0, 1, 1]);
  });

  it("keeps wide landscape scans standalone in double page mode", () => {
    const pages = [createMockPage(0), createMockPage(1), createMockPage(2)];
    const metrics = {
      "p-1": { width: 1920, height: 1080 }, // Wide 2-page landscape scan
    };

    const { spreads } = buildReaderSpreads(pages, {
      spreadMode: "double",
      coverSolo: false,
      allowDouble: true,
      metrics,
    });

    // P0 stands alone because P1 is wide
    // P1 stands alone because it is wide
    // P2 stands alone because it is the remainder
    expect(spreads).toHaveLength(3);
    expect(spreads[0].pages).toHaveLength(1);
    expect(spreads[1].pages).toHaveLength(1);
    expect(spreads[1].isWide).toBe(true);
    expect(spreads[2].pages).toHaveLength(1);
  });
});
