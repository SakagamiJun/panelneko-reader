import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  Folder,
  FolderInput,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { appAdapter } from "@/lib/api";
import type {
  AppSettings,
  LibrarySource,
  SourceType,
} from "@/lib/contracts";
import { cn } from "@/lib/utils";

export interface SourcesTabProps {
  form: AppSettings;
  updateField: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  onUpdateForm: (newSettings: AppSettings) => void;
  onSave: (settings: AppSettings) => void;
}

export function SourcesTab({
  form,
  updateField,
  onUpdateForm,
  onSave,
}: SourcesTabProps) {
  const { t } = useTranslation();

  const [isAddingSource, setIsAddingSource] = useState(false);
  const [newSourcePath, setNewSourcePath] = useState("");
  const [newSourceName, setNewSourceName] = useState("");
  const [newSourceReadOnly, setNewSourceReadOnly] = useState(false);
  const [newSourceType, setNewSourceType] = useState<SourceType>("local");
  const [sourceOpError, setSourceOpError] = useState<string | null>(null);

  const [editingSourceId, setEditingSourceId] = useState<string | null>(null);
  const [editingSourceName, setEditingSourceName] = useState("");
  const [sourceToDelete, setSourceToDelete] = useState<LibrarySource | null>(null);
  const [scanningSourceId, setScanningSourceId] = useState<string | null>(null);

  const handleBrowseNewSource = async () => {
    try {
      const selected = await appAdapter.selectDirectory({
        title: t("settings.selectMangaDirectory"),
      });
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
      onUpdateForm(updated);
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
      onUpdateForm(updated);
      onSave(updated);
    } catch (err) {
      console.error("Failed to toggle source:", err);
    }
  };

  const handleRelocateSource = async (source: LibrarySource) => {
    try {
      const selected = await appAdapter.selectDirectory({
        title: t("settings.selectMangaDirectory"),
        defaultDirectory: source.path,
      });
      if (selected && selected !== source.path) {
        const updated = await appAdapter.relocateLibrarySource(source.id, selected);
        onUpdateForm(updated);
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
      onUpdateForm(fresh);
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
      onUpdateForm(updated);
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
      onUpdateForm(updated);
      onSave(updated);
      setEditingSourceId(null);
    } catch (err) {
      console.error("Failed to update source alias:", err);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between pb-1">
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
              className="h-7 px-3 text-xs"
            >
              {t("library.cancel")}
            </Button>
            <Button
              type="button"
              size="xs"
              variant="primary"
              disabled={!newSourcePath.trim()}
              onClick={handleAddSourceSubmit}
              className="h-7 px-3 text-xs"
            >
              {t("library.confirm")}
            </Button>
          </div>
        </div>
      )}

      {/* Sources List */}
      <div className="space-y-3">
        {!form.librarySources || form.librarySources.length === 0 ? (
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

                    {form.librarySources && form.librarySources.length > 1 && (
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

      <ConfirmDialog
        open={Boolean(sourceToDelete)}
        title={sourceToDelete ? t("settings.sourceRemoveConfirmTitle", { name: sourceToDelete.name }) : ""}
        description={t("settings.sourceRemoveConfirmDesc")}
        confirmLabel={t("settings.sourceRemove")}
        cancelLabel={t("library.cancel")}
        confirmVariant="primary"
        onConfirm={handleConfirmDeleteSource}
        onCancel={() => setSourceToDelete(null)}
      />
    </div>
  );
}
