import {
  type WheelEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
} from "react";
import {
  type FlatReaderPage,
  type PageMetric,
  type ReaderNavigationRequest,
  DEFAULT_ASPECT_RATIO,
  PAGE_PADDING,
  buildReaderSpreads,
  isNextSpreadOnLeft,
} from "@/components/reader-shared";
import type {
  ReaderDirection,
  ReaderFitMode,
  ReaderFilter,
  ReaderSpreadMode,
  ReaderSideClickMode,
} from "@/lib/contracts";
import { cn } from "@/lib/utils";

interface PagedReaderProps {
  currentIndex: number;
  metrics: Record<string, PageMetric>;
  navigationRequest: ReaderNavigationRequest | null;
  onCurrentIndexChange: (index: number) => void;
  onMetricMeasured: (pageID: string, width: number, height: number) => void;
  pages: FlatReaderPage[];
  requestMetric: (page: FlatReaderPage | undefined) => void;
  shortcuts?: Record<string, string>;
  direction?: ReaderDirection;
  spreadMode?: ReaderSpreadMode;
  coverSolo?: boolean;
  fitMode?: ReaderFitMode;
  filter?: ReaderFilter;
  sideClickMode?: ReaderSideClickMode;
  rotation?: number;
  onToggleHUD?: () => void;
  clickCenterZoom?: boolean;
  doubleClickZoom?: boolean;
}

function getFilterCSS(filter: ReaderFilter) {
  switch (filter) {
    case "invert":
      return "invert(1) hue-rotate(180deg) contrast(1.1)";
    case "sepia":
      return "sepia(0.35) contrast(1.08) brightness(0.96)";
    case "high-contrast":
      return "contrast(1.35) brightness(0.98)";
    default:
      return "none";
  }
}

export function PagedReader({
  currentIndex,
  metrics,
  navigationRequest,
  onCurrentIndexChange,
  onMetricMeasured,
  pages,
  requestMetric,
  shortcuts = {},
  direction = "rtl",
  spreadMode = "auto",
  coverSolo = true,
  fitMode = "contain",
  filter = "none",
  sideClickMode = "right_next",
  rotation = 0,
  onToggleHUD,
  clickCenterZoom = false,
  doubleClickZoom = false,
}: PagedReaderProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const spreadStageRef = useRef<HTMLDivElement | null>(null);
  const handledNavigationIDRef = useRef<number | null>(null);

  const [viewportWidth, setViewportWidth] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const isDraggingRef = useRef(false);
  const hasDraggedRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const syncSize = () => {
      setViewportWidth(element.clientWidth);
      setViewportHeight(element.clientHeight);
    };

    syncSize();
    const observer = new ResizeObserver(syncSize);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    handledNavigationIDRef.current = null;
  }, [pages]);

  useEffect(() => {
    if (!navigationRequest || handledNavigationIDRef.current === navigationRequest.id) {
      return;
    }

    handledNavigationIDRef.current = navigationRequest.id;
    containerRef.current?.focus();
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [navigationRequest]);

  const contentWidth = Math.max(320, viewportWidth - PAGE_PADDING * 2);
  const contentHeight = Math.max(320, viewportHeight - PAGE_PADDING * 2);

  const allowDouble = viewportWidth >= 640 && viewportWidth > viewportHeight * 0.95;

  const { spreads, pageToSpreadIndex } = useMemo(() => {
    return buildReaderSpreads(pages, {
      spreadMode,
      coverSolo,
      allowDouble,
      metrics,
    });
  }, [pages, spreadMode, coverSolo, allowDouble, metrics]);

  const currentSpreadIndex = pageToSpreadIndex[currentIndex] ?? 0;
  const currentSpread = spreads[currentSpreadIndex];

  // Request dimensions for active spread pages
  useEffect(() => {
    if (!currentSpread) return;
    for (const page of currentSpread.pages) {
      requestMetric(page);
    }
    // Also request for adjacent spreads
    const nextSpread = spreads[currentSpreadIndex + 1];
    if (nextSpread) {
      for (const page of nextSpread.pages) requestMetric(page);
    }
    const prevSpread = spreads[currentSpreadIndex - 1];
    if (prevSpread) {
      for (const page of prevSpread.pages) requestMetric(page);
    }
  }, [currentSpread, currentSpreadIndex, requestMetric, spreads]);

  // Silent prefetch for smooth flipping
  useEffect(() => {
    const prefetchIndices = [
      currentSpreadIndex + 1,
      currentSpreadIndex + 2,
      currentSpreadIndex - 1,
    ];
    for (const idx of prefetchIndices) {
      const s = spreads[idx];
      if (s) {
        for (const p of s.pages) {
          const img = new Image();
          img.src = p.sourceURL;
        }
      }
    }
  }, [currentSpreadIndex, spreads]);

  // Reset zoom and pan on spread change
  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [currentSpreadIndex]);

  useEffect(() => {
    const handleGlobalMouseUp = () => {
      isDraggingRef.current = false;
      setIsDragging(false);
    };
    window.addEventListener("mouseup", handleGlobalMouseUp);
    return () => window.removeEventListener("mouseup", handleGlobalMouseUp);
  }, []);

  const goToNextSpread = useCallback(() => {
    if (currentSpreadIndex < spreads.length - 1) {
      const nextSpread = spreads[currentSpreadIndex + 1];
      setZoom(1);
      setPan({ x: 0, y: 0 });
      onCurrentIndexChange(nextSpread.startIndex);
    }
  }, [currentSpreadIndex, onCurrentIndexChange, spreads]);

  const goToPrevSpread = useCallback(() => {
    if (currentSpreadIndex > 0) {
      const prevSpread = spreads[currentSpreadIndex - 1];
      setZoom(1);
      setPan({ x: 0, y: 0 });
      onCurrentIndexChange(prevSpread.startIndex);
    }
  }, [currentSpreadIndex, onCurrentIndexChange, spreads]);

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      const delta = event.deltaY < 0 ? 0.25 : -0.25;
      setZoom((z) => {
        const nextZoom = Math.min(8, Math.max(1, Number((z + delta).toFixed(2))));
        if (nextZoom === 1) {
          setPan({ x: 0, y: 0 });
        }
        return nextZoom;
      });
      return;
    }

    if (Math.abs(event.deltaY) < 8) {
      return;
    }

    event.preventDefault();
    if (event.deltaY > 0) {
      goToNextSpread();
    } else {
      goToPrevSpread();
    }
  };

  useEffect(() => {
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "SELECT" ||
        document.activeElement?.tagName === "TEXTAREA" ||
        (document.activeElement as HTMLElement)?.isContentEditable
      ) {
        return;
      }

      const key = event.key.toLowerCase();
      const nextKey = shortcuts.nextPage?.toLowerCase();
      const prevKey = shortcuts.prevPage?.toLowerCase();

      if (nextKey && key === nextKey) {
        event.preventDefault();
        goToNextSpread();
        return;
      }
      if (prevKey && key === prevKey) {
        event.preventDefault();
        goToPrevSpread();
        return;
      }

      if (event.key === " " || event.key === "PageDown" || event.key === "ArrowDown") {
        event.preventDefault();
        goToNextSpread();
        return;
      }
      if (event.key === "PageUp") {
        event.preventDefault();
        goToPrevSpread();
        return;
      }

      // Directional arrow navigation
      if (direction === "rtl") {
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          goToNextSpread();
        } else if (event.key === "ArrowRight") {
          event.preventDefault();
          goToPrevSpread();
        }
      } else {
        if (event.key === "ArrowRight") {
          event.preventDefault();
          goToNextSpread();
        } else if (event.key === "ArrowLeft") {
          event.preventDefault();
          goToPrevSpread();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [direction, goToNextSpread, goToPrevSpread, shortcuts.nextPage, shortcuts.prevPage]);

  const calculateOriginalScale = useCallback(() => {
    if (!spreadStageRef.current) return 2;
    const imgs = spreadStageRef.current.querySelectorAll("img");
    if (imgs.length === 0) return 2;

    let maxScale = 1;
    imgs.forEach((img) => {
      if (img.naturalHeight > 0 && img.clientHeight > 0) {
        const scaleH = img.naturalHeight / img.clientHeight;
        const scaleW = img.naturalWidth / img.clientWidth;
        const scale = Math.max(scaleH, scaleW);
        if (scale > maxScale) {
          maxScale = scale;
        }
      }
    });

    if (maxScale === 1 && currentSpread) {
      for (const page of currentSpread.pages) {
        const metric = metrics[page.id];
        if (metric && metric.height > 0 && contentHeight > 0) {
          const scale = metric.height / contentHeight;
          if (scale > maxScale) {
            maxScale = scale;
          }
        }
      }
    }

    return maxScale > 1.05 ? Number(maxScale.toFixed(2)) : 2;
  }, [currentSpread, metrics, contentHeight]);

  const toggleOriginalScaleZoom = useCallback(() => {
    if (zoom > 1) {
      setZoom(1);
      setPan({ x: 0, y: 0 });
    } else {
      const targetZoom = calculateOriginalScale();
      setZoom(targetZoom);
      setPan({ x: 0, y: 0 });
    }
  }, [zoom, calculateOriginalScale]);

  // Click zone handling (left, center, right)
  const handleClickZone = (event: React.MouseEvent<HTMLDivElement>) => {
    if (hasDraggedRef.current) {
      hasDraggedRef.current = false;
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const ratio = clickX / rect.width;

    if (ratio >= 0.3 && ratio <= 0.7) {
      // Center zone (30% ~ 70%)
      if (clickCenterZoom) {
        toggleOriginalScaleZoom();
      } else {
        onToggleHUD?.();
      }
      return;
    }

    // If currently zoomed in, avoid side clicks accidentally triggering page flips
    if (zoom > 1) {
      return;
    }

    const isNextOnLeft = isNextSpreadOnLeft(direction, sideClickMode);

    if (ratio < 0.3) {
      // Left zone
      if (isNextOnLeft) {
        goToNextSpread();
      } else {
        goToPrevSpread();
      }
    } else if (ratio > 0.7) {
      // Right zone
      if (isNextOnLeft) {
        goToPrevSpread();
      } else {
        goToNextSpread();
      }
    }
  };

  const handleDoubleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (!doubleClickZoom) {
      return;
    }
    toggleOriginalScaleZoom();
  };

  const handleMouseDown = (event: React.MouseEvent) => {
    if (zoom <= 1 || event.button !== 0) return;
    isDraggingRef.current = true;
    setIsDragging(true);
    hasDraggedRef.current = false;
    dragStartRef.current = {
      x: event.clientX,
      y: event.clientY,
      panX: pan.x,
      panY: pan.y,
    };
  };

  const handleMouseMove = (event: React.MouseEvent) => {
    if (!isDraggingRef.current || zoom <= 1) return;
    const dx = event.clientX - dragStartRef.current.x;
    const dy = event.clientY - dragStartRef.current.y;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      hasDraggedRef.current = true;
    }

    let nextPanX = dragStartRef.current.panX + dx;
    let nextPanY = dragStartRef.current.panY + dy;

    if (containerRef.current && spreadStageRef.current) {
      const containerW = containerRef.current.clientWidth;
      const containerH = containerRef.current.clientHeight;
      const stageW = spreadStageRef.current.clientWidth * zoom;
      const stageH = spreadStageRef.current.clientHeight * zoom;

      const maxPanX = Math.max(0, (stageW - containerW) / 2) + 120;
      const maxPanY = Math.max(0, (stageH - containerH) / 2) + 120;

      nextPanX = Math.max(-maxPanX, Math.min(maxPanX, nextPanX));
      nextPanY = Math.max(-maxPanY, Math.min(maxPanY, nextPanY));
    }

    setPan({
      x: nextPanX,
      y: nextPanY,
    });
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
    setIsDragging(false);
  };

  const displayPages = useMemo(() => {
    if (!currentSpread || currentSpread.pages.length === 0) return [];
    if (currentSpread.pages.length === 1) return currentSpread.pages;

    // 2-page spread:
    // If RTL, right page is pages[0], left page is pages[1] -> render as [pages[1], pages[0]]
    // If LTR, left page is pages[0], right page is pages[1] -> render as [pages[0], pages[1]]
    if (direction === "rtl") {
      return [currentSpread.pages[1], currentSpread.pages[0]];
    }
    return [currentSpread.pages[0], currentSpread.pages[1]];
  }, [currentSpread, direction]);

  const maxPageWidth = currentSpread?.pages.length === 2 ? contentWidth / 2 : contentWidth;

  const stageStyle: React.CSSProperties = {
    transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom}) rotate(${rotation}deg)`,
    transformOrigin: "center center",
    transition: isDraggingRef.current ? "none" : zoom === 1 ? "transform 0.15s ease-out" : "none",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };

  const getImageStyle = (page: FlatReaderPage): React.CSSProperties => {
    const filterCSS = getFilterCSS(filter);
    const baseStyle: React.CSSProperties = {
      filter: filterCSS,
      display: "block",
      flexShrink: 0,
    };

    switch (fitMode) {
      case "width":
        return {
          ...baseStyle,
          width: maxPageWidth,
          height: "auto",
          maxWidth: "none",
          maxHeight: "none",
        };
      case "height":
        return {
          ...baseStyle,
          height: contentHeight,
          width: "auto",
          maxWidth: "none",
          maxHeight: "none",
        };
      case "original":
        return {
          ...baseStyle,
          width: "auto",
          height: "auto",
          maxWidth: "none",
          maxHeight: "none",
        };
      case "contain":
      default:
        return {
          ...baseStyle,
          height: contentHeight,
          maxWidth: maxPageWidth,
        };
    }
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative flex h-full min-h-0 w-full overflow-hidden bg-background outline-none select-none",
        zoom > 1 ? (isDragging ? "cursor-grabbing" : "cursor-grab") : "cursor-pointer"
      )}
      onClick={handleClickZone}
      onDoubleClick={handleDoubleClick}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onWheel={handleWheel}
      tabIndex={0}
    >
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden pointer-events-none">
        <div
          ref={spreadStageRef}
          className="flex items-center justify-center pointer-events-auto"
          style={stageStyle}
        >
          {displayPages.map((page) => (
            <img
              key={page.id}
              alt={`${page.chapterTitle} #${page.pageIndex + 1}`}
              className="select-none object-contain"
              draggable={false}
              loading="eager"
              onLoad={(event) => {
                const image = event.currentTarget;
                if (!image.naturalWidth || !image.naturalHeight) {
                  return;
                }
                onMetricMeasured(page.id, image.naturalWidth, image.naturalHeight);
              }}
              src={page.sourceURL}
              style={getImageStyle(page)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
