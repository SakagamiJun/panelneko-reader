import { useEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface FloatingCardProps {
  icon?: ReactNode;
  title: ReactNode;
  badge?: ReactNode;
  onClose?: () => void;
  closeAriaLabel?: string;
  durationMs?: number;
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
}

export function FloatingCard({
  icon,
  title,
  badge,
  onClose,
  closeAriaLabel = "Close",
  durationMs,
  children,
  footer,
  className,
}: FloatingCardProps) {
  const [progress, setProgress] = useState(100);
  const [isHovered, setIsHovered] = useState(false);
  const timerRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(Date.now());
  const remainingTimeRef = useRef<number>(durationMs ?? 0);

  useEffect(() => {
    if (!durationMs || !onClose) return;

    if (isHovered) {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    startTimeRef.current = Date.now();
    const currentRemaining = remainingTimeRef.current;

    timerRef.current = window.setTimeout(() => {
      onClose();
    }, currentRemaining);

    const interval = window.setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      const nextRemaining = Math.max(0, currentRemaining - elapsed);
      remainingTimeRef.current = nextRemaining;
      setProgress((nextRemaining / durationMs) * 100);
      if (nextRemaining <= 0) {
        window.clearInterval(interval);
      }
    }, 50);

    return () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
      }
      window.clearInterval(interval);
    };
  }, [isHovered, durationMs, onClose]);

  return (
    <div
      role="alert"
      aria-live="polite"
      className={cn(
        "pointer-events-auto flex flex-col overflow-hidden rounded-xl border border-border/80 bg-card/95 backdrop-blur-2xl shadow-2xl transition-all duration-200 select-none animate-in fade-in-50 slide-in-from-bottom-4",
        className
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {icon && <div className="shrink-0">{icon}</div>}
            <span className="text-xs font-bold text-foreground truncate">{title}</span>
            {badge && <div className="shrink-0">{badge}</div>}
          </div>

          {onClose && (
            <Button
              type="button"
              size="xs"
              variant="ghost"
              onClick={onClose}
              className="h-6 w-6 p-0 rounded-md text-muted-foreground hover:text-foreground shrink-0 cursor-pointer"
              title={closeAriaLabel}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>

        {/* Content Body */}
        {children && <div className="text-xs text-muted-foreground">{children}</div>}

        {/* Footer */}
        {footer && <div className="flex items-center justify-end gap-2 pt-1 border-t border-border/40">{footer}</div>}
      </div>

      {/* Auto dismiss countdown line */}
      {durationMs !== undefined && durationMs > 0 && (
        <div className="h-0.5 w-full bg-muted/40 overflow-hidden">
          <div
            className="h-full bg-primary/40 transition-all duration-75 ease-linear"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </div>
  );
}
