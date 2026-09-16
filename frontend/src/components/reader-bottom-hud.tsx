import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  Columns2,
  FileText,
  Maximize2,
  Minimize2,
  RotateCw,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  List,
  Sun,
  Eye,
  BookOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type {
  FlatReaderPage,
} from "@/components/reader-shared";
import type {
  ReaderDirection,
  ReaderFitMode,
  ReaderFilter,
  ReaderSpreadMode,
  ReaderManifest,
} from "@/lib/contracts";
import { cn } from "@/lib/utils";

interface ReaderBottomHUDProps {
  manifest: ReaderManifest;
  activePage: FlatReaderPage | undefined;
  currentIndex: number;
  totalPages: number;
  mode: "paged" | "scroll";
  onModeChange: (mode: "paged" | "scroll") => void;
  direction: ReaderDirection;
  onDirectionChange: (dir: ReaderDirection) => void;
  spreadMode: ReaderSpreadMode;
  onSpreadModeChange: (spread: ReaderSpreadMode) => void;
  coverSolo: boolean;
  onCoverSoloChange: (solo: boolean) => void;
  fitMode: ReaderFitMode;
  onFitModeChange: (fit: ReaderFitMode) => void;
  filter: ReaderFilter;
  onFilterChange: (filter: ReaderFilter) => void;
  rotation: number;
  onRotate: () => void;
  onSeekPage: (pageNumber: number) => void;
  onPrevChapter: () => void;
  onNextChapter: () => void;
  onToggleChapterDrawer: () => void;
  visible: boolean;
}

export function ReaderBottomHUD({
  manifest,
  activePage,
  currentIndex,
  totalPages,
  mode,
  onModeChange,
  direction,
  onDirectionChange,
  spreadMode,
  onSpreadModeChange,
  coverSolo,
  onCoverSoloChange,
  fitMode,
  onFitModeChange,
  filter,
  onFilterChange,
  onRotate,
  onSeekPage,
  onPrevChapter,
  onNextChapter,
  onToggleChapterDrawer,
  visible,
}: ReaderBottomHUDProps) {
  const { t } = useTranslation();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showPreferences, setShowPreferences] = useState(false);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      void document.documentElement.requestFullscreen();
    } else {
      void document.exitFullscreen();
    }
  };

  const currentPageNumber = activePage ? activePage.globalPage : currentIndex + 1;

  const cycleDirection = () => {
    onDirectionChange(direction === "rtl" ? "ltr" : "rtl");
  };

  const cycleSpreadMode = () => {
    const sequence: ReaderSpreadMode[] = ["auto", "single", "double"];
    const nextIdx = (sequence.indexOf(spreadMode) + 1) % sequence.length;
    onSpreadModeChange(sequence[nextIdx]);
  };

  const cycleFitMode = () => {
    const sequence: ReaderFitMode[] = ["contain", "width", "height", "original"];
    const nextIdx = (sequence.indexOf(fitMode) + 1) % sequence.length;
    onFitModeChange(sequence[nextIdx]);
  };

  const cycleFilter = () => {
    const sequence: ReaderFilter[] = ["none", "invert", "sepia", "high-contrast"];
    const nextIdx = (sequence.indexOf(filter) + 1) % sequence.length;
    onFilterChange(sequence[nextIdx]);
  };

  return (
    <div
      className={cn(
        "absolute inset-x-0 bottom-4 z-40 flex flex-col items-center pointer-events-none transition-all duration-300 ease-out px-4",
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6 pointer-events-none"
      )}
    >
      {/* Extended preference drawer */}
      {showPreferences && (
        <div className="pointer-events-auto mb-2 flex flex-wrap items-center gap-1.5 rounded-2xl border border-slate-200/80 bg-[rgba(236,241,246,0.92)] dark:border-slate-700/80 dark:bg-[rgba(15,23,42,0.92)] p-2 shadow-2xl backdrop-blur-2xl text-xs">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs gap-1.5"
            onClick={cycleDirection}
            title={t("reader.direction")}
          >
            <BookOpen className="h-3.5 w-3.5" />
            <span>{direction === "rtl" ? t("reader.directionRTL") : t("reader.directionLTR")}</span>
          </Button>

          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs gap-1.5"
            onClick={cycleSpreadMode}
            title={t("reader.spreadMode")}
          >
            <Columns2 className="h-3.5 w-3.5" />
            <span>
              {spreadMode === "auto"
                ? t("reader.spreadAuto")
                : spreadMode === "double"
                ? t("reader.spreadDouble")
                : t("reader.spreadSingle")}
            </span>
          </Button>

          <Button
            size="sm"
            variant="ghost"
            className={cn("h-7 px-2 text-xs gap-1.5", coverSolo ? "bg-muted font-bold" : "")}
            onClick={() => onCoverSoloChange(!coverSolo)}
            title={t("reader.coverSolo")}
          >
            <FileText className="h-3.5 w-3.5" />
            <span>{coverSolo ? t("reader.coverSoloOn") : t("reader.coverSoloOff")}</span>
          </Button>

          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs gap-1.5"
            onClick={cycleFitMode}
            title={t("reader.fitMode")}
          >
            <Eye className="h-3.5 w-3.5" />
            <span>
              {fitMode === "contain"
                ? t("reader.fitContain")
                : fitMode === "width"
                ? t("reader.fitWidth")
                : fitMode === "height"
                ? t("reader.fitHeight")
                : t("reader.fitOriginal")}
            </span>
          </Button>

          <Button
            size="sm"
            variant="ghost"
            className={cn("h-7 px-2 text-xs gap-1.5", filter !== "none" ? "bg-muted font-bold" : "")}
            onClick={cycleFilter}
            title={t("reader.filter")}
          >
            <Sun className="h-3.5 w-3.5" />
            <span>
              {filter === "none"
                ? t("reader.filterNone")
                : filter === "invert"
                ? t("reader.filterInvert")
                : filter === "sepia"
                ? t("reader.filterSepia")
                : t("reader.filterHighContrast")}
            </span>
          </Button>

          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs gap-1.5"
            onClick={onRotate}
            title={t("reader.rotate")}
          >
            <RotateCw className="h-3.5 w-3.5" />
            <span>{t("reader.rotate")}</span>
          </Button>
        </div>
      )}

      {/* Main Scrubber Pill */}
      <div className="pointer-events-auto flex max-w-[min(54rem,calc(100vw-2rem))] w-full items-center gap-3 rounded-2xl border border-slate-200/80 bg-[rgba(236,241,246,0.92)] dark:border-slate-700/80 dark:bg-[rgba(15,23,42,0.92)] px-4 py-2.5 shadow-2xl backdrop-blur-2xl">
        {/* Chapter prev */}
        <Button
          size="sm"
          variant="ghost"
          className="h-8 w-8 p-0 shrink-0"
          onClick={onPrevChapter}
          title={t("reader.prevChapter")}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        {/* Chapter drawer trigger */}
        <Button
          size="sm"
          variant="ghost"
          className="h-8 px-2 text-xs font-semibold shrink-0 gap-1.5 max-w-[160px] truncate"
          onClick={onToggleChapterDrawer}
          title={t("reader.chapterList")}
        >
          <List className="h-4 w-4 shrink-0" />
          <span className="truncate">{activePage?.chapterTitle ?? t("reader.chapters")}</span>
        </Button>

        {/* Progress Slider */}
        <div className="flex flex-1 items-center gap-2.5 min-w-0">
          <input
            type="range"
            min={1}
            max={Math.max(1, totalPages)}
            value={currentPageNumber}
            onChange={(e) => onSeekPage(Number(e.target.value))}
            className="w-full h-1.5 bg-slate-300 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-primary focus:outline-none"
          />
          <Badge tone="running" className="shrink-0 text-xs font-mono font-bold px-2 py-0.5">
            {currentPageNumber} / {totalPages}
          </Badge>
        </div>

        {/* Chapter next */}
        <Button
          size="sm"
          variant="ghost"
          className="h-8 w-8 p-0 shrink-0"
          onClick={onNextChapter}
          title={t("reader.nextChapter")}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>

        <div className="h-4 w-px bg-border/60 shrink-0 mx-0.5" />

        {/* Mode switch */}
        <Button
          size="sm"
          variant="outline"
          className="h-8 px-2.5 text-xs font-medium shrink-0"
          onClick={() => onModeChange(mode === "paged" ? "scroll" : "paged")}
        >
          {mode === "paged" ? t("reader.pagedMode") : t("reader.scrollMode")}
        </Button>

        {/* Preferences Toggle */}
        <Button
          size="sm"
          variant={showPreferences ? "primary" : "ghost"}
          className="h-8 w-8 p-0 shrink-0"
          onClick={() => setShowPreferences((s) => !s)}
          title={t("shell.settings")}
        >
          <SlidersHorizontal className="h-4 w-4" />
        </Button>

        {/* Fullscreen Toggle */}
        <Button
          size="sm"
          variant="ghost"
          className="h-8 w-8 p-0 shrink-0"
          onClick={toggleFullscreen}
          title={isFullscreen ? t("reader.exitFullscreen") : t("reader.fullscreen")}
        >
          {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}
