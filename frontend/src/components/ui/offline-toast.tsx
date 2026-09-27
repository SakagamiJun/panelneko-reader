import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { HardDrive, RefreshCw, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface OfflineToastProps {
  offlineSourcesCount: number;
  showOffline: boolean;
  isRescanning?: boolean;
  onRescan: () => void;
  onToggleShowOffline: () => void;
  onClose: () => void;
  durationMs?: number;
}

export function OfflineToast({
  offlineSourcesCount,
  showOffline,
  isRescanning = false,
  onRescan,
  onToggleShowOffline,
  onClose,
  durationMs = 6000,
}: OfflineToastProps) {
  const { t } = useTranslation();
  const [progress, setProgress] = useState(100);
  const [isHovered, setIsHovered] = useState(false);
  const timerRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(Date.now());
  const remainingTimeRef = useRef<number>(durationMs);

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
      className="pointer-events-auto flex w-88 max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-xl border border-border/80 bg-card/95 backdrop-blur-2xl shadow-2xl transition-all duration-200 select-none animate-in fade-in-50 slide-in-from-bottom-4"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500 shrink-0">
              <HardDrive className="h-3.5 w-3.5" />
            </div>
            <span className="text-xs font-bold text-foreground truncate">
              {t("library.offlineToastTitle")}
            </span>
            <Badge tone="default" className="shrink-0 font-mono text-[10px] text-amber-600 dark:text-amber-400 border-amber-500/30 bg-amber-500/10">
              {offlineSourcesCount}
            </Badge>
          </div>

          <Button
            type="button"
            size="xs"
            variant="ghost"
            onClick={onClose}
            className="h-6 w-6 p-0 rounded-md text-muted-foreground hover:text-foreground shrink-0 cursor-pointer"
            title={t("updates.dismiss")}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Content */}
        <p className="text-xs text-muted-foreground leading-relaxed">
          {offlineSourcesCount === 1
            ? t("library.offlineBannerSingle")
            : t("library.offlineBannerMultiple", { count: offlineSourcesCount })}
        </p>

        {/* Action buttons */}
        <div className="flex items-center justify-end gap-2 pt-1">
          <Button
            type="button"
            size="xs"
            variant="ghost"
            disabled={isRescanning}
            onClick={onRescan}
            className="h-6 px-2 text-xs font-medium text-foreground hover:bg-muted/70 gap-1.5 cursor-pointer"
            title={t("library.rescan")}
          >
            <RefreshCw className={cn("h-3 w-3", isRescanning && "animate-spin")} />
            <span>{isRescanning ? t("library.rescanning") : t("library.rescan")}</span>
          </Button>
          <Button
            type="button"
            size="xs"
            variant="outline"
            onClick={onToggleShowOffline}
            className="h-6 px-2 text-xs font-semibold border-border/70 hover:bg-muted/60 cursor-pointer text-foreground"
          >
            {showOffline ? t("library.hideOffline") : t("library.showOffline")}
          </Button>
        </div>
      </div>

      {/* Auto-dismiss progress bar */}
      <div className="h-0.5 w-full bg-border/40 overflow-hidden">
        <div
          className="h-full bg-amber-500/80 transition-all duration-75 ease-linear"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
