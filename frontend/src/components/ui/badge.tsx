import type { PropsWithChildren } from "react";
import { cn } from "@/lib/utils";

const toneMap: Record<string, string> = {
  default: "border-border/60 bg-muted/60 text-muted-foreground",
  primary: "border-primary/30 bg-primary/10 text-primary",
  running: "border-primary/30 bg-primary/10 text-primary",
  success: "border-success/30 bg-success/10 text-success",
  warning: "border-warning/30 bg-warning/10 text-warning",
  danger: "border-danger/30 bg-danger/10 text-danger",
};

export function Badge({
  children,
  className,
  tone = "default",
  title,
}: PropsWithChildren<{ className?: string; tone?: string; title?: string }>) {
  return (
    <span
      title={title}
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
