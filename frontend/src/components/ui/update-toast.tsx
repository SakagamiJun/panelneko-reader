import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowUpCircle, Check, Copy, ExternalLink, Terminal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FloatingCard } from "@/components/ui/floating-card";
import type { UpdateCheckResult } from "@/lib/contracts";
import { copyToClipboard } from "@/lib/runtime";

export interface UpdateToastProps {
  update: UpdateCheckResult;
  onClose: () => void;
  onViewUpdate: (url: string) => void;
  durationMs?: number;
}

export function UpdateToast({
  update,
  onClose,
  onViewUpdate,
  durationMs = 8000,
}: UpdateToastProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await copyToClipboard("brew upgrade panelneko");
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore clipboard error
    }
  };

  return (
    <FloatingCard
      icon={
        <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
          <ArrowUpCircle className="h-3.5 w-3.5" />
        </div>
      }
      title={t("updates.newVersionTitle")}
      badge={
        <Badge tone="running" className="shrink-0 font-mono text-[10px]">
          v{update.latestVersion}
        </Badge>
      }
      onClose={onClose}
      closeAriaLabel={t("updates.dismiss")}
      durationMs={durationMs}
      className="w-92 max-w-[calc(100vw-2.5rem)]"
      footer={
        <>
          <Button
            type="button"
            size="xs"
            variant="ghost"
            onClick={onClose}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            {t("updates.dismiss")}
          </Button>
          <Button
            type="button"
            size="xs"
            variant="primary"
            onClick={() => onViewUpdate(update.releaseURL)}
            className="gap-1.5 text-xs font-semibold"
          >
            <ExternalLink className="h-3 w-3" />
            <span>{t("updates.viewDetails")}</span>
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground leading-relaxed">
          {t("updates.newVersionDesc", {
            latest: `v${update.latestVersion}`,
            current: `v${update.currentVersion}`,
          })}
        </p>

        {update.isHomebrew && (
          <div className="space-y-1.5 rounded-lg border border-border/60 bg-muted/40 p-2.5">
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-foreground">
              <Terminal className="h-3 w-3 text-muted-foreground" />
              <span>{t("updates.homebrewDesc")}</span>
            </div>
            <div className="flex items-center justify-between gap-2 rounded bg-background/80 px-2 py-1 border border-border/50">
              <code className="font-mono text-[11px] text-foreground select-all">
                brew upgrade panelneko
              </code>
              <Button
                type="button"
                size="xs"
                variant="ghost"
                onClick={handleCopy}
                className="h-5 px-1.5 text-[10px] text-muted-foreground hover:text-foreground gap-1"
                title={t("updates.copyCommand")}
              >
                {copied ? (
                  <>
                    <Check className="h-3 w-3 text-success" />
                    <span className="text-success">{t("updates.copied")}</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3" />
                    <span>{t("updates.copyCommand")}</span>
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </div>
    </FloatingCard>
  );
}
