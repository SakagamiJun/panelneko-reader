import { type ReactNode, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  BookImage,
  ChevronsLeft,
  ChevronsRight,
  Folder,
  FolderOpen,
  Languages,
  Loader2,
  MoonStar,
  Pin,
  Settings2,
  Sparkles,
  SunMedium,
  Telescope,
  Eye,
  EyeOff,
} from "lucide-react";
import { ReaderController, type ReaderJumpRequest } from "@/components/reader-controller";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { appAdapter } from "@/lib/api";
import {
  type AppSettings,
  EVENTS,
  type LibraryManga,
  type ReaderDirection,
  type ReaderSpreadMode,
  type ReaderFitMode,
  type ReaderFilter,
} from "@/lib/contracts";
import { i18n } from "@/lib/i18n";
import { emitRuntimeEvent } from "@/lib/runtime";
import { resolveLocale, resolveTheme } from "@/lib/system";
import { cn, formatDateTime } from "@/lib/utils";

const floatingSurfaceClass =
  "border border-slate-200/80 bg-[rgba(236,241,246,0.84)] text-slate-800 shadow-[0_1px_0_rgba(255,255,255,0.62)_inset,0_14px_36px_rgba(15,23,42,0.16)] backdrop-blur-2xl supports-[backdrop-filter]:bg-[rgba(236,241,246,0.72)]";

function formatLocaleState(settings: AppSettings | undefined, t: (key: string) => string) {
  if (!settings || settings.localeMode === "system") {
    return t("settings.system");
  }

  switch (settings.locale) {
    case "zh-CN":
      return "中文";
    case "ja":
      return "日本語";
    default:
      return "English";
  }
}

function formatThemeState(settings: AppSettings | undefined, t: (key: string) => string) {
  if (!settings) {
    return t("settings.system");
  }

  switch (settings.themeMode) {
    case "light":
      return t("settings.light");
    case "dark":
      return t("settings.dark");
    default:
      return t("settings.system");
  }
}

export default function App() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [paneVisible, setPaneVisible] = useState(false);
  const [paneWidth, setPaneWidth] = useState(380);
  const [selectedCollectionPath, setSelectedCollectionPath] = useState<string | null>(null);
  const [selectedLibraryID, setSelectedLibraryID] = useState<string | null>(null);
  const [readerMode, setReaderMode] = useState<"scroll" | "paged">("paged");
  const [readerJumpRequest, setReaderJumpRequest] = useState<ReaderJumpRequest | null>(null);
  const [readerChapterTitle, setReaderChapterTitle] = useState<string | null>(null);

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

    const mediaQuery = typeof window.matchMedia === "function" ? window.matchMedia("(prefers-color-scheme: dark)") : null;
    const applyTheme = () => {
      const resolvedTheme = resolveTheme(settings.themeMode, mediaQuery?.matches ?? false);
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

  const readerManifest = readerQuery.data ?? null;
  const localeState = formatLocaleState(settings, t);
  const localeBadge = formatLocaleBadge(settings);
  const themeState = formatThemeState(settings, t);
  const themeIcon =
    settings?.themeMode === "dark" ? (
      <MoonStar className="h-4 w-4" />
    ) : settings?.themeMode === "light" ? (
      <SunMedium className="h-4 w-4" />
    ) : (
      <Sparkles className="h-4 w-4" />
    );

  const togglePane = () => {
    setPaneVisible((current) => !current);
  };

  const startResize = (clientX: number, initialWidth: number) => {
    const handleMouseMove = (event: MouseEvent) => {
      const nextWidth = initialWidth + event.clientX - clientX;
      setPaneWidth(Math.min(500, Math.max(340, nextWidth)));
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
    if (!settings) {
      return;
    }

    const nextTheme =
      settings.themeMode === "system" ? "light" : settings.themeMode === "light" ? "dark" : "system";

    settingsMutation.mutate({
      ...settings,
      themeMode: nextTheme,
    });
  };

  const cycleLocale = () => {
    if (!settings) {
      return;
    }

    const sequence: Array<{ localeMode: AppSettings["localeMode"]; locale: AppSettings["locale"] }> = [
      { localeMode: "system", locale: "en" },
      { localeMode: "manual", locale: "zh-CN" },
      { localeMode: "manual", locale: "en" },
      { localeMode: "manual", locale: "ja" },
    ];

    const currentIndex = sequence.findIndex(
      (item) => item.localeMode === settings.localeMode && (settings.localeMode === "system" || item.locale === settings.locale)
    );
    const next = sequence[(currentIndex + 1 + sequence.length) % sequence.length];

    settingsMutation.mutate({
      ...settings,
      localeMode: next.localeMode,
      locale: next.locale,
    });
  };

  return (
    <main className="h-screen overflow-hidden bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0)),radial-gradient(circle_at_top_left,rgba(116,162,255,0.10),transparent_24%),linear-gradient(180deg,hsl(var(--background)),hsl(var(--background)))] text-foreground">
      <div className="flex h-full border border-border/60">
        <div className="relative min-w-0 flex-1">
          <section className="relative h-full overflow-hidden bg-card/20 ">
            {!selectedLibraryID && (
              <div className="app-window-drag-region absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-3 pl-20 pr-4 py-2">
                <div className={cn("flex max-w-[min(58vw,32rem)] items-center gap-2 px-3 py-1.5 text-xs font-semibold", floatingSurfaceClass)}>
                  {selectedCollectionPath ? (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-6 px-1.5 text-xs gap-1 text-slate-700 hover:text-slate-900 app-window-no-drag"
                        onClick={() => setSelectedCollectionPath(null)}
                      >
                        <ArrowLeft className="h-3.5 w-3.5" />
                        {t("library.backToMain")}
                      </Button>
                      <span className="text-slate-400">/</span>
                      <span className="truncate">{currentCollection ? currentCollection.title : selectedCollectionPath}</span>
                      {currentCollection && (
                        <Badge tone="running" className="max-w-[120px] truncate">
                          {t("library.mangaUnit", { count: currentCollection.mangaCount || displayedItems.length })}
                        </Badge>
                      )}
                    </>
                  ) : (
                    <span className="truncate">{t("library.title")}</span>
                  )}
                </div>
              </div>
            )}

            <div className="h-full pt-0">
              {selectedLibraryID && readerQuery.isLoading ? (
                <div className="flex h-full items-center justify-center border-l border-border/40 bg-card/14 text-sm text-muted-foreground">
                  Loading reader…
                </div>
              ) : selectedLibraryID && readerQuery.isError ? (
                <div className="flex h-full items-center justify-center border-l border-danger/20 bg-card/14 text-sm text-danger">
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
                <div className="flex h-full items-center justify-center border-l border-border/40 bg-card/14 text-sm text-muted-foreground">
                  Loading reader settings…
                </div>
              ) : (
                <LibraryGrid
                  emptyLabel={t("library.empty")}
                  items={displayedItems}
                  loading={libraryQuery.isLoading}
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
            </div>

            {/* Floating Action Buttons in bottom-left */}
            {!selectedLibraryID && (
              <div className="absolute bottom-4 left-4 z-30 flex items-center gap-2 app-window-no-drag">
                <RailUtilityButton
                  className={cn(
                    floatingSurfaceClass,
                    paneVisible
                      ? "border-slate-400 bg-[rgba(230,236,242,0.96)] text-slate-900 shadow-md"
                      : "text-slate-700 hover:bg-[rgba(236,241,246,0.92)] hover:text-slate-900"
                  )}
                  icon={<Settings2 className="h-4 w-4" />}
                  label={t("shell.settings")}
                  onClick={togglePane}
                />
                <RailUtilityButton
                  className={cn(floatingSurfaceClass, "text-slate-700 hover:bg-[rgba(236,241,246,0.92)] hover:text-slate-900")}
                  disabled={!settings || settingsMutation.isPending}
                  icon={themeIcon}
                  label={t("shell.theme")}
                  onClick={cycleTheme}
                  title={`${t("shell.theme")}: ${themeState}`}
                />
                <RailUtilityButton
                  badge={localeBadge}
                  className={cn(floatingSurfaceClass, "text-slate-700 hover:bg-[rgba(236,241,246,0.92)] hover:text-slate-900")}
                  disabled={!settings || settingsMutation.isPending}
                  icon={<Languages className="h-4 w-4" />}
                  label={t("shell.language")}
                  onClick={cycleLocale}
                  title={`${t("shell.language")}: ${localeState}`}
                />
              </div>
            )}
          </section>

          {paneVisible ? (
            <div className="pointer-events-none absolute inset-y-0 left-0 z-20 flex" style={{ width: paneWidth + 10 }}>
              <section
                className="pointer-events-auto h-full overflow-hidden border-r border-border/60 bg-card/90 backdrop-blur-xl"
                style={{ width: paneWidth }}
              >
                <div className="flex h-full flex-col">
                  <div className="app-window-drag-region border-b border-border/60 px-4 pt-7 pb-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <h1 className="truncate text-base font-black">
                          {t("settings.title")}
                        </h1>
                      </div>
                      <Button
                        onClick={togglePane}
                        size="sm"
                        variant="ghost"
                        className="app-window-no-drag h-8 w-8 p-0 hover:bg-muted"
                        title={t("shell.collapseSidebar")}
                      >
                        <ChevronsLeft className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto">
                    {settings ? (
                      <SettingsForm
                        settings={settings}
                        onSave={(nextSettings) => settingsMutation.mutate(nextSettings)}
                        version={versionQuery.data}
                      />
                    ) : (
                      <div className="p-3">
                        <div className="border border-dashed border-border/60 px-3 py-5 text-sm text-muted-foreground">
                          {t("settings.loading")}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </section>

              <button
                className="pointer-events-auto relative w-[10px] shrink-0 cursor-col-resize"
                onMouseDown={(event) => startResize(event.clientX, paneWidth)}
                type="button"
              >
                <span className="absolute bottom-0 left-1/2 top-0 w-px -translate-x-1/2 bg-border/80 transition hover:bg-primary/60" />
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}

function formatLocaleBadge(settings: AppSettings | undefined) {
  if (!settings || settings.localeMode === "system") {
    return "SYS";
  }

  switch (settings.locale) {
    case "zh-CN":
      return "中";
    case "ja":
      return "日";
    default:
      return "EN";
  }
}

function RailUtilityButton({
  badge,
  disabled = false,
  icon,
  label,
  onClick,
  title,
  className,
}: {
  badge?: string;
  disabled?: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
  title?: string;
  className?: string;
}) {
  return (
    <button
      className={cn(
        "relative inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-border/70 bg-background/80 text-muted-foreground shadow-[0_1px_0_rgba(255,255,255,0.35)_inset] transition-colors hover:bg-muted/70 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:bg-background/80 disabled:hover:text-muted-foreground",
        className
      )}
      disabled={disabled}
      onClick={onClick}
      title={title ?? label}
      type="button"
    >
      <span className="sr-only">{label}</span>
      {icon}
      {badge ? (
        <span className="absolute bottom-1 right-1 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-foreground px-1 text-[8px] font-bold leading-none text-background">
          {badge}
        </span>
      ) : null}
    </button>
  );
}

function PanelSection({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <section className="border border-border/60 bg-background/44 p-3">
      <div className="mb-3">
        <h3 className="text-xs font-black uppercase tracking-[0.18em]">{title}</h3>
        {subtitle ? <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p> : null}
      </div>
      {children}
    </section>
  );
}

function LibraryGrid({
  items,
  loading,
  emptyLabel,
  onOpenManga,
  onOpenCollection,
  onOpenSettings,
  onTogglePin,
  onOpenDirectory,
}: {
  items: LibraryManga[];
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
      if (width >= 3840) setColumns(12);      // 2160p
      else if (width >= 2560) setColumns(8);  // 1440p
      else if (width >= 1920) setColumns(6);  // 1080p
      else if (width >= 1280) setColumns(4);  // 720p
      else if (width >= 768) setColumns(3);   // 平板
      else setColumns(2);                     // 手机
    });
    observer.observe(scrollEl);
    return () => observer.disconnect();
  }, [scrollEl]);

  const rowCount = Math.ceil(items.length / columns);
  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollEl,
    estimateSize: () => 280,
    overscan: 2,
  });

  const { t } = useTranslation();

  if (loading) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center border-l border-border/40 bg-card/14 p-6 text-center">
        <div className="relative flex items-center justify-center mb-8">
          <div className="absolute h-24 w-24 animate-ping rounded-full bg-primary/20" />
          <div className="absolute h-16 w-16 animate-pulse rounded-full bg-primary/40" />
          <div className="relative z-10 flex h-16 w-16 items-center justify-center rounded-full bg-primary/90 text-primary-foreground shadow-xl ring-4 ring-primary/20 backdrop-blur">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        </div>
        <h3 className="mb-3 text-xl font-semibold tracking-tight text-foreground">
          {t("library.loadingTitle")}
        </h3>
        <p className="max-w-md text-sm text-muted-foreground/80 leading-relaxed">
          {t("library.loadingDescription")}
        </p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center border-l border-border/40 bg-card/14 p-6 text-center text-sm text-muted-foreground">
        <BookImage className="h-16 w-16 mb-4 text-muted-foreground/50" />
        <p className="max-w-md text-base font-semibold mb-2">{emptyLabel}</p>
        <Button onClick={onOpenSettings} size="sm" variant="outline" className="mt-2">
          Configure Library Directory
        </Button>
      </div>
    );
  }

  return (
    <div ref={setScrollEl} className="h-full overflow-y-auto bg-border/45 relative">
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: "100%",
          position: "relative",
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => (
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
              gap: "1px",
            }}
          >
            {items.slice(virtualRow.index * columns, (virtualRow.index + 1) * columns).map((item) => (
              <article
                className="group relative flex flex-col overflow-hidden bg-background/92 transition hover:bg-background"
                key={item.id}
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
                  <div className="relative aspect-[4/5] overflow-hidden bg-muted w-full">
                    {item.coverImageURL ? (
                      <img
                        alt={item.title}
                        className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.02]"
                        loading="lazy"
                        src={item.coverImageURL}
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                        {item.isCollection ? <Folder className="h-10 w-10 text-muted-foreground/60" /> : <BookImage className="h-9 w-9" />}
                      </div>
                    )}
                    {item.isCollection && (
                      <div className="absolute top-2.5 right-2.5 z-10 flex items-center gap-1.5 rounded-lg bg-slate-900/80 px-2 py-1 text-[11px] font-bold text-white shadow-md backdrop-blur-md">
                        <Folder className="h-3.5 w-3.5" />
                        <span>{t("library.collectionBadge")}</span>
                      </div>
                    )}
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/74 via-black/18 to-transparent px-3 py-3 text-black drop-shadow-[0_0_10px_rgba(255,255,255,1)]">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-black drop-shadow-[0_0_10px_rgba(255,255,255,1)]">
                        {item.isCollection
                          ? t("library.mangaUnit", { count: item.mangaCount || 0 })
                          : t("library.chapterUnit", { count: item.chapterCount })}
                      </div>
                      <div className="mt-1 line-clamp-2 text-base font-black">{item.title}</div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-1 items-center justify-between gap-2 px-3 py-3">
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
                    <div className="text-xs text-muted-foreground">
                      {item.isCollection
                        ? `${t("library.chapterUnit", { count: item.chapterCount })} · ${t("library.pageUnit", { count: item.pageCount })}`
                        : t("library.pageUnit", { count: item.pageCount })}
                    </div>
                    <div className="mt-1 truncate text-[11px] text-muted-foreground">{formatDateTime(item.lastUpdated)}</div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      title={t("library.openDirectory")}
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenDirectory(item.id);
                      }}
                      className="flex h-7 w-7 items-center justify-center rounded-md text-xs font-semibold text-muted-foreground opacity-0 transition-all duration-200 hover:bg-muted hover:text-foreground group-hover:opacity-100"
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
                        "flex h-7 items-center gap-1 rounded-md px-2 text-xs font-semibold transition-all duration-200 shrink-0",
                        item.isPinned
                          ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 hover:bg-amber-500/25"
                          : "text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-muted hover:text-foreground"
                      )}
                    >
                      <Pin
                        className={cn(
                          "h-3.5 w-3.5 transition-transform",
                          item.isPinned && "rotate-45 fill-amber-500 text-amber-500 dark:text-amber-400 dark:fill-amber-400"
                        )}
                      />
                      {item.isPinned && <span className="text-[11px]">{t("library.pinnedBadge")}</span>}
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function SettingsForm({
  settings,
  onSave,
  version,
}: {
  settings: AppSettings;
  onSave: (settings: AppSettings) => void;
  version?: string;
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState(settings);

  useEffect(() => {
    setForm(settings);
  }, [settings]);

  const handleSelectDirectory = async () => {
    try {
      const selected = await appAdapter.selectDirectory();
      if (selected) {
        setForm((current) => ({ ...current, libraryRoot: selected }));
      }
    } catch (error) {
      console.error("Failed to select directory:", error);
    }
  };

  return (
    <div className="space-y-3 p-3">
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          onSave(form);
        }}
      >
        <PanelSection title={t("settings.title")} subtitle={t("settings.subtitle")}>
          <div className="space-y-3.5">
            <Field label={t("settings.outputRoot")}>
              <div className="flex gap-2">
                <Input
                  className="flex-1"
                  value={form.libraryRoot}
                  onChange={(event) => setForm((current) => ({ ...current, libraryRoot: event.target.value }))}
                />
                <Button type="button" variant="outline" onClick={handleSelectDirectory}>
                  {t("settings.browse")}
                </Button>
              </div>
            </Field>

            <Field label={t("settings.readerScrollCachePages")} hint={t("settings.readerScrollCachePagesHint")}>
              <Input
                min={1}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    readerScrollCachePages: Number(event.target.value) || current.readerScrollCachePages,
                  }))
                }
                type="number"
                value={form.readerScrollCachePages}
              />
            </Field>

            <label className="flex items-start gap-3 rounded-2xl border border-border/60 bg-background/58 px-3 py-3 cursor-pointer">
              <Checkbox
                checked={form.autoRestoreReaderProgress}
                className="mt-0.5"
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    autoRestoreReaderProgress: event.target.checked,
                  }))
                }
              />
              <div className="min-w-0">
                <div className="text-sm font-semibold">{t("settings.autoRestoreReaderProgress")}</div>
                <p className="mt-1 text-xs text-muted-foreground">{t("settings.autoRestoreReaderProgressHint")}</p>
              </div>
            </label>

            <p className="text-[11px] text-muted-foreground">{t("settings.railHint")}</p>
          </div>
        </PanelSection>

        <PanelSection title={t("settings.readerPreferences")} subtitle={t("settings.readerPreferencesSubtitle")}>
          <div className="space-y-3">
            <Field label={t("reader.direction")}>
              <Select
                value={form.readerDirection || "rtl"}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    readerDirection: event.target.value as ReaderDirection,
                  }))
                }
              >
                <option value="rtl">{t("reader.directionRTL")}</option>
                <option value="ltr">{t("reader.directionLTR")}</option>
              </Select>
            </Field>

            <Field label={t("reader.spreadMode")}>
              <Select
                value={form.readerSpreadMode || "auto"}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    readerSpreadMode: event.target.value as ReaderSpreadMode,
                  }))
                }
              >
                <option value="auto">{t("reader.spreadAuto")}</option>
                <option value="single">{t("reader.spreadSingle")}</option>
                <option value="double">{t("reader.spreadDouble")}</option>
              </Select>
            </Field>

            <Field label={t("reader.fitMode")}>
              <Select
                value={form.readerFitMode || "contain"}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    readerFitMode: event.target.value as ReaderFitMode,
                  }))
                }
              >
                <option value="contain">{t("reader.fitContain")}</option>
                <option value="width">{t("reader.fitWidth")}</option>
                <option value="height">{t("reader.fitHeight")}</option>
                <option value="original">{t("reader.fitOriginal")}</option>
              </Select>
            </Field>

            <Field label={t("reader.filter")}>
              <Select
                value={form.readerFilter || "none"}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    readerFilter: event.target.value as ReaderFilter,
                  }))
                }
              >
                <option value="none">{t("reader.filterNone")}</option>
                <option value="invert">{t("reader.filterInvert")}</option>
                <option value="sepia">{t("reader.filterSepia")}</option>
                <option value="high-contrast">{t("reader.filterHighContrast")}</option>
              </Select>
            </Field>

            <label className="flex items-start gap-3 rounded-2xl border border-border/60 bg-background/58 px-3 py-3 cursor-pointer">
              <Checkbox
                checked={form.readerCoverSolo !== false}
                className="mt-0.5"
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    readerCoverSolo: event.target.checked,
                  }))
                }
              />
              <div className="min-w-0">
                <div className="text-sm font-semibold">{t("reader.coverSolo")}</div>
                <p className="mt-1 text-xs text-muted-foreground">{t("settings.coverSoloHint")}</p>
              </div>
            </label>
          </div>
        </PanelSection>

        <PanelSection title={t("settings.shortcuts")} subtitle="">
          <div className="space-y-2 py-1">
            <ShortcutEditor label={t("settings.shortcutAction_nextPage")} action="nextPage" form={form} setForm={setForm} />
            <ShortcutEditor label={t("settings.shortcutAction_prevPage")} action="prevPage" form={form} setForm={setForm} />
            <ShortcutEditor label={t("settings.shortcutAction_nextChapter")} action="nextChapter" form={form} setForm={setForm} />
            <ShortcutEditor label={t("settings.shortcutAction_prevChapter")} action="prevChapter" form={form} setForm={setForm} />
            <ShortcutEditor label={t("settings.shortcutAction_toggleMode")} action="toggleMode" form={form} setForm={setForm} />
            <ShortcutEditor label={t("settings.shortcutAction_backToLibrary")} action="backToLibrary" form={form} setForm={setForm} />
            <ShortcutEditor label={t("settings.shortcutAction_toggleMenu")} action="toggleMenu" form={form} setForm={setForm} />
          </div>
        </PanelSection>

        <Button className="w-full" type="submit">
          {t("settings.save")}
        </Button>
      </form>

      {version && (
        <div className="pt-2 text-center text-[10px] tracking-[0.1em] text-muted-foreground/60 border-t border-border/40">
          PanelNeko Reader v{version}
        </div>
      )}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="grid gap-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label}</span>
      {children}
      {hint ? <span className="text-[11px] text-muted-foreground">{hint}</span> : null}
    </label>
  );
}

function ShortcutEditor({
  action,
  label,
  form,
  setForm,
}: {
  action: string;
  label: string;
  form: AppSettings;
  setForm: React.Dispatch<React.SetStateAction<AppSettings>>;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const value = form.shortcuts?.[action] ?? "";

  useEffect(() => {
    if (!editing) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key !== "Escape") {
        setForm((current) => ({
          ...current,
          shortcuts: { ...current.shortcuts, [action]: e.key },
        }));
      }
      setEditing(false);
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [editing, action, setForm]);

  return (
    <div className="flex items-center justify-between text-sm px-1 py-1">
      <span className="text-muted-foreground">{label}</span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={cn("w-32", editing && "border-primary text-primary")}
        onClick={() => setEditing(true)}
      >
        {editing ? t("settings.pressAnyKey") : value}
      </Button>
    </div>
  );
}

