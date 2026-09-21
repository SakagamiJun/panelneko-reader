import { useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  BookOpen,
  FolderOpen,
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
  searchQuery: string;
  onSearchChange: (query: string) => void;
  settings?: AppSettings;
  settingsPending?: boolean;
  onCycleTheme: () => void;
  onCycleLocale: () => void;
  settingsOpen: boolean;
  onToggleSettings: () => void;
  onOpenLibraryFolder?: () => void;
}

export function AppHeader({
  selectedCollectionPath,
  currentCollection,
  totalCount,
  onBackToMain,
  searchQuery,
  onSearchChange,
  settings,
  settingsPending = false,
  onCycleTheme,
  onCycleLocale,
  settingsOpen,
  onToggleSettings,
  onOpenLibraryFolder,
}: AppHeaderProps) {
  const { t } = useTranslation();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const isMac = isMacPlatform();

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

      {/* Right section: Theme, Language, Open Folder, Settings */}
      <div className="app-window-no-drag flex items-center gap-1.5 shrink-0">
        {onOpenLibraryFolder && (
          <Button
            type="button"
            size="xs"
            variant="ghost"
            onClick={onOpenLibraryFolder}
            className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
            title={t("library.openDirectory")}
          >
            <FolderOpen className="h-3.5 w-3.5" />
          </Button>
        )}

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
          variant={settingsOpen ? "subtle" : "ghost"}
          onClick={onToggleSettings}
          className={cn(
            "h-7 px-2.5 text-xs gap-1.5 transition-colors",
            settingsOpen
              ? "bg-primary/10 text-primary border-primary/30"
              : "text-muted-foreground hover:text-foreground"
          )}
          title={t("shell.settings")}
        >
          <Settings2 className="h-3.5 w-3.5" />
          <span className="hidden sm:inline font-medium">{t("shell.settings")}</span>
        </Button>
      </div>
    </header>
  );
}
