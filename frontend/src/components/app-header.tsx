import { useRef, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  BookOpen,
  Check,
  ChevronDown,
  FolderCog,
  Folders,
  Languages,
  MoonStar,
  Search,
  Settings2,
  Sparkles,
  SunMedium,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Kbd } from "@/components/ui/kbd";
import type { AppSettings, LibraryManga } from "@/lib/contracts";
import { isMacPlatform } from "@/lib/system";
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
}: AppHeaderProps) {
  const { t } = useTranslation();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const sourceMenuRef = useRef<HTMLDivElement>(null);
  const [isSourceMenuOpen, setIsSourceMenuOpen] = useState(false);
  const isMac = isMacPlatform();

  const isAllSources = !selectedSourceId || selectedSourceId === "all";
  const activeSource = settings?.librarySources?.find((s) => s.id === selectedSourceId);

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

  return (
    <header
      className={cn(
        "app-window-drag-region sticky top-0 z-20 flex h-12 items-center justify-between gap-3 border-b border-border/70 bg-background/80 px-3 backdrop-blur-xl transition-all select-none",
        isMac ? "pl-20" : "pl-3"
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
                  title={activeSource?.path || t("library.sourceFilter")}
                  aria-expanded={isSourceMenuOpen}
                >
                  {!isAllSources && (
                    <span
                      className={cn(
                        "h-1.5 w-1.5 rounded-full shrink-0",
                        !activeSource?.enabled
                          ? "bg-muted-foreground/40"
                          : activeSource?.status === "offline"
                          ? "bg-destructive"
                          : "bg-emerald-500"
                      )}
                    />
                  )}
                  <span className="truncate max-w-[120px]">
                    {isAllSources ? t("library.filterAllSources") : activeSource?.name || t("library.filterAllSources")}
                  </span>
                  <ChevronDown
                    className={cn(
                      "h-3 w-3 text-muted-foreground/70 transition-transform duration-150 shrink-0",
                      isSourceMenuOpen && "rotate-180"
                    )}
                  />
                </button>

                {isSourceMenuOpen && (
                  <div
                    className="absolute left-0 top-full mt-1.5 w-60 rounded-xl border border-border/80 bg-card shadow-xl p-1 z-50 animate-in fade-in-0 zoom-in-95 origin-top-left"
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
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <span
                                className={cn(
                                  "h-1.5 w-1.5 rounded-full shrink-0",
                                  !s.enabled
                                    ? "bg-muted-foreground/40"
                                    : isOffline
                                    ? "bg-destructive"
                                    : "bg-emerald-500"
                                )}
                              />
                              <span className="truncate flex-1">{s.name}</span>
                              {typeof s.mangaCount === "number" && (
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
                            {isSelected && <Check className="h-3.5 w-3.5 shrink-0 text-primary ml-2" />}
                          </button>
                        );
                      })}
                    </div>

                    {/* Manage Directories shortcut */}
                    {onOpenManageSources && (
                      <>
                        <div className="h-px bg-border/40 my-1 mx-1" />
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setIsSourceMenuOpen(false);
                            onOpenManageSources();
                          }}
                          className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer text-left font-medium"
                        >
                          <FolderCog className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{t("library.manageSources")}</span>
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Middle section: Instant search filter */}
      <div className="app-window-no-drag flex items-center max-w-sm flex-1 mx-2">
        <div className="relative w-full">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/70 pointer-events-none" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={t("library.searchPlaceholder")}
            className="h-7 w-full rounded-lg border border-border/60 bg-muted/40 pl-8 pr-14 text-xs text-foreground placeholder:text-muted-foreground/60 outline-none transition-all duration-150 focus:border-primary/50 focus:bg-background focus:ring-1 focus:ring-primary/20"
          />
          <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {searchQuery ? (
              <button
                type="button"
                onClick={() => onSearchChange("")}
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
