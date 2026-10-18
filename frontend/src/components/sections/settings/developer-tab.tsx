import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Check,
  Cpu,
  Key,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SettingGroup, SettingRow } from "@/components/ui/setting-row";
import { appAdapter } from "@/lib/api";
import type { CopyMangaAccount, DevInfo } from "@/lib/contracts";

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
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs px-2"
                onClick={loadData}
                disabled={isLoading}
              >
                <RefreshCw className={`h-3.5 w-3.5 mr-1 ${isLoading ? "animate-spin" : ""}`} />
                {t("settings.refresh")}
              </Button>
              <Button
                variant="primary"
                size="sm"
                className="h-7 text-xs px-2"
                onClick={() => setShowAddForm(!showAddForm)}
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                {t("settings.devAddAccount")}
              </Button>
            </div>
          </div>

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
              {actionError && <div className="text-[11px] text-destructive">{actionError}</div>}
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
              <div className="col-span-4">{t("settings.devColUsername")}</div>
              <div className="col-span-4">{t("settings.devColToken")}</div>
              <div className="col-span-3">{t("settings.devColStatus")}</div>
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
                    className="grid grid-cols-12 px-3 py-2 text-xs items-center border-b border-border/30 last:border-b-0 hover:bg-muted/30 transition-colors"
                  >
                    <div className="col-span-4 font-mono font-medium truncate">{acc.username}</div>
                    <div className="col-span-4 font-mono text-muted-foreground truncate">
                      {acc.token ? `${acc.token.slice(0, 6)}...${acc.token.slice(-4)}` : "None"}
                    </div>
                    <div className="col-span-3">
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
                        className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
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
