import type { ComponentProps } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker } from "react-day-picker";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

/**
 * shadcn's calendar over react-day-picker. Every class is supplied here rather
 * than importing the library's stylesheet, so the grid inherits Munch's palette
 * and radii instead of arriving with its own look.
 *
 * Sizes are deliberately generous: this is tapped with a thumb inside a
 * Telegram webview, not clicked with a mouse.
 */
export function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: ComponentProps<typeof DayPicker>) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      classNames={{
        months: "relative flex flex-col gap-4",
        month: "w-full space-y-3",
        month_caption: "relative mx-10 flex h-10 items-center justify-center",
        caption_label: "font-display text-base font-semibold",
        nav: "absolute inset-x-0 top-0 z-10 flex h-10 items-center justify-between",
        button_previous: cn(buttonVariants({ variant: "ghost", size: "icon" }), "size-10"),
        button_next: cn(buttonVariants({ variant: "ghost", size: "icon" }), "size-10"),
        month_grid: "w-full border-collapse",
        weekdays: "flex",
        weekday: "w-10 text-xs font-bold uppercase text-muted-foreground",
        week: "mt-1 flex w-full",
        day: "relative size-10 p-0 text-center",
        day_button: cn(
          "size-10 rounded-lg text-sm font-semibold transition-colors",
          "hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        ),
        selected: "[&>button]:bg-primary [&>button]:text-primary-foreground [&>button]:hover:bg-primary",
        today: "[&>button]:ring-1 [&>button]:ring-primary/50",
        outside: "[&>button]:text-muted-foreground/50",
        disabled: "[&>button]:pointer-events-none [&>button]:opacity-30",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, ...rest }) =>
          orientation === "left" ? (
            <ChevronLeft className="size-4" {...rest} />
          ) : (
            <ChevronRight className="size-4" {...rest} />
          ),
      }}
      {...props}
    />
  );
}
