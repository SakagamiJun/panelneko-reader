import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { PagedReader } from "@/components/paged-reader";
import { ScrollReader } from "@/components/scroll-reader";
import { ReaderTopBar } from "@/components/reader-top-bar";
import { ChapterDrawer } from "@/components/chapter-drawer";
import {
  type FlatReaderPage,
  type PageMetric,
  type ReaderNavigationRequest,
  clampIndex,
} from "@/components/reader-shared";
import { appAdapter } from "@/lib/api";
import { isMacPlatform } from "@/lib/system";
import { cn } from "@/lib/utils";
import type {
  AppSettings,
  ReaderDirection,
  ReaderFitMode,
  ReaderFilter,
  ReaderManifest,
  ReaderSpreadMode,
} from "@/lib/contracts";

export type ReaderMode = "scroll" | "paged";

export type ReaderJumpRequest =
  | {
      requestID: number;
      target: "chapter";
      chapterID: string;
    }
  | {
      requestID: number;
      target: "page";
      page: number;
    };

interface ReaderControllerProps {
  jumpRequest?: ReaderJumpRequest | null;
  manifest: ReaderManifest;
  mode: ReaderMode;
  onModeChange?: (mode: ReaderMode) => void;
  onChapterChange?: (chapterID: string, chapterTitle: string) => void;
  settings: AppSettings;
  onUpdateSettings?: (patch: Partial<AppSettings>) => void;
  onExitReader?: () => void;
}

function resolveJumpTargetIndex(jumpRequest: ReaderJumpRequest, pages: FlatReaderPage[]) {
  if (jumpRequest.target === "chapter") {
    return pages.findIndex((page) => page.chapterID === jumpRequest.chapterID);
  }

  return clampIndex(jumpRequest.page - 1, pages.length);
}

export function ReaderController({
  jumpRequest = null,
  manifest,
  mode,
  onModeChange,
  onChapterChange,
  settings,
  onUpdateSettings,
  onExitReader,
}: ReaderControllerProps) {
  const handledJumpRequestIDRef = useRef<number | null>(null);
  const lastSavedPageRef = useRef<number | null>(null);
  const metricRequestGenerationRef = useRef(0);
  const navigationRequestIDRef = useRef(0);
  const previousModeRef = useRef(mode);
  const requestedMetricIDsRef = useRef<Set<string>>(new Set());

  const [metrics, setMetrics] = useState<Record<string, PageMetric>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [navigationRequest, setNavigationRequest] = useState<ReaderNavigationRequest | null>(null);
  const [restoreReady, setRestoreReady] = useState(false);

  // Reader preference state
  const [direction, setDirection] = useState<ReaderDirection>(settings.readerDirection || "rtl");
  const [spreadMode, setSpreadMode] = useState<ReaderSpreadMode>(settings.readerSpreadMode || "auto");
  const [coverSolo, setCoverSolo] = useState<boolean>(settings.readerCoverSolo !== false);
  const [fitMode, setFitMode] = useState<ReaderFitMode>(settings.readerFitMode || "contain");
  const [filter, setFilter] = useState<ReaderFilter>(settings.readerFilter || "none");
  const [rotation, setRotation] = useState<number>(0);

  // HUD and Drawer state
  const [hudVisible, setHudVisible] = useState(true);
  const [menuLocked, setMenuLocked] = useState(false);
  const [chapterDrawerOpen, setChapterDrawerOpen] = useState(false);
  const hudTimerRef = useRef<number | null>(null);

  const resetHudTimer = useCallback(() => {
    if (hudTimerRef.current) {
      window.clearTimeout(hudTimerRef.current);
    }
    hudTimerRef.current = window.setTimeout(() => {
      setHudVisible(false);
    }, 3500);
  }, []);

  useEffect(() => {
    setHudVisible(true);
    resetHudTimer();
    return () => {
      if (hudTimerRef.current) window.clearTimeout(hudTimerRef.current);
    };
  }, [resetHudTimer]);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (menuLocked) {
      return;
    }
    if (e.clientY < 48 || hudVisible) {
      setHudVisible(true);
      resetHudTimer();
    }
  };

  const handleToggleLock = useCallback(() => {
    setMenuLocked((prev) => {
      const next = !prev;
      if (next) {
        if (hudTimerRef.current) {
          window.clearTimeout(hudTimerRef.current);
        }
        setHudVisible(false);
      } else {
        setHudVisible(true);
        resetHudTimer();
      }
      return next;
    });
  }, [resetHudTimer]);

  const toggleHUD = useCallback(() => {
    if (menuLocked) {
      setMenuLocked(false);
      setHudVisible(true);
      resetHudTimer();
      return;
    }
    setHudVisible((prev) => {
      const next = !prev;
      if (next) {
        resetHudTimer();
      } else if (hudTimerRef.current) {
        window.clearTimeout(hudTimerRef.current);
      }
      return next;
    });
  }, [menuLocked, resetHudTimer]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "SELECT" ||
        document.activeElement?.tagName === "TEXTAREA"
      ) {
        return;
      }
      const s = settings.shortcuts || {};
      const key = e.key.toLowerCase();
      if ((s.toggleMenu && key === s.toggleMenu.toLowerCase()) || key === "m") {
        e.preventDefault();
        toggleHUD();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [settings.shortcuts, toggleHUD]);

  const pages = useMemo<FlatReaderPage[]>(() => {
    let globalIndex = 0;
    return manifest.chapters.flatMap((chapter) =>
      chapter.pages.map((page) => {
        const item: FlatReaderPage = {
          ...page,
          globalIndex,
          globalPage: globalIndex + 1,
        };
        globalIndex += 1;
        return item;
      })
    );
  }, [manifest]);

  const cacheRadius = Math.max(1, settings.readerScrollCachePages || 3);

  const nextNavigationRequest = useCallback(
    (index: number, reason: ReaderNavigationRequest["reason"]) => {
      navigationRequestIDRef.current += 1;
      return {
        id: navigationRequestIDRef.current,
        index: clampIndex(index, pages.length),
        reason,
      } satisfies ReaderNavigationRequest;
    },
    [pages.length]
  );

  const onMetricMeasured = useCallback((pageID: string, width: number, height: number) => {
    if (!width || !height) {
      return;
    }

    setMetrics((current) => {
      const previousMetric = current[pageID];
      if (previousMetric && previousMetric.width === width && previousMetric.height === height) {
        return current;
      }

      return {
        ...current,
        [pageID]: { width, height },
      };
    });
  }, []);

  const requestMetric = useCallback(
    (page: FlatReaderPage | undefined) => {
      if (!page || requestedMetricIDsRef.current.has(page.id)) {
        return;
      }

      const requestGeneration = metricRequestGenerationRef.current;
      requestedMetricIDsRef.current.add(page.id);

      const image = new Image();
      image.src = page.sourceURL;
      const releaseImage = () => {
        image.onload = null;
        image.onerror = null;
        image.src = "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";
      };

      image.onload = () => {
        const width = image.naturalWidth || 1;
        const height = image.naturalHeight || 1;
        releaseImage();
        if (metricRequestGenerationRef.current !== requestGeneration) {
          return;
        }

        onMetricMeasured(page.id, width, height);
      };
      image.onerror = () => {
        releaseImage();
        if (metricRequestGenerationRef.current !== requestGeneration) {
          return;
        }

        onMetricMeasured(page.id, 1, 1);
      };
    },
    [onMetricMeasured]
  );

  useEffect(() => {
    metricRequestGenerationRef.current += 1;
    requestedMetricIDsRef.current = new Set();
    handledJumpRequestIDRef.current = null;
    lastSavedPageRef.current = null;
    previousModeRef.current = mode;

    setMetrics({});
    setCurrentIndex(0);
    setNavigationRequest(null);
    setRestoreReady(false);
  }, [manifest.mangaID, mode]);

  useEffect(() => {
    if (pages.length === 0) {
      setRestoreReady(true);
      return;
    }

    if (!settings.autoRestoreReaderProgress) {
      setRestoreReady(true);
      return;
    }

    let cancelled = false;
    setRestoreReady(false);

    void appAdapter
      .getReaderProgress(manifest.mangaID)
      .then((progress) => {
        if (cancelled) {
          return;
        }

        if (progress.page > 0) {
          const targetIndex = clampIndex(progress.page - 1, pages.length);
          lastSavedPageRef.current = targetIndex + 1;
          setCurrentIndex(targetIndex);
          setNavigationRequest(nextNavigationRequest(targetIndex, "restore"));
        }

        setRestoreReady(true);
      })
      .catch(() => {
        if (!cancelled) {
          setRestoreReady(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [manifest.mangaID, nextNavigationRequest, pages.length, settings.autoRestoreReaderProgress]);

  useEffect(() => {
    if (previousModeRef.current === mode || pages.length === 0) {
      previousModeRef.current = mode;
      return;
    }

    previousModeRef.current = mode;
    setNavigationRequest(nextNavigationRequest(currentIndex, "sync"));
  }, [currentIndex, mode, nextNavigationRequest, pages.length]);

  useEffect(() => {
    if (!jumpRequest || pages.length === 0 || handledJumpRequestIDRef.current === jumpRequest.requestID) {
      return;
    }

    handledJumpRequestIDRef.current = jumpRequest.requestID;

    const targetIndex = resolveJumpTargetIndex(jumpRequest, pages);

    if (targetIndex < 0) {
      return;
    }

    setCurrentIndex(targetIndex);
    setNavigationRequest(nextNavigationRequest(targetIndex, mode === "scroll" ? "sync" : "jump"));
  }, [jumpRequest, mode, nextNavigationRequest, pages]);

  useEffect(() => {
    const start = Math.max(0, currentIndex - cacheRadius);
    const end = Math.min(pages.length - 1, currentIndex + cacheRadius);

    for (let index = start; index <= end; index += 1) {
      requestMetric(pages[index]);
    }
  }, [cacheRadius, currentIndex, pages, requestMetric]);

  const onChapterChangeRef = useRef(onChapterChange);
  useEffect(() => {
    onChapterChangeRef.current = onChapterChange;
  }, [onChapterChange]);

  const activePage = pages[clampIndex(currentIndex, pages.length)];

  useEffect(() => {
    if (pages.length === 0) return;
    if (activePage) {
      onChapterChangeRef.current?.(activePage.chapterID, activePage.chapterTitle);
    }
  }, [activePage, pages]);

  useEffect(() => {
    if (!restoreReady || pages.length === 0) {
      return;
    }

    if (!activePage || lastSavedPageRef.current === activePage.globalPage) {
      return;
    }

    const timer = window.setTimeout(() => {
      lastSavedPageRef.current = activePage.globalPage;
      void appAdapter.updateReaderProgress({
        mangaID: manifest.mangaID,
        chapterID: activePage.chapterID,
        page: activePage.globalPage,
        updatedAt: "",
      });
    }, 300);

    return () => window.clearTimeout(timer);
  }, [activePage, manifest.mangaID, pages, restoreReady]);

  const handleCurrentIndexChange = (nextIndex: number) => {
    const clampedIndex = clampIndex(nextIndex, pages.length);
    setCurrentIndex((current) => (current === clampedIndex ? current : clampedIndex));
  };

  const handleSeekPage = (targetPageNumber: number) => {
    const targetIdx = clampIndex(targetPageNumber - 1, pages.length);
    setCurrentIndex(targetIdx);
    setNavigationRequest(nextNavigationRequest(targetIdx, "jump"));
  };

  const handlePrevChapter = () => {
    if (!activePage) return;
    const chapterIdx = manifest.chapters.findIndex((c) => c.id === activePage.chapterID);
    if (chapterIdx > 0) {
      const prevChapter = manifest.chapters[chapterIdx - 1];
      const targetIndex = pages.findIndex((p) => p.chapterID === prevChapter.id);
      if (targetIndex !== -1) {
        setCurrentIndex(targetIndex);
        setNavigationRequest(nextNavigationRequest(targetIndex, "jump"));
      }
    }
  };

  const handleNextChapter = () => {
    if (!activePage) return;
    const chapterIdx = manifest.chapters.findIndex((c) => c.id === activePage.chapterID);
    if (chapterIdx !== -1 && chapterIdx + 1 < manifest.chapters.length) {
      const nextChapter = manifest.chapters[chapterIdx + 1];
      const targetIndex = pages.findIndex((p) => p.chapterID === nextChapter.id);
      if (targetIndex !== -1) {
        setCurrentIndex(targetIndex);
        setNavigationRequest(nextNavigationRequest(targetIndex, "jump"));
      }
    }
  };

  const handleSelectChapter = (chapterID: string) => {
    const targetIndex = pages.findIndex((p) => p.chapterID === chapterID);
    if (targetIndex !== -1) {
      setCurrentIndex(targetIndex);
      setNavigationRequest(nextNavigationRequest(targetIndex, "jump"));
    }
  };

  const handleDirectionChange = (d: ReaderDirection) => {
    setDirection(d);
    onUpdateSettings?.({ readerDirection: d });
  };

  const handleSpreadModeChange = (s: ReaderSpreadMode) => {
    setSpreadMode(s);
    onUpdateSettings?.({ readerSpreadMode: s });
  };

  const handleCoverSoloChange = (solo: boolean) => {
    setCoverSolo(solo);
    onUpdateSettings?.({ readerCoverSolo: solo });
  };

  const handleFitModeChange = (f: ReaderFitMode) => {
    setFitMode(f);
    onUpdateSettings?.({ readerFitMode: f });
  };

  const handleFilterChange = (fl: ReaderFilter) => {
    setFilter(fl);
    onUpdateSettings?.({ readerFilter: fl });
  };

  const handleRotate = () => {
    setRotation((r) => (r + 90) % 360);
  };

  if (pages.length === 0) {
    return (
      <div className="flex h-full items-center justify-center border-l border-border/40 bg-card/14 text-sm text-muted-foreground">
        No local pages available for this manga yet.
      </div>
    );
  }

  return (
    <div
      className="relative h-full w-full overflow-hidden select-none"
      onMouseMove={handleMouseMove}
    >
      {mode === "scroll" ? (
        <ScrollReader
          cacheRadius={cacheRadius}
          currentIndex={currentIndex}
          filter={filter}
          metrics={metrics}
          navigationRequest={navigationRequest}
          onCurrentIndexChange={handleCurrentIndexChange}
          onMetricMeasured={onMetricMeasured}
          onToggleHUD={toggleHUD}
          pages={pages}
          requestMetric={requestMetric}
          rotation={rotation}
          shortcuts={settings.shortcuts}
        />
      ) : (
        <PagedReader
          coverSolo={coverSolo}
          currentIndex={currentIndex}
          direction={direction}
          filter={filter}
          fitMode={fitMode}
          metrics={metrics}
          navigationRequest={navigationRequest}
          onCurrentIndexChange={handleCurrentIndexChange}
          onMetricMeasured={onMetricMeasured}
          onToggleHUD={toggleHUD}
          pages={pages}
          requestMetric={requestMetric}
          rotation={rotation}
          shortcuts={settings.shortcuts}
          spreadMode={spreadMode}
          sideClickMode={settings.readerSideClickMode || "right_next"}
          clickCenterZoom={settings.readerClickCenterZoom === true}
          doubleClickZoom={settings.readerDoubleClickZoom === true}
        />
      )}

      {/* Invisible top hover zone to easily reveal top bar with mouse */}
      {!menuLocked && (
        <div
          className={cn(
            "absolute top-0 right-0 h-4 z-20 pointer-events-auto",
            isMacPlatform() ? "left-20" : "left-0"
          )}
          onMouseEnter={() => {
            setHudVisible(true);
            resetHudTimer();
          }}
        />
      )}

      {/* Unified Top Navigation and Reader Controls Bar */}
      <ReaderTopBar
        activePage={activePage}
        coverSolo={coverSolo}
        currentIndex={currentIndex}
        direction={direction}
        filter={filter}
        fitMode={fitMode}
        manifest={manifest}
        menuLocked={menuLocked}
        mode={mode}
        onCoverSoloChange={handleCoverSoloChange}
        onDirectionChange={handleDirectionChange}
        onExitReader={onExitReader ?? (() => {})}
        onFilterChange={handleFilterChange}
        onFitModeChange={handleFitModeChange}
        onHide={handleToggleLock}
        onModeChange={onModeChange ?? (() => {})}
        onNextChapter={handleNextChapter}
        onPrevChapter={handlePrevChapter}
        onRotate={handleRotate}
        onSeekPage={handleSeekPage}
        onSpreadModeChange={handleSpreadModeChange}
        onToggleChapterDrawer={() => setChapterDrawerOpen(true)}
        onToggleLock={handleToggleLock}
        rotation={rotation}
        spreadMode={spreadMode}
        totalPages={pages.length}
        visible={hudVisible}
      />

      {/* Slide-over Chapter Drawer */}
      <ChapterDrawer
        activeChapterID={activePage?.chapterID}
        chapters={manifest.chapters}
        onClose={() => setChapterDrawerOpen(false)}
        onSelectChapter={handleSelectChapter}
        open={chapterDrawerOpen}
      />
    </div>
  );
}
