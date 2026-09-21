import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  List,
  Maximize2,
  Minimize2,
  RotateCw,
  Settings2,
  SlidersHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Switch } from "@/components/ui/switch";
import type { FlatReaderPage } from "@/components/reader-shared";
import type {
  ReaderDirection,
  ReaderFitMode,
  ReaderFilter,
  ReaderSpreadMode,
  ReaderManifest,
} from "@/lib/contracts";
import { isMacPlatform } from "@/lib/system";
import { cn } from "@/lib/utils";

interface ReaderTopBarProps {
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
  onExitReader: () => void;
  visible: boolean;
  menuLocked?: boolean;
  onToggleLock?: () => void;
  onHide: () => void;
}

export function ReaderTopBar({
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
  rotation,
  onRotate,
  onSeekPage,
  onPrevChapter,
  onNextChapter,
  onToggleChapterDrawer,
  onExitReader,
  visible,
  menuLocked,
  onToggleLock,
  onHide,
}: ReaderTopBarProps) {
  const { t } = useTranslation();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [jumpOpen, setJumpOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pageInput, setPageInput] = useState("");

  const jumpRef = useRef<HTMLDivElement>(null);
  const settingsRef = useRef<HTMLDivElement>(null);

  const currentPage = activePage ? activePage.globalPage : currentIndex + 1;
  const isMac = isMacPlatform();
  const hasTrafficLights = isMac && !isFullscreen;

  useEffect(() => {
    const checkFullscreen = () => {
      const isDocFs = Boolean(document.fullscreenElement);
      const isMediaFs = typeof window !== "undefined" && window.matchMedia?.("(display-mode: fullscreen)").matches;
      const isScreenFs =
        typeof window !== "undefined" &&
        window.innerWidth === window.screen.width &&
        window.innerHeight === window.screen.height;
      setIsFullscreen(Boolean(isDocFs || isMediaFs || isScreenFs));
    };

    checkFullscreen();
    document.addEventListener("fullscreenchange", checkFullscreen);
    window.addEventListener("resize", checkFullscreen);

    return () => {
      document.removeEventListener("fullscreenchange", checkFullscreen);
      window.removeEventListener("resize", checkFullscreen);
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (jumpRef.current && !jumpRef.current.contains(e.target as Node)) {
        setJumpOpen(false);
      }
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setSettingsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      void document.documentElement.requestFullscreen();
    } else {
      void document.exitFullscreen();
    }
  };

  const handleJumpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const target = Number(pageInput);
    if (!isNaN(target) && target >= 1 && target <= totalPages) {
      onSeekPage(target);
      setJumpOpen(false);
      setPageInput("");
    }
  };

  return (
    <>
      <header
        className={cn(
          "app-window-drag-region absolute top-0 left-0 right-0 z-30 flex items-center justify-between py-2 transition-all duration-300 ease-out",
          hasTrafficLights ? "pl-20 pr-3" : "px-3",
          "border-b border-border/50 bg-background/90 text-foreground shadow-[0_4px_24px_rgba(0,0,0,0.25)] backdrop-blur-2xl",
          visible
            ? "translate-y-0 opacity-100 pointer-events-auto"
            : "-translate-y-full opacity-0 pointer-events-none"
        )}
      >
      {/* Left section: Exit button, Manga Title, Chapter, Page count */}
      <div className="app-window-no-drag flex items-center gap-2 min-w-0">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={onExitReader}
          className="h-8 gap-1.5 px-2.5 text-xs text-foreground hover:bg-muted font-medium shrink-0"
          title={t("library.back")}
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">{t("library.back")}</span>
        </Button>

        <div className="h-4 w-[1px] bg-border/60 shrink-0" />

        <div className="flex items-center gap-1.5 min-w-0 text-xs">
          <span className="font-semibold text-foreground truncate max-w-[140px] sm:max-w-[200px]">
            {manifest.title}
          </span>
          {activePage?.chapterTitle && (
            <>
              <span className="text-muted-foreground/60">/</span>
              <span className="text-muted-foreground truncate max-w-[120px] sm:max-w-[180px]">
                {activePage.chapterTitle}
              </span>
            </>
          )}
        </div>

        <Badge tone="running" className="text-[11px] font-mono shrink-0 ml-1">
          {currentPage} / {totalPages}
        </Badge>
      </div>

      {/* Right section: Mode toggle, Chapter drawer, Jump popover, Settings popover, Hide UI */}
      <div className="app-window-no-drag flex items-center gap-1.5 shrink-0">
        {/* Mode Toggle: Paged vs Scroll */}
        <SegmentedControl<"paged" | "scroll">
          size="sm"
          value={mode}
          onChange={onModeChange}
          options={[
            { value: "paged", label: t("reader.pagedMode") },
            { value: "scroll", label: t("reader.scrollMode") },
          ]}
        />

        {/* Chapters list button */}
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onToggleChapterDrawer}
          className="h-8 gap-1.5 px-2.5 text-xs text-foreground"
          title={t("reader.chapterList")}
        >
          <List className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{t("reader.chapters")}</span>
        </Button>

        {/* Quick jump & Scrubber popover */}
        <div className="relative" ref={jumpRef}>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setJumpOpen(!jumpOpen);
              setSettingsOpen(false);
            }}
            className={cn("h-8 gap-1.5 px-2.5 text-xs text-foreground", jumpOpen && "bg-muted")}
            title={t("reader.jumpTitle")}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            <span className="hidden md:inline">{t("reader.jump")}</span>
          </Button>

          {jumpOpen && (
            <div className="absolute right-0 top-full mt-2 w-72 rounded-xl border border-border/80 bg-background/95 p-3 shadow-xl backdrop-blur-2xl z-40 space-y-3">
              <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
                <span>{t("reader.jumpTitle")}</span>
                <span className="font-mono text-foreground">{currentPage} / {totalPages}</span>
              </div>

              {/* Scrubber slider */}
              <div className="space-y-1">
                <input
                  type="range"
                  min={1}
                  max={totalPages}
                  value={currentPage}
                  onChange={(e) => onSeekPage(Number(e.target.value))}
                  className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                />
              </div>

              {/* Chapter prev/next navigation */}
              <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-2.5">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    onPrevChapter();
                    setJumpOpen(false);
                  }}
                  className="h-7 text-xs gap-1 flex-1"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  <span>{t("reader.prevChapter")}</span>
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    onNextChapter();
                    setJumpOpen(false);
                  }}
                  className="h-7 text-xs gap-1 flex-1"
                >
                  <span>{t("reader.nextChapter")}</span>
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>

              {/* Direct page number jump */}
              <form onSubmit={handleJumpSubmit} className="flex gap-2 border-t border-border/60 pt-2.5">
                <input
                  type="number"
                  min={1}
                  max={totalPages}
                  placeholder={`${currentPage}`}
                  value={pageInput}
                  onChange={(e) => setPageInput(e.target.value)}
                  className="h-8 flex-1 rounded-lg border border-border bg-muted/40 px-2.5 text-xs text-foreground outline-none focus:border-primary/60"
                />
                <Button type="submit" size="sm" variant="outline" className="h-8 text-xs px-3">
                  {t("reader.jumpPageAction")}
                </Button>
              </form>
            </div>
          )}
        </div>

        {/* Reader Preferences Popover */}
        <div className="relative" ref={settingsRef}>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setSettingsOpen(!settingsOpen);
              setJumpOpen(false);
            }}
            className={cn("h-8 gap-1.5 px-2.5 text-xs text-foreground", settingsOpen && "bg-muted")}
            title={t("settings.readerPreferences")}
          >
            <Settings2 className="h-3.5 w-3.5" />
          </Button>

          {settingsOpen && (
            <div className="absolute right-0 top-full mt-2 w-80 rounded-xl border border-border/80 bg-card/95 p-3.5 shadow-2xl backdrop-blur-2xl z-40 space-y-3.5">
              <div className="text-xs font-bold text-foreground border-b border-border/60 pb-2">
                {t("settings.readerPreferences")}
              </div>

              {/* Spread layout */}
              <div className="space-y-1">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("reader.spreadMode")}
                </label>
                <SegmentedControl<ReaderSpreadMode>
                  size="sm"
                  className="w-full flex"
                  value={spreadMode}
                  onChange={onSpreadModeChange}
                  options={[
                    { value: "auto", label: t("reader.spreadAuto") },
                    { value: "single", label: t("reader.spreadSingle") },
                    { value: "double", label: t("reader.spreadDouble") },
                  ]}
                />
              </div>

              {/* Reading Direction */}
              <div className="space-y-1">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("reader.direction")}
                </label>
                <SegmentedControl<ReaderDirection>
                  size="sm"
                  className="w-full flex"
                  value={direction}
                  onChange={onDirectionChange}
                  options={[
                    { value: "rtl", label: t("reader.directionRTL") },
                    { value: "ltr", label: t("reader.directionLTR") },
                  ]}
                />
              </div>

              {/* Cover Solo */}
              <div className="flex items-center justify-between py-1">
                <span className="text-xs font-medium text-foreground">{t("reader.coverSolo")}</span>
                <Switch
                  size="sm"
                  checked={coverSolo}
                  onChange={onCoverSoloChange}
                />
              </div>

              {/* Fit Mode */}
              <div className="space-y-1">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("reader.fitMode")}
                </label>
                <SegmentedControl<ReaderFitMode>
                  size="sm"
                  className="w-full flex"
                  value={fitMode}
                  onChange={onFitModeChange}
                  options={[
                    { value: "contain", label: t("reader.fitContain") },
                    { value: "width", label: t("reader.fitWidth") },
                    { value: "height", label: t("reader.fitHeight") },
                    { value: "original", label: t("reader.fitOriginal") },
                  ]}
                />
              </div>

              {/* Visual Filter */}
              <div className="space-y-1">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("reader.filter")}
                </label>
                <SegmentedControl<ReaderFilter>
                  size="sm"
                  className="w-full flex"
                  value={filter}
                  onChange={onFilterChange}
                  options={[
                    { value: "none", label: t("reader.filterNone") },
                    { value: "invert", label: t("reader.filterInvert") },
                    { value: "sepia", label: t("reader.filterSepia") },
                    { value: "high-contrast", label: t("reader.filterHighContrast") },
                  ]}
                />
              </div>

              {/* Rotate and Fullscreen actions */}
              <div className="flex items-center gap-2 border-t border-border/60 pt-2.5">
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  onClick={onRotate}
                  className="h-7 text-xs gap-1.5 flex-1"
                  title={t("reader.rotate")}
                >
                  <RotateCw className="h-3.5 w-3.5" />
                  <span>{rotation > 0 ? `${rotation}°` : t("reader.rotate")}</span>
                </Button>

                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  onClick={toggleFullscreen}
                  className="h-7 text-xs gap-1.5 flex-1"
                >
                  {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
                  <span>{isFullscreen ? t("reader.exitFullscreen") : t("reader.fullscreen")}</span>
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Hide menu button */}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={onToggleLock ?? onHide}
          className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
          title={t("reader.collapseMenu")}
        >
          <EyeOff className="h-4 w-4" />
        </Button>
      </div>
    </header>

    {/* Floating expand button when menu is locked collapsed */}
    {menuLocked && !visible && (
      <div className="app-window-no-drag absolute top-2 right-3 z-40">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={onToggleLock ?? onHide}
          className="h-8 w-8 p-0 rounded-md bg-background/60 hover:bg-background/90 text-muted-foreground/70 hover:text-foreground border border-border/40 shadow-sm backdrop-blur-md transition-all"
          title={t("reader.expandMenu")}
        >
          <Eye className="h-4 w-4" />
        </Button>
      </div>
    )}
  </>
);
}
