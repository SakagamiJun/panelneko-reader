import { useTranslation } from "react-i18next";
import { HardDrive, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FloatingCard } from "@/components/ui/floating-card";
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

  return (
    <FloatingCard
      icon={
        <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500 shrink-0">
          <HardDrive className="h-3.5 w-3.5" />
        </div>
      }
      title={t("library.offlineToastTitle")}
      badge={
        <Badge
          tone="default"
          className="shrink-0 font-mono text-[10px] text-amber-600 dark:text-amber-400 border-amber-500/30 bg-amber-500/10"
        >
          {offlineSourcesCount}
        </Badge>
      }
      onClose={onClose}
      closeAriaLabel={t("updates.dismiss")}
      durationMs={durationMs}
      className="w-88 max-w-[calc(100vw-2.5rem)]"
      footer={
        <>
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
        </>
      }
    >
      <p className="text-xs text-muted-foreground leading-relaxed">
        {offlineSourcesCount === 1
          ? t("library.offlineBannerSingle")
          : t("library.offlineBannerMultiple", { count: offlineSourcesCount })}
      </p>
    </FloatingCard>
  );
}
