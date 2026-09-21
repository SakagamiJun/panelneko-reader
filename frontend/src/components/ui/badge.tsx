import type { PropsWithChildren } from "react";
import { cn } from "@/lib/utils";

const toneMap: Record<string, string> = {
  default: "border-border/60 bg-muted/60 text-muted-foreground",
  not_downloaded: "border-border/60 bg-muted/60 text-muted-foreground",
  partial: "border-warning/30 bg-warning/10 text-warning",
  complete: "border-success/30 bg-success/10 text-success",
  missing: "border-danger/30 bg-danger/10 text-danger",
  running: "border-primary/30 bg-primary/10 text-primary",
  paused: "border-warning/30 bg-warning/10 text-warning",
  completed: "border-success/30 bg-success/10 text-success",
  failed: "border-danger/30 bg-danger/10 text-danger",
  queued: "border-border/60 bg-muted/60 text-muted-foreground",
};

export function Badge({
  children,
  className,
  tone = "default",
}: PropsWithChildren<{ className?: string; tone?: string }>) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium leading-tight tracking-tight select-none",
        toneMap[tone] ?? toneMap.default,
        className
      )}
    >
      {children}
    </span>
  );
}
