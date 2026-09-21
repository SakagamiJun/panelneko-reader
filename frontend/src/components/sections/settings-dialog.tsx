import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  BookOpen,
  Check,
  Folder,
  Info,
  Keyboard,
  Settings2,
  Sliders,
  X,
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
  const saveTimeoutRef = useRef<number | null>(null);

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
    { id: "general", label: t("settings.generalTab", { defaultValue: "常规设置" }), icon: <Sliders className="h-4 w-4" /> },
    { id: "reader", label: t("settings.readerPreferences"), icon: <BookOpen className="h-4 w-4" /> },
    { id: "shortcuts", label: t("settings.shortcuts"), icon: <Keyboard className="h-4 w-4" /> },
    { id: "about", label: "关于", icon: <Info className="h-4 w-4" /> },
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
                PanelNeko 系统参数与个性化偏好
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
              <span className="font-medium text-[11px]">已自动保存</span>
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
                title="关闭"
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
                  title={t("settings.title")}
                  description={t("settings.subtitle")}
                >
                  <SettingRow
                    title={t("settings.outputRoot")}
                    description="存放本地漫画（包含图片子目录或 ZIP/CBZ 压缩包）的本地文件夹"
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
                  title="性能与缓存"
                  description="调节滚动与翻页时的内存与性能平衡"
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
                </SettingGroup>
              </div>
            )}

            {activeTab === "reader" && (
              <div className="space-y-5">
                <SettingGroup
                  title="排版与翻页"
                  description="配置打开漫画时的默认阅读方向与跨页拼合模式"
                >
                  <SettingRow
                    title={t("reader.spreadMode")}
                    description="单页展示或自动将两页双开对齐拼合"
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
                    description="日漫习惯右向左翻页，传统/美漫左向右"
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
                  title="画面显示与滤镜"
                  description="调节画面在窗口中的对齐与显示风格"
                >
                  <SettingRow
                    title={t("reader.fitMode")}
                    description="画面如何自适应窗口视口大小"
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
                    description="画面滤镜与反色渲染模式"
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
                  title="缩放交互"
                  description="配置在画面上点击或双击时的缩放行为"
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
                  description="点击右侧按键徽标录制新按键，按 Esc 取消"
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
                <SettingGroup title="关于 PanelNeko">
                  <div className="p-5 space-y-4">
                    <div className="flex items-center gap-3.5">
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary font-bold text-lg">
                        PN
                      </div>
                      <div>
                        <h4 className="text-base font-bold text-foreground">
                          PanelNeko Reader
                        </h4>
                        <p className="text-xs text-muted-foreground">
                          极简、专注、现代的高性能本地漫画阅读器
                        </p>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-border/40 text-xs space-y-2 text-muted-foreground">
                      <div className="flex justify-between py-1 border-b border-border/20">
                        <span>应用版本</span>
                        <span className="font-mono text-foreground font-semibold">
                          v{version || "0.1.0"}
                        </span>
                      </div>
                      {commit && (
                        <div className="flex justify-between py-1 border-b border-border/20">
                          <span>构建提交</span>
                          <span className="font-mono text-foreground font-medium px-1.5 py-0.5 rounded bg-muted/50 border border-border/40 text-[11px]">
                            {commit}
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between py-1 border-b border-border/20">
                        <span>开源协议</span>
                        <span className="text-foreground font-mono">MIT License</span>
                      </div>
                      <div className="flex justify-between py-1">
                        <span>快捷键说明</span>
                        <span className="text-foreground font-mono">⌘, / Ctrl+, 唤出设置</span>
                      </div>
                    </div>
                  </div>
                </SettingGroup>

                <SettingGroup
                  title="致谢"
                  description="致谢为 PanelNeko 提供坚实基础的开源项目与生态："
                >
                  <SettingRow
                    title="Wails"
                    description="现代化轻量桌面应用框架，驱动 Go 后端与 Web 前端协同"
                    control={<span className="text-[11px] font-mono text-muted-foreground">v2</span>}
                  />
                  <SettingRow
                    title="Go"
                    description="高效可靠的系统级并发语言运行时与流式 IO 基础"
                    control={<span className="text-[11px] font-mono text-muted-foreground">Backend</span>}
                  />
                  <SettingRow
                    title="React 19"
                    description="声明式 UI 渲染引擎与并发组件模型"
                    control={<span className="text-[11px] font-mono text-muted-foreground">Frontend</span>}
                  />
                  <SettingRow
                    title="Tailwind CSS"
                    description="高性能现代原子化样式系统"
                    control={<span className="text-[11px] font-mono text-muted-foreground">Styling</span>}
                  />
                  <SettingRow
                    title="TanStack Query & Virtual"
                    description="虚拟化长列表与高效客户端数据状态缓存"
                    control={<span className="text-[11px] font-mono text-muted-foreground">State</span>}
                  />
                  <SettingRow
                    title="SQLite"
                    description="轻量级嵌入式本地结构化存储引擎"
                    control={<span className="text-[11px] font-mono text-muted-foreground">Storage</span>}
                  />
                  <SettingRow
                    title="Lucide Icons"
                    description="简洁一致的现代开源矢量图标库"
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
            <span className="text-muted-foreground text-[11px]">未设置</span>
          )}
        </button>
      }
    />
  );
}
