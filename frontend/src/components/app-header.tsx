import { useRef, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  BookOpen,
  Check,
  ChevronDown,
  Download,
  FolderCog,
  Folders,
  Globe,
  Languages,
  MoonStar,
  RefreshCw,
  Search,
  Settings2,
  Sparkles,
  SunMedium,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Kbd } from "@/components/ui/kbd";
import { DownloadPopover } from "@/components/download-popover";
import { appAdapter } from "@/lib/api";
import {
  type AppSettings,
  type DownloadProgress,
  type DownloadTask,
  EVENTS,
  type FollowedUpdateCheckProgress,
  type LibraryManga,
} from "@/lib/contracts";
import { isMacPlatform } from "@/lib/system";
import { useHasTrafficLights } from "@/hooks/use-traffic-lights";
import { cn } from "@/lib/utils";

interface AppHeaderProps {
  selectedCollectionPath: string | null;
  currentCollection?: LibraryManga | null;
  totalCount: number;
  onBackToMain: () => void;
  onToggleCollection?: (collection: LibraryManga) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  settings?: AppSettings;
  settingsPending?: boolean;
  onCycleTheme: () => void;
  onCycleLocale: () => void;
  settingsOpen: boolean;
  onToggleSettings: () => void;
  onOpenManageSources?: () => void;
  selectedSourceId?: string;
  onSelectSourceId?: (sourceId: string) => void;
  offlineSourcesCount?: number;
  showOffline?: boolean;
  onToggleShowOffline?: () => void;
  onRescan?: () => void;
  isRescanning?: boolean;
  localMangaItems?: LibraryManga[];
  onSelectLocalManga?: (id: string) => void;
  onOpenOnlineSearch?: (source: "copymanga" | "klz9", query: string) => void;
  onOpenSettingsTab?: (tab: "general" | "sources" | "downloads" | "reader" | "shortcuts" | "about") => void;
  downloadTasks?: DownloadTask[];
  downloadProgress?: DownloadProgress;
  onPauseTask?: (id: string) => void;
  onResumeTask?: (id: string) => void;
  onCancelTask?: (id: string) => void;
  onClearCompleted?: () => void;
  onCheckAllUpdates?: () => Promise<number | void>;
  followedUpdateProgress?: FollowedUpdateCheckProgress | null;
}

export function AppHeader({
  selectedCollectionPath,
  currentCollection,
  totalCount,
  onBackToMain,
  onToggleCollection,
  searchQuery,
  onSearchChange,
  settings,
  settingsPending = false,
  onCycleTheme,
  onCycleLocale,
  settingsOpen,
  onToggleSettings,
  onOpenManageSources,
  selectedSourceId = "all",
  onSelectSourceId,
  offlineSourcesCount = 0,
  showOffline = false,
  onToggleShowOffline,
  onRescan,
  isRescanning = false,
  localMangaItems = [],
  onSelectLocalManga,
  onOpenOnlineSearch,
  onOpenSettingsTab,
  downloadTasks: propDownloadTasks,
  downloadProgress: propDownloadProgress,
  followedUpdateProgress: propFollowedUpdateProgress,
  onPauseTask,
  onResumeTask,
  onCancelTask,
  onClearCompleted,
  onCheckAllUpdates,
}: AppHeaderProps) {
  const { t } = useTranslation();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const sourceMenuRef = useRef<HTMLDivElement>(null);
  const offlineMenuRef = useRef<HTMLDivElement>(null);
  const downloadMenuRef = useRef<HTMLDivElement>(null);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [isSourceMenuOpen, setIsSourceMenuOpen] = useState(false);
  const [isOfflineMenuOpen, setIsOfflineMenuOpen] = useState(false);
  const [isDownloadMenuOpen, setIsDownloadMenuOpen] = useState(false);
  const isMac = isMacPlatform();
  const hasTrafficLights = useHasTrafficLights();

  const [internalDownloadProgress, setInternalDownloadProgress] = useState<DownloadProgress>({
    activeTasks: 0,
    totalTasks: 0,
    downloadedPages: 0,
    totalPages: 0,
    speedFormatted: "0 B/s",
    bytesPerSec: 0,
  });
  const [internalDownloadTasks, setInternalDownloadTasks] = useState<DownloadTask[]>([]);
  const [internalFollowedUpdateProgress, setInternalFollowedUpdateProgress] =
    useState<FollowedUpdateCheckProgress | null>(null);

  useEffect(() => {
    if (propDownloadProgress === undefined) {
      void appAdapter.getDownloadProgress().then(setInternalDownloadProgress).catch(() => {});
      const offProgress = appAdapter.subscribe(EVENTS.DOWNLOAD_PROGRESS, (payload) => {
        if (payload && typeof payload === "object") {
          setInternalDownloadProgress(payload as DownloadProgress);
        }
      });
      return offProgress;
    }
  }, [propDownloadProgress]);

  useEffect(() => {
    if (propDownloadTasks !== undefined || !isDownloadMenuOpen) {
      return;
    }
    void appAdapter.getDownloadTasks().then(setInternalDownloadTasks).catch(() => {});
    const offTasks = appAdapter.subscribe(EVENTS.DOWNLOAD_TASKS_UPDATED, (payload) => {
      if (Array.isArray(payload)) {
        setInternalDownloadTasks(payload as DownloadTask[]);
      } else {
        void appAdapter.getDownloadTasks().then(setInternalDownloadTasks).catch(() => {});
      }
    });
    return offTasks;
  }, [propDownloadTasks, isDownloadMenuOpen]);

  useEffect(() => {
    if (propFollowedUpdateProgress === undefined) {
      void appAdapter.getFollowedUpdateCheckStatus().then(setInternalFollowedUpdateProgress).catch(() => {});
      const offUpdateCheck = appAdapter.subscribe(EVENTS.FOLLOWED_UPDATE_CHECK_PROGRESS, (payload) => {
        if (payload && typeof payload === "object") {
          setInternalFollowedUpdateProgress(payload as FollowedUpdateCheckProgress);
        }
      });
      return offUpdateCheck;
    }
  }, [propFollowedUpdateProgress]);

  const downloadProgress = propDownloadProgress ?? internalDownloadProgress;
  const downloadTasks = propDownloadTasks ?? internalDownloadTasks;
  const followedUpdateProgress = propFollowedUpdateProgress ?? internalFollowedUpdateProgress;

  const handlePauseTask = onPauseTask ?? ((id: string) => void appAdapter.pauseDownloadTask(id));
  const handleResumeTask =
    onResumeTask ??
    ((id: string) => {
      const task = downloadTasks.find((t) => t.id === id);
      if (task && (task.status === "failed" || task.status === "waiting_source")) {
        void appAdapter.retryDownloadTask(id);
      } else {
        void appAdapter.resumeDownloadTask(id);
      }
    });
  const handleCancelTask = onCancelTask ?? ((id: string) => void appAdapter.cancelDownloadTask(id));
  const handleClearCompleted =
    onClearCompleted ??
    (() => {
      void appAdapter.clearCompletedDownloadTasks().then(() => {
        void appAdapter.getDownloadTasks().then(setInternalDownloadTasks);
      });
    });
  const handleCheckAllUpdates =
    onCheckAllUpdates ??
    (async () => {
      const queuedCount = await appAdapter.checkAllFollowedUpdates();
      const tasks = await appAdapter.getDownloadTasks();
      setInternalDownloadTasks(tasks);
      const prog = await appAdapter.getDownloadProgress();
      setInternalDownloadProgress(prog);
      return queuedCount;
    });

  const isAllSources = !selectedSourceId || selectedSourceId === "all";
  const activeSource = settings?.librarySources?.find((s) => s.id === selectedSourceId);
  const activeDownloadsCount =
    downloadProgress?.activeTasks ??
    downloadTasks.filter((t) => t.status === "downloading" || t.status === "pending").length;
  const isCheckingUpdates = Boolean(followedUpdateProgress?.checking);
  const downloadButtonTitle = isCheckingUpdates
    ? followedUpdateProgress && followedUpdateProgress.total > 0
      ? `${t("downloader.checkingFollowedUpdates")} (${followedUpdateProgress.current}/${followedUpdateProgress.total})`
      : t("downloader.checkingFollowedUpdates")
    : t("downloader.managerTitle");

  const themeIcon =
    settings?.themeMode === "dark" ? (
      <MoonStar className="h-3.5 w-3.5" />
    ) : settings?.themeMode === "light" ? (
      <SunMedium className="h-3.5 w-3.5" />
    ) : (
      <Sparkles className="h-3.5 w-3.5" />
    );

  const themeLabel =
    settings?.themeMode === "dark"
      ? t("settings.dark")
      : settings?.themeMode === "light"
      ? t("settings.light")
      : t("settings.system");

  const localeBadge =
    !settings || settings.localeMode === "system"
      ? "SYS"
      : settings.locale === "zh-CN"
      ? "中"
      : settings.locale === "ja"
      ? "日"
      : "EN";

  // Shortcut to focus search or clear on Esc
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      if (e.key === "Escape" && document.activeElement === searchInputRef.current) {
        if (searchQuery) {
          e.preventDefault();
          onSearchChange("");
        } else {
          searchInputRef.current?.blur();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [searchQuery, onSearchChange]);

  // Click outside or Escape to dismiss source dropdown popover
  useEffect(() => {
    if (!isSourceMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (sourceMenuRef.current && !sourceMenuRef.current.contains(e.target as Node)) {
        setIsSourceMenuOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsSourceMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isSourceMenuOpen]);

  // Click outside or Escape to dismiss offline dropdown popover
  useEffect(() => {
    if (!isOfflineMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (offlineMenuRef.current && !offlineMenuRef.current.contains(e.target as Node)) {
        setIsOfflineMenuOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOfflineMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOfflineMenuOpen]);

  // Click outside to dismiss search composite popover
  useEffect(() => {
    if (!isSearchFocused) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setIsSearchFocused(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isSearchFocused]);

  // Click outside or Escape to dismiss download dropdown popover
  useEffect(() => {
    if (!isDownloadMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (downloadMenuRef.current && !downloadMenuRef.current.contains(e.target as Node)) {
        setIsDownloadMenuOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsDownloadMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isDownloadMenuOpen]);

  useEffect(() => {
    setHighlightedIndex(-1);
  }, [searchQuery]);

  const trimmedQuery = searchQuery.trim();
  const lowerQuery = trimmedQuery.toLowerCase();

  const localMatches = trimmedQuery
    ? localMangaItems
        .filter((item) => {
          const matchTitle = item.title.toLowerCase().includes(lowerQuery);
          const matchPath = item.relativePath?.toLowerCase().includes(lowerQuery);
          return matchTitle || matchPath;
        })
        .slice(0, 5)
    : [];

  const copyMangaEnabled = Boolean(settings?.downloader?.enableCopyManga);
  const rawMangaEnabled = Boolean(settings?.downloader?.enableRawManga);

  type ActionableItem =
    | { type: "local"; item: LibraryManga }
    | { type: "online"; source: "copymanga" | "klz9"; label: string }
    | { type: "settings"; label: string };

  const actionableItems: ActionableItem[] = [];
  if (trimmedQuery) {
    for (const m of localMatches) {
      actionableItems.push({ type: "local", item: m });
    }
    if (copyMangaEnabled) {
      actionableItems.push({
        type: "online",
        source: "copymanga",
        label: t("downloader.searchInCopyManga", { query: trimmedQuery }),
      });
    }
    if (rawMangaEnabled) {
      actionableItems.push({
        type: "online",
        source: "klz9",
        label: t("downloader.searchInRawManga", { query: trimmedQuery }),
      });
    }
    if (!copyMangaEnabled && !rawMangaEnabled) {
      actionableItems.push({
        type: "settings",
        label: t("downloader.openSettings"),
      });
    }
  }

  const handleSelectActionable = (action: ActionableItem) => {
    if (action.type === "local") {
      onSelectLocalManga?.(action.item.id);
      setIsSearchFocused(false);
    } else if (action.type === "online") {
      onOpenOnlineSearch?.(action.source, trimmedQuery);
      setIsSearchFocused(false);
    } else if (action.type === "settings") {
      onOpenSettingsTab?.("downloads");
      setIsSearchFocused(false);
    }
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!trimmedQuery || !isSearchFocused || actionableItems.length === 0) {
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev + 1) % actionableItems.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev - 1 + actionableItems.length) % actionableItems.length);
    } else if (e.key === "Enter") {
      if (highlightedIndex >= 0 && highlightedIndex < actionableItems.length) {
        e.preventDefault();
        handleSelectActionable(actionableItems[highlightedIndex]);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setIsSearchFocused(false);
    }
  };

  return (
    <header
      className={cn(
        "app-window-drag-region sticky top-0 z-20 flex h-12 items-center justify-between gap-3 border-b border-border/70 bg-background/80 px-3 backdrop-blur-xl transition-all select-none",
        hasTrafficLights ? "pl-20" : "pl-3"
      )}
    >
      {/* Left section: Breadcrumb and collection title */}
      <div className="app-window-no-drag flex items-center gap-2 min-w-0">
        {selectedCollectionPath ? (
          <div className="flex items-center gap-2 min-w-0">
            <Button
              type="button"
              size="xs"
              variant="ghost"
              className="text-xs text-muted-foreground hover:text-foreground shrink-0"
              onClick={onBackToMain}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>{t("library.backToMain")}</span>
            </Button>
            <span className="text-border text-xs shrink-0">/</span>
            <span className="truncate text-xs font-semibold text-foreground">
              {currentCollection ? currentCollection.title : selectedCollectionPath}
            </span>
            <Badge tone="running" className="shrink-0 font-mono text-[10px]">
              {totalCount}
            </Badge>
            {currentCollection && onToggleCollection && (
              <Button
                type="button"
                size="xs"
                variant="ghost"
                className="text-[11px] text-muted-foreground hover:text-foreground shrink-0 h-6 px-1.5 ml-1 gap-1"
                title={t("library.unsetCollection")}
                onClick={() => onToggleCollection(currentCollection)}
              >
                <Folders className="h-3 w-3" />
                <span className="hidden sm:inline">{t("library.unsetCollection")}</span>
              </Button>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary shrink-0">
              <BookOpen className="h-3.5 w-3.5" />
            </div>
            <span className="truncate text-xs font-bold tracking-tight text-foreground">
              {t("library.title")}
            </span>
            <Badge tone="default" className="shrink-0 font-mono text-[10px]">
              {totalCount}
            </Badge>

            {/* Multi-source directory dropdown popover */}
            {settings?.librarySources && settings.librarySources.length > 1 && onSelectSourceId && (
              <div ref={sourceMenuRef} className="relative ml-1">
                <button
                  type="button"
                  onClick={() => setIsSourceMenuOpen((prev) => !prev)}
                  className={cn(
                    "flex items-center gap-1.5 h-6 px-2 rounded-md text-[11px] font-medium transition-colors border select-none cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-primary/30",
                    isSourceMenuOpen
                      ? "bg-muted text-foreground border-border/80 shadow-xs"
                      : "bg-muted/40 hover:bg-muted/70 text-foreground/80 hover:text-foreground border-border/50"
                  )}
                  title={activeSource ? `${activeSource.name} (${activeSource.path})` : t("library.sourceFilter")}
                  aria-expanded={isSourceMenuOpen}
                >
                  {!isAllSources && (
                    <span
                      className={cn(
                        "h-1.5 w-1.5 rounded-full shrink-0",
                        !activeSource?.enabled
                          ? "bg-muted-foreground/40"
                          : activeSource?.status === "offline"
                          ? "bg-danger"
                          : "bg-emerald-500"
                      )}
                    />
                  )}
                  <span className="truncate max-w-[120px]">
                    {isAllSources ? t("library.filterAllSources") : activeSource?.name || t("library.filterAllSources")}
                  </span>
                  {!isAllSources && activeSource?.status === "offline" && (
                    <span className="text-[9px] font-mono text-danger shrink-0">
                      [{t("library.offlineTag")}]
                    </span>
                  )}
                  <ChevronDown
                    className={cn(
                      "h-3 w-3 text-muted-foreground/70 transition-transform duration-150 shrink-0",
                      isSourceMenuOpen && "rotate-180"
                    )}
                  />
                </button>

                {isSourceMenuOpen && (
                  <div
                    className="absolute left-0 top-full mt-1.5 w-72 rounded-xl border border-border/80 bg-card shadow-xl p-1 z-50 animate-in fade-in-0 zoom-in-95 origin-top-left"
                    role="menu"
                  >
                    {/* All Directories Item */}
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        onSelectSourceId("all");
                        setIsSourceMenuOpen(false);
                      }}
                      className={cn(
                        "w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer text-left",
                        isAllSources
                          ? "bg-primary/10 text-primary font-medium"
                          : "text-foreground hover:bg-muted/60"
                      )}
                    >
                      <span className="truncate">{t("library.filterAllSources")}</span>
                      {isAllSources && <Check className="h-3.5 w-3.5 shrink-0 text-primary ml-2" />}
                    </button>

                    <div className="h-px bg-border/40 my-1 mx-1" />

                    {/* Sources List */}
                    <div className="max-h-56 overflow-y-auto space-y-0.5 pr-0.5">
                      {settings.librarySources.map((s) => {
                        const isSelected = selectedSourceId === s.id;
                        const isOffline = s.status === "offline";
                        return (
                          <button
                            key={s.id}
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              onSelectSourceId(s.id);
                              setIsSourceMenuOpen(false);
                            }}
                            className={cn(
                              "w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer text-left group",
                              isSelected
                                ? "bg-primary/10 text-primary font-medium"
                                : "text-foreground hover:bg-muted/60"
                            )}
                            title={s.path}
                          >
                            <div className="flex items-start gap-2 min-w-0 flex-1">
                              <span
                                className={cn(
                                  "h-1.5 w-1.5 rounded-full shrink-0 mt-1.5",
                                  !s.enabled
                                    ? "bg-muted-foreground/40"
                                    : isOffline
                                    ? "bg-danger"
                                    : "bg-emerald-500"
                                )}
                              />
                              <div className="flex flex-col min-w-0 flex-1 gap-0.5">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <span className="truncate flex-1 font-medium">{s.name}</span>
                                  {isOffline && (
                                    <span className="text-[9px] font-mono text-danger bg-danger/10 px-1 py-0.5 rounded shrink-0">
                                      {t("library.offlineTag")}
                                    </span>
                                  )}
                                  {typeof s.mangaCount === "number" && !isOffline && (
                                    <span className="text-[10px] font-mono text-muted-foreground/60 shrink-0">
                                      {s.mangaCount}
                                    </span>
                                  )}
                                  {s.type && (
                                    <span className="text-[9px] uppercase tracking-wider font-mono text-muted-foreground/50 px-1 rounded border border-border/40 shrink-0">
                                      {s.type}
                                    </span>
                                  )}
                                </div>
                                <span className="text-[10px] font-mono text-muted-foreground/50 truncate max-w-[210px]" title={s.path}>
                                  {s.path}
                                </span>
                              </div>
                            </div>
                            {isSelected && <Check className="h-3.5 w-3.5 shrink-0 text-primary ml-2" />}
                          </button>
                        );
                      })}
                    </div>

                    {/* Actions row: Manage Directories & Rescan */}
                    {(onOpenManageSources || onRescan) && (
                      <>
                        <div className="h-px bg-border/40 my-1 mx-1" />
                        <div className="flex items-center gap-1.5 p-1">
                          {onOpenManageSources && (
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                setIsSourceMenuOpen(false);
                                onOpenManageSources();
                              }}
                              className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer text-center font-medium select-none"
                            >
                              <FolderCog className="h-3.5 w-3.5 shrink-0" />
                              <span className="truncate">{t("library.manageSources")}</span>
                            </button>
                          )}
                          {onRescan && (
                            <button
                              type="button"
                              role="menuitem"
                              disabled={isRescanning}
                              onClick={() => {
                                onRescan();
                              }}
                              className={cn(
                                "flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-xs transition-colors text-center font-medium select-none",
                                isRescanning
                                  ? "text-muted-foreground/50 cursor-not-allowed bg-muted/30"
                                  : "text-muted-foreground hover:text-foreground hover:bg-muted/60 cursor-pointer"
                              )}
                            >
                              <RefreshCw className={cn("h-3.5 w-3.5 shrink-0", isRescanning && "animate-spin")} />
                              <span className="truncate">
                                {isRescanning ? t("library.rescanning") : t("library.rescan")}
                              </span>
                            </button>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Offline status indicator pill */}
        {offlineSourcesCount > 0 && (
          <div ref={offlineMenuRef} className="relative ml-1 shrink-0">
            <button
              type="button"
              onClick={() => setIsOfflineMenuOpen((prev) => !prev)}
              className={cn(
                "flex items-center gap-1.5 h-6 px-2 rounded-md text-[11px] font-medium transition-colors border select-none cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-amber-500/30",
                isOfflineMenuOpen
                  ? "bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/40 shadow-xs"
                  : "bg-amber-500/10 hover:bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30"
              )}
              title={
                offlineSourcesCount === 1
                  ? t("library.offlineBannerSingle")
                  : t("library.offlineBannerMultiple", { count: offlineSourcesCount })
              }
              aria-expanded={isOfflineMenuOpen}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" />
              <span className="whitespace-nowrap">
                {offlineSourcesCount === 1
                  ? t("library.offlinePillSingle")
                  : t("library.offlinePillMultiple", { count: offlineSourcesCount })}
              </span>
              <ChevronDown
                className={cn(
                  "h-3 w-3 text-amber-500/70 transition-transform duration-150 shrink-0",
                  isOfflineMenuOpen && "rotate-180"
                )}
              />
            </button>

            {isOfflineMenuOpen && (
              <div
                className="absolute left-0 top-full mt-1.5 w-72 rounded-xl border border-border/80 bg-card shadow-xl p-3 z-50 animate-in fade-in-0 zoom-in-95 origin-top-left space-y-2.5 text-xs select-none"
                role="dialog"
              >
                <div className="flex items-start gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0 mt-1.5" />
                  <p className="text-muted-foreground leading-relaxed text-[11px]">
                    {offlineSourcesCount === 1
                      ? t("library.offlineBannerSingle")
                      : t("library.offlineBannerMultiple", { count: offlineSourcesCount })}
                  </p>
                </div>

                <div className="flex items-center justify-end gap-1.5 pt-1 border-t border-border/40">
                  {onRescan && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      disabled={isRescanning}
                      onClick={() => {
                        onRescan();
                      }}
                      className="h-6 px-2 text-[11px] font-medium text-foreground hover:bg-muted/70 gap-1.5 cursor-pointer"
                    >
                      <RefreshCw className={cn("h-3 w-3", isRescanning && "animate-spin")} />
                      <span>{isRescanning ? t("library.rescanning") : t("library.rescan")}</span>
                    </Button>
                  )}
                  {onToggleShowOffline && (
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      onClick={() => {
                        onToggleShowOffline();
                      }}
                      className="h-6 px-2 text-[11px] font-medium border-border/70 hover:bg-muted/60 cursor-pointer text-foreground"
                    >
                      {showOffline ? t("library.hideOffline") : t("library.showOffline")}
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Middle section: Instant search filter with composite dropdown & Download Manager */}
      <div className="app-window-no-drag relative flex items-center max-w-sm sm:max-w-md flex-1 mx-2 gap-1.5">
        <div ref={searchContainerRef} className="relative flex items-center flex-1 min-w-0">
        <div className="relative w-full">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/70 pointer-events-none" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onFocus={() => setIsSearchFocused(true)}
            onChange={(e) => {
              onSearchChange(e.target.value);
              setIsSearchFocused(true);
            }}
            onKeyDown={handleSearchKeyDown}
            placeholder={t("library.searchPlaceholder")}
            className="h-7 w-full rounded-lg border border-border/60 bg-muted/40 pl-8 pr-14 text-xs text-foreground placeholder:text-muted-foreground/60 outline-none transition-all duration-150 focus:border-primary/50 focus:bg-background focus:ring-1 focus:ring-primary/20"
          />
          <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {searchQuery ? (
              <button
                type="button"
                onClick={() => {
                  onSearchChange("");
                  setIsSearchFocused(false);
                }}
                className="flex h-4 w-4 items-center justify-center rounded text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            ) : (
              <Kbd size="sm" className="hidden sm:inline-flex text-[9px] h-4 min-w-[1rem] px-1 opacity-60">
                {isMac ? "⌘F" : "^F"}
              </Kbd>
            )}
          </div>
        </div>

        {/* Dropdown Popover */}
        {isSearchFocused && trimmedQuery && (
          <div
            className="absolute left-0 top-full mt-1.5 w-full min-w-[320px] max-w-md rounded-xl border border-border/80 bg-card/95 shadow-xl backdrop-blur-xl p-1 z-50 animate-in fade-in-0 zoom-in-95 origin-top-left"
            role="listbox"
          >
            {/* Section 1: Local manga */}
            <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground/70 tracking-wider">
              {t("downloader.localMangaGroup")}
            </div>
            {localMatches.length > 0 ? (
              <div className="space-y-0.5">
                {localMatches.map((item, idx) => {
                  const isHighlighted = highlightedIndex === idx;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      role="option"
                      aria-selected={isHighlighted}
                      onClick={() => handleSelectActionable({ type: "local", item })}
                      className={cn(
                        "w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer text-left group",
                        isHighlighted ? "bg-primary/10 text-primary font-medium" : "text-foreground hover:bg-muted/60"
                      )}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <BookOpen className="h-3.5 w-3.5 shrink-0 text-muted-foreground group-hover:text-primary transition-colors" />
                        <div className="flex flex-col min-w-0 flex-1">
                          <span className="truncate font-medium">{item.title}</span>
                          {item.relativePath && (
                            <span className="text-[10px] text-muted-foreground/60 truncate font-mono">
                              {item.relativePath}
                            </span>
                          )}
                        </div>
                      </div>
                      {typeof item.chapterCount === "number" && item.chapterCount > 0 && (
                        <span className="text-[10px] font-mono text-muted-foreground/60 ml-2 shrink-0">
                          {t("library.chapterUnit", { count: item.chapterCount })}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="px-2.5 py-1.5 text-[11px] text-muted-foreground/60 select-none">
                {t("downloader.noLocalMatch")}
              </div>
            )}

            <div className="h-px bg-border/40 my-1 mx-1" />

            {/* Section 2: Online downloaders */}
            <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground/70 tracking-wider">
              {t("downloader.onlineGroup")}
            </div>

            <div className="space-y-0.5">
              {copyMangaEnabled && (
                (() => {
                  const actionIndex = localMatches.length;
                  const isHighlighted = highlightedIndex === actionIndex;
                  return (
                    <button
                      key="online-copymanga"
                      type="button"
                      role="option"
                      aria-selected={isHighlighted}
                      onClick={() =>
                        handleSelectActionable({
                          type: "online",
                          source: "copymanga",
                          label: t("downloader.searchInCopyManga", { query: trimmedQuery }),
                        })
                      }
                      className={cn(
                        "w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer text-left group",
                        isHighlighted ? "bg-primary/10 text-primary font-medium" : "text-foreground hover:bg-muted/60"
                      )}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <Globe className="h-3.5 w-3.5 shrink-0 text-primary" />
                        <span className="truncate font-medium">
                          {t("downloader.searchInCopyManga", { query: trimmedQuery })}
                        </span>
                      </div>
                      <span className="text-[9px] font-mono text-primary bg-primary/10 px-1.5 py-0.5 rounded shrink-0 ml-2">
                        {t("downloader.sourceCopyManga")}
                      </span>
                    </button>
                  );
                })()
              )}

              {rawMangaEnabled && (
                (() => {
                  const actionIndex = localMatches.length + (copyMangaEnabled ? 1 : 0);
                  const isHighlighted = highlightedIndex === actionIndex;
                  return (
                    <button
                      key="online-klz9"
                      type="button"
                      role="option"
                      aria-selected={isHighlighted}
                      onClick={() =>
                        handleSelectActionable({
                          type: "online",
                          source: "klz9",
                          label: t("downloader.searchInRawManga", { query: trimmedQuery }),
                        })
                      }
                      className={cn(
                        "w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer text-left group",
                        isHighlighted ? "bg-primary/10 text-primary font-medium" : "text-foreground hover:bg-muted/60"
                      )}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <Download className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                        <span className="truncate font-medium">
                          {t("downloader.searchInRawManga", { query: trimmedQuery })}
                        </span>
                      </div>
                      <span className="text-[9px] font-mono text-amber-600 dark:text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded shrink-0 ml-2">
                        {t("downloader.sourceRawManga")}
                      </span>
                    </button>
                  );
                })()
              )}

              {!copyMangaEnabled && !rawMangaEnabled && (
                <div className="flex items-center justify-between px-2.5 py-1.5 text-xs text-muted-foreground/80">
                  <span className="truncate text-[11px]">{t("downloader.onlineSearchDisabled")}</span>
                  <button
                    type="button"
                    onClick={() => {
                      onOpenSettingsTab?.("downloads");
                      setIsSearchFocused(false);
                    }}
                    className="text-primary hover:underline font-medium text-[11px] shrink-0 ml-2 cursor-pointer"
                  >
                    {t("downloader.openSettings")}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Download Manager Icon Button & Dropdown Popover */}
      <div ref={downloadMenuRef} className="relative shrink-0">
        <Button
          type="button"
          size="xs"
          variant="ghost"
          onClick={() => {
            setIsDownloadMenuOpen((prev) => !prev);
            setIsSearchFocused(false);
          }}
          className={cn(
            "relative h-7 px-2 text-xs gap-1.5 transition-colors border outline-none select-none cursor-pointer",
            isDownloadMenuOpen
              ? "bg-primary/10 text-primary border-primary/30 font-semibold shadow-xs"
              : activeDownloadsCount > 0
              ? "border-primary/30 bg-primary/5 text-primary hover:bg-primary/10"
              : isCheckingUpdates
              ? "border-primary/30 bg-primary/5 text-primary hover:bg-primary/10"
              : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/60"
          )}
          title={downloadButtonTitle}
          aria-label={t("downloader.managerTitle")}
        >
          <div className="relative flex items-center justify-center">
            {activeDownloadsCount === 0 && isCheckingUpdates ? (
              <RefreshCw className="h-3.5 w-3.5 text-primary animate-spin shrink-0" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            {activeDownloadsCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
              </span>
            )}
          </div>
          {activeDownloadsCount > 0 ? (
            <div className="flex items-center gap-1 font-mono text-[11px] font-semibold text-primary">
              <span>{activeDownloadsCount}</span>
              {downloadProgress?.speedFormatted ? (
                <>
                  <span className="text-primary/40 font-normal">·</span>
                  <span className="text-[10px] tracking-tight">{downloadProgress.speedFormatted}</span>
                </>
              ) : null}
              {isCheckingUpdates && (
                <RefreshCw className="h-2.5 w-2.5 ml-0.5 text-primary/80 animate-spin shrink-0" />
              )}
            </div>
          ) : isCheckingUpdates ? (
            <span className="font-mono text-[11px] font-semibold text-primary">
              {followedUpdateProgress && followedUpdateProgress.total > 0
                ? `${followedUpdateProgress.current}/${followedUpdateProgress.total}`
                : t("downloader.checkingShort")}
            </span>
          ) : null}
        </Button>

        {isDownloadMenuOpen && (
          <div className="absolute right-0 top-full mt-1.5 z-50 origin-top-right">
            <DownloadPopover
              tasks={downloadTasks}
              progress={
                downloadProgress ?? {
                  activeTasks: 0,
                  totalTasks: 0,
                  downloadedPages: 0,
                  totalPages: 0,
                  speedFormatted: "",
                  bytesPerSec: 0,
                }
              }
              checkProgress={followedUpdateProgress}
              onPauseTask={handlePauseTask}
              onResumeTask={handleResumeTask}
              onCancelTask={handleCancelTask}
              onClearCompleted={handleClearCompleted}
              onCheckAllUpdates={handleCheckAllUpdates}
              onOpenSettings={() => {
                setIsDownloadMenuOpen(false);
                onOpenSettingsTab?.("downloads");
              }}
              onClose={() => setIsDownloadMenuOpen(false)}
            />
          </div>
        )}
      </div>
    </div>

      {/* Right section: Theme, Language, Settings */}
      <div className="app-window-no-drag flex items-center gap-1.5 shrink-0">
        {/* Theme Cycler */}
        <Button
          type="button"
          size="xs"
          variant="ghost"
          disabled={!settings || settingsPending}
          onClick={onCycleTheme}
          className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
          title={`${t("shell.theme")}: ${themeLabel}`}
        >
          {themeIcon}
        </Button>

        {/* Language Cycler */}
        <Button
          type="button"
          size="xs"
          variant="ghost"
          disabled={!settings || settingsPending}
          onClick={onCycleLocale}
          className="h-7 px-2 text-xs font-mono font-semibold text-muted-foreground hover:text-foreground gap-1"
          title={t("shell.language")}
        >
          <Languages className="h-3.5 w-3.5" />
          <span className="text-[10px]">{localeBadge}</span>
        </Button>

        <div className="h-4 w-px bg-border/60 mx-0.5" />

        {/* Settings Toggle */}
        <Button
          type="button"
          size="xs"
          variant="ghost"
          onClick={onToggleSettings}
          className={cn(
            "h-7 px-2.5 text-xs gap-1.5 transition-colors border outline-none focus:outline-none focus-visible:ring-0",
            settingsOpen
              ? "bg-primary/10 text-primary border-primary/30 font-semibold shadow-xs"
              : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/60"
          )}
          title={`${t("shell.settings")} (${isMac ? "⌘," : "Ctrl+,"})`}
        >
          <Settings2 className="h-3.5 w-3.5" />
          <span className="hidden sm:inline font-medium">{t("shell.settings")}</span>
          <Kbd size="sm" className="hidden md:inline-flex text-[9px] h-4 min-w-[1rem] px-1 opacity-60 ml-0.5">
            {isMac ? "⌘," : "^,"}
          </Kbd>
        </Button>
      </div>
    </header>
  );
}
