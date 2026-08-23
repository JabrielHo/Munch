import * as React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/**
 * The frame every screen sits in: a one-line header with an optional back
 * arrow, a scrolling body, and room at the bottom for a docked action bar.
 */
export function Screen({
  title,
  subtitle,
  backTo,
  badge,
  children,
  className,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  backTo?: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mx-auto flex w-full max-w-md flex-col gap-4 px-4 pt-safe pb-8", className)}>
      <header className="flex items-start gap-2 pt-1">
        {backTo && (
          <Button asChild variant="ghost" size="icon" className="-ml-2 shrink-0">
            <Link to={backTo} aria-label="Back">
              <ArrowLeft />
            </Link>
          </Button>
        )}
        <div className="min-w-0 flex-1 py-2">
          <h1 className="truncate text-xl leading-tight font-semibold">{title}</h1>
          {subtitle && <p className="truncate text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        {badge && <div className="shrink-0 pt-2.5">{badge}</div>}
      </header>
      {children}
    </div>
  );
}

/** A bottom-anchored action bar. `spacer` reserves the same height in the flow,
 *  so the last row of content is never trapped underneath it. */
export function Dock({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-md flex-col gap-2 px-4 pt-3 pb-safe">
        {children}
      </div>
    </div>
  );
}

export function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
      {children}
    </p>
  );
}
