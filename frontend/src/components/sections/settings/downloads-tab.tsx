import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Check,
  Eye,
  EyeOff,
  FolderOpen,
  HardDrive,
  Link2,
  LogOut,
  Network,
  UserCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { SettingGroup, SettingRow } from "@/components/ui/setting-row";
import { Switch } from "@/components/ui/switch";
import { appAdapter } from "@/lib/api";
import type { AppSettings } from "@/lib/contracts";
import { cn } from "@/lib/utils";

export interface DownloadsTabProps {
  form: AppSettings;
  updateDownloader: (patch: Partial<NonNullable<AppSettings["downloader"]>>) => void;
  onOpenBatchLink?: () => void;
  onDevModeUnlocked?: () => void;
}

export function DownloadsTab({
  form,
  updateDownloader,
  onOpenBatchLink,
  onDevModeUnlocked,
}: DownloadsTabProps) {
  const { t } = useTranslation();
  const [usernameInput, setUsernameInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginStatusMessage, setLoginStatusMessage] = useState("");

  const currentCDNsStr = Array.isArray(form.downloader?.copyMangaCustomCdns)
    ? form.downloader.copyMangaCustomCdns.join(", ")
    : "";
  const [customCDNsInput, setCustomCDNsInput] = useState(currentCDNsStr);
  const [prevCDNsStr, setPrevCDNsStr] = useState(currentCDNsStr);

  if (currentCDNsStr !== prevCDNsStr) {
    setPrevCDNsStr(currentCDNsStr);
    setCustomCDNsInput(currentCDNsStr);
  }

  const selectedTargetSourceId = form.downloader?.targetSourceId || form.librarySources?.[0]?.id;
  const selectedTargetSource = form.librarySources?.find((s) => s.id === selectedTargetSourceId);
  const targetSubPath = form.downloader?.downloadSubPath?.trim() ?? "";
  const effectiveDownloadPath = selectedTargetSource
    ? (targetSubPath
        ? `${selectedTargetSource.path.replace(/[\\/]+$/, "")}/${targetSubPath.replace(/^[\\/]+/, "")}`
        : selectedTargetSource.path)
    : (form.downloader?.downloadDir || "");

  const handleSelectDownloadDir = async () => {
    try {
      const selected = await appAdapter.selectDirectory({
        title: t("settings.downloadDir"),
        defaultDirectory: form.downloader?.downloadDir || form.libraryRoot,
      });
      if (selected) {
        updateDownloader({ downloadDir: selected });
      }
    } catch (err) {
      console.error("Failed to select download directory:", err);
    }
  };

  const handleLogin = async () => {
    if (!usernameInput.trim() || !passwordInput.trim()) return;
    setIsLoggingIn(true);
    setLoginStatusMessage("");
    try {
      const res = await appAdapter.loginCopyManga(usernameInput, passwordInput);
      if (res.isDevMode) {
        setLoginStatusMessage(t("settings.devModeActivated"));
        onDevModeUnlocked?.();
        setUsernameInput("");
        setPasswordInput("");
        return;
      }
      if (res.success) {
        updateDownloader({
          copyMangaUsername: res.username,
          copyMangaToken: res.token,
        });
        setUsernameInput("");
        setPasswordInput("");
      }
    } catch (err: any) {
      setLoginStatusMessage(err?.message || t("settings.loginFailed"));
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    setIsLoggingIn(true);
    try {
      await appAdapter.logoutCopyManga();
      updateDownloader({
        copyMangaUsername: "",
        copyMangaToken: "",
        copyMangaPasswordEncrypted: "",
      });
    } catch (err) {
      console.error("Logout failed:", err);
    } finally {
      setIsLoggingIn(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* CopyManga Provider Section */}
      <SettingGroup
        title={t("settings.copyMangaSection")}
        description={t("settings.copyMangaDesc")}
      >
        <SettingRow
          title={t("settings.enableCopyManga")}
          description={t("settings.enableCopyMangaHint")}
          control={
            <Switch
              checked={Boolean(form.downloader?.enableCopyManga)}
              onChange={(checked) => updateDownloader({ enableCopyManga: checked })}
            />
          }
        />
        {form.downloader?.enableCopyManga && (
          <>
            <SettingRow
              title={t("settings.copyMangaApiDomain")}
              description={t("settings.copyMangaApiDomainHint")}
              control={
                <Input
                  value={form.downloader?.copyMangaApiDomain ?? "api.copy202601.com"}
                  onChange={(e) => updateDownloader({ copyMangaApiDomain: e.target.value })}
                  className="w-56 text-xs h-7"
                  placeholder="api.copy202601.com"
                />
              }
            />
            {form.downloader?.copyMangaUsername ? (
              <SettingRow
                title={t("settings.copyMangaAccount")}
                description={t("settings.copyMangaAccountHint")}
                control={
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5 px-2 py-1 rounded border border-border/60 bg-muted/30 text-xs">
                      <UserCheck className="h-3.5 w-3.5 text-primary" />
                      <span className="font-medium text-foreground">{form.downloader.copyMangaUsername}</span>
                      <span className="text-[10px] text-muted-foreground">({t("settings.copyMangaAuthorized")})</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-muted-foreground hover:text-destructive"
                      onClick={handleLogout}
                      disabled={isLoggingIn}
                    >
                      <LogOut className="h-3.5 w-3.5 mr-1" />
                      {t("settings.logout")}
                    </Button>
                  </div>
                }
              />
            ) : (
              <SettingRow
                title={t("settings.copyMangaAccount")}
                description={t("settings.copyMangaLoginHint")}
                control={
                  <div className="flex flex-col gap-1.5 w-72">
                    <div className="flex items-center gap-2">
                      <Input
                        value={usernameInput}
                        onChange={(e) => setUsernameInput(e.target.value)}
                        placeholder={t("settings.usernamePlaceholder")}
                        className="text-xs h-7 flex-1"
                        disabled={isLoggingIn}
                      />
                      <div className="relative flex-1">
                        <Input
                          type={showPassword ? "text" : "password"}
                          value={passwordInput}
                          onChange={(e) => setPasswordInput(e.target.value)}
                          placeholder={t("settings.passwordPlaceholder")}
                          className="text-xs h-7 pr-7"
                          disabled={isLoggingIn}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[11px] text-muted-foreground truncate max-w-[190px]">
                        {loginStatusMessage}
                      </div>
                      <Button
                        size="sm"
                        className="h-7 text-xs px-3 shrink-0"
                        onClick={handleLogin}
                        disabled={isLoggingIn || !usernameInput.trim() || !passwordInput.trim()}
                      >
                        {isLoggingIn ? t("settings.loggingIn") : t("settings.login")}
                      </Button>
                    </div>
                  </div>
                }
              />
            )}
            <SettingRow
              title={t("settings.copyMangaCDNMode")}
              description={t("settings.copyMangaCDNModeHint")}
              control={
                <SegmentedControl
                  size="sm"
                  value={form.downloader?.copyMangaCdnMode || "official"}
                  onChange={(val) =>
                    updateDownloader({
                      copyMangaCdnMode: val as "official" | "striped",
                    })
                  }
                  options={[
                    { value: "official", label: t("settings.copyMangaCDNOfficial") },
                    { value: "striped", label: t("settings.copyMangaCDNStriped") },
                  ]}
                />
              }
            />
            {form.downloader?.copyMangaCdnMode === "striped" && (
              <SettingRow
                title={t("settings.copyMangaCustomCDNs")}
                description={t("settings.copyMangaCustomCDNsHint")}
                control={
                  <Input
                    value={customCDNsInput}
                    onChange={(e) => {
                      const val = e.target.value;
                      setCustomCDNsInput(val);
                      const parsed = val.split(",").map((s) => s.trim()).filter(Boolean);
                      updateDownloader({
                        copyMangaCustomCdns: parsed,
                      });
                    }}
                    className="w-56 text-xs h-7"
                    placeholder="e.g. cdn.example.com, cdn2.example.com"
                  />
                }
              />
            )}
          </>
        )}
      </SettingGroup>

      {/* RawManga (KLZ9) Provider Section */}
      <SettingGroup
        title={t("settings.rawMangaSection")}
        description={t("settings.rawMangaDesc")}
      >
        <SettingRow
          title={t("settings.enableRawManga")}
          description={t("settings.enableRawMangaHint")}
          control={
            <Switch
              checked={Boolean(form.downloader?.enableRawManga)}
              onChange={(checked) => updateDownloader({ enableRawManga: checked })}
            />
          }
        />
        {form.downloader?.enableRawManga && (
          <SettingRow
            title={t("settings.rawMangaBaseUrl")}
            description={t("settings.rawMangaBaseUrlHint")}
            control={
              <Input
                value={form.downloader?.rawMangaBaseUrl ?? "https://klz9.com"}
                onChange={(e) => updateDownloader({ rawMangaBaseUrl: e.target.value })}
                className="w-56 text-xs h-7"
                placeholder="https://klz9.com"
              />
            }
          />
        )}
      </SettingGroup>

      {/* Automatic Updates & Follow Section */}
      <SettingGroup
        title={t("settings.updatesAndFollowSection")}
        description={t("settings.updatesAndFollowDesc")}
      >
        <SettingRow
          title={t("settings.autoCheckComicUpdates")}
          description={t("settings.autoCheckComicUpdatesHint")}
          control={
            <Switch
              checked={Boolean(form.downloader?.autoCheckComicUpdates)}
              onChange={(checked) => updateDownloader({ autoCheckComicUpdates: checked })}
            />
          }
        />
        <SettingRow
          title={t("settings.autoFollowPolicy")}
          description={t("settings.autoFollowPolicyHint")}
          control={
            <SegmentedControl
              size="sm"
              value={form.downloader?.autoFollowPolicy ?? "latest_only"}
              onChange={(val) => updateDownloader({ autoFollowPolicy: val as "latest_only" | "fill_gaps" })}
              options={[
                { value: "latest_only", label: t("settings.policyLatestOnly") },
                { value: "fill_gaps", label: t("settings.policyFillGaps") },
              ]}
            />
          }
        />
      </SettingGroup>

      {/* Local Manga Linking Section */}
      <SettingGroup
        title={t("settings.localMangaLinkingSection")}
        description={t("settings.localMangaLinkingDesc")}
      >
        <SettingRow
          title={t("settings.batchLinkTitle")}
          description={t("settings.batchLinkDesc")}
          control={
            <Button
              type="button"
              size="xs"
              variant="outline"
              onClick={() => onOpenBatchLink?.()}
              className="h-7 px-2.5 text-xs font-medium cursor-pointer"
            >
              <Link2 className="h-3.5 w-3.5 mr-1 text-primary" />
              <span>{t("settings.openBatchLink")}</span>
            </Button>
          }
        />
      </SettingGroup>

      {/* Storage & Concurrency Section */}
      <SettingGroup
        title={t("settings.storageAndConcurrencySection")}
      >
        {(form.librarySources?.length ?? 0) > 0 ? (
          <div className="p-3.5 sm:p-4 border-b border-border/40 space-y-3">
            <div>
              <h5 className="text-xs font-semibold text-foreground">{t("settings.targetLibrarySource")}</h5>
              <p className="text-[11px] text-muted-foreground mt-0.5">{t("settings.targetLibrarySourceHint")}</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {form.librarySources?.map((src) => {
                const isSelected = selectedTargetSourceId === src.id;
                return (
                  <button
                    key={src.id}
                    type="button"
                    onClick={() => updateDownloader({ targetSourceId: src.id })}
                    className={cn(
                      "flex flex-col text-left p-2.5 rounded-lg border transition-all text-xs relative cursor-pointer",
                      isSelected
                        ? "border-primary/70 bg-primary/5 shadow-xs ring-1 ring-primary/25"
                        : "border-border/60 bg-card hover:bg-muted/40 hover:border-border"
                    )}
                  >
                    <div className="flex items-center justify-between w-full mb-1">
                      <div className="flex items-center gap-2 min-w-0">
                        {src.type === "smb" || src.type === "webdav" ? (
                          <Network className={cn("h-3.5 w-3.5 shrink-0", isSelected ? "text-primary" : "text-muted-foreground")} />
                        ) : (
                          <HardDrive className={cn("h-3.5 w-3.5 shrink-0", isSelected ? "text-primary" : "text-muted-foreground")} />
                        )}
                        <span className={cn("font-medium truncate", isSelected ? "text-foreground font-semibold" : "text-foreground/90")}>
                          {src.name}
                        </span>
                      </div>
                      {isSelected && (
                        <span className="flex items-center justify-center h-4 w-4 rounded-full bg-primary text-primary-foreground shrink-0 ml-1">
                          <Check className="h-2.5 w-2.5" />
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] font-mono text-muted-foreground/80 truncate w-full" title={src.path}>
                      {src.path}
                    </p>
                  </button>
                );
              })}
            </div>

            <div className="pt-1">
              <div className="flex items-center justify-between gap-4 py-1">
                <div>
                  <div className="text-xs font-medium text-foreground">{t("settings.downloadSubPath")}</div>
                  <div className="text-[11px] text-muted-foreground">{t("settings.downloadSubPathHint")}</div>
                </div>
                <Input
                  value={form.downloader?.downloadSubPath ?? ""}
                  onChange={(e) => updateDownloader({ downloadSubPath: e.target.value })}
                  className="w-48 text-xs h-7 font-mono shrink-0"
                  placeholder="Downloads"
                />
              </div>
            </div>

            {effectiveDownloadPath && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-muted/40 border border-border/40 text-[11px]">
                <span className="text-muted-foreground shrink-0">{t("settings.effectiveDownloadPath")}:</span>
                <span className="font-mono text-foreground font-medium truncate select-all" title={effectiveDownloadPath}>
                  {effectiveDownloadPath}
                </span>
              </div>
            )}
          </div>
        ) : (
          <SettingRow
            title={t("settings.downloadDir")}
            description={t("settings.downloadDirHint")}
            control={
              <div className="flex items-center gap-2 max-w-sm">
                <span
                  className="truncate font-mono text-[11px] text-muted-foreground bg-muted/50 px-2 py-1 rounded border border-border/50 max-w-[200px]"
                  title={form.downloader?.downloadDir || (form.libraryRoot ? `${form.libraryRoot}/Downloads` : "")}
                >
                  {form.downloader?.downloadDir || (form.libraryRoot ? `${form.libraryRoot}/Downloads` : "")}
                </span>
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  onClick={() => void handleSelectDownloadDir()}
                  className="h-7 px-2.5 text-xs shrink-0 cursor-pointer"
                >
                  <FolderOpen className="h-3.5 w-3.5 mr-1" />
                  <span>{t("settings.browse")}</span>
                </Button>
              </div>
            }
          />
        )}
        <SettingRow
          title={t("settings.downloadFormat")}
          description={t("settings.downloadFormatHint")}
          control={
            <SegmentedControl
              size="sm"
              value={form.downloader?.downloadFormat ?? "cbz"}
              onChange={(val) => updateDownloader({ downloadFormat: val as "cbz" | "folder" })}
              options={[
                { value: "cbz", label: t("settings.formatCbz") },
                { value: "folder", label: t("settings.formatFolder") },
              ]}
            />
          }
        />
        <SettingRow
          title={t("settings.maxConcurrentDownloads")}
          description={t("settings.maxConcurrentDownloadsHint")}
          control={
            <Input
              type="number"
              min={1}
              max={10}
              value={form.downloader?.maxConcurrentDownloads ?? 3}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                if (!isNaN(val) && val >= 1 && val <= 10) {
                  updateDownloader({ maxConcurrentDownloads: val });
                }
              }}
              className="w-20 text-xs h-7 font-mono text-center"
            />
          }
        />
        <SettingRow
          title={t("settings.maxImageConcurrency")}
          description={t("settings.maxImageConcurrencyHint")}
          control={
            <Input
              type="number"
              min={1}
              max={30}
              value={form.downloader?.maxImageConcurrency ?? 10}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                if (!isNaN(val) && val >= 1 && val <= 30) {
                  updateDownloader({ maxImageConcurrency: val });
                }
              }}
              className="w-20 text-xs h-7 font-mono text-center"
            />
          }
        />
        <SettingRow
          title={t("settings.chapterIntervalSec")}
          description={t("settings.chapterIntervalSecHint")}
          control={
            <Input
              type="number"
              min={0}
              max={60}
              value={form.downloader?.chapterIntervalSec ?? 0}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                if (!isNaN(val) && val >= 0 && val <= 60) {
                  updateDownloader({ chapterIntervalSec: val });
                }
              }}
              className="w-20 text-xs h-7 font-mono text-center"
            />
          }
        />
      </SettingGroup>
    </div>
  );
}
