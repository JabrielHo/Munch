import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold whitespace-nowrap",
  {
    variants: {
      variant: {
        default: "bg-primary/12 text-primary",
        muted: "bg-muted text-muted-foreground",
        outline: "border border-border text-muted-foreground",
        going: "bg-going-soft text-going",
        maybe: "bg-maybe-soft text-maybe",
        cant: "bg-cant-soft text-cant",
        live: "bg-going-soft text-going",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
