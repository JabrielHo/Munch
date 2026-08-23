import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        // 16px on mobile, because anything smaller makes iOS Safari zoom the
        // whole webview the moment the field takes focus.
        "flex h-12 w-full rounded-lg border border-input bg-card px-3 text-base text-foreground",
        "placeholder:text-muted-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-ring",
        "disabled:cursor-not-allowed disabled:opacity-50",
        // Chrome puts its own calendar or clock button inside these two, which
        // index.css pins to the trailing edge. This is the room it sits in — it
        // lives here rather than in that stylesheet because a utility class
        // outranks the base layer.
        (type === "date" || type === "time") && "pr-10",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";
