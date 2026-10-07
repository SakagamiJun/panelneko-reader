import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { PagedReader } from "@/components/paged-reader";
import type { FlatReaderPage } from "@/components/reader-shared";

describe("PagedReader Component", () => {
  const originalImage = globalThis.Image;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    globalThis.Image = originalImage;
  });

  const mockPages: FlatReaderPage[] = [
    {
      id: "page-0",
      chapterID: "chap-1",
      chapterTitle: "Chapter 1",
      pageIndex: 0,
      globalIndex: 0,
      globalPage: 1,
      fileName: "001.jpg",
      sourceURL: "/api/reader/page/001.jpg",
    },
    {
      id: "page-1",
      chapterID: "chap-1",
      chapterTitle: "Chapter 1",
      pageIndex: 1,
      globalIndex: 1,
      globalPage: 2,
      fileName: "002.jpg",
      sourceURL: "/api/reader/page/002.jpg",
    },
    {
      id: "page-2",
      chapterID: "chap-1",
      chapterTitle: "Chapter 1",
      pageIndex: 2,
      globalIndex: 2,
      globalPage: 3,
      fileName: "003.jpg",
      sourceURL: "/api/reader/page/003.jpg",
    },
  ];

  it("renders active spread images and triggers offscreen decode for adjacent pages", () => {
    const createdImages: Array<{
      src: string;
      decode: ReturnType<typeof vi.fn>;
      onload: (() => void) | null;
    }> = [];

    const mockDecode = vi.fn().mockResolvedValue(undefined);

    class MockImage {
      private _src = "";
      decode = mockDecode;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      naturalWidth = 1200;
      naturalHeight = 1600;

      get src() {
        return this._src;
      }

      set src(val: string) {
        this._src = val;
        createdImages.push(this);
      }
    }

    // @ts-expect-error Mocking Image constructor
    globalThis.Image = MockImage;

    const onCurrentIndexChange = vi.fn();
    const onMetricMeasured = vi.fn();
    const requestMetric = vi.fn();

    const { container } = render(
      <PagedReader
        currentIndex={0}
        metrics={{}}
        navigationRequest={null}
        onCurrentIndexChange={onCurrentIndexChange}
        onMetricMeasured={onMetricMeasured}
        pages={mockPages}
        requestMetric={requestMetric}
        spreadMode="single"
      />
    );

    const renderedImgs = container.querySelectorAll("img");
    expect(renderedImgs.length).toBe(1);
    expect(renderedImgs[0].getAttribute("src")).toBe("/api/reader/page/001.jpg");

    // Preloaded images should have been created for next spreads
    const preloadedUrls = createdImages.map((img) => img.src);
    expect(preloadedUrls).toContain("/api/reader/page/002.jpg");
    expect(mockDecode).toHaveBeenCalled();

    // Trigger onload on preloaded image
    const preloadedImg = createdImages.find((img) => img.src === "/api/reader/page/002.jpg");
    expect(preloadedImg).toBeDefined();
    preloadedImg?.onload?.();

    expect(onMetricMeasured).toHaveBeenCalledWith("page-1", 1200, 1600);
  });
});
