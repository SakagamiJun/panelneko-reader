import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Kbd } from "@/components/ui/kbd";
import { SettingGroup, SettingRow } from "@/components/ui/setting-row";
import type { AppSettings } from "@/lib/contracts";
import { cn } from "@/lib/utils";

export interface ShortcutsTabProps {
  form: AppSettings;
  updateField: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
}

export function ShortcutsTab({ form, updateField }: ShortcutsTabProps) {
  const { t } = useTranslation();

  const handleUpdateShortcut = (action: string, key: string) => {
    const nextShortcuts = { ...(form.shortcuts || {}), [action]: key };
    updateField("shortcuts", nextShortcuts);
  };

  return (
    <div className="space-y-5">
      <SettingGroup
        title={t("settings.shortcuts")}
        description={t("settings.shortcutsDesc")}
      >
        <ShortcutItem
          label={t("settings.shortcutAction_nextPage")}
          action="nextPage"
          form={form}
          onUpdate={handleUpdateShortcut}
        />
        <ShortcutItem
          label={t("settings.shortcutAction_prevPage")}
          action="prevPage"
          form={form}
          onUpdate={handleUpdateShortcut}
        />
        <ShortcutItem
          label={t("settings.shortcutAction_nextChapter")}
          action="nextChapter"
          form={form}
          onUpdate={handleUpdateShortcut}
        />
        <ShortcutItem
          label={t("settings.shortcutAction_prevChapter")}
          action="prevChapter"
          form={form}
          onUpdate={handleUpdateShortcut}
        />
        <ShortcutItem
          label={t("settings.shortcutAction_toggleMode")}
          action="toggleMode"
          form={form}
          onUpdate={handleUpdateShortcut}
        />
        <ShortcutItem
          label={t("settings.shortcutAction_backToLibrary")}
          action="backToLibrary"
          form={form}
          onUpdate={handleUpdateShortcut}
        />
        <ShortcutItem
          label={t("settings.shortcutAction_toggleMenu")}
          action="toggleMenu"
          form={form}
          onUpdate={handleUpdateShortcut}
        />
      </SettingGroup>
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
            "flex items-center justify-center min-w-[5.5rem] h-7 px-2.5 rounded-lg border text-xs font-mono transition-all cursor-pointer",
            editing
              ? "border-primary ring-1 ring-primary/40 bg-primary/10 text-primary font-semibold"
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
