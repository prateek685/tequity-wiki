import { type ErrorComponentProps, Link } from "@tanstack/react-router";
import { ZodError } from "zod";
import { buttonVariants } from "@/components/ui/button-variants";
import { Notice } from "@/components/ui/page-header";
import { errorMessage } from "@/lib/api";
import { PlayerTopBar } from "./player/player";

/** A day or lesson that can't be shown (locked, not ready, not found): the reason, in the player frame. */
export function LearningRouteError({ error }: ErrorComponentProps) {
  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <PlayerTopBar />
      <main className="flex w-full max-w-240 flex-col gap-6 px-4 py-6 lg:px-12 lg:pt-9">
        <h1 className="text-title font-bold">This lesson can&apos;t be opened</h1>
        <Notice tone="warning">
          {error instanceof ZodError
            ? "There's no such day or lesson. Days run from 1 to 65."
            : errorMessage(error)}
        </Notice>
        <div className="flex flex-wrap gap-2">
          <Link to="/app/plan" className={buttonVariants({ variant: "primary", size: "lg" })}>
            Go to My plan
          </Link>
          <Link to="/app" className={buttonVariants({ size: "lg" })}>
            Back to Home
          </Link>
        </div>
      </main>
    </div>
  );
}
