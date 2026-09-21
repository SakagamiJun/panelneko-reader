import type { ReaderDirection, ReaderPage, ReaderSideClickMode } from "@/lib/contracts";

export interface PageMetric {
  width: number;
  height: number;
}

export interface FlatReaderPage extends ReaderPage {
  globalIndex: number;
  globalPage: number;
}

export interface ReaderNavigationRequest {
  id: number;
  index: number;
  reason: "jump" | "restore" | "sync";
}

export const DEFAULT_ASPECT_RATIO = 0.72;
export const PAGE_GAP = 0;
export const PAGE_PADDING = 0;

export function clampIndex(index: number, total: number) {
  if (total <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(total - 1, index));
}

export function findPageIndexAtPosition(offsets: number[], heights: number[], position: number) {
  if (offsets.length === 0) {
    return 0;
  }

  let matchIndex = 0;
  for (let index = 0; index < offsets.length; index += 1) {
    const start = offsets[index];
    const end = start + heights[index];
    if (position >= start && position <= end) {
      return index;
    }
    if (position > end) {
      matchIndex = index;
    }
  }

  return matchIndex;
}

export interface ReaderSpread {
  spreadIndex: number;
  startIndex: number;
  pages: FlatReaderPage[];
  isCover: boolean;
  isWide: boolean;
}

export function buildReaderSpreads(
  pages: FlatReaderPage[],
  options: {
    spreadMode: "auto" | "single" | "double";
    coverSolo: boolean;
    allowDouble: boolean;
    metrics: Record<string, PageMetric>;
  }
): { spreads: ReaderSpread[]; pageToSpreadIndex: number[] } {
  if (pages.length === 0) {
    return { spreads: [], pageToSpreadIndex: [] };
  }

  const spreads: ReaderSpread[] = [];
  const pageToSpreadIndex = new Array<number>(pages.length);

  const canDouble =
    options.spreadMode === "double" || (options.spreadMode === "auto" && options.allowDouble);

  let i = 0;
  while (i < pages.length) {
    const page = pages[i];
    const metric = options.metrics[page.id];
    const isWide = metric ? metric.width > metric.height * 1.15 : false;

    if (!canDouble || (options.coverSolo && i === 0) || isWide) {
      const spreadIdx = spreads.length;
      spreads.push({
        spreadIndex: spreadIdx,
        startIndex: i,
        pages: [page],
        isCover: options.coverSolo && i === 0,
        isWide,
      });
      pageToSpreadIndex[i] = spreadIdx;
      i += 1;
      continue;
    }

    const next = pages[i + 1];
    if (!next || next.chapterID !== page.chapterID) {
      const spreadIdx = spreads.length;
      spreads.push({
        spreadIndex: spreadIdx,
        startIndex: i,
        pages: [page],
        isCover: false,
        isWide: false,
      });
      pageToSpreadIndex[i] = spreadIdx;
      i += 1;
      continue;
    }

    const nextMetric = options.metrics[next.id];
    const nextIsWide = nextMetric ? nextMetric.width > nextMetric.height * 1.15 : false;
    if (nextIsWide) {
      const spreadIdx = spreads.length;
      spreads.push({
        spreadIndex: spreadIdx,
        startIndex: i,
        pages: [page],
        isCover: false,
        isWide: false,
      });
      pageToSpreadIndex[i] = spreadIdx;
      i += 1;
      continue;
    }

    const spreadIdx = spreads.length;
    spreads.push({
      spreadIndex: spreadIdx,
      startIndex: i,
      pages: [page, next],
      isCover: false,
      isWide: false,
    });
    pageToSpreadIndex[i] = spreadIdx;
    pageToSpreadIndex[i + 1] = spreadIdx;
    i += 2;
  }

  return { spreads, pageToSpreadIndex };
}

export function isNextSpreadOnLeft(
  direction: ReaderDirection = "rtl",
  sideClickMode: ReaderSideClickMode = "right_next"
): boolean {
  if (sideClickMode === "left_next") {
    return true;
  }
  if (sideClickMode === "right_next") {
    return false;
  }
  return direction === "rtl";
}
