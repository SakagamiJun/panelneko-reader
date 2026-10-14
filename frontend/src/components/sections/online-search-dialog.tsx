import { useState, useEffect, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertCircle,
  BookOpen,
  Check,
  CheckSquare,
  Download,
  Globe,
  Loader2,
  RefreshCw,
  Search,
  Square,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { appAdapter } from "@/lib/api";
import type {
  AppSettings,
  CreateDownloadTaskInput,
  OnlineMangaChapter,
  OnlineMangaItem,
} from "@/lib/contracts";
import { cn } from "@/lib/utils";

export interface OnlineSearchDialogProps {
  open: boolean;
  onClose: () => void;
  initialSource?: "copymanga" | "klz9";
  initialQuery?: string;
  settings?: AppSettings;
  onDownloadStarted?: () => void;
}

export function OnlineSearchDialog({
  open,
  onClose,
  initialSource = "copymanga",
  initialQuery = "",
  settings,
  onDownloadStarted,
}: OnlineSearchDialogProps) {
  const { t } = useTranslation();

  const [activeSource, setActiveSource] = useState<"copymanga" | "klz9">(initialSource);
  const [queryInput, setQueryInput] = useState(initialQuery);
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<OnlineMangaItem[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [selectedManga, setSelectedManga] = useState<OnlineMangaItem | null>(null);
  const [loadingChapters, setLoadingChapters] = useState(false);
  const [chapters, setChapters] = useState<OnlineMangaChapter[]>([]);
  const [activeGroup, setActiveGroup] = useState<string>("all");
  const [chaptersError, setChaptersError] = useState<string | null>(null);
  const [selectedChapterIds, setSelectedChapterIds] = useState<Set<string>>(new Set());
  const [isSubmittingDownload, setIsSubmittingDownload] = useState(false);

  const availableGroups = useMemo(() => {
    const set = new Set<string>();
    for (const ch of chapters) {
      if (ch.group) {
        set.add(ch.group);
      }
    }
    return Array.from(set);
  }, [chapters]);

  const displayedChapters = useMemo(() => {
    if (activeGroup === "all") return chapters;
    return chapters.filter((ch) => ch.group === activeGroup);
  }, [chapters, activeGroup]);

  // Sync initial query and source when opened
  useEffect(() => {
    if (open) {
      const source =
        initialSource === "klz9" && settings?.downloader?.enableRawManga
          ? "klz9"
          : settings?.downloader?.enableCopyManga
          ? "copymanga"
          : settings?.downloader?.enableRawManga
          ? "klz9"
          : initialSource;
      setActiveSource(source);
      setQueryInput(initialQuery);
      setSelectedManga(null);
      setChapters([]);
      setActiveGroup("all");
      setSelectedChapterIds(new Set());
      setSearchError(null);
      setChaptersError(null);

      if (initialQuery.trim()) {
        void executeSearch(source, initialQuery.trim());
      } else {
        setSearchResults([]);
      }
    }
  }, [open, initialSource, initialQuery, settings?.downloader?.enableCopyManga, settings?.downloader?.enableRawManga]);

  // Handle Escape key to close
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  const executeSearch = useCallback(
    async (source: "copymanga" | "klz9", query: string) => {
      if (!query.trim()) return;
      setSearching(true);
      setSearchError(null);
      setSelectedManga(null);
      setChapters([]);
      setSelectedChapterIds(new Set());

      try {
        const res = await appAdapter.searchOnlineManga(source, query.trim(), 1);
        setSearchResults(res.items || []);
      } catch (err: unknown) {
        setSearchError(err instanceof Error ? err.message : String(err));
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    },
    []
  );

  const handleSelectManga = async (manga: OnlineMangaItem) => {
    setSelectedManga(manga);
    setLoadingChapters(true);
    setChaptersError(null);
    setActiveGroup("all");
    setSelectedChapterIds(new Set());

    try {
      const fetchedChapters = await appAdapter.getOnlineMangaChapters(manga.source, manga.id);
      setChapters(fetchedChapters);
      // Default to selecting all chapters
      setSelectedChapterIds(new Set(fetchedChapters.map((c) => c.id)));
    } catch (err: unknown) {
      setChaptersError(err instanceof Error ? err.message : String(err));
      setChapters([]);
    } finally {
      setLoadingChapters(false);
    }
  };

  const handleToggleChapter = (chapterId: string) => {
    setSelectedChapterIds((prev) => {
      const next = new Set(prev);
      if (next.has(chapterId)) {
        next.delete(chapterId);
      } else {
        next.add(chapterId);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    setSelectedChapterIds((prev) => {
      const next = new Set(prev);
      for (const ch of displayedChapters) {
        next.add(ch.id);
      }
      return next;
    });
  };

  const handleDeselectAll = () => {
    setSelectedChapterIds((prev) => {
      const next = new Set(prev);
      for (const ch of displayedChapters) {
        next.delete(ch.id);
      }
      return next;
    });
  };

  const handleInvertSelection = () => {
    setSelectedChapterIds((prev) => {
      const next = new Set(prev);
      for (const ch of displayedChapters) {
        if (next.has(ch.id)) {
          next.delete(ch.id);
        } else {
          next.add(ch.id);
        }
      }
      return next;
    });
  };

  const handleStartDownload = async () => {
    if (!selectedManga || selectedChapterIds.size === 0 || isSubmittingDownload) {
      return;
    }

    const selectedList = chapters.filter((c) => selectedChapterIds.has(c.id));
    const tasks: CreateDownloadTaskInput[] = selectedList.map((ch) => ({
      source: selectedManga.source,
      mangaID: selectedManga.id,
      mangaTitle: selectedManga.title,
      mangaCoverURL: selectedManga.coverURL,
      chapterID: ch.id,
      chapterTitle: ch.title,
      chapterNumber: ch.number,
      chapterGroup: ch.group,
      targetSourceID: settings?.downloader?.targetSourceId,
    }));

    setIsSubmittingDownload(true);
    try {
      await appAdapter.createDownloadTasks(tasks);
      onDownloadStarted?.();
      onClose();
    } catch (err: unknown) {
      setChaptersError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmittingDownload(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md animate-in fade-in duration-150 p-4"
      onClick={onClose}
    >
      <div
        className="relative flex flex-col w-[960px] max-w-[96vw] h-[640px] max-h-[90vh] rounded-2xl border border-border/80 bg-card/95 backdrop-blur-2xl shadow-2xl overflow-hidden select-none animate-in zoom-in-95 duration-150 text-foreground"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={t("downloader.dialogTitle")}
      >
        {/* Top Header Bar */}
        <div className="flex items-center justify-between border-b border-border/60 px-5 h-14 shrink-0 bg-muted/20">
          <div className="flex items-center gap-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Download className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-foreground leading-none">
                {t("downloader.dialogTitle")}
              </h2>
            </div>
          </div>

          {/* Source Tabs */}
          <div className="flex items-center gap-1.5 bg-muted/50 p-1 rounded-lg border border-border/40">
            <button
              type="button"
              onClick={() => {
                setActiveSource("copymanga");
                if (queryInput.trim()) {
                  void executeSearch("copymanga", queryInput.trim());
                }
              }}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer",
                activeSource === "copymanga"
                  ? "bg-card text-foreground shadow-xs border border-border/60"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Globe className="h-3.5 w-3.5 text-primary" />
              <span>{t("downloader.sourceCopyManga")}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveSource("klz9");
                if (queryInput.trim()) {
                  void executeSearch("klz9", queryInput.trim());
                }
              }}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer",
                activeSource === "klz9"
                  ? "bg-card text-foreground shadow-xs border border-border/60"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Download className="h-3.5 w-3.5 text-amber-500" />
              <span>{t("downloader.sourceRawManga")}</span>
            </button>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={onClose}
            className="h-7 w-7 p-0 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/70"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Search Query Toolbar */}
        <div className="flex items-center gap-2 px-5 py-3 border-b border-border/50 bg-background/50">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/70" />
            <Input
              type="text"
              value={queryInput}
              onChange={(e) => setQueryInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  void executeSearch(activeSource, queryInput);
                }
              }}
              placeholder={t("downloader.searchPlaceholder")}
              className="pl-8.5 pr-8 h-8 text-xs bg-muted/30"
              autoFocus
            />
            {queryInput && (
              <button
                type="button"
                onClick={() => setQueryInput("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
          <Button
            type="button"
            size="xs"
            variant="primary"
            disabled={searching || !queryInput.trim()}
            onClick={() => void executeSearch(activeSource, queryInput)}
            className="h-8 px-3.5 text-xs gap-1.5 cursor-pointer font-medium"
          >
            {searching ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Search className="h-3.5 w-3.5" />
            )}
            <span>{searching ? t("downloader.searching") : t("library.rescan")}</span>
          </Button>
        </div>

        {/* Main Content Area (Split Pane) */}
        <div className="flex flex-1 min-h-0 overflow-hidden divide-x divide-border/60">
          {/* Left Panel: Search Results List */}
          <div className="w-[380px] shrink-0 flex flex-col bg-muted/10 overflow-hidden">
            <div className="px-3.5 py-2 border-b border-border/40 text-[11px] font-medium text-muted-foreground flex items-center justify-between">
              <span>{t("downloader.onlineGroup")}</span>
              <span className="font-mono text-[10px]">{searchResults.length}</span>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
              {searching ? (
                <div className="flex flex-col items-center justify-center h-48 gap-2 text-muted-foreground text-xs">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  <span>{t("downloader.searching")}</span>
                </div>
              ) : searchError ? (
                <div className="flex flex-col items-center justify-center p-6 text-center gap-2">
                  <AlertCircle className="h-5 w-5 text-destructive" />
                  <span className="text-xs text-destructive">{searchError}</span>
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    onClick={() => void executeSearch(activeSource, queryInput)}
                    className="mt-2 text-xs"
                  >
                    <RefreshCw className="h-3 w-3 mr-1" />
                    <span>{t("downloader.retry")}</span>
                  </Button>
                </div>
              ) : searchResults.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-muted-foreground/60 text-xs text-center px-4">
                  <span>{t("downloader.searchEmpty")}</span>
                </div>
              ) : (
                searchResults.map((manga) => {
                  const isSelected = selectedManga?.id === manga.id;
                  return (
                    <button
                      key={manga.id}
                      type="button"
                      onClick={() => void handleSelectManga(manga)}
                      className={cn(
                        "w-full flex items-start gap-3 p-2.5 rounded-xl text-left transition-colors border cursor-pointer group select-none",
                        isSelected
                          ? "bg-primary/10 border-primary/30 shadow-xs"
                          : "bg-card/60 hover:bg-muted/60 border-border/40"
                      )}
                    >
                      {/* Cover Thumbnail */}
                      <div className="h-16 w-11 shrink-0 rounded-md bg-muted/80 overflow-hidden border border-border/40 flex items-center justify-center">
                        {manga.coverURL ? (
                          <img
                            src={manga.coverURL}
                            alt={manga.title}
                            className="h-full w-full object-cover"
                            loading="lazy"
                            onError={(e) => {
                              (e.currentTarget as HTMLElement).style.display = "none";
                            }}
                          />
                        ) : (
                          <BookOpen className="h-4 w-4 text-muted-foreground/40" />
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex flex-col min-w-0 flex-1 gap-1">
                        <span
                          className={cn(
                            "text-xs font-semibold leading-tight line-clamp-2",
                            isSelected ? "text-primary" : "text-foreground group-hover:text-primary transition-colors"
                          )}
                        >
                          {manga.title}
                        </span>
                        {manga.author && (
                          <span className="text-[10px] text-muted-foreground/80 truncate font-medium">
                            {manga.author}
                          </span>
                        )}
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[9px] font-mono px-1 py-0.5 rounded bg-muted text-muted-foreground/80 border border-border/40">
                            {manga.status === "completed"
                              ? t("downloader.statusFinished")
                              : t("downloader.statusOngoing")}
                          </span>
                          {typeof manga.totalChapters === "number" && manga.totalChapters > 0 && (
                            <span className="text-[10px] font-mono text-muted-foreground/60">
                              {manga.totalChapters} {t("reader.chapters")}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Panel: Chapter Selection & Download */}
          <div className="flex-1 flex flex-col bg-background overflow-hidden">
            {!selectedManga ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground/50 text-xs gap-2">
                <BookOpen className="h-8 w-8 stroke-1 text-muted-foreground/40" />
                <span>{t("downloader.idleStatus")}</span>
              </div>
            ) : (
              <>
                {/* Selected Manga Header */}
                <div className="px-5 py-3 border-b border-border/50 bg-muted/20 flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-xs font-bold text-foreground truncate max-w-sm">
                          {selectedManga.title}
                        </h3>
                        <Badge tone="default" className="text-[9px] font-mono">
                          {selectedManga.source}
                        </Badge>
                      </div>
                      <span className="text-[10px] text-muted-foreground truncate">
                        {selectedManga.author || selectedManga.id}
                      </span>
                    </div>
                  </div>

                  {/* Chapter Select Toolbar */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      onClick={handleSelectAll}
                      disabled={loadingChapters || chapters.length === 0}
                      className="h-6 px-2 text-[10px] text-muted-foreground hover:text-foreground"
                    >
                      <CheckSquare className="h-3 w-3 mr-1" />
                      <span>{t("downloader.selectAll")}</span>
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      onClick={handleInvertSelection}
                      disabled={loadingChapters || chapters.length === 0}
                      className="h-6 px-2 text-[10px] text-muted-foreground hover:text-foreground"
                    >
                      <span>{t("downloader.invertSelection")}</span>
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      onClick={handleDeselectAll}
                      disabled={loadingChapters || chapters.length === 0}
                      className="h-6 px-2 text-[10px] text-muted-foreground hover:text-foreground"
                    >
                      <Square className="h-3 w-3 mr-1" />
                      <span>{t("downloader.deselectAll")}</span>
                    </Button>
                  </div>
                </div>

                {/* Chapter List Area */}
                <div className="flex-1 overflow-y-auto p-4">
                  {loadingChapters ? (
                    <div className="flex flex-col items-center justify-center h-48 gap-2 text-muted-foreground text-xs">
                      <Loader2 className="h-5 w-5 animate-spin text-primary" />
                      <span>{t("downloader.loadingChapters")}</span>
                    </div>
                  ) : chaptersError ? (
                    <div className="flex flex-col items-center justify-center p-6 text-center gap-2">
                      <AlertCircle className="h-5 w-5 text-destructive" />
                      <span className="text-xs text-destructive">{chaptersError}</span>
                      <Button
                        type="button"
                        size="xs"
                        variant="outline"
                        onClick={() => void handleSelectManga(selectedManga)}
                        className="mt-2 text-xs"
                      >
                        <RefreshCw className="h-3 w-3 mr-1" />
                        <span>{t("downloader.retry")}</span>
                      </Button>
                    </div>
                  ) : chapters.length === 0 ? (
                    <div className="flex items-center justify-center h-48 text-muted-foreground/60 text-xs">
                      <span>{t("downloader.idleStatus")}</span>
                    </div>
                  ) : (
                    <>
                      {availableGroups.length > 1 && (
                        <div className="flex items-center gap-1.5 mb-3 overflow-x-auto pb-1">
                          <button
                            type="button"
                            onClick={() => setActiveGroup("all")}
                            className={cn(
                              "px-2.5 py-1 text-xs rounded-md font-medium transition-colors cursor-pointer border",
                              activeGroup === "all"
                                ? "bg-primary text-primary-foreground border-primary"
                                : "bg-muted/40 hover:bg-muted text-muted-foreground border-border/50"
                            )}
                          >
                            {t("downloader.allGroups") || "全部"} ({chapters.length})
                          </button>
                          {availableGroups.map((grp) => {
                            const count = chapters.filter((c) => c.group === grp).length;
                            return (
                              <button
                                key={grp}
                                type="button"
                                onClick={() => setActiveGroup(grp)}
                                className={cn(
                                  "px-2.5 py-1 text-xs rounded-md font-medium transition-colors cursor-pointer border",
                                  activeGroup === grp
                                    ? "bg-primary text-primary-foreground border-primary"
                                    : "bg-muted/40 hover:bg-muted text-muted-foreground border-border/50"
                                )}
                              >
                                {grp} ({count})
                              </button>
                            );
                          })}
                        </div>
                      )}
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                        {displayedChapters.map((ch) => {
                          const isChecked = selectedChapterIds.has(ch.id);
                          return (
                            <button
                              key={ch.id}
                              type="button"
                              onClick={() => handleToggleChapter(ch.id)}
                              className={cn(
                                "flex items-center justify-between p-2 rounded-lg text-left text-xs border transition-colors cursor-pointer select-none group",
                                isChecked
                                  ? "bg-primary/10 border-primary/40 text-foreground"
                                  : "bg-card hover:bg-muted/50 border-border/60 text-muted-foreground"
                              )}
                            >
                              <span className="truncate flex-1 font-medium text-[11px]" title={ch.title}>
                                {ch.title}
                              </span>
                              <div
                                className={cn(
                                  "h-3.5 w-3.5 rounded border flex items-center justify-center ml-1.5 shrink-0 transition-colors",
                                  isChecked
                                    ? "bg-primary border-primary text-primary-foreground"
                                    : "border-border/80 group-hover:border-primary/50"
                                )}
                              >
                                {isChecked && <Check className="h-2.5 w-2.5 stroke-[3]" />}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>

                {/* Bottom Action Footer */}
                <div className="flex items-center justify-between px-5 py-3 border-t border-border/50 bg-muted/20">
                  <div className="text-xs text-muted-foreground font-medium">
                    {t("downloader.selectedCount", {
                      selected: selectedChapterIds.size,
                      total: chapters.length,
                    })}
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={onClose}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      {t("settings.close")}
                    </Button>
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      disabled={selectedChapterIds.size === 0 || isSubmittingDownload}
                      onClick={() => void handleStartDownload()}
                      className="text-xs font-semibold gap-1.5 px-4 cursor-pointer shadow-xs"
                    >
                      {isSubmittingDownload ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Download className="h-3.5 w-3.5" />
                      )}
                      <span>
                        {t("downloader.downloadSelected", {
                          count: selectedChapterIds.size,
                        })}
                      </span>
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
