import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center font-medium transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 select-none",
  {
    variants: {
      variant: {
        primary:
          "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 active:scale-[0.98]",
        outline:
          "border border-border/80 bg-card/80 text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:bg-muted/60 hover:border-border active:scale-[0.98]",
        ghost:
          "text-muted-foreground hover:bg-muted/60 hover:text-foreground active:scale-[0.98]",
        subtle:
          "border border-border/50 bg-muted/60 text-foreground hover:bg-muted active:scale-[0.98]",
      },
      size: {
        xs: "h-6 px-2 text-[11px] rounded-md gap-1",
        sm: "h-8 px-2.5 text-xs rounded-lg gap-1.5",
        md: "h-9 px-3.5 text-xs sm:text-sm rounded-lg gap-2",
        lg: "h-10 px-4 text-sm rounded-xl gap-2",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
