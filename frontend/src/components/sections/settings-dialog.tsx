import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  BookOpen,
  Check,
  ExternalLink,
  Folder,
  FolderInput,
  FolderOpen,
  Info,
  Keyboard,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Settings2,
  Sliders,
  Trash2,
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
  DuplicateMergeMode,
  LibrarySource,
  ReaderDirection,
  ReaderFitMode,
  ReaderFilter,
  ReaderSpreadMode,
  ReaderSideClickMode,
  SourceType,
  ThumbnailQuality,
  UpdateCheckResult,
} from "@/lib/contracts";
import { cn, formatBytes } from "@/lib/utils";

export type SettingsTab = "general" | "sources" | "reader" | "shortcuts" | "about";

export interface SettingsDialogProps {
  open: boolean;
  onClose: (finalSettings?: AppSettings) => void;
  settings: AppSettings;
  onSave: (settings: AppSettings) => void;
  version?: string;
  commit?: string;
  defaultTab?: SettingsTab;
}

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

  // Source Management State
  const [isAddingSource, setIsAddingSource] = useState(false);
  const [newSourceName, setNewSourceName] = useState("");
  const [newSourcePath, setNewSourcePath] = useState("");
  const [newSourceType, setNewSourceType] = useState<SourceType>("local");
  const [newSourceReadOnly, setNewSourceReadOnly] = useState(false);
  const [sourceToDelete, setSourceToDelete] = useState<LibrarySource | null>(null);
  const [scanningSourceId, setScanningSourceId] = useState<string | null>(null);
  const [sourceOpError, setSourceOpError] = useState<string | null>(null);
  const [editingSourceId, setEditingSourceId] = useState<string | null>(null);
  const [editingSourceName, setEditingSourceName] = useState("");

  useEffect(() => {
    setForm(settings);
  }, [settings]);

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

  const updateFields = (patch: Partial<AppSettings>) => {
    setForm((prev) => {
      const next = { ...prev, ...patch };
      onSave(next);
      return next;
    });
    setIsSavedRecently(true);
    if (saveTimeoutRef.current) {
      window.clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = window.setTimeout(() => {
      setIsSavedRecently(false);
    }, 1500);
  };

  const updateField = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    updateFields({ [key]: value } as Partial<AppSettings>);
  };

  const handleBrowseNewSource = async () => {
    try {
      const selected = await appAdapter.selectDirectory();
      if (selected) {
        setNewSourcePath(selected);
        if (!newSourceName) {
          const parts = selected.replace(/[\\/]+$/, "").split(/[\\/]/);
          let base = parts[parts.length - 1] || "Manga Library";
          const existingNames = new Set((form.librarySources ?? []).map((s) => s.name));
          if (existingNames.has(base)) {
            const parent = parts.length > 1 ? parts[parts.length - 2] : "";
            if (parent && !existingNames.has(`${base} (${parent})`)) {
              base = `${base} (${parent})`;
            } else {
              let idx = 2;
              while (existingNames.has(`${base} (${idx})`)) {
                idx++;
              }
              base = `${base} (${idx})`;
            }
          }
          setNewSourceName(base);
        }
      }
    } catch (err) {
      console.error("Failed to select directory:", err);
    }
  };

  const handleAddSourceSubmit = async () => {
    if (!newSourcePath.trim()) return;
    setSourceOpError(null);
    try {
      const updated = await appAdapter.addLibrarySource({
        id: "",
        name: newSourceName.trim(),
        path: newSourcePath.trim(),
        type: newSourceType,
        readOnly: newSourceReadOnly,
        enabled: true,
      });
      setForm(updated);
      onSave(updated);
      setIsAddingSource(false);
      setNewSourceName("");
      setNewSourcePath("");
      setNewSourceReadOnly(false);
      setNewSourceType("local");
    } catch (err: unknown) {
      setSourceOpError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleToggleSourceEnabled = async (source: LibrarySource) => {
    try {
      const updated = await appAdapter.updateLibrarySource({
        ...source,
        enabled: !source.enabled,
      });
      setForm(updated);
      onSave(updated);
    } catch (err) {
      console.error("Failed to toggle source:", err);
    }
  };

  const handleRelocateSource = async (source: LibrarySource) => {
    try {
      const selected = await appAdapter.selectDirectory();
      if (selected && selected !== source.path) {
        const updated = await appAdapter.relocateLibrarySource(source.id, selected);
        setForm(updated);
        onSave(updated);
      }
    } catch (err) {
      console.error("Failed to relocate source:", err);
    }
  };

  const handleRescanSource = async (sourceId: string) => {
    setScanningSourceId(sourceId);
    try {
      await appAdapter.rescanSource(sourceId);
      const fresh = await appAdapter.getSettings();
      setForm(fresh);
      onSave(fresh);
    } catch (err) {
      console.error("Failed to rescan source:", err);
    } finally {
      setScanningSourceId(null);
    }
  };

  const handleConfirmDeleteSource = async () => {
    if (!sourceToDelete) return;
    try {
      const updated = await appAdapter.removeLibrarySource(sourceToDelete.id);
      setForm(updated);
      onSave(updated);
      setSourceToDelete(null);
    } catch (err) {
      console.error("Failed to remove source:", err);
    }
  };

  const handleSaveSourceName = async (source: LibrarySource) => {
    const trimmed = editingSourceName.trim();
    if (!trimmed) return;
    try {
      const updated = await appAdapter.updateLibrarySource({
        ...source,
        name: trimmed,
      });
      setForm(updated);
      onSave(updated);
      setEditingSourceId(null);
    } catch (err) {
      console.error("Failed to update source alias:", err);
    }
  };

  const tabs: Array<{ id: SettingsTab; label: string; icon: React.ReactNode }> = [
    { id: "general", label: t("settings.generalTab"), icon: <Sliders className="h-4 w-4" /> },
    { id: "sources", label: t("settings.sourcesTab"), icon: <Folder className="h-4 w-4" /> },
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

  const handleClose = () => {
    onClose(form);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-md animate-in fade-in duration-150 p-4"
      onClick={handleClose}
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
                onClick={handleClose}
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
                    title={t("settings.thumbnailQuality")}
                    description={t("settings.thumbnailQualityDesc")}
                    control={
                      <SegmentedControl<ThumbnailQuality>
                        value={
                          form.thumbnailQuality ??
                          (form.enableThumbnailCache === false ? "off" : "medium")
                        }
                        onChange={(val) => {
                          updateFields({
                            thumbnailQuality: val,
                            enableThumbnailCache: val !== "off",
                          });
                        }}
                        options={[
                          { value: "off", label: t("settings.thumbnailQualityOff") },
                          { value: "low", label: t("settings.thumbnailQualityLow") },
                          { value: "medium", label: t("settings.thumbnailQualityMedium") },
                          { value: "high", label: t("settings.thumbnailQualityHigh") },
                        ]}
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

            {activeTab === "sources" && (
              <div className="space-y-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-foreground">
                      {t("settings.sourcesTitle")}
                    </h3>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {t("settings.sourcesDesc")}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="primary"
                    onClick={() => {
                      setSourceOpError(null);
                      setIsAddingSource(true);
                    }}
                    className="gap-1.5 shrink-0"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>{t("settings.addSource")}</span>
                  </Button>
                </div>

                {/* Add Source Inline Card */}
                {isAddingSource && (
                  <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3.5 animate-in fade-in-50 zoom-in-95 duration-150">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Folder className="h-4 w-4 text-primary" />
                        <h4 className="text-xs font-bold text-foreground">
                          {t("settings.addSourceDialogTitle")}
                        </h4>
                      </div>
                      <Button
                        type="button"
                        size="xs"
                        variant="ghost"
                        onClick={() => setIsAddingSource(false)}
                        className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>

                    <p className="text-[11px] text-muted-foreground">
                      {t("settings.addSourceDialogDesc")}
                    </p>

                    {sourceOpError && (
                      <div className="text-[11px] text-destructive bg-destructive/10 border border-destructive/20 rounded-lg p-2 flex items-center gap-1.5">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                        <span>{sourceOpError}</span>
                      </div>
                    )}

                    <div className="space-y-2.5">
                      <div className="space-y-1">
                        <label className="text-[11px] font-medium text-muted-foreground">
                          {t("settings.sourcePath")}
                        </label>
                        <div className="flex gap-2">
                          <Input
                            value={newSourcePath}
                            onChange={(e) => setNewSourcePath(e.target.value)}
                            placeholder={t("settings.sourcePathPlaceholder")}
                            className="text-xs font-mono flex-1 h-8"
                          />
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={handleBrowseNewSource}
                            className="gap-1.5 shrink-0 h-8 text-xs"
                          >
                            <Folder className="h-3.5 w-3.5" />
                            <span>{t("settings.browse")}</span>
                          </Button>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[11px] font-medium text-muted-foreground">
                          {t("settings.sourceName")}
                        </label>
                        <Input
                          value={newSourceName}
                          onChange={(e) => setNewSourceName(e.target.value)}
                          placeholder={t("settings.sourceNamePlaceholder")}
                          className="text-xs h-8"
                        />
                      </div>

                      <div className="flex items-center justify-between py-1">
                        <div>
                          <div className="text-xs font-medium text-foreground">
                            {t("settings.sourceReadOnly")}
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            {t("settings.sourceReadOnlyHint")}
                          </div>
                        </div>
                        <Switch
                          checked={newSourceReadOnly}
                          onChange={setNewSourceReadOnly}
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/40">
                      <Button
                        type="button"
                        size="xs"
                        variant="ghost"
                        onClick={() => setIsAddingSource(false)}
                      >
                        {t("library.cancel")}
                      </Button>
                      <Button
                        type="button"
                        size="xs"
                        variant="primary"
                        disabled={!newSourcePath.trim()}
                        onClick={handleAddSourceSubmit}
                      >
                        {t("library.confirm")}
                      </Button>
                    </div>
                  </div>
                )}

                {/* Sources List */}
                <div className="space-y-3">
                  {(!form.librarySources || form.librarySources.length === 0) ? (
                    <div className="rounded-xl border border-dashed border-border/70 p-8 text-center text-muted-foreground">
                      <Folder className="h-8 w-8 mx-auto mb-2 opacity-40" />
                      <p className="text-xs">{t("settings.sourceEmpty")}</p>
                    </div>
                  ) : (
                    form.librarySources.map((source, index) => {
                      const isScanning = scanningSourceId === source.id;
                      const isOffline = source.status === "offline";
                      const isDefault = source.id === "default" || index === 0;

                      return (
                        <div
                          key={source.id}
                          className={cn(
                            "rounded-xl border border-border/60 bg-card/60 p-3.5 transition-all duration-150 space-y-2.5",
                            !source.enabled && "opacity-60 bg-muted/20",
                            isOffline && source.enabled && "border-destructive/40 bg-destructive/5"
                          )}
                        >
                          <div className="flex items-center justify-between gap-2">
                            {editingSourceId === source.id ? (
                              <div className="flex items-center gap-1.5 flex-1 min-w-0">
                                <Input
                                  value={editingSourceName}
                                  onChange={(e) => setEditingSourceName(e.target.value)}
                                  placeholder={t("settings.sourceEditNamePlaceholder")}
                                  className="h-7 text-xs flex-1"
                                  autoFocus
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") handleSaveSourceName(source);
                                    if (e.key === "Escape") setEditingSourceId(null);
                                  }}
                                />
                                <Button
                                  type="button"
                                  size="xs"
                                  variant="primary"
                                  className="h-7 px-2 text-[10px]"
                                  onClick={() => handleSaveSourceName(source)}
                                >
                                  {t("settings.sourceSave")}
                                </Button>
                                <Button
                                  type="button"
                                  size="xs"
                                  variant="ghost"
                                  className="h-7 px-2 text-[10px]"
                                  onClick={() => setEditingSourceId(null)}
                                >
                                  {t("settings.sourceCancel")}
                                </Button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 min-w-0">
                                <span
                                  className={cn(
                                    "h-2 w-2 rounded-full shrink-0",
                                    !source.enabled
                                      ? "bg-muted-foreground/40"
                                      : isOffline
                                      ? "bg-destructive"
                                      : "bg-emerald-500"
                                  )}
                                />
                                <span className="font-semibold text-xs text-foreground truncate">
                                  {source.name || t("settings.sourceName")}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingSourceId(source.id);
                                    setEditingSourceName(source.name || "");
                                  }}
                                  className="p-1 rounded text-muted-foreground/60 hover:text-foreground hover:bg-muted/50 transition-colors shrink-0"
                                  title={t("settings.sourceEditName")}
                                >
                                  <Pencil className="h-3 w-3" />
                                </button>
                                {isDefault && (
                                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-primary/10 text-primary border border-primary/20 shrink-0">
                                    {t("settings.sourceDefaultBadge")}
                                  </span>
                                )}
                                {source.readOnly && (
                                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-muted text-muted-foreground border border-border/50 shrink-0">
                                    {t("settings.sourceReadOnly")}
                                  </span>
                                )}
                                <span className="text-[11px] text-muted-foreground/80 shrink-0">
                                  {t("settings.sourceMangaCount", { count: source.mangaCount ?? 0 })}
                                </span>
                              </div>
                            )}

                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-[11px] text-muted-foreground">
                                {!source.enabled
                                  ? t("settings.sourceDisabled")
                                  : isOffline
                                  ? t("settings.sourceOffline")
                                  : t("settings.sourceOnline")}
                              </span>
                              <Switch
                                checked={source.enabled}
                                onChange={() => handleToggleSourceEnabled(source)}
                              />
                            </div>
                          </div>

                          <div className="text-[11px] font-mono text-muted-foreground bg-muted/30 rounded-lg px-2.5 py-1.5 break-all select-all border border-border/30">
                            {source.path}
                          </div>

                          {isOffline && source.enabled && (
                            <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-2 text-[11px] text-destructive flex items-start gap-2">
                              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                              <div className="min-w-0 flex-1">
                                {source.errorMessage || t("library.offlineAlertDesc")}
                              </div>
                            </div>
                          )}

                          <div className="flex items-center justify-between pt-1 text-[11px] text-muted-foreground">
                            <span className="text-[10px] font-mono text-muted-foreground/60">
                              {source.lastScanned
                                ? t("settings.sourceLastScanned", {
                                    time: new Date(source.lastScanned).toLocaleTimeString([], {
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    }),
                                  })
                                : ""}
                            </span>

                            <div className="flex items-center gap-1.5">
                              <Button
                                type="button"
                                size="xs"
                                variant="outline"
                                onClick={() => handleRelocateSource(source)}
                                className="h-6 px-2 text-[10px] gap-1"
                                title={t("settings.sourceRelocate")}
                              >
                                <FolderInput className="h-3 w-3" />
                                <span>{t("settings.sourceRelocate")}</span>
                              </Button>

                              <Button
                                type="button"
                                size="xs"
                                variant="outline"
                                disabled={isScanning || !source.enabled}
                                onClick={() => handleRescanSource(source.id)}
                                className="h-6 px-2 text-[10px] gap-1"
                                title={t("settings.sourceRescan")}
                              >
                                <RefreshCw className={cn("h-3 w-3", isScanning && "animate-spin")} />
                                <span>{t("settings.sourceRescan")}</span>
                              </Button>

                              {(form.librarySources && form.librarySources.length > 1) && (
                                <Button
                                  type="button"
                                  size="xs"
                                  variant="ghost"
                                  onClick={() => setSourceToDelete(source)}
                                  className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                  title={t("settings.sourceRemove")}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {sourceToDelete && (
                  <div
                    className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
                    onClick={() => setSourceToDelete(null)}
                  >
                    <div
                      className="w-full max-w-sm rounded-xl border border-border/80 bg-card p-4 space-y-3 shadow-xl"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <h4 className="text-sm font-bold text-foreground">
                        {t("settings.sourceRemoveConfirmTitle", { name: sourceToDelete.name })}
                      </h4>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {t("settings.sourceRemoveConfirmDesc")}
                      </p>
                      <div className="flex items-center justify-end gap-2 pt-2">
                        <Button
                          type="button"
                          size="xs"
                          variant="ghost"
                          onClick={() => setSourceToDelete(null)}
                        >
                          {t("library.cancel")}
                        </Button>
                        <Button
                          type="button"
                          size="xs"
                          variant="primary"
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          onClick={handleConfirmDeleteSource}
                        >
                          {t("settings.sourceRemove")}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                <div className="pt-2">
                  <SettingGroup
                    title={t("settings.duplicateMergeMode")}
                    description={t("settings.duplicateMergeModeDesc")}
                  >
                    <SettingRow
                      title={t("settings.duplicateMergeMode")}
                      description={
                        form.duplicateMergeMode === "merge"
                          ? t("settings.duplicateMergeMergeDesc")
                          : t("settings.duplicateMergeSeparateDesc")
                      }
                      control={
                        <SegmentedControl<DuplicateMergeMode>
                          value={form.duplicateMergeMode ?? "separate"}
                          onChange={(mode) => updateField("duplicateMergeMode", mode)}
                          options={[
                            {
                              value: "separate",
                              label: t("settings.duplicateMergeSeparate"),
                            },
                            {
                              value: "merge",
                              label: t("settings.duplicateMergeMerge"),
                            },
                          ]}
                        />
                      }
                    />
                  </SettingGroup>
                </div>
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
