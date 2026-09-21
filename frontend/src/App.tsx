import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useTranslation } from "react-i18next";
import {
  BookImage,
  ChevronsLeft,
  Folder,
  FolderOpen,
  Loader2,
  Pin,
  Search,
  Settings2,
} from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { SettingsPanel } from "@/components/sections/settings-panel";
import { ReaderController, type ReaderJumpRequest } from "@/components/reader-controller";
import { Button } from "@/components/ui/button";
import { appAdapter } from "@/lib/api";
import {
  type AppSettings,
  EVENTS,
  type LibraryManga,
} from "@/lib/contracts";
import { i18n } from "@/lib/i18n";
import { emitRuntimeEvent } from "@/lib/runtime";
import { resolveLocale, resolveTheme } from "@/lib/system";
import { cn, formatDateTime } from "@/lib/utils";

export default function App() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [paneVisible, setPaneVisible] = useState(false);
  const [paneWidth, setPaneWidth] = useState(400);
  const [selectedCollectionPath, setSelectedCollectionPath] = useState<string | null>(null);
  const [selectedLibraryID, setSelectedLibraryID] = useState<string | null>(null);
  const [readerMode, setReaderMode] = useState<"scroll" | "paged">("paged");
  const [readerJumpRequest, setReaderJumpRequest] = useState<ReaderJumpRequest | null>(null);
  const [, setReaderChapterTitle] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const settingsQuery = useQuery({
    queryKey: ["settings"],
    queryFn: () => appAdapter.getSettings(),
  });

  const versionQuery = useQuery({
    queryKey: ["appVersion"],
    queryFn: () => appAdapter.getAppVersion(),
  });

  const libraryQuery = useQuery({
    queryKey: ["library"],
    queryFn: () => appAdapter.listLibraryManga(),
  });

  const readerQuery = useQuery({
    queryKey: ["reader", selectedLibraryID],
    enabled: Boolean(selectedLibraryID),
    queryFn: () => appAdapter.getReaderManifest(selectedLibraryID!),
  });

  useEffect(() => {
    setReaderChapterTitle(null);
  }, [selectedLibraryID]);

  useEffect(() => {
    const offSettings = appAdapter.subscribe(EVENTS.SETTINGS_UPDATED, () => {
      void queryClient.invalidateQueries({ queryKey: ["library"] });
    });
    const offLibrary = appAdapter.subscribe(EVENTS.LIBRARY_UPDATED, () => {
      void queryClient.invalidateQueries({ queryKey: ["library"] });
    });

    return () => {
      offSettings();
      offLibrary();
    };
  }, [queryClient]);

  useEffect(() => {
    const settings = settingsQuery.data;
    if (!settings) {
      return;
    }

    const mediaQuery =
      typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-color-scheme: dark)")
        : null;

    const applyTheme = () => {
      const resolvedTheme = resolveTheme(
        settings.themeMode,
        mediaQuery?.matches ?? false
      );
      document.documentElement.setAttribute("data-theme", resolvedTheme);
      emitRuntimeEvent(EVENTS.THEME_RESOLVED, {
        mode: settings.themeMode,
        resolved: resolvedTheme,
      });
    };

    const resolvedLocale = resolveLocale(settings, navigator.languages);
    void i18n.changeLanguage(resolvedLocale);
    emitRuntimeEvent(EVENTS.LOCALE_RESOLVED, {
      mode: settings.localeMode,
      locale: resolvedLocale,
    });

    applyTheme();
    if (!mediaQuery) {
      return;
    }

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", applyTheme);
      return () => mediaQuery.removeEventListener("change", applyTheme);
    }

    if (typeof mediaQuery.addListener === "function") {
      mediaQuery.addListener(applyTheme);
      return () => mediaQuery.removeListener(applyTheme);
    }
  }, [settingsQuery.data]);

  useEffect(() => {
    if (!selectedLibraryID || !settingsQuery.data) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "SELECT" ||
        document.activeElement?.tagName === "TEXTAREA" ||
        (document.activeElement as HTMLElement)?.isContentEditable
      ) {
        return;
      }

      const s = settingsQuery.data.shortcuts || {};
      const key = e.key.toLowerCase();
      if (s.backToLibrary && key === s.backToLibrary.toLowerCase()) {
        e.preventDefault();
        setSelectedLibraryID(null);
      } else if (s.toggleMode && key === s.toggleMode.toLowerCase()) {
        e.preventDefault();
        setReaderMode((m) => (m === "scroll" ? "paged" : "scroll"));
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedLibraryID, settingsQuery.data]);

  useEffect(() => {
    if (selectedLibraryID || !selectedCollectionPath) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "SELECT" ||
        document.activeElement?.tagName === "TEXTAREA" ||
        (document.activeElement as HTMLElement)?.isContentEditable
      ) {
        return;
      }

      if (e.key === "Escape" || e.key === "Backspace") {
        e.preventDefault();
        setSelectedCollectionPath(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedLibraryID, selectedCollectionPath]);

  useEffect(() => {
    setReaderJumpRequest(null);
  }, [selectedLibraryID]);

  const settingsMutation = useMutation({
    mutationFn: (input: AppSettings) => appAdapter.updateSettings(input),
    onSuccess: async (updated) => {
      queryClient.setQueryData(["settings"], updated);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["settings"] }),
        queryClient.invalidateQueries({ queryKey: ["library"] }),
      ]);
    },
  });

  const togglePinMutation = useMutation({
    mutationFn: (mangaID: string) => appAdapter.togglePin(mangaID),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["library"] });
    },
  });

  const settings = settingsQuery.data;
  const library = libraryQuery.data ?? [];
  const selectedLibrary = library.find((item) => item.id === selectedLibraryID) ?? null;
  const parentCollection = selectedLibrary?.parentPath
    ? library.find((item) => item.relativePath === selectedLibrary.parentPath && item.isCollection)
    : null;
  const currentCollection = selectedCollectionPath
    ? library.find((item) => item.relativePath === selectedCollectionPath && item.isCollection)
    : null;

  const displayedItems = library
    .filter((item) => {
      if (selectedCollectionPath) {
        return item.parentPath === selectedCollectionPath;
      }
      return !item.parentPath;
    })
    .sort((a, b) => {
      if (Boolean(a.isPinned) !== Boolean(b.isPinned)) {
        return a.isPinned ? -1 : 1;
      }
      if (a.isPinned && b.isPinned && a.pinnedAt !== b.pinnedAt) {
        return (b.pinnedAt ?? "").localeCompare(a.pinnedAt ?? "");
      }
      return 0;
    });

  const filteredItems = displayedItems.filter((item) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    return (
      item.title.toLowerCase().includes(q) ||
      item.relativePath.toLowerCase().includes(q)
    );
  });

  const togglePane = () => {
    setPaneVisible((current) => !current);
  };

  const startResize = (clientX: number, initialWidth: number) => {
    const handleMouseMove = (event: MouseEvent) => {
      const nextWidth = initialWidth + event.clientX - clientX;
      setPaneWidth(Math.min(520, Math.max(340, nextWidth)));
    };

    const handleMouseUp = () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  const handleExitReader = () => {
    if (parentCollection) {
      setSelectedCollectionPath(parentCollection.relativePath);
    }
    setSelectedLibraryID(null);
  };

  const cycleTheme = () => {
    if (!settings) return;
    const nextTheme =
      settings.themeMode === "system"
        ? "light"
        : settings.themeMode === "light"
        ? "dark"
        : "system";
    settingsMutation.mutate({ ...settings, themeMode: nextTheme });
  };

  const cycleLocale = () => {
    if (!settings) return;
    const sequence: Array<{
      localeMode: AppSettings["localeMode"];
      locale: AppSettings["locale"];
    }> = [
      { localeMode: "system", locale: "en" },
      { localeMode: "manual", locale: "zh-CN" },
      { localeMode: "manual", locale: "en" },
      { localeMode: "manual", locale: "ja" },
    ];
    const currentIndex = sequence.findIndex(
      (item) =>
        item.localeMode === settings.localeMode &&
        (settings.localeMode === "system" || item.locale === settings.locale)
    );
    const next = sequence[(currentIndex + 1 + sequence.length) % sequence.length];
    settingsMutation.mutate({
      ...settings,
      localeMode: next.localeMode,
      locale: next.locale,
    });
  };

  return (
    <main className="h-screen overflow-hidden bg-background text-foreground flex flex-col antialiased select-none">
      {!selectedLibraryID && (
        <AppHeader
          selectedCollectionPath={selectedCollectionPath}
          currentCollection={currentCollection}
          totalCount={displayedItems.length}
          onBackToMain={() => setSelectedCollectionPath(null)}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          settings={settings}
          settingsPending={settingsMutation.isPending}
          onCycleTheme={cycleTheme}
          onCycleLocale={cycleLocale}
          settingsOpen={paneVisible}
          onToggleSettings={togglePane}
          onOpenLibraryFolder={
            settings?.libraryRoot
              ? () => {
                  void appAdapter.selectDirectory();
                }
              : undefined
          }
        />
      )}

      <div className="relative flex-1 min-h-0 overflow-hidden">
        {selectedLibraryID && readerQuery.isLoading ? (
          <div className="flex h-full items-center justify-center bg-card/20 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2 text-primary" />
            Loading reader…
          </div>
        ) : selectedLibraryID && readerQuery.isError ? (
          <div className="flex h-full items-center justify-center bg-card/20 text-sm text-danger">
            Failed to open this manga reader.
          </div>
        ) : selectedLibraryID && readerQuery.data && settings ? (
          <ReaderController
            jumpRequest={readerJumpRequest}
            manifest={readerQuery.data}
            mode={readerMode}
            onModeChange={setReaderMode}
            settings={settings}
            onUpdateSettings={(patch) => {
              if (settings) {
                settingsMutation.mutate({ ...settings, ...patch });
              }
            }}
            onChapterChange={(_, title) => setReaderChapterTitle(title)}
            onExitReader={handleExitReader}
          />
        ) : selectedLibraryID && readerQuery.data ? (
          <div className="flex h-full items-center justify-center bg-card/20 text-sm text-muted-foreground">
            Loading reader settings…
          </div>
        ) : (
          <LibraryGrid
            items={filteredItems}
            totalItemsCount={displayedItems.length}
            searchQuery={searchQuery}
            onClearSearch={() => setSearchQuery("")}
            loading={libraryQuery.isLoading}
            emptyLabel={t("library.empty")}
            onOpenManga={(id) => {
              setSelectedLibraryID(id);
            }}
            onOpenCollection={setSelectedCollectionPath}
            onOpenSettings={togglePane}
            onTogglePin={(id) => togglePinMutation.mutate(id)}
            onOpenDirectory={(id) => {
              void appAdapter.openDirectory(id);
            }}
          />
        )}

        {/* Resizable Settings Drawer Panel */}
        {paneVisible && (
          <div
            className="pointer-events-none absolute inset-y-0 left-0 z-30 flex"
            style={{ width: paneWidth + 10 }}
          >
            <section
              className="pointer-events-auto h-full overflow-hidden border-r border-border/70 bg-card/95 backdrop-blur-2xl shadow-2xl flex flex-col"
              style={{ width: paneWidth }}
            >
              <div className="app-window-drag-region flex items-center justify-between border-b border-border/60 px-4 h-12 shrink-0">
                <div className="flex items-center gap-2">
                  <Settings2 className="h-4 w-4 text-primary" />
                  <h1 className="text-sm font-bold text-foreground">
                    {t("settings.title")}
                  </h1>
                </div>
                <Button
                  onClick={togglePane}
                  size="xs"
                  variant="ghost"
                  className="app-window-no-drag h-7 w-7 p-0 hover:bg-muted"
                  title={t("shell.collapseSidebar")}
                >
                  <ChevronsLeft className="h-4 w-4" />
                </Button>
              </div>

              <div className="flex-1 overflow-hidden">
                {settings ? (
                  <SettingsPanel
                    settings={settings}
                    onSave={(nextSettings) => settingsMutation.mutate(nextSettings)}
                    version={versionQuery.data}
                    isSaving={settingsMutation.isPending}
                  />
                ) : (
                  <div className="p-4 text-xs text-muted-foreground">
                    {t("settings.loading")}
                  </div>
                )}
              </div>
            </section>

            <button
              className="pointer-events-auto relative w-[10px] shrink-0 cursor-col-resize"
              onMouseDown={(event) => startResize(event.clientX, paneWidth)}
              type="button"
            >
              <span className="absolute bottom-0 left-1/2 top-0 w-px -translate-x-1/2 bg-border/60 transition hover:bg-primary/60" />
            </button>
          </div>
        )}
      </div>
    </main>
  );
}

function LibraryGrid({
  items,
  totalItemsCount,
  searchQuery,
  onClearSearch,
  loading,
  emptyLabel,
  onOpenManga,
  onOpenCollection,
  onOpenSettings,
  onTogglePin,
  onOpenDirectory,
}: {
  items: LibraryManga[];
  totalItemsCount: number;
  searchQuery: string;
  onClearSearch: () => void;
  loading: boolean;
  emptyLabel: string;
  onOpenManga: (mangaID: string) => void;
  onOpenCollection: (collectionPath: string) => void;
  onOpenSettings: () => void;
  onTogglePin: (mangaID: string) => void;
  onOpenDirectory: (mangaID: string) => void;
}) {
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  const [columns, setColumns] = useState(1);

  useEffect(() => {
    if (!scrollEl) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0].contentRect.width;
      if (width >= 3840) setColumns(12);
      else if (width >= 2560) setColumns(8);
      else if (width >= 1920) setColumns(6);
      else if (width >= 1280) setColumns(4);
      else if (width >= 768) setColumns(3);
      else setColumns(2);
    });
    observer.observe(scrollEl);
    return () => observer.disconnect();
  }, [scrollEl]);

  const rowCount = Math.ceil(items.length / columns);
  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollEl,
    estimateSize: () => 320,
    overscan: 2,
  });

  const { t } = useTranslation();

  if (loading) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center p-6 text-center">
        <div className="relative flex items-center justify-center mb-6">
          <div className="absolute h-20 w-20 animate-ping rounded-full bg-primary/10" />
          <div className="relative z-10 flex h-14 w-14 items-center justify-center rounded-2xl bg-card border border-border/80 shadow-md">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        </div>
        <h3 className="mb-2 text-base font-bold text-foreground">
          {t("library.loadingTitle")}
        </h3>
        <p className="max-w-xs text-xs text-muted-foreground leading-relaxed">
          {t("library.loadingDescription")}
        </p>
      </div>
    );
  }

  // Search yielded no results
  if (items.length === 0 && searchQuery) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-6 text-center text-muted-foreground">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/40 border border-border/60 mb-3 text-muted-foreground">
          <Search className="h-5 w-5" />
        </div>
        <h3 className="text-sm font-semibold text-foreground mb-1">
          {t("library.noMatches")}
        </h3>
        <p className="text-xs text-muted-foreground mb-4">
          未找到包含 "{searchQuery}" 的漫画
        </p>
        <Button onClick={onClearSearch} size="xs" variant="outline">
          清空搜索
        </Button>
      </div>
    );
  }

  // Completely empty library
  if (items.length === 0 && totalItemsCount === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-6 text-center text-muted-foreground">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/40 border border-border/60 mb-3 text-muted-foreground/60">
          <BookImage className="h-7 w-7" />
        </div>
        <p className="max-w-md text-xs sm:text-sm font-medium mb-4 leading-relaxed">
          {emptyLabel}
        </p>
        <Button onClick={onOpenSettings} size="sm" variant="outline">
          配置漫画库目录
        </Button>
      </div>
    );
  }

  return (
    <div ref={setScrollEl} className="h-full overflow-y-auto p-3 sm:p-4 relative">
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: "100%",
          position: "relative",
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const startIndex = virtualRow.index * columns;
          const rowItems = items.slice(startIndex, startIndex + columns);

          return (
            <div
              key={virtualRow.index}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${virtualRow.start}px)`,
                display: "grid",
                gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                gap: "12px",
                paddingBottom: "12px",
              }}
            >
              {rowItems.map((item) => (
                <article
                  key={item.id}
                  className="group relative flex flex-col rounded-xl border border-border/70 bg-card overflow-hidden transition-all duration-200 hover:border-primary/40 hover:shadow-lg shadow-xs"
                >
                  <div
                    role="button"
                    tabIndex={0}
                    className="flex flex-col text-left cursor-pointer focus:outline-none"
                    onClick={() => {
                      if (item.isCollection) {
                        onOpenCollection(item.relativePath);
                      } else {
                        onOpenManga(item.id);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        if (item.isCollection) {
                          onOpenCollection(item.relativePath);
                        } else {
                          onOpenManga(item.id);
                        }
                      }
                    }}
                  >
                    <div className="relative aspect-[4/5] overflow-hidden bg-muted/50 w-full">
                      {item.coverImageURL ? (
                        <img
                          alt={item.title}
                          className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                          loading="lazy"
                          src={item.coverImageURL}
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-muted-foreground/60">
                          {item.isCollection ? (
                            <Folder className="h-10 w-10 text-muted-foreground/50" />
                          ) : (
                            <BookImage className="h-9 w-9" />
                          )}
                        </div>
                      )}

                      {/* Collection badge */}
                      {item.isCollection && (
                        <div className="absolute top-2 right-2 z-10 flex items-center gap-1 rounded-md bg-black/65 px-2 py-0.5 text-[10px] font-semibold text-white shadow-sm backdrop-blur-md border border-white/10">
                          <Folder className="h-3 w-3" />
                          <span>{t("library.collectionBadge")}</span>
                        </div>
                      )}

                      {/* Pinned bookmark tag */}
                      {item.isPinned && (
                        <div className="absolute top-2 left-2 z-10 flex items-center gap-1 rounded-md bg-amber-500/90 px-1.5 py-0.5 text-[10px] font-bold text-black shadow-sm backdrop-blur-sm">
                          <Pin className="h-2.5 w-2.5 fill-black" />
                          <span>{t("library.pinnedBadge")}</span>
                        </div>
                      )}

                      {/* Cover bottom text overlay */}
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-3 text-white pointer-events-none">
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-white/70 font-mono">
                          {item.isCollection
                            ? t("library.mangaUnit", { count: item.mangaCount || 0 })
                            : t("library.chapterUnit", { count: item.chapterCount })}
                        </div>
                        <div className="mt-0.5 line-clamp-2 text-xs sm:text-sm font-bold text-white leading-snug">
                          {item.title}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Card bottom info and actions bar */}
                  <div className="flex flex-1 items-center justify-between gap-2 px-3 py-2 bg-card border-t border-border/40">
                    <div
                      className="min-w-0 flex-1 cursor-pointer"
                      onClick={() => {
                        if (item.isCollection) {
                          onOpenCollection(item.relativePath);
                        } else {
                          onOpenManga(item.id);
                        }
                      }}
                    >
                      <div className="text-[11px] text-muted-foreground truncate">
                        {item.isCollection
                          ? `${t("library.chapterUnit", { count: item.chapterCount })} · ${t("library.pageUnit", { count: item.pageCount })}`
                          : t("library.pageUnit", { count: item.pageCount })}
                      </div>
                      <div className="mt-0.5 truncate text-[10px] text-muted-foreground/60">
                        {formatDateTime(item.lastUpdated)}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        title={t("library.openDirectory")}
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenDirectory(item.id);
                        }}
                        className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-all duration-150 hover:bg-muted hover:text-foreground group-hover:opacity-100"
                      >
                        <FolderOpen className="h-3.5 w-3.5" />
                      </button>

                      <button
                        type="button"
                        title={item.isPinned ? t("library.unpin") : t("library.pin")}
                        onClick={(e) => {
                          e.stopPropagation();
                          onTogglePin(item.id);
                        }}
                        className={cn(
                          "flex h-6 items-center gap-1 rounded-md px-1.5 text-[11px] font-medium transition-all duration-150 shrink-0",
                          item.isPinned
                            ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 hover:bg-amber-500/25"
                            : "text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-muted hover:text-foreground"
                        )}
                      >
                        <Pin
                          className={cn(
                            "h-3 w-3 transition-transform",
                            item.isPinned &&
                              "rotate-45 fill-amber-500 text-amber-500 dark:text-amber-400 dark:fill-amber-400"
                          )}
                        />
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
