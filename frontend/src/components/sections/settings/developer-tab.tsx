import { useEffect, useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Check, ClipboardPaste, Copy, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SettingGroup, SettingRow } from "@/components/ui/setting-row";
import { appAdapter } from "@/lib/api";
import { parseAccountsClipboardText } from "@/lib/account-parser";
import type { CopyMangaAccount, DevInfo } from "@/lib/contracts";
import { cn } from "@/lib/utils";

export function DeveloperTab() {
  const { t } = useTranslation();
  const [devInfo, setDevInfo] = useState<DevInfo | null>(null);
  const [accounts, setAccounts] = useState<CopyMangaAccount[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newToken, setNewToken] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState("");
  const [actionNotice, setActionNotice] = useState("");
  const [hasCopied, setHasCopied] = useState(false);

  const copyTimeoutRef = useRef<number | null>(null);
  const noticeTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) window.clearTimeout(copyTimeoutRef.current);
      if (noticeTimeoutRef.current) window.clearTimeout(noticeTimeoutRef.current);
    };
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [info, accs] = await Promise.all([
        appAdapter.getDevInfo(),
        appAdapter.getCopyMangaAccounts(),
      ]);
      setDevInfo(info);
      setAccounts(accs);
    } catch (err) {
      console.error("Failed to load dev info:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleAddAccount = async () => {
    if (!newUsername.trim()) return;
    setIsSubmitting(true);
    setActionError("");
    try {
      await appAdapter.addCopyMangaAccount(newUsername, newPassword, newToken);
      setNewUsername("");
      setNewPassword("");
      setNewToken("");
      setShowAddForm(false);
      await loadData();
    } catch (err: any) {
      setActionError(err?.message || "Failed to add account");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteAccount = async (username: string) => {
    setIsSubmitting(true);
    try {
      await appAdapter.deleteCopyMangaAccount(username);
      await loadData();
    } catch (err) {
      console.error("Delete failed:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyAccounts = async () => {
    setActionError("");
    setActionNotice("");
    try {
      const exportData = accounts.map((a) => ({
        username: a.username,
        password: a.password || "",
        token: a.token || "",
      }));
      await navigator.clipboard.writeText(JSON.stringify(exportData, null, 2));
      setHasCopied(true);
      setActionNotice(t("settings.devCopiedToClipboard", { count: accounts.length }));
      if (copyTimeoutRef.current) window.clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = window.setTimeout(() => setHasCopied(false), 2000);
      if (noticeTimeoutRef.current) window.clearTimeout(noticeTimeoutRef.current);
      noticeTimeoutRef.current = window.setTimeout(() => setActionNotice(""), 4000);
    } catch (err: any) {
      setActionError(err?.message || "Failed to copy to clipboard");
    }
  };

  const handleImportAccounts = async () => {
    setIsSubmitting(true);
    setActionError("");
    setActionNotice("");
    try {
      const text = await navigator.clipboard.readText();
      if (!text || !text.trim()) {
        setActionError(t("settings.devClipboardEmpty"));
        return;
      }
      const parsed = parseAccountsClipboardText(text);
      if (parsed.length === 0) {
        setActionError(t("settings.devClipboardNoValidAccounts"));
        return;
      }
      const res = await appAdapter.importCopyMangaAccounts(parsed);
      await loadData();
      setActionNotice(
        t("settings.devImportSummary", {
          imported: res.imported,
          updated: res.updated,
          skipped: res.skipped,
        })
      );
      if (noticeTimeoutRef.current) window.clearTimeout(noticeTimeoutRef.current);
      noticeTimeoutRef.current = window.setTimeout(() => setActionNotice(""), 5000);
    } catch (err: any) {
      setActionError(err?.message || "Failed to import from clipboard");
    } finally {
      setIsSubmitting(false);
    }
  };

  const isAccountInCooldown = (acc: CopyMangaAccount) => {
    if (!acc.limitedAt) return false;
    const elapsed = Math.floor(Date.now() / 1000) - acc.limitedAt;
    return elapsed < 60;
  };

  return (
    <div className="space-y-6">
      {/* Encryption & Security Status */}
      <SettingGroup title={t("settings.devSecurityTitle")}>
        <SettingRow
          title={t("settings.devKeySource")}
          description={t("settings.devKeySourceHint")}
          control={
            <div className="flex items-center gap-2">
              <span className="text-xs px-2 py-0.5 rounded border border-border/70 bg-muted/40 font-mono">
                {devInfo?.keySource === "machine_id" ? t("settings.devKeySourceMachine") : t("settings.devKeySourceFallback")}
              </span>
            </div>
          }
        />
        <SettingRow
          title={t("settings.devKeyFingerprint")}
          description={t("settings.devKeyFingerprintHint")}
          control={
            <span className="text-xs px-2 py-0.5 rounded border border-border/70 bg-muted/40 font-mono text-muted-foreground select-all">
              {devInfo?.keyFingerprint || "N/A"}
            </span>
          }
        />
        {devInfo?.machineId && (
          <SettingRow
            title={t("settings.devMachineId")}
            description={t("settings.devMachineIdHint")}
            control={
              <span className="text-xs px-2 py-0.5 rounded border border-border/70 bg-muted/40 font-mono text-muted-foreground select-all max-w-[220px] truncate">
                {devInfo.machineId}
              </span>
            }
          />
        )}
      </SettingGroup>

      {/* CopyManga Account Pool Management */}
      <SettingGroup title={t("settings.devAccountPoolTitle")}>
        <div className="p-3 bg-muted/20 border border-border/50 rounded-lg space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-xs text-muted-foreground">
              {t("settings.devAccountPoolDesc", { count: accounts.length })}
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="xs"
                className="h-7 w-7 p-0 flex items-center justify-center cursor-pointer"
                onClick={handleCopyAccounts}
                disabled={isLoading || isSubmitting}
                title={t("settings.devCopyToClipboard")}
              >
                {hasCopied ? (
                  <Check className="h-3.5 w-3.5 text-success" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </Button>
              <Button
                variant="outline"
                size="xs"
                className="h-7 w-7 p-0 flex items-center justify-center cursor-pointer"
                onClick={handleImportAccounts}
                disabled={isLoading || isSubmitting}
                title={t("settings.devImportFromClipboard")}
              >
                <ClipboardPaste className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="outline"
                size="xs"
                className="h-7 w-7 p-0 flex items-center justify-center cursor-pointer"
                onClick={loadData}
                disabled={isLoading}
                title={t("settings.refresh")}
              >
                <RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
              </Button>
              <Button
                variant="primary"
                size="xs"
                className="h-7 w-7 p-0 flex items-center justify-center cursor-pointer"
                onClick={() => setShowAddForm(!showAddForm)}
                title={t("settings.devAddAccount")}
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {actionNotice && (
            <div className="text-[11px] px-2.5 py-1 rounded bg-success/10 text-success border border-success/30 font-medium">
              {actionNotice}
            </div>
          )}
          {actionError && (
            <div className="text-[11px] px-2.5 py-1 rounded bg-danger/10 text-danger border border-danger/30 font-medium">
              {actionError}
            </div>
          )}

          {showAddForm && (
            <div className="p-3 bg-card border border-border/80 rounded-md space-y-2">
              <div className="text-xs font-medium text-foreground">{t("settings.devAddAccountTitle")}</div>
              <div className="grid grid-cols-3 gap-2">
                <Input
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  placeholder={t("settings.usernamePlaceholder")}
                  className="text-xs h-7"
                />
                <Input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder={t("settings.passwordPlaceholder")}
                  className="text-xs h-7"
                />
                <Input
                  value={newToken}
                  onChange={(e) => setNewToken(e.target.value)}
                  placeholder={t("settings.devTokenOptionalPlaceholder")}
                  className="text-xs h-7"
                />
              </div>
              {actionError && <div className="text-[11px] text-danger">{actionError}</div>}
              <div className="flex justify-end gap-2 pt-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs px-2"
                  onClick={() => setShowAddForm(false)}
                >
                  {t("settings.cancel")}
                </Button>
                <Button
                  size="sm"
                  className="h-6 text-xs px-2"
                  onClick={handleAddAccount}
                  disabled={isSubmitting || !newUsername.trim()}
                >
                  {t("settings.save")}
                </Button>
              </div>
            </div>
          )}

          {/* Account Table */}
          <div className="border border-border/60 rounded-md overflow-hidden bg-card/50">
            <div className="grid grid-cols-12 px-3 py-1.5 text-[11px] font-medium text-muted-foreground border-b border-border/60 bg-muted/40">
              <div className="col-span-3">{t("settings.devColUsername")}</div>
              <div className="col-span-3">{t("settings.devColPassword")}</div>
              <div className="col-span-3">{t("settings.devColToken")}</div>
              <div className="col-span-2">{t("settings.devColStatus")}</div>
              <div className="col-span-1 text-right">{t("settings.devColAction")}</div>
            </div>
            {accounts.length === 0 ? (
              <div className="p-4 text-center text-xs text-muted-foreground">
                {t("settings.devNoAccounts")}
              </div>
            ) : (
              accounts.map((acc) => {
                const inCooldown = isAccountInCooldown(acc);
                return (
                  <div
                    key={acc.username}
                    className="grid grid-cols-12 px-3 py-2 text-xs items-center border-b border-border/30 last:border-b-0 hover:bg-muted/30 transition-colors gap-1.5"
                  >
                    <div className="col-span-3 font-mono font-medium truncate select-all" title={acc.username}>
                      {acc.username}
                    </div>
                    <div className="col-span-3 font-mono text-foreground/90 truncate select-all" title={acc.password}>
                      {acc.password || "—"}
                    </div>
                    <div className="col-span-3 font-mono text-muted-foreground truncate select-all" title={acc.token}>
                      {acc.token ? `${acc.token.slice(0, 8)}...${acc.token.slice(-6)}` : "None"}
                    </div>
                    <div className="col-span-2">
                      {inCooldown ? (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/10 text-amber-500 border border-amber-500/30">
                          {t("settings.devStatusCooldown")}
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-500 border border-emerald-500/30">
                          {t("settings.devStatusReady")}
                        </span>
                      )}
                    </div>
                    <div className="col-span-1 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 text-muted-foreground hover:text-danger cursor-pointer inline-flex items-center justify-center"
                        onClick={() => handleDeleteAccount(acc.username)}
                        disabled={isSubmitting}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </SettingGroup>
    </div>
  );
}
