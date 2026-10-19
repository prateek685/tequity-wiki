import { cva } from "class-variance-authority";

/** Button styles, shared by <Button> and links styled as buttons. */
export const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-ctl border font-medium whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-45",
  {
    variants: {
      variant: {
        primary: "border-accent bg-accent text-on-accent hover:border-accent-hover hover:bg-accent-hover",
        secondary: "border-line-strong bg-surface text-fg hover:bg-subtle",
        ghost: "border-transparent bg-transparent text-fg-2 hover:bg-subtle",
        danger: "border-danger bg-surface text-danger hover:bg-danger-soft",
      },
      size: {
        sm: "h-7 px-2.5 text-xs",
        md: "h-9 px-3 text-sm",
        /** Course player: 40px, 14px semibold (docs/design/course-player.html). */
        lg: "h-10 rounded-card px-4 text-base font-semibold",
      },
      block: { true: "w-full" },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);
