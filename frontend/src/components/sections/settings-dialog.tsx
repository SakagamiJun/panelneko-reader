import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  BookOpen,
  Check,
  Code2,
  Download,
  Folder,
  Info,
  Keyboard,
  Settings2,
  Sliders,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { appAdapter } from "@/lib/api";
import type { AppSettings } from "@/lib/contracts";
import { cn } from "@/lib/utils";
import { GeneralTab } from "./settings/general-tab";
import { SourcesTab } from "./settings/sources-tab";
import { DownloadsTab } from "./settings/downloads-tab";
import { ReaderTab } from "./settings/reader-tab";
import { ShortcutsTab } from "./settings/shortcuts-tab";
import { AboutTab } from "./settings/about-tab";
import { DeveloperTab } from "./settings/developer-tab";

export type SettingsTab = "general" | "sources" | "downloads" | "reader" | "shortcuts" | "about" | "developer";

export interface SettingsDialogProps {
  open: boolean;
  onClose: (finalSettings?: AppSettings) => void;
  settings: AppSettings;
  onSave: (settings: AppSettings) => void;
  defaultTab?: SettingsTab;
  version?: string;
  commit?: string;
  onOpenBatchLink?: () => void;
}

export function SettingsDialog({
  open,
  onClose,
  settings,
  onSave,
  defaultTab = "general",
  version,
  commit,
  onOpenBatchLink,
}: SettingsDialogProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<SettingsTab>(defaultTab);
  const [form, setForm] = useState<AppSettings>(settings);
  const [isSavedRecently, setIsSavedRecently] = useState(false);
  const [isDevMode, setIsDevMode] = useState(false);

  const saveTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (open) {
      appAdapter.getIsDevMode().then(setIsDevMode).catch(() => {});
    }
  }, [open]);

  useEffect(() => {
    if (settings) {
      setForm(settings);
    }
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

  // Escape key handler
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose(form);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose, form]);

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

  const updateDownloader = (patch: Partial<NonNullable<AppSettings["downloader"]>>) => {
    const current = form.downloader || {
      enableCopyManga: false,
      enableRawManga: false,
      downloadDir: "",
      downloadFormat: "cbz",
      maxConcurrentDownloads: 3,
    };
    updateFields({
      downloader: {
        ...current,
        ...patch,
      },
    });
  };

  const tabs: Array<{ id: SettingsTab; label: string; icon: React.ReactNode }> = [
    { id: "general", label: t("settings.generalTab"), icon: <Sliders className="h-4 w-4" /> },
    { id: "sources", label: t("settings.sourcesTab"), icon: <Folder className="h-4 w-4" /> },
    { id: "downloads", label: t("settings.downloadsTab"), icon: <Download className="h-4 w-4" /> },
    { id: "reader", label: t("settings.readerPreferences"), icon: <BookOpen className="h-4 w-4" /> },
    { id: "shortcuts", label: t("settings.shortcuts"), icon: <Keyboard className="h-4 w-4" /> },
    { id: "about", label: t("settings.aboutTab"), icon: <Info className="h-4 w-4" /> },
    ...(isDevMode
      ? [{ id: "developer" as SettingsTab, label: t("settings.developerTab"), icon: <Code2 className="h-4 w-4" /> }]
      : []),
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
                      "w-full flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium transition-colors duration-150 text-left border outline-none select-none cursor-pointer",
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
              <GeneralTab
                form={form}
                updateField={updateField}
                updateFields={updateFields}
              />
            )}

            {activeTab === "sources" && (
              <SourcesTab
                form={form}
                updateField={updateField}
                onUpdateForm={setForm}
                onSave={onSave}
              />
            )}

            {activeTab === "downloads" && (
              <DownloadsTab
                form={form}
                updateDownloader={updateDownloader}
                onOpenBatchLink={onOpenBatchLink}
              />
            )}

            {activeTab === "reader" && (
              <ReaderTab
                form={form}
                updateField={updateField}
              />
            )}

            {activeTab === "shortcuts" && (
              <ShortcutsTab
                form={form}
                updateField={updateField}
              />
            )}

            {activeTab === "about" && (
              <AboutTab
                form={form}
                updateField={updateField}
                version={version}
                commit={commit}
                onDevModeUnlocked={async () => {
                  try {
                    await appAdapter.setDevMode(true);
                  } catch (err) {
                    console.error("Failed to unlock dev mode on backend:", err);
                  }
                  setIsDevMode(true);
                  setActiveTab("developer");
                }}
              />
            )}

            {activeTab === "developer" && <DeveloperTab />}
          </main>
        </div>
      </div>
    </div>
  );
}
