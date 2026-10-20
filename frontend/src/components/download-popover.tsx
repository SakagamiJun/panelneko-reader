import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertCircle,
  Check,
  Download,
  Inbox,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Settings2,
  Trash2,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { DownloadProgress, DownloadTask, FollowedUpdateCheckProgress } from "@/lib/contracts";
import { cn } from "@/lib/utils";

export interface DownloadPopoverProps {
  tasks: DownloadTask[];
  progress: DownloadProgress;
  checkProgress?: FollowedUpdateCheckProgress | null;
  onPauseTask?: (id: string) => void;
  onResumeTask?: (id: string) => void;
  onCancelTask?: (id: string) => void;
  onClearCompleted?: () => void;
  onCheckAllUpdates?: () => Promise<number | void>;
  onOpenSettings?: () => void;
  onClose?: () => void;
  className?: string;
}

export function DownloadPopover({
  tasks,
  progress,
  checkProgress,
  onPauseTask,
  onResumeTask,
  onCancelTask,
  onClearCompleted,
  onCheckAllUpdates,
  onOpenSettings,
  onClose,
  className,
}: DownloadPopoverProps) {
  const { t } = useTranslation();
  const [isLocalChecking, setIsLocalChecking] = useState(false);
  const [updateFeedback, setUpdateFeedback] = useState<{
    type: "success" | "none" | "error";
    count?: number;
  } | null>(null);

  const isCheckingUpdates = Boolean(checkProgress?.checking || isLocalChecking);

  const activeCount =
    progress.activeTasks ??
    tasks.filter((it) => it.status === "downloading" || it.status === "pending").length;
  const hasFinished = tasks.some((it) => it.status === "completed" || it.status === "failed");

  const handleCheckUpdates = async () => {
    if (isCheckingUpdates || !onCheckAllUpdates) return;
    setIsLocalChecking(true);
    setUpdateFeedback(null);
    try {
      const res = await onCheckAllUpdates();
      const count = typeof res === "number" ? res : 0;
      if (count > 0) {
        setUpdateFeedback({ type: "success", count });
      } else {
        setUpdateFeedback({ type: "none" });
      }
    } catch {
      setUpdateFeedback({ type: "error" });
    } finally {
      setIsLocalChecking(false);
      window.setTimeout(() => {
        setUpdateFeedback(null);
      }, 4000);
    }
  };

  const checkingProgressText =
    checkProgress && checkProgress.total > 0
      ? t("downloader.checkingFollowedUpdatesProgress", {
          current: checkProgress.current,
          total: checkProgress.total,
        })
      : t("downloader.checkingFollowedUpdates");

  return (
    <div
      role="region"
      aria-label={t("downloader.managerTitle")}
      className={cn(
        "flex flex-col w-[460px] sm:w-[480px] max-w-[calc(100vw-2rem)] rounded-xl border border-border/80 bg-card/95 backdrop-blur-2xl shadow-2xl overflow-hidden select-none animate-in fade-in-0 zoom-in-95",
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-border/40 bg-muted/20 gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Download className="h-3.5 w-3.5 text-primary shrink-0" />
          <span className="text-xs font-bold text-foreground truncate">
            {t("downloader.managerTitle")}
          </span>
          <Badge
            tone={activeCount > 0 ? "running" : "neutral"}
            className="font-mono text-[10px] shrink-0 whitespace-nowrap"
          >
            {activeCount > 0
              ? t("downloader.activeBadge", { count: activeCount })
              : t("downloader.idleBadge")}
          </Badge>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {onCheckAllUpdates && (
            <Button
              type="button"
              size="xs"
              variant="ghost"
              disabled={isCheckingUpdates}
              onClick={() => void handleCheckUpdates()}
              className="h-6 px-2 text-[11px] text-muted-foreground hover:text-foreground gap-1.5 cursor-pointer shrink-0 whitespace-nowrap"
              title={isCheckingUpdates ? checkingProgressText : t("downloader.checkFollowedUpdates")}
            >
              <RefreshCw className={cn("h-3 w-3", isCheckingUpdates && "animate-spin")} />
              <span>
                {isCheckingUpdates ? checkingProgressText : t("downloader.checkFollowedUpdates")}
              </span>
            </Button>
          )}

          {hasFinished && onClearCompleted && (
            <Button
              type="button"
              size="xs"
              variant="ghost"
              onClick={onClearCompleted}
              className="h-6 px-1.5 text-[11px] text-muted-foreground hover:text-foreground gap-1 cursor-pointer shrink-0 whitespace-nowrap"
              title={t("downloader.clearCompleted")}
            >
              <Trash2 className="h-3 w-3" />
              <span>{t("downloader.clear")}</span>
            </Button>
          )}

          {onClose && (
            <Button
              type="button"
              size="xs"
              variant="ghost"
              onClick={onClose}
              className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground cursor-pointer shrink-0"
              title={t("downloader.collapse")}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Inline Feedback Banner */}
      {updateFeedback && (
        <div
          className={cn(
            "flex items-center gap-2 px-3 py-1.5 text-[11px] border-b animate-in fade-in-50",
            updateFeedback.type === "success" &&
              "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
            updateFeedback.type === "none" &&
              "bg-muted/40 text-muted-foreground border-border/40",
            updateFeedback.type === "error" &&
              "bg-destructive/10 text-destructive border-destructive/20"
          )}
        >
          {updateFeedback.type === "success" && <Check className="h-3.5 w-3.5 shrink-0" />}
          {updateFeedback.type === "none" && <Inbox className="h-3.5 w-3.5 shrink-0" />}
          {updateFeedback.type === "error" && <AlertCircle className="h-3.5 w-3.5 shrink-0" />}
          <span className="truncate">
            {updateFeedback.type === "success"
              ? t("downloader.foundFollowedUpdates", { count: updateFeedback.count })
              : updateFeedback.type === "none"
              ? t("downloader.noFollowedUpdates")
              : t("downloader.checkFollowedUpdatesFailed")}
          </span>
        </div>
      )}

      {/* Global Speed & Progress Summary (when downloading) */}
      {activeCount > 0 && (
        <div className="px-3.5 py-2 border-b border-border/30 bg-muted/10 space-y-1.5">
          <div className="flex items-center justify-between text-[11px] font-mono text-muted-foreground">
            <span>
              {progress.downloadedPages}/{progress.totalPages} {t("downloader.pages")}
            </span>
            {progress.speedFormatted && (
              <span className="text-primary font-semibold">{progress.speedFormatted}</span>
            )}
          </div>
          <div className="h-1 w-full bg-muted/60 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-200 ease-out"
              style={{
                width: `${
                  progress.totalPages > 0
                    ? Math.round((progress.downloadedPages / progress.totalPages) * 100)
                    : 0
                }%`,
              }}
            />
          </div>
        </div>
      )}

      {/* Tasks List */}
      {tasks.length > 0 ? (
        <div className="max-h-[440px] overflow-y-auto p-2.5 space-y-2 divide-y divide-border/20">
          {tasks.map((task) => {
            const pct =
              task.totalPages > 0
                ? Math.round((task.downloadedPages / task.totalPages) * 100)
                : 0;
            const isDownloading = task.status === "downloading";
            const isPaused = task.status === "paused";
            const isWaitingSource = task.status === "waiting_source";
            const isCompleted = task.status === "completed";
            const isFailed = task.status === "failed";

            return (
              <div key={task.id} className="pt-2 first:pt-0 space-y-1.5">
                {/* Title & Status */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-mono text-muted-foreground uppercase px-1 rounded bg-muted/60 border border-border/40 shrink-0">
                        {task.source}
                      </span>
                      <span
                        className="text-xs font-semibold text-foreground truncate"
                        title={task.mangaTitle}
                      >
                        {task.mangaTitle}
                      </span>
                    </div>
                    <p
                      className="text-[11px] text-muted-foreground truncate"
                      title={task.chapterTitle}
                    >
                      {task.chapterTitle}
                    </p>
                  </div>

                  <span
                    className={cn(
                      "text-[10px] font-mono px-1.5 py-0.5 rounded shrink-0",
                      isDownloading && "text-primary bg-primary/10 font-semibold",
                      isPaused && "text-amber-500 bg-amber-500/10",
                      isWaitingSource && "text-sky-500 bg-sky-500/10",
                      isCompleted && "text-emerald-500 bg-emerald-500/10",
                      isFailed && "text-destructive bg-destructive/10"
                    )}
                  >
                    {isDownloading
                      ? t("downloader.statusDownloading")
                      : isPaused
                      ? t("downloader.statusPaused")
                      : isWaitingSource
                      ? t("downloader.statusWaitingSource")
                      : isCompleted
                      ? t("downloader.statusCompleted")
                      : isFailed
                      ? t("downloader.statusFailed")
                      : t("downloader.statusPending")}
                  </span>
                </div>

                {/* Task Progress Bar */}
                <div className="h-1 w-full bg-muted/60 rounded-full overflow-hidden">
                  <div
                    className={cn(
                      "h-full transition-all duration-150 ease-out",
                      isDownloading
                        ? "bg-primary"
                        : isCompleted
                        ? "bg-emerald-500"
                        : isFailed
                        ? "bg-destructive"
                        : "bg-muted-foreground/40"
                    )}
                    style={{ width: `${pct}%` }}
                  />
                </div>

                {/* Stats & Actions */}
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <div className="flex items-center gap-1.5 font-mono">
                    <span>
                      {task.downloadedPages}/{task.totalPages} {t("downloader.pages")}
                    </span>
                    {task.speed && isDownloading && (
                      <>
                        <span>·</span>
                        <span className="text-foreground/80">{task.speed}</span>
                      </>
                    )}
                    {task.errorMessage && (
                      <span
                        className="text-destructive truncate max-w-[140px]"
                        title={task.errorMessage}
                      >
                        {task.errorMessage}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {isDownloading && onPauseTask && (
                      <Button
                        type="button"
                        size="xs"
                        variant="ghost"
                        onClick={() => onPauseTask(task.id)}
                        className="h-5 w-5 p-0 text-muted-foreground hover:text-foreground cursor-pointer"
                        title={t("downloader.pause")}
                      >
                        <Pause className="h-2.5 w-2.5" />
                      </Button>
                    )}

                    {isPaused && onResumeTask && (
                      <Button
                        type="button"
                        size="xs"
                        variant="ghost"
                        onClick={() => onResumeTask(task.id)}
                        className="h-5 w-5 p-0 text-muted-foreground hover:text-foreground cursor-pointer"
                        title={t("downloader.resume")}
                      >
                        <Play className="h-2.5 w-2.5" />
                      </Button>
                    )}

                    {(isFailed || isWaitingSource) && onResumeTask && (
                      <Button
                        type="button"
                        size="xs"
                        variant="ghost"
                        onClick={() => onResumeTask(task.id)}
                        className="h-5 w-5 p-0 text-muted-foreground hover:text-foreground cursor-pointer"
                        title={t("downloader.retry")}
                      >
                        <RotateCcw className="h-2.5 w-2.5" />
                      </Button>
                    )}

                    {onCancelTask && (
                      <Button
                        type="button"
                        size="xs"
                        variant="ghost"
                        onClick={() => onCancelTask(task.id)}
                        className="h-5 w-5 p-0 text-muted-foreground hover:text-destructive cursor-pointer"
                        title={t("downloader.cancel")}
                      >
                        <X className="h-2.5 w-2.5" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center p-6 text-center space-y-2 text-muted-foreground">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted/40 border border-border/40">
            <Inbox className="h-4 w-4 opacity-60" />
          </div>
          <div className="space-y-0.5">
            <p className="text-xs font-medium text-foreground">{t("downloader.noTasks")}</p>
            <p className="text-[11px] text-muted-foreground/80">{t("downloader.noTasksHint")}</p>
          </div>
        </div>
      )}

      {/* Footer */}
      {onOpenSettings && (
        <div className="flex items-center justify-between px-3 py-2 border-t border-border/40 bg-muted/10 text-[11px]">
          <span className="text-muted-foreground/70 font-mono text-[10px]">PanelNeko Sync</span>
          <Button
            type="button"
            size="xs"
            variant="ghost"
            onClick={onOpenSettings}
            className="h-5 px-1.5 text-[11px] text-muted-foreground hover:text-foreground gap-1 cursor-pointer"
          >
            <Settings2 className="h-3 w-3" />
            <span>{t("downloader.openDownloadSettings")}</span>
          </Button>
        </div>
      )}
    </div>
  );
}
