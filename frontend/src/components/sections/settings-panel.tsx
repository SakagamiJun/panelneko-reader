import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  BookOpen,
  Check,
  Folder,
  Info,
  Keyboard,
  RotateCcw,
  Save,
  Sliders,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { SegmentedControl, type SegmentedOption } from "@/components/ui/segmented-control";
import { SettingGroup, SettingRow } from "@/components/ui/setting-row";
import { Switch } from "@/components/ui/switch";
import { appAdapter } from "@/lib/api";
import type {
  AppSettings,
  ReaderDirection,
  ReaderFitMode,
  ReaderFilter,
  ReaderSpreadMode,
  ReaderSideClickMode,
} from "@/lib/contracts";
import { cn } from "@/lib/utils";

interface SettingsPanelProps {
  settings: AppSettings;
  onSave: (settings: AppSettings) => void;
  version?: string;
  isSaving?: boolean;
}

type SettingsTab = "general" | "reader" | "shortcuts" | "about";

export function SettingsPanel({
  settings,
  onSave,
  version,
  isSaving = false,
}: SettingsPanelProps) {
  const { t } = useTranslation();
  const [form, setForm] = useState<AppSettings>(settings);
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");
  const [isSavedRecently, setIsSavedRecently] = useState(false);

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

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(form);
    setIsSavedRecently(true);
    setTimeout(() => setIsSavedRecently(false), 2000);
  };

  const tabs: Array<{ id: SettingsTab; label: string; icon: React.ReactNode }> = [
    { id: "general", label: t("settings.title"), icon: <Sliders className="h-3.5 w-3.5" /> },
    { id: "reader", label: t("settings.readerPreferences"), icon: <BookOpen className="h-3.5 w-3.5" /> },
    { id: "shortcuts", label: t("settings.shortcuts"), icon: <Keyboard className="h-3.5 w-3.5" /> },
    { id: "about", label: "关于", icon: <Info className="h-3.5 w-3.5" /> },
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
    { value: "right_next", label: "右侧下页" },
    { value: "follow", label: "跟随方向" },
    { value: "left_next", label: "左侧下页" },
  ];

  return (
    <div className="flex h-full flex-col">
      {/* DevToys-style Category Navigation Tabs */}
      <div className="border-b border-border/60 bg-muted/20 px-3 py-2 shrink-0">
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors shrink-0",
                  isActive
                    ? "bg-card text-foreground shadow-xs border border-border/60 font-semibold"
                    : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                )}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Settings Form Scroll Area */}
      <form onSubmit={handleFormSubmit} className="flex-1 overflow-y-auto p-4 space-y-4">
        {activeTab === "general" && (
          <div className="space-y-4">
            <SettingGroup
              title={t("settings.title")}
              description={t("settings.subtitle")}
            >
              <SettingRow
                title={t("settings.outputRoot")}
                description="存放本地漫画（ZIP/CBZ 或图片目录）的根目录"
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
                <div className="px-3.5 py-2 text-xs font-mono text-muted-foreground bg-muted/30 break-all select-all">
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
                      setForm((current) => ({
                        ...current,
                        autoRestoreReaderProgress: checked,
                      }))
                    }
                  />
                }
              />
            </SettingGroup>
          </div>
        )}

        {activeTab === "reader" && (
          <div className="space-y-4">
            <SettingGroup
              title={t("settings.readerPreferences")}
              description={t("settings.readerPreferencesSubtitle")}
            >
              <SettingRow
                title={t("reader.spreadMode")}
                description="单页展示或自动将两页双开对齐拼合"
                control={
                  <SegmentedControl
                    size="sm"
                    value={form.readerSpreadMode || "auto"}
                    options={spreadOptions}
                    onChange={(val) =>
                      setForm((c) => ({ ...c, readerSpreadMode: val }))
                    }
                  />
                }
              />

              <SettingRow
                title={t("reader.direction")}
                description="日漫惯用右向左翻页，美漫/传统左向右"
                control={
                  <SegmentedControl
                    size="sm"
                    value={form.readerDirection || "rtl"}
                    options={directionOptions}
                    onChange={(val) =>
                      setForm((c) => ({ ...c, readerDirection: val }))
                    }
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
                    onChange={(val) =>
                      setForm((c) => ({ ...c, readerSideClickMode: val }))
                    }
                  />
                }
              />

              <SettingRow
                title={t("reader.fitMode")}
                description="画面如何自适应窗口视口大小"
                control={
                  <SegmentedControl
                    size="sm"
                    value={form.readerFitMode || "contain"}
                    options={fitOptions}
                    onChange={(val) =>
                      setForm((c) => ({ ...c, readerFitMode: val }))
                    }
                  />
                }
              />

              <SettingRow
                title={t("reader.filter")}
                description="画面滤镜与反色渲染模式"
                control={
                  <SegmentedControl
                    size="sm"
                    value={form.readerFilter || "none"}
                    options={filterOptions}
                    onChange={(val) =>
                      setForm((c) => ({ ...c, readerFilter: val }))
                    }
                  />
                }
              />

              <SettingRow
                title={t("reader.coverSolo")}
                description={t("settings.coverSoloHint")}
                control={
                  <Switch
                    checked={form.readerCoverSolo !== false}
                    onChange={(checked) =>
                      setForm((c) => ({ ...c, readerCoverSolo: checked }))
                    }
                  />
                }
              />

              <SettingRow
                title={t("reader.clickCenterZoom")}
                description={t("settings.clickCenterZoomHint")}
                control={
                  <Switch
                    checked={form.readerClickCenterZoom === true}
                    onChange={(checked) =>
                      setForm((c) => ({ ...c, readerClickCenterZoom: checked }))
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
                      setForm((c) => ({ ...c, readerDoubleClickZoom: checked }))
                    }
                  />
                }
              />

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
                    onChange={(e) =>
                      setForm((c) => ({
                        ...c,
                        readerScrollCachePages: Number(e.target.value) || c.readerScrollCachePages,
                      }))
                    }
                  />
                }
              />
            </SettingGroup>
          </div>
        )}

        {activeTab === "shortcuts" && (
          <div className="space-y-4">
            <SettingGroup
              title={t("settings.shortcuts")}
              description="点击右侧按键徽标录制新快捷键，Esc 取消"
            >
              <ShortcutRow
                label={t("settings.shortcutAction_nextPage")}
                action="nextPage"
                form={form}
                setForm={setForm}
              />
              <ShortcutRow
                label={t("settings.shortcutAction_prevPage")}
                action="prevPage"
                form={form}
                setForm={setForm}
              />
              <ShortcutRow
                label={t("settings.shortcutAction_nextChapter")}
                action="nextChapter"
                form={form}
                setForm={setForm}
              />
              <ShortcutRow
                label={t("settings.shortcutAction_prevChapter")}
                action="prevChapter"
                form={form}
                setForm={setForm}
              />
              <ShortcutRow
                label={t("settings.shortcutAction_toggleMode")}
                action="toggleMode"
                form={form}
                setForm={setForm}
              />
              <ShortcutRow
                label={t("settings.shortcutAction_backToLibrary")}
                action="backToLibrary"
                form={form}
                setForm={setForm}
              />
              <ShortcutRow
                label={t("settings.shortcutAction_toggleMenu")}
                action="toggleMenu"
                form={form}
                setForm={setForm}
              />
            </SettingGroup>
          </div>
        )}

        {activeTab === "about" && (
          <div className="space-y-4">
            <SettingGroup title="关于 PanelNeko">
              <div className="p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary font-bold text-base">
                    PN
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-foreground">
                      PanelNeko Reader
                    </h4>
                    <p className="text-xs text-muted-foreground">
                      极简、高效、现代的本地漫画阅读器
                    </p>
                  </div>
                </div>

                <div className="pt-2 border-t border-border/40 text-xs text-muted-foreground space-y-1.5">
                  <div className="flex justify-between">
                    <span>版本:</span>
                    <span className="font-mono text-foreground font-semibold">
                      v{version || "0.1.0"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>架构:</span>
                    <span className="text-foreground">Wails v2 + React 19 + Go</span>
                  </div>
                  <div className="flex justify-between">
                    <span>设计规范:</span>
                    <span className="text-foreground">Linear & DevToys Minimalist</span>
                  </div>
                </div>
              </div>
            </SettingGroup>
          </div>
        )}

        {/* Action Save Button */}
        <div className="pt-2">
          <Button
            type="submit"
            disabled={isSaving}
            className="w-full h-9 text-xs font-semibold gap-2"
          >
            {isSavedRecently ? (
              <>
                <Check className="h-4 w-4" />
                <span>已保存</span>
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                <span>{t("settings.save")}</span>
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}

function ShortcutRow({
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
    <SettingRow
      title={label}
      control={
        <button
          type="button"
          onClick={() => setEditing(true)}
          className={cn(
            "flex items-center justify-center min-w-[5rem] h-7 px-2 rounded-lg border text-xs font-mono transition-all",
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
            <span className="text-muted-foreground text-[11px]">未设置</span>
          )}
        </button>
      }
    />
  );
}
