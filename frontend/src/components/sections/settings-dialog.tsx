import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  BookOpen,
  Check,
  ExternalLink,
  Folder,
  Info,
  Keyboard,
  Loader2,
  RefreshCw,
  Settings2,
  Sliders,
  X,
} from "lucide-react";
import appIcon from "@/assets/appicon.png";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { SegmentedControl, type SegmentedOption } from "@/components/ui/segmented-control";
import { SettingGroup, SettingRow } from "@/components/ui/setting-row";
import { Switch } from "@/components/ui/switch";
import { appAdapter } from "@/lib/api";
import { APP_LINKS } from "@/lib/constants";
import type {
  AppSettings,
  ReaderDirection,
  ReaderFitMode,
  ReaderFilter,
  ReaderSpreadMode,
  ReaderSideClickMode,
  UpdateCheckResult,
} from "@/lib/contracts";
import { cn, formatBytes } from "@/lib/utils";

export interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSave: (settings: AppSettings) => void;
  version?: string;
  commit?: string;
  defaultTab?: "general" | "reader" | "shortcuts" | "about";
}

export type SettingsTab = "general" | "reader" | "shortcuts" | "about";

export function SettingsDialog({
  open,
  onClose,
  settings,
  onSave,
  version,
  commit,
  defaultTab = "general",
}: SettingsDialogProps) {
  const { t } = useTranslation();
  const [form, setForm] = useState<AppSettings>(settings);
  const [activeTab, setActiveTab] = useState<SettingsTab>(defaultTab);
  const [isSavedRecently, setIsSavedRecently] = useState(false);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [updateResult, setUpdateResult] = useState<UpdateCheckResult | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [cacheSizeBytes, setCacheSizeBytes] = useState<number>(0);
  const [isClearingCache, setIsClearingCache] = useState(false);
  const [isCacheClearedRecently, setIsCacheClearedRecently] = useState(false);

  useEffect(() => {
    if (open && activeTab === "general") {
      void appAdapter.getThumbnailCacheSize().then(setCacheSizeBytes);
    }
  }, [open, activeTab]);

  const handleClearCache = async () => {
    setIsClearingCache(true);
    try {
      await appAdapter.clearThumbnailCache();
      setCacheSizeBytes(0);
      setIsCacheClearedRecently(true);
      window.setTimeout(() => {
        setIsCacheClearedRecently(false);
      }, 2000);
    } catch (err) {
      console.error("Failed to clear thumbnail cache:", err);
    } finally {
      setIsClearingCache(false);
    }
  };

  const saveTimeoutRef = useRef<number | null>(null);

  const handleCheckUpdate = async () => {
    setIsCheckingUpdate(true);
    setUpdateError(null);
    try {
      const result = await appAdapter.checkForUpdates();
      setUpdateResult(result);
    } catch (err) {
      console.error("Failed to check for updates:", err);
      setUpdateError(t("settings.checkUpdateFailed"));
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  useEffect(() => {
    setForm(settings);
  }, [settings]);

  useEffect(() => {
    if (open) {
      setActiveTab(defaultTab);
    }
  }, [open, defaultTab]);

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        window.clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  if (!open) return null;

  const updateField = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    const next = { ...form, [key]: value };
    setForm(next);
    onSave(next);
    setIsSavedRecently(true);
    if (saveTimeoutRef.current) {
      window.clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = window.setTimeout(() => {
      setIsSavedRecently(false);
    }, 1500);
  };

  const handleSelectDirectory = async () => {
    try {
      const selected = await appAdapter.selectDirectory();
      if (selected) {
        updateField("libraryRoot", selected);
      }
    } catch (error) {
      console.error("Failed to select directory:", error);
    }
  };

  const tabs: Array<{ id: SettingsTab; label: string; icon: React.ReactNode }> = [
    { id: "general", label: t("settings.generalTab"), icon: <Sliders className="h-4 w-4" /> },
    { id: "reader", label: t("settings.readerPreferences"), icon: <BookOpen className="h-4 w-4" /> },
    { id: "shortcuts", label: t("settings.shortcuts"), icon: <Keyboard className="h-4 w-4" /> },
    { id: "about", label: t("settings.aboutTab"), icon: <Info className="h-4 w-4" /> },
  ];

  const spreadOptions: SegmentedOption<ReaderSpreadMode>[] = [
    { value: "auto", label: t("reader.spreadAuto") },
    { value: "single", label: t("reader.spreadSingle") },
    { value: "double", label: t("reader.spreadDouble") },
  ];

  const directionOptions: SegmentedOption<ReaderDirection>[] = [
    { value: "rtl", label: t("reader.directionRTL") },
    { value: "ltr", label: t("reader.directionLTR") },
  ];

  const fitOptions: SegmentedOption<ReaderFitMode>[] = [
    { value: "contain", label: t("reader.fitContain") },
    { value: "width", label: t("reader.fitWidth") },
    { value: "height", label: t("reader.fitHeight") },
    { value: "original", label: t("reader.fitOriginal") },
  ];

  const filterOptions: SegmentedOption<ReaderFilter>[] = [
    { value: "none", label: t("reader.filterNone") },
    { value: "invert", label: t("reader.filterInvert") },
    { value: "sepia", label: t("reader.filterSepia") },
    { value: "high-contrast", label: t("reader.filterHighContrast") },
  ];

  const sideClickOptions: SegmentedOption<ReaderSideClickMode>[] = [
    { value: "right_next", label: t("settings.sideClickRightNextShort") },
    { value: "follow", label: t("settings.sideClickFollowShort") },
    { value: "left_next", label: t("settings.sideClickLeftNextShort") },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-md animate-in fade-in duration-150 p-4"
      onClick={onClose}
    >
      <div
        className="relative flex flex-col w-[780px] max-w-[94vw] h-[560px] max-h-[88vh] rounded-2xl border border-border/80 bg-card/95 backdrop-blur-2xl shadow-2xl overflow-hidden select-none animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header Bar */}
        <div className="flex items-center justify-between border-b border-border/60 px-5 h-13 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Settings2 className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-foreground leading-none">
                {t("settings.title")}
              </h2>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {t("settings.headerDesc")}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Auto-save reactive status */}
            <div
              className={cn(
                "flex items-center gap-1.5 text-xs text-muted-foreground transition-opacity duration-200",
                isSavedRecently ? "opacity-100 text-success" : "opacity-0"
              )}
            >
              <Check className="h-3.5 w-3.5" />
              <span className="font-medium text-[11px]">{t("settings.autoSaved")}</span>
            </div>

            <div className="flex items-center gap-1.5">
              <Kbd size="sm" className="hidden sm:inline-flex text-[10px]">
                ESC
              </Kbd>
              <Button
                type="button"
                size="xs"
                variant="ghost"
                onClick={onClose}
                className="h-7 w-7 p-0 rounded-lg text-muted-foreground hover:text-foreground"
                title={t("settings.close")}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Master-Detail Body */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Left Master Navigation Sidebar */}
          <aside className="w-48 sm:w-52 shrink-0 border-r border-border/60 bg-muted/20 p-3 flex flex-col justify-between">
            <nav className="space-y-1">
              {tabs.map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      "w-full flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium transition-colors duration-150 text-left border outline-none select-none",
                      isActive
                        ? "bg-card text-foreground shadow-xs border-border/70 font-bold"
                        : "border-transparent text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                    )}
                  >
                    <span className={cn(isActive ? "text-primary" : "text-muted-foreground")}>
                      {tab.icon}
                    </span>
                    <span className="truncate">{tab.label}</span>
                  </button>
                );
              })}
            </nav>

            <div className="px-3 py-2 text-[10px] text-muted-foreground/60 border-t border-border/40 font-mono">
              PanelNeko v{version || "0.1.0"}
            </div>
          </aside>

          {/* Right Detail Canvas */}
          <main className="flex-1 min-w-0 overflow-y-auto p-5 sm:p-6 space-y-6">
            {activeTab === "general" && (
              <div className="space-y-5">
                <SettingGroup
                  title={t("settings.generalTab")}
                  description={t("settings.subtitle")}
                >
                  <SettingRow
                    title={t("settings.outputRoot")}
                    description={t("settings.outputRootDesc")}
                    control={
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={handleSelectDirectory}
                        className="gap-1.5 shrink-0"
                      >
                        <Folder className="h-3.5 w-3.5" />
                        <span>{t("settings.browse")}</span>
                      </Button>
                    }
                  />
                  {form.libraryRoot && (
                    <div className="px-3.5 py-2.5 text-xs font-mono text-muted-foreground bg-muted/25 break-all select-all">
                      {form.libraryRoot}
                    </div>
                  )}

                  <SettingRow
                    title={t("settings.autoRestoreReaderProgress")}
                    description={t("settings.autoRestoreReaderProgressHint")}
                    control={
                      <Switch
                        checked={form.autoRestoreReaderProgress}
                        onChange={(checked) =>
                          updateField("autoRestoreReaderProgress", checked)
                        }
                      />
                    }
                  />
                </SettingGroup>

                <SettingGroup
                  title={t("settings.groupPerformance")}
                  description={t("settings.groupPerformanceDesc")}
                >
                  <SettingRow
                    title={t("settings.readerScrollCachePages")}
                    description={t("settings.readerScrollCachePagesHint")}
                    control={
                      <Input
                        className="w-20 h-7 text-xs text-center"
                        type="number"
                        min={1}
                        max={30}
                        value={form.readerScrollCachePages}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          if (val > 0) {
                            updateField("readerScrollCachePages", val);
                          }
                        }}
                      />
                    }
                  />

                  <SettingRow
                    title={t("settings.enableThumbnailCache")}
                    description={t("settings.enableThumbnailCacheDesc")}
                    control={
                      <Switch
                        checked={form.enableThumbnailCache !== false}
                        onChange={(checked) =>
                          updateField("enableThumbnailCache", checked)
                        }
                      />
                    }
                  />

                  <SettingRow
                    title={t("settings.thumbnailCacheSize")}
                    description={t("settings.thumbnailCacheSizeDesc")}
                    control={
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs font-mono text-muted-foreground min-w-[50px] text-right">
                          {formatBytes(cacheSizeBytes)}
                        </span>
                        <Button
                          type="button"
                          size="xs"
                          variant="outline"
                          disabled={isClearingCache || cacheSizeBytes === 0}
                          onClick={handleClearCache}
                          className="h-7 text-xs px-2.5"
                        >
                          {isClearingCache ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : isCacheClearedRecently ? (
                            t("settings.cacheCleared")
                          ) : (
                            t("settings.clearCache")
                          )}
                        </Button>
                      </div>
                    }
                  />
                </SettingGroup>
              </div>
            )}

            {activeTab === "reader" && (
              <div className="space-y-5">
                <SettingGroup
                  title={t("settings.groupLayout")}
                  description={t("settings.groupLayoutDesc")}
                >
                  <SettingRow
                    title={t("reader.spreadMode")}
                    description={t("settings.spreadModeHint")}
                    control={
                      <SegmentedControl
                        size="sm"
                        value={form.readerSpreadMode || "auto"}
                        options={spreadOptions}
                        onChange={(val) => updateField("readerSpreadMode", val)}
                      />
                    }
                  />

                  <SettingRow
                    title={t("reader.direction")}
                    description={t("settings.directionHint")}
                    control={
                      <SegmentedControl
                        size="sm"
                        value={form.readerDirection || "rtl"}
                        options={directionOptions}
                        onChange={(val) => updateField("readerDirection", val)}
                      />
                    }
                  />

                  <SettingRow
                    title={t("reader.sideClickMode")}
                    description={
                      (form.readerSideClickMode || "right_next") === "follow"
                        ? t("settings.sideClickFollowHint")
                        : (form.readerSideClickMode || "right_next") === "left_next"
                        ? t("settings.sideClickLeftNextHint")
                        : t("settings.sideClickRightNextHint")
                    }
                    control={
                      <SegmentedControl
                        size="sm"
                        value={form.readerSideClickMode || "right_next"}
                        options={sideClickOptions}
                        onChange={(val) => updateField("readerSideClickMode", val)}
                      />
                    }
                  />

                  <SettingRow
                    title={t("reader.coverSolo")}
                    description={t("settings.coverSoloHint")}
                    control={
                      <Switch
                        checked={form.readerCoverSolo !== false}
                        onChange={(checked) => updateField("readerCoverSolo", checked)}
                      />
                    }
                  />
                </SettingGroup>

                <SettingGroup
                  title={t("settings.groupDisplay")}
                  description={t("settings.groupDisplayDesc")}
                >
                  <SettingRow
                    title={t("reader.fitMode")}
                    description={t("settings.fitModeHint")}
                    control={
                      <SegmentedControl
                        size="sm"
                        value={form.readerFitMode || "contain"}
                        options={fitOptions}
                        onChange={(val) => updateField("readerFitMode", val)}
                      />
                    }
                  />

                  <SettingRow
                    title={t("reader.filter")}
                    description={t("settings.filterHint")}
                    control={
                      <SegmentedControl
                        size="sm"
                        value={form.readerFilter || "none"}
                        options={filterOptions}
                        onChange={(val) => updateField("readerFilter", val)}
                      />
                    }
                  />
                </SettingGroup>

                <SettingGroup
                  title={t("settings.groupZoom")}
                  description={t("settings.groupZoomDesc")}
                >
                  <SettingRow
                    title={t("reader.clickCenterZoom")}
                    description={t("settings.clickCenterZoomHint")}
                    control={
                      <Switch
                        checked={form.readerClickCenterZoom === true}
                        onChange={(checked) =>
                          updateField("readerClickCenterZoom", checked)
                        }
                      />
                    }
                  />

                  <SettingRow
                    title={t("reader.doubleClickZoom")}
                    description={t("settings.doubleClickZoomHint")}
                    control={
                      <Switch
                        checked={form.readerDoubleClickZoom === true}
                        onChange={(checked) =>
                          updateField("readerDoubleClickZoom", checked)
                        }
                      />
                    }
                  />
                </SettingGroup>
              </div>
            )}

            {activeTab === "shortcuts" && (
              <div className="space-y-5">
                <SettingGroup
                  title={t("settings.shortcuts")}
                  description={t("settings.shortcutsDesc")}
                >
                  <ShortcutItem
                    label={t("settings.shortcutAction_nextPage")}
                    action="nextPage"
                    form={form}
                    onUpdate={(act, key) => {
                      const nextShortcuts = { ...(form.shortcuts || {}), [act]: key };
                      updateField("shortcuts", nextShortcuts);
                    }}
                  />
                  <ShortcutItem
                    label={t("settings.shortcutAction_prevPage")}
                    action="prevPage"
                    form={form}
                    onUpdate={(act, key) => {
                      const nextShortcuts = { ...(form.shortcuts || {}), [act]: key };
                      updateField("shortcuts", nextShortcuts);
                    }}
                  />
                  <ShortcutItem
                    label={t("settings.shortcutAction_nextChapter")}
                    action="nextChapter"
                    form={form}
                    onUpdate={(act, key) => {
                      const nextShortcuts = { ...(form.shortcuts || {}), [act]: key };
                      updateField("shortcuts", nextShortcuts);
                    }}
                  />
                  <ShortcutItem
                    label={t("settings.shortcutAction_prevChapter")}
                    action="prevChapter"
                    form={form}
                    onUpdate={(act, key) => {
                      const nextShortcuts = { ...(form.shortcuts || {}), [act]: key };
                      updateField("shortcuts", nextShortcuts);
                    }}
                  />
                  <ShortcutItem
                    label={t("settings.shortcutAction_toggleMode")}
                    action="toggleMode"
                    form={form}
                    onUpdate={(act, key) => {
                      const nextShortcuts = { ...(form.shortcuts || {}), [act]: key };
                      updateField("shortcuts", nextShortcuts);
                    }}
                  />
                  <ShortcutItem
                    label={t("settings.shortcutAction_backToLibrary")}
                    action="backToLibrary"
                    form={form}
                    onUpdate={(act, key) => {
                      const nextShortcuts = { ...(form.shortcuts || {}), [act]: key };
                      updateField("shortcuts", nextShortcuts);
                    }}
                  />
                  <ShortcutItem
                    label={t("settings.shortcutAction_toggleMenu")}
                    action="toggleMenu"
                    form={form}
                    onUpdate={(act, key) => {
                      const nextShortcuts = { ...(form.shortcuts || {}), [act]: key };
                      updateField("shortcuts", nextShortcuts);
                    }}
                  />
                </SettingGroup>
              </div>
            )}

            {activeTab === "about" && (
              <div className="space-y-5">
                <SettingGroup title={t("settings.aboutPanelNeko")}>
                  <div className="p-5 space-y-4">
                    <div className="flex items-center gap-3.5">
                      <img
                        src={appIcon}
                        alt="PanelNeko Reader"
                        className="h-11 w-11 rounded-xl shadow-xs object-cover border border-border/40 shrink-0 select-none pointer-events-none"
                      />
                      <div>
                        <h4 className="text-base font-bold text-foreground">
                          PanelNeko Reader
                        </h4>
                        <p className="text-xs text-muted-foreground">
                          {t("settings.appSlogan")}
                        </p>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-border/40 text-xs space-y-2 text-muted-foreground">
                      <div className="flex justify-between py-1 border-b border-border/20">
                        <span>{t("settings.appVersion")}</span>
                        <span className="font-mono text-foreground font-semibold">
                          v{version || "0.1.0"}
                        </span>
                      </div>
                      {commit && (
                        <div className="flex justify-between py-1 border-b border-border/20">
                          <span>{t("settings.buildCommit")}</span>
                          <span className="font-mono text-foreground font-medium px-1.5 py-0.5 rounded bg-muted/50 border border-border/40 text-[11px]">
                            {commit}
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between py-1 border-b border-border/20">
                        <span>{t("settings.license")}</span>
                        <span className="text-foreground font-mono">MIT License</span>
                      </div>
                      <div className="flex justify-between py-1">
                        <span>{t("settings.shortcutHelp")}</span>
                        <span className="text-foreground font-mono">{t("settings.openSettingsShortcut")}</span>
                      </div>
                    </div>
                  </div>

                  <SettingRow
                    title={t("settings.projectRepo")}
                    description={t("settings.projectRepoDesc")}
                    control={
                      <Button
                        type="button"
                        size="xs"
                        variant="outline"
                        onClick={() => appAdapter.openURL(APP_LINKS.REPO)}
                        className="gap-1 text-xs"
                      >
                        <ExternalLink className="h-3 w-3" />
                        <span>{t("settings.visitRepo")}</span>
                      </Button>
                    }
                  />

                  <SettingRow
                    title={t("settings.feedbackAndSuggestions")}
                    description={t("settings.feedbackAndSuggestionsDesc")}
                    control={
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          size="xs"
                          variant="outline"
                          onClick={() => appAdapter.openURL(APP_LINKS.BUG_REPORT)}
                          className="gap-1 text-xs"
                        >
                          <ExternalLink className="h-3 w-3" />
                          <span>{t("settings.reportBug")}</span>
                        </Button>
                        <Button
                          type="button"
                          size="xs"
                          variant="outline"
                          onClick={() => appAdapter.openURL(APP_LINKS.FEATURE_REQUEST)}
                          className="gap-1 text-xs"
                        >
                          <ExternalLink className="h-3 w-3" />
                          <span>{t("settings.suggestFeature")}</span>
                        </Button>
                      </div>
                    }
                  />
                </SettingGroup>

                <SettingGroup
                  title={t("settings.groupUpdates")}
                  description={t("settings.groupUpdatesDesc")}
                >
                  <SettingRow
                    title={t("settings.autoCheckUpdates")}
                    description={t("settings.autoCheckUpdatesHint")}
                    control={
                      <Switch
                        checked={form.autoCheckUpdates !== false}
                        onChange={(checked) => updateField("autoCheckUpdates", checked)}
                      />
                    }
                  />

                  <SettingRow
                    title={t("settings.checkUpdates")}
                    description={
                      isCheckingUpdate
                        ? t("settings.checkingUpdates")
                        : updateError
                        ? updateError
                        : updateResult?.hasUpdate
                        ? t("settings.updateAvailableHint", {
                            version: `v${updateResult.latestVersion}`,
                            current: `v${updateResult.currentVersion}`,
                          })
                        : updateResult && !updateResult.hasUpdate
                        ? t("settings.upToDate")
                        : t("settings.currentVersionPrefix", { version: version || "0.1.0" })
                    }
                    control={
                      <div className="flex items-center gap-2">
                        {updateResult?.hasUpdate && (
                          <Button
                            type="button"
                            size="xs"
                            variant="outline"
                            onClick={() => appAdapter.openURL(updateResult.releaseURL)}
                            className="gap-1 text-xs text-primary border-primary/40 hover:bg-primary/10"
                          >
                            <ExternalLink className="h-3 w-3" />
                            <span>{t("settings.viewRelease")}</span>
                          </Button>
                        )}
                        <Button
                          type="button"
                          size="xs"
                          variant="outline"
                          disabled={isCheckingUpdate}
                          onClick={handleCheckUpdate}
                          className="gap-1 text-xs"
                        >
                          {isCheckingUpdate ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <RefreshCw className="h-3 w-3" />
                          )}
                          <span>
                            {isCheckingUpdate
                              ? t("settings.checkingUpdates")
                              : t("settings.checkUpdates")}
                          </span>
                        </Button>
                      </div>
                    }
                  />
                </SettingGroup>

                <SettingGroup
                  title={t("settings.acknowledgments")}
                  description={t("settings.acknowledgmentsDesc")}
                >
                  <SettingRow
                    title="Wails"
                    description={t("settings.ackWailsDesc")}
                    control={<span className="text-[11px] font-mono text-muted-foreground">v2</span>}
                  />
                  <SettingRow
                    title="Go"
                    description={t("settings.ackGoDesc")}
                    control={<span className="text-[11px] font-mono text-muted-foreground">Backend</span>}
                  />
                  <SettingRow
                    title="React 19"
                    description={t("settings.ackReactDesc")}
                    control={<span className="text-[11px] font-mono text-muted-foreground">Frontend</span>}
                  />
                  <SettingRow
                    title="Tailwind CSS"
                    description={t("settings.ackTailwindDesc")}
                    control={<span className="text-[11px] font-mono text-muted-foreground">Styling</span>}
                  />
                  <SettingRow
                    title="TanStack Query & Virtual"
                    description={t("settings.ackTanstackDesc")}
                    control={<span className="text-[11px] font-mono text-muted-foreground">State</span>}
                  />
                  <SettingRow
                    title="SQLite"
                    description={t("settings.ackSqliteDesc")}
                    control={<span className="text-[11px] font-mono text-muted-foreground">Storage</span>}
                  />
                  <SettingRow
                    title="Lucide Icons"
                    description={t("settings.ackLucideDesc")}
                    control={<span className="text-[11px] font-mono text-muted-foreground">Icons</span>}
                  />
                </SettingGroup>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

function ShortcutItem({
  action,
  label,
  form,
  onUpdate,
}: {
  action: string;
  label: string;
  form: AppSettings;
  onUpdate: (action: string, key: string) => void;
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
        onUpdate(action, e.key);
      }
      setEditing(false);
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [editing, action, onUpdate]);

  return (
    <SettingRow
      title={label}
      control={
        <button
          type="button"
          onClick={() => setEditing(true)}
          className={cn(
            "flex items-center justify-center min-w-[5.5rem] h-7 px-2.5 rounded-lg border text-xs font-mono transition-all",
            editing
              ? "border-primary bg-primary/10 text-primary font-bold animate-pulse"
              : "border-border/70 bg-muted/40 hover:bg-muted text-foreground"
          )}
        >
          {editing ? (
            <span className="text-[11px] text-primary">{t("settings.pressAnyKey")}</span>
          ) : value ? (
            <Kbd size="sm">{value}</Kbd>
          ) : (
            <span className="text-muted-foreground text-[11px]">{t("settings.shortcutNotSet")}</span>
          )}
        </button>
      }
    />
  );
}
