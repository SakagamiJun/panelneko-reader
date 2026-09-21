import * as React from "react";
import { cn } from "@/lib/utils";

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
  className?: string;
  size?: "sm" | "md";
  title?: string;
}

export function Switch({
  checked,
  onChange,
  disabled = false,
  id,
  className,
  size = "md",
  title,
}: SwitchProps) {
  const isSm = size === "sm";

  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      title={title}
      onClick={() => {
        if (!disabled) {
          onChange(!checked);
        }
      }}
      className={cn(
        "relative inline-flex shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-40",
        isSm ? "h-4 w-7 p-[2px]" : "h-5 w-9 p-[2px]",
        checked ? "bg-primary" : "bg-muted-foreground/25 hover:bg-muted-foreground/35",
        className
      )}
    >
      <span
        className={cn(
          "pointer-events-none inline-block rounded-full bg-white shadow-sm ring-0 transition-transform duration-200 ease-in-out",
          isSm ? "h-3 w-3" : "h-4 w-4",
          checked
            ? isSm
              ? "translate-x-3"
              : "translate-x-4"
            : "translate-x-0"
        )}
      />
    </button>
  );
}
