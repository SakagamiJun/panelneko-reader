import * as React from "react";
import { cn } from "@/lib/utils";

export interface SettingGroupProps {
  title?: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}

export function SettingGroup({
  title,
  description,
  children,
  className,
}: SettingGroupProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      {(title || description) && (
        <div className="px-1 mb-2">
          {title && (
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {title}
            </h3>
          )}
          {description && (
            <p className="mt-0.5 text-xs text-muted-foreground/80">{description}</p>
          )}
        </div>
      )}
      <div className="overflow-hidden rounded-xl border border-border/70 bg-card/60 divide-y divide-border/40 backdrop-blur-sm shadow-sm">
        {children}
      </div>
    </div>
  );
}

export interface SettingRowProps {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  control?: React.ReactNode;
  className?: string;
  onClick?: () => void;
  disabled?: boolean;
}

export function SettingRow({
  icon,
  title,
  description,
  control,
  className,
  onClick,
  disabled = false,
}: SettingRowProps) {
  const isClickable = Boolean(onClick) && !disabled;

  return (
    <div
      onClick={isClickable ? onClick : undefined}
      className={cn(
        "flex items-center justify-between gap-4 px-3.5 py-3 transition-colors",
        isClickable && "cursor-pointer hover:bg-muted/30",
        disabled && "opacity-50 pointer-events-none",
        className
      )}
    >
      <div className="flex items-start gap-3 min-w-0 flex-1">
        {icon && (
          <div className="mt-0.5 text-muted-foreground shrink-0">{icon}</div>
        )}
        <div className="min-w-0 flex-1">
          <div className="text-xs sm:text-sm font-medium text-foreground leading-snug">
            {title}
          </div>
          {description && (
            <div className="mt-0.5 text-[11px] text-muted-foreground leading-normal">
              {description}
            </div>
          )}
        </div>
      </div>
      {control && <div className="shrink-0 flex items-center gap-2">{control}</div>}
    </div>
  );
}
