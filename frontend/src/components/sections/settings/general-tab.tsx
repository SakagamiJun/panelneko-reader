import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { SettingGroup, SettingRow } from "@/components/ui/setting-row";
import { Switch } from "@/components/ui/switch";
import { appAdapter } from "@/lib/api";
import type { AppSettings, Locale, ThemeMode, ThumbnailQuality } from "@/lib/contracts";
import { formatBytes } from "@/lib/utils";

export interface GeneralTabProps {
  form: AppSettings;
  updateField: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  updateFields: (patch: Partial<AppSettings>) => void;
}

export function GeneralTab({ form, updateField, updateFields }: GeneralTabProps) {
  const { t } = useTranslation();

  const [cacheSizeBytes, setCacheSizeBytes] = useState<number>(0);
  const [isClearingCache, setIsClearingCache] = useState(false);
  const [isCacheClearedRecently, setIsCacheClearedRecently] = useState(false);

  useEffect(() => {
    void appAdapter
      .getThumbnailCacheSize()
      .then((size) => setCacheSizeBytes(size))
      .catch((err) => console.error("Failed to get thumbnail cache size:", err));
  }, []);

  const handleClearCache = async () => {
    setIsClearingCache(true);
    try {
      await appAdapter.clearThumbnailCache();
      setCacheSizeBytes(0);
      setIsCacheClearedRecently(true);
      setTimeout(() => setIsCacheClearedRecently(false), 2000);
    } catch (err) {
      console.error("Failed to clear thumbnail cache:", err);
    } finally {
      setIsClearingCache(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Appearance & Language Group */}
      <SettingGroup
        title={t("settings.groupAppearance")}
        description={t("settings.groupAppearanceDesc")}
      >
        <SettingRow
          title={t("settings.themeMode")}
          description={t("settings.themeModeHint")}
          control={
            <SegmentedControl<ThemeMode>
              size="sm"
              value={form.themeMode || "system"}
              onChange={(val) => updateField("themeMode", val)}
              options={[
                { value: "system", label: t("settings.system") },
                { value: "light", label: t("settings.light") },
                { value: "dark", label: t("settings.dark") },
              ]}
            />
          }
        />

        <SettingRow
          title={t("settings.locale")}
          description={t("settings.localeHint")}
          control={
            <SegmentedControl<string>
              size="sm"
              value={form.localeMode === "system" ? "system" : form.locale || "zh-CN"}
              onChange={(val) => {
                if (val === "system") {
                  updateFields({ localeMode: "system" });
                } else {
                  updateFields({
                    localeMode: "manual",
                    locale: val as Locale,
                  });
                }
              }}
              options={[
                { value: "system", label: t("settings.system") },
                { value: "zh-CN", label: t("settings.localeZhCN") },
                { value: "en", label: t("settings.localeEn") },
                { value: "ja", label: t("settings.localeJa") },
              ]}
            />
          }
        />
      </SettingGroup>

      {/* Reading Behavior Group */}
      <SettingGroup
        title={t("settings.groupReading")}
        description={t("settings.groupReadingDesc")}
      >
        <SettingRow
          title={t("settings.autoRestoreReaderProgress")}
          description={t("settings.autoRestoreReaderProgressHint")}
          control={
            <Switch
              checked={form.autoRestoreReaderProgress}
              onChange={(checked) => updateField("autoRestoreReaderProgress", checked)}
            />
          }
        />
      </SettingGroup>

      {/* Performance & Cache Group */}
      <SettingGroup
        title={t("settings.groupPerformance")}
        description={t("settings.groupPerformanceDesc")}
      >
        <SettingRow
          title={t("settings.readerScrollCachePages")}
          description={t("settings.readerScrollCachePagesHint")}
          control={
            <Input
              className="w-20 h-7 text-xs text-center font-mono"
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
              size="sm"
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
  );
}
