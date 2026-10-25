import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronDown,
  ChevronUp,
  Download,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { DownloadProgress, DownloadTask } from "@/lib/contracts";
import { cn } from "@/lib/utils";

export interface DownloadWidgetProps {
  tasks: DownloadTask[];
  progress: DownloadProgress;
  onPauseTask: (id: string) => void;
  onResumeTask: (id: string) => void;
  onCancelTask: (id: string) => void;
  onClearCompleted: () => void;
  className?: string;
}

export function DownloadWidget({
  tasks,
  progress,
  onPauseTask,
  onResumeTask,
  onCancelTask,
  onClearCompleted,
  className,
}: DownloadWidgetProps) {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);

  if (tasks.length === 0) {
    return null;
  }

  const activeCount = progress.activeTasks ?? tasks.filter((it) => it.status === "downloading" || it.status === "pending").length;
  const hasFinished = tasks.some((it) => it.status === "completed" || it.status === "failed");

  // Collapsed Mode
  if (!isExpanded) {
    return (
      <div
        role="region"
        aria-label={t("downloader.managerTitle")}
        onClick={() => setIsExpanded(true)}
        className={cn(
          "pointer-events-auto flex items-center gap-2.5 px-3.5 py-2 rounded-full border border-border/80 bg-card/95 backdrop-blur-2xl shadow-xl transition-all duration-200 cursor-pointer select-none hover:border-primary/40 hover:bg-muted/60 group animate-in fade-in-50 slide-in-from-bottom-2",
          className
        )}
      >
        <div className="relative flex items-center justify-center">
          <Download className="h-3.5 w-3.5 text-primary" />
          {activeCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 text-xs font-medium text-foreground">
          {activeCount > 0 ? (
            <>
              <span className="text-primary font-semibold">
                {t("downloader.activeCount", { count: activeCount })}
              </span>
              <span className="text-muted-foreground/50">·</span>
              <span className="font-mono text-[11px] text-muted-foreground">
                {progress.downloadedPages}/{progress.totalPages} {t("downloader.pages")}
              </span>
              {progress.speedFormatted && (
                <>
                  <span className="text-muted-foreground/50">·</span>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {progress.speedFormatted}
                  </span>
                </>
              )}
            </>
          ) : (
            <span className="text-muted-foreground">
              {hasFinished ? t("downloader.allFinished") : t("downloader.allPaused")}
            </span>
          )}
        </div>

        <ChevronUp className="h-3.5 w-3.5 text-muted-foreground/70 group-hover:text-foreground transition-transform ml-1" />
      </div>
    );
  }

  // Expanded Mode: Shows up to 5 items directly, scrollable overflow
  return (
    <div
      role="region"
      aria-label={t("downloader.managerTitle")}
      className={cn(
        "pointer-events-auto flex flex-col w-96 max-w-[calc(100vw-2.5rem)] rounded-xl border border-border/80 bg-card/95 backdrop-blur-2xl shadow-2xl overflow-hidden select-none animate-in fade-in-50 zoom-in-95",
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-border/40 bg-muted/20">
        <div className="flex items-center gap-2 min-w-0">
          <Download className="h-3.5 w-3.5 text-primary shrink-0" />
          <span className="text-xs font-bold text-foreground truncate">
            {t("downloader.managerTitle")}
          </span>
          <Badge tone="running" className="font-mono text-[10px] shrink-0">
            {activeCount > 0
              ? t("downloader.activeCount", { count: activeCount })
              : t("downloader.idleStatus")}
          </Badge>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {hasFinished && (
            <Button
              type="button"
              size="xs"
              variant="ghost"
              onClick={onClearCompleted}
              className="h-6 px-1.5 text-[11px] text-muted-foreground hover:text-foreground gap-1 cursor-pointer"
              title={t("downloader.clearCompleted")}
            >
              <Trash2 className="h-3 w-3" />
              <span>{t("downloader.clear")}</span>
            </Button>
          )}

          <Button
            type="button"
            size="xs"
            variant="ghost"
            onClick={() => setIsExpanded(false)}
            className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground cursor-pointer"
            title={t("downloader.collapse")}
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Task List (Max 5 items visible height, scrollable) */}
      <div className="max-h-[360px] overflow-y-auto p-2.5 space-y-2 divide-y divide-border/20">
        {tasks.map((task) => {
          const pct = task.totalPages > 0 ? Math.round((task.downloadedPages / task.totalPages) * 100) : 0;
          const isDownloading = task.status === "downloading";
          const isPaused = task.status === "paused";
          const isWaitingSource = task.status === "waiting_source";
          const isCompleted = task.status === "completed";
          const isFailed = task.status === "failed";

          return (
            <div key={task.id} className="pt-2 first:pt-0 space-y-1.5">
              {/* Task Title & State */}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-mono text-muted-foreground uppercase px-1 rounded bg-muted/60 border border-border/40 shrink-0">
                      {task.source}
                    </span>
                    <span className="text-xs font-semibold text-foreground truncate" title={task.mangaTitle}>
                      {task.mangaTitle}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate" title={task.chapterTitle}>
                    {task.chapterTitle}
                  </p>
                </div>

                {/* Status indicator */}
                <span
                  className={cn(
                    "text-[10px] font-mono px-1.5 py-0.5 rounded shrink-0",
                    isDownloading && "text-primary bg-primary/10 font-semibold",
                    isPaused && "text-amber-500 bg-amber-500/10",
                    isWaitingSource && "text-sky-500 bg-sky-500/10",
                    isCompleted && "text-emerald-500 bg-emerald-500/10",
                    isFailed && "text-danger bg-danger/10"
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

              {/* Progress Bar */}
              <div className="h-1 w-full bg-muted/60 rounded-full overflow-hidden">
                <div
                  className={cn(
                    "h-full transition-all duration-150 ease-out",
                    isDownloading ? "bg-primary" : isCompleted ? "bg-emerald-500" : isFailed ? "bg-danger" : "bg-muted-foreground/40"
                  )}
                  style={{ width: `${pct}%` }}
                />
              </div>

              {/* Stats & Actions */}
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <div className="flex items-center gap-2 font-mono">
                  <span>
                    {task.downloadedPages}/{task.totalPages} {t("downloader.pages")}
                  </span>
                  {task.speed && isDownloading && (
                    <>
                      <span>·</span>
                      <span>{task.speed}</span>
                    </>
                  )}
                  {task.errorMessage && (
                    <span className="text-danger truncate max-w-[150px]" title={task.errorMessage}>
                      {task.errorMessage}
                    </span>
                  )}
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-1 shrink-0">
                  {isDownloading && (
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

                  {isPaused && (
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

                  {(isFailed || isWaitingSource) && (
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

                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    onClick={() => onCancelTask(task.id)}
                    className="h-5 w-5 p-0 text-muted-foreground hover:text-danger cursor-pointer"
                    title={t("downloader.cancel")}
                  >
                    <X className="h-2.5 w-2.5" />
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
