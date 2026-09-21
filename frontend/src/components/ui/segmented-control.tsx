import * as React from "react";
import { cn } from "@/lib/utils";

export interface SegmentedOption<T extends string = string> {
  value: T;
  label: string;
  icon?: React.ReactNode;
  disabled?: boolean;
}

export interface SegmentedControlProps<T extends string = string> {
  value: T;
  onChange: (value: T) => void;
  options: SegmentedOption<T>[];
  size?: "sm" | "md";
  className?: string;
  disabled?: boolean;
}

export function SegmentedControl<T extends string = string>({
  value,
  onChange,
  options,
  size = "md",
  className,
  disabled = false,
}: SegmentedControlProps<T>) {
  const isSm = size === "sm";

  return (
    <div
      role="radiogroup"
      className={cn(
        "inline-flex items-center rounded-lg border border-border/70 bg-muted/40 p-0.5 select-none backdrop-blur-sm",
        disabled && "opacity-50 pointer-events-none",
        className
      )}
    >
      {options.map((opt) => {
        const isSelected = opt.value === value;
        const isOptionDisabled = disabled || opt.disabled;

        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={isSelected}
            disabled={isOptionDisabled}
            onClick={() => {
              if (!isOptionDisabled && opt.value !== value) {
                onChange(opt.value);
              }
            }}
            className={cn(
              "relative flex items-center justify-center gap-1.5 rounded-md font-medium transition-all duration-150 outline-none",
              isSm ? "h-6 px-2 text-[11px]" : "h-7 px-2.5 text-xs",
              isSelected
                ? "bg-card text-foreground shadow-[0_1px_3px_rgba(0,0,0,0.1)] font-semibold border border-border/50"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/30",
              isOptionDisabled && "cursor-not-allowed opacity-40"
            )}
          >
            {opt.icon && <span className="shrink-0">{opt.icon}</span>}
            <span className="truncate">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
