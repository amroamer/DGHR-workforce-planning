import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// Button hierarchy (SPEC §4.5 / §9): primary solid blue / secondary bordered / tertiary link.
// Motion (§16): 1px press via scale-98, fast token timing; focus uses the global standardized ring.
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-btn text-sm font-semibold transition-[transform,background-color,border-color,box-shadow,color] duration-fast ease-standard active:scale-[.98] focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 disabled:active:scale-100",
  {
    variants: {
      variant: {
        primary: "bg-primary text-white shadow-sm hover:bg-primary-hover hover:shadow-card",
        secondary: "border border-border bg-card text-text1 hover:border-border-strong hover:bg-surface2",
        ghost: "text-text2 hover:bg-surface2 hover:text-text1",
        link: "h-auto p-0 font-semibold text-primary hover:underline active:scale-100",
        danger: "bg-danger text-white hover:brightness-95",
      },
      size: {
        md: "h-10 px-4",
        sm: "h-8 px-3 text-[13px]",
        lg: "h-11 px-5",
        icon: "h-9 w-9 p-0",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  ),
);
Button.displayName = "Button";
