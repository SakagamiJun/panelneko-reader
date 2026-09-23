import { useEffect, useState, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { LibraryGrid } from "@/components/library/library-grid";
import { SettingsDialog, type SettingsTab } from "@/components/sections/settings-dialog";
import { ReaderController, type ReaderJumpRequest } from "@/components/reader-controller";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { UpdateToast } from "@/components/ui/update-toast";
import { appAdapter } from "@/lib/api";
import {
  type AppSettings,
  EVENTS,
  type LibraryManga,
  type UpdateCheckResult,
} from "@/lib/contracts";
import { i18n } from "@/lib/i18n";
import { emitRuntimeEvent } from "@/lib/runtime";
import { resolveLocale, resolveTheme } from "@/lib/system";

export default function App() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsDefaultTab, setSettingsDefaultTab] = useState<SettingsTab>("general");
  const [selectedCollectionPath, setSelectedCollectionPath] = useState<string | null>(null);
  const [selectedLibraryID, setSelectedLibraryID] = useState<string | null>(null);
  const [readerMode, setReaderMode] = useState<"scroll" | "paged">("paged");
  const [readerJumpRequest, setReaderJumpRequest] = useState<ReaderJumpRequest | null>(null);
  const [, setReaderChapterTitle] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [collectionToToggle, setCollectionToToggle] = useState<LibraryManga | null>(null);
  const [updateNotification, setUpdateNotification] = useState<UpdateCheckResult | null>(null);
  const hasCheckedStartupRef = useRef(false);

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
    if (!settings || hasCheckedStartupRef.current) return;
    if (settings.autoCheckUpdates === false) return;

    hasCheckedStartupRef.current = true;
    const timer = window.setTimeout(async () => {
      try {
        const result = await appAdapter.checkForUpdates();
        if (result && result.hasUpdate) {
          setUpdateNotification(result);
        }
      } catch {
        // Silently ignore failures on startup auto-check
      }
    }, 1500);

    return () => window.clearTimeout(timer);
  }, [settingsQuery.data]);

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

  const toggleCollectionMutation = useMutation({
    mutationFn: (mangaID: string) => appAdapter.toggleCollection(mangaID),
    onSuccess: async (isColl, mangaID) => {
      await queryClient.invalidateQueries({ queryKey: ["library"] });
      setCollectionToToggle(null);
      if (!isColl && currentCollection?.id === mangaID) {
        setSelectedCollectionPath(null);
      }
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

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === ",") {
        e.preventDefault();
        setSettingsOpen((prev) => !prev);
        return;
      }

      if (e.key === "Escape" && settingsOpen) {
        e.preventDefault();
        setSettingsOpen(false);
        return;
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [settingsOpen]);

  const openSettingsWithTab = (tab: SettingsTab = "general") => {
    setSettingsDefaultTab(tab);
    setSettingsOpen(true);
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
          onToggleCollection={setCollectionToToggle}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          settings={settings}
          settingsPending={settingsMutation.isPending}
          onCycleTheme={cycleTheme}
          onCycleLocale={cycleLocale}
          settingsOpen={settingsOpen}
          onToggleSettings={() => openSettingsWithTab("general")}
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
          <div className="flex h-full flex-col items-center justify-center bg-background text-muted-foreground animate-in fade-in-50 duration-150 gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-card border border-border/80 shadow-xs">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
            <span className="text-xs text-muted-foreground">{t("reader.loading")}</span>
          </div>
        ) : selectedLibraryID && readerQuery.isError ? (
          <div className="flex h-full items-center justify-center bg-background text-xs text-danger font-medium">
            {t("reader.loadFailed")}
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
            onOpenFullSettings={() => openSettingsWithTab("reader")}
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
            onOpenSettings={() => openSettingsWithTab("general")}
            onTogglePin={(id) => togglePinMutation.mutate(id)}
            onToggleCollection={setCollectionToToggle}
            onOpenDirectory={(id) => {
              void appAdapter.openDirectory(id);
            }}
          />
        )}
      </div>

      {/* Centered Master-Detail Settings Dialog */}
      {settings && (
        <SettingsDialog
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          settings={settings}
          onSave={(nextSettings) => settingsMutation.mutate(nextSettings)}
          version={versionQuery.data?.version}
          commit={versionQuery.data?.commit}
          defaultTab={settingsDefaultTab}
        />
      )}

      {/* Collection Toggle Confirmation Dialog */}
      <ConfirmDialog
        open={Boolean(collectionToToggle)}
        title={
          collectionToToggle?.isCollection
            ? t("library.unsetCollectionConfirmTitle", { title: collectionToToggle?.title })
            : t("library.setCollectionConfirmTitle", { title: collectionToToggle?.title })
        }
        description={
          collectionToToggle?.isCollection
            ? t("library.unsetCollectionConfirmDesc")
            : t("library.setCollectionConfirmDesc")
        }
        confirmLabel={
          collectionToToggle?.isCollection
            ? t("library.unsetCollection")
            : t("library.setCollection")
        }
        confirmVariant={collectionToToggle?.isCollection ? "outline" : "primary"}
        loading={toggleCollectionMutation.isPending}
        onCancel={() => setCollectionToToggle(null)}
        onConfirm={() => {
          if (collectionToToggle) {
            toggleCollectionMutation.mutate(collectionToToggle.id);
          }
        }}
      />

      {/* Startup Update Notification Toast */}
      {updateNotification && (
        <UpdateToast
          update={updateNotification}
          onClose={() => setUpdateNotification(null)}
          onViewUpdate={(url) => {
            void appAdapter.openURL(url);
            setUpdateNotification(null);
          }}
        />
      )}
    </main>
  );
}
