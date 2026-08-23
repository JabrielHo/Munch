import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Sized for thumbs in a Telegram webview: nothing below 44px tall, and the
 * `lg` size is what the primary action on every screen uses.
 *
 * The three rsvp variants are Munch's own addition to the shadcn set — "I'm
 * in", "Maybe" and "Can't" have to read as one control group with three moods.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-bold transition-[color,background-color,box-shadow,transform] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        outline: "border border-border bg-card text-foreground hover:bg-muted",
        ghost: "text-foreground hover:bg-muted",
        link: "text-primary underline-offset-4 hover:underline",
        destructive:
          "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
        going: "bg-going-soft text-going border border-going/25 hover:bg-going-soft/70",
        maybe: "bg-maybe-soft text-maybe border border-maybe/25 hover:bg-maybe-soft/70",
        cant: "bg-cant-soft text-cant border border-cant/25 hover:bg-cant-soft/70",
      },
      size: {
        sm: "h-9 px-3",
        default: "h-11 px-4",
        lg: "h-13 px-5 text-base",
        icon: "size-11",
      },
      /** A chosen rsvp answer, so the group of three shows which one is yours. */
      selected: { true: "ring-2 ring-current ring-offset-2 ring-offset-background", false: "" },
    },
    defaultVariants: { variant: "default", size: "default", selected: false },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, selected, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size, selected }), className)}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { buttonVariants };
