import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  ref?: React.Ref<HTMLInputElement>;
}

export function Input({ className, type = "text", ref, ...props }: InputProps) {
  return (
    <input
      ref={ref}
      type={type}
      className={cn(
        "h-8 w-full rounded-lg border border-border/70 bg-muted/35 px-2.5 text-xs text-foreground placeholder:text-muted-foreground/60 outline-none transition-colors duration-150 focus:border-primary/50 focus:bg-background focus:ring-1 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}
