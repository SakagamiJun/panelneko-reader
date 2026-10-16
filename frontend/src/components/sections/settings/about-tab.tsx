import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ExternalLink, FolderOpen, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SettingGroup, SettingRow } from "@/components/ui/setting-row";
import { Switch } from "@/components/ui/switch";
import { appAdapter } from "@/lib/api";
import { APP_LINKS } from "@/lib/constants";
import type { AppSettings, UpdateCheckResult } from "@/lib/contracts";

export interface AboutTabProps {
  form: AppSettings;
  updateField: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  version?: string;
  commit?: string;
}

export function AboutTab({ form, updateField, version, commit }: AboutTabProps) {
  const { t } = useTranslation();

  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [updateResult, setUpdateResult] = useState<UpdateCheckResult | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);

  const handleCheckUpdate = async () => {
    setIsCheckingUpdate(true);
    setUpdateError(null);
    try {
      const result = await appAdapter.checkForUpdates();
      setUpdateResult(result);
    } catch (err) {
      console.error("Update check failed:", err);
      setUpdateError(t("settings.checkUpdateFailed"));
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  return (
    <div className="space-y-5">
      <SettingGroup title={t("settings.aboutPanelNeko")}>
        <div className="p-4 sm:p-5 space-y-4">
          <div className="flex items-center gap-3.5">
            <img
              src="/appicon.png"
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
              className="h-7 px-2.5 text-xs gap-1.5 cursor-pointer"
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
                className="h-7 px-2.5 text-xs gap-1.5 cursor-pointer"
              >
                <ExternalLink className="h-3 w-3" />
                <span>{t("settings.reportBug")}</span>
              </Button>
              <Button
                type="button"
                size="xs"
                variant="outline"
                onClick={() => appAdapter.openURL(APP_LINKS.FEATURE_REQUEST)}
                className="h-7 px-2.5 text-xs gap-1.5 cursor-pointer"
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
              ? updateResult.isHomebrew
                ? t("settings.updateAvailableHomebrewHint", {
                    version: `v${updateResult.latestVersion}`,
                    current: `v${updateResult.currentVersion}`,
                  })
                : t("settings.updateAvailableHint", {
                    version: `v${updateResult.latestVersion}`,
                    current: `v${updateResult.currentVersion}`,
                  })
              : updateResult && !updateResult.hasUpdate
              ? t("settings.upToDate")
              : t("settings.currentVersionPrefix", { version: version || "0.1.0" })
          }
          control={
            <div className="flex items-center gap-2">
              {updateResult?.hasUpdate && updateResult.isHomebrew && (
                <div className="hidden sm:flex items-center gap-1.5 rounded-lg bg-muted/60 px-2.5 py-1 border border-border/40 font-mono text-[11px] text-muted-foreground select-all">
                  <code>brew upgrade panelneko</code>
                </div>
              )}
              {updateResult?.hasUpdate && (
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  onClick={() => appAdapter.openURL(updateResult.releaseURL)}
                  className="h-7 px-2.5 text-xs gap-1.5 cursor-pointer text-primary border-primary/40 hover:bg-primary/10"
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
                className="h-7 px-2.5 text-xs gap-1.5 cursor-pointer"
              >
                {isCheckingUpdate ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
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
        title={t("settings.diagnosticsAndLogs")}
        description={t("settings.diagnosticsAndLogsDesc")}
      >
        <SettingRow
          title={t("settings.enableFileLogging")}
          description={t("settings.enableFileLoggingHint")}
          control={
            <Switch
              checked={Boolean(form.enableFileLogging)}
              onChange={(checked) => updateField("enableFileLogging", checked)}
            />
          }
        />
        <SettingRow
          title={t("settings.openLogDirectory")}
          description={t("settings.openLogDirectoryHint")}
          control={
            <Button
              type="button"
              size="xs"
              variant="outline"
              onClick={() => void appAdapter.openLogDirectory()}
              className="h-7 px-2.5 text-xs gap-1.5 cursor-pointer"
            >
              <FolderOpen className="h-3.5 w-3.5" />
              <span>{t("settings.openLogDirectory")}</span>
            </Button>
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
  );
}
