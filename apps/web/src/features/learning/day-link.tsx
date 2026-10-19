import { Link } from "@tanstack/react-router";
import { buttonVariants } from "@/components/ui/button-variants";
import type * as React from "react";

/**
 * A link into the course player: a day (it opens on the first lesson not done) or one lesson.
 * Not preloaded on hover: opening a day is recorded (first open), so it should only happen when the
 * engineer actually opens it.
 */
export function DayLink({
  day,
  lesson,
  children,
  className,
  button = false,
}: {
  day: number;
  /** A lesson id, or "quiz". */
  lesson?: string;
  children: React.ReactNode;
  className?: string;
  button?: boolean;
}) {
  const classes = button ? buttonVariants({ variant: "primary", className }) : className;
  if (lesson)
    return (
      <Link to="/app/day/$day/$lesson" params={{ day, lesson }} preload={false} className={classes}>
        {children}
      </Link>
    );
  return (
    <Link to="/app/day/$day" params={{ day }} preload={false} className={classes}>
      {children}
    </Link>
  );
}
