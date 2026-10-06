import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowUpCircle, Check, Copy, ExternalLink, Terminal, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  const [progress, setProgress] = useState(100);
  const [isHovered, setIsHovered] = useState(false);
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(Date.now());
  const remainingTimeRef = useRef<number>(durationMs);

  const handleCopy = async () => {
    try {
      await copyToClipboard("brew upgrade panelneko");
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore clipboard error
    }
  };

  useEffect(() => {
    if (isHovered) {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    startTimeRef.current = Date.now();
    const currentRemaining = remainingTimeRef.current;

    timerRef.current = window.setTimeout(() => {
      onClose();
    }, currentRemaining);

    const interval = window.setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      const nextRemaining = Math.max(0, currentRemaining - elapsed);
      remainingTimeRef.current = nextRemaining;
      setProgress((nextRemaining / durationMs) * 100);
      if (nextRemaining <= 0) {
        window.clearInterval(interval);
      }
    }, 50);

    return () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
      }
      window.clearInterval(interval);
    };
  }, [isHovered, durationMs, onClose]);

  return (
    <div
      role="alert"
      aria-live="polite"
      className="pointer-events-auto flex w-92 max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-xl border border-border/80 bg-card/95 backdrop-blur-2xl shadow-2xl transition-all duration-200 select-none animate-in fade-in-50 slide-in-from-bottom-4"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
              <ArrowUpCircle className="h-3.5 w-3.5" />
            </div>
            <span className="text-xs font-bold text-foreground truncate">
              {t("updates.newVersionTitle")}
            </span>
            <Badge tone="running" className="shrink-0 font-mono text-[10px]">
              v{update.latestVersion}
            </Badge>
          </div>

          <Button
            type="button"
            size="xs"
            variant="ghost"
            onClick={onClose}
            className="h-6 w-6 p-0 rounded-md text-muted-foreground hover:text-foreground shrink-0"
            title={t("updates.dismiss")}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Content */}
        <p className="text-xs text-muted-foreground leading-relaxed">
          {t("updates.newVersionDesc", {
            latest: `v${update.latestVersion}`,
            current: `v${update.currentVersion}`,
          })}
        </p>

        {/* Homebrew notice */}
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

        {/* Action buttons */}
        <div className="flex items-center justify-end gap-2 pt-1">
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
        </div>
      </div>

      {/* Auto-dismiss progress bar */}
      <div className="h-0.5 w-full bg-border/40 overflow-hidden">
        <div
          className="h-full bg-primary/60 transition-all duration-75 ease-linear"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
