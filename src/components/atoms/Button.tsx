"use client";

import type { ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// Aceternity magnetic-button-demo, by Manu Arora. Style only: no magnetic wrapper.
// Source and licence references: docs/design/action-components/README.md.
const filled = "bg-linear-to-b ring-1 ring-inset ring-white/20 ring-offset-1";

export const buttonVariants = cva(
  `inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg font-medium select-none
   transition-[transform,filter,background-color] duration-150
   enabled:active:scale-[0.98] motion-reduce:enabled:active:scale-100
   disabled:opacity-50 disabled:pointer-events-none`,
  {
    variants: {
      variant: {
        primary: `${filled} from-blue-600 to-blue-700 text-white ring-offset-blue-600 enabled:hover:brightness-110`,
        secondary: `${filled} from-field to-surface text-ink ring-offset-surface enabled:hover:brightness-110 aria-expanded:brightness-110`,
        ghost: "bg-hover-2 text-ink hover:bg-line-strong ring-1 ring-inset ring-white/10",
        accent: `${filled} from-accent to-accent-ink text-canvas ring-offset-accent`,
        success: `${filled} from-green to-green text-canvas ring-offset-green`,
        quiet: "text-ink hover:bg-hover",
      },
      size: {
        xs: "min-h-8 px-2.5 py-1.5 text-[14px] leading-5 gap-1",
        sm: "min-h-11 px-3 py-2 text-[14px] leading-5 gap-1.5",
        md: "min-h-11 px-4 py-2 text-[16px] leading-6",
        icon: "size-11 shrink-0 p-0",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export type ButtonVariant = NonNullable<VariantProps<typeof buttonVariants>["variant"]>;

export function Button({
  variant,
  size,
  className,
  type = "button",
  ...props
}: ComponentProps<"button"> & VariantProps<typeof buttonVariants>) {
  return <button type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
