import * as React from "react";
import { cn } from "@/lib/utils";

export interface KbdProps extends React.HTMLAttributes<HTMLElement> {
  size?: "sm" | "md";
}

export function Kbd({ children, className, size = "md", ...props }: KbdProps) {
  return (
    <kbd
      className={cn(
        "inline-flex items-center justify-center font-mono font-medium rounded border border-border/80 bg-muted/60 text-muted-foreground shadow-[0_1px_0_1px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.15)] select-none",
        size === "sm" ? "h-5 min-w-[1.25rem] px-1 text-[10px]" : "h-6 min-w-[1.5rem] px-1.5 text-xs",
        className
      )}
      {...props}
    >
      {children}
    </kbd>
  );
}
