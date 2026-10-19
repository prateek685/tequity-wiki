import { type ErrorComponentProps, Link } from "@tanstack/react-router";
import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardBody } from "@/components/ui/card";
import { errorMessage } from "@/lib/api";
import type * as React from "react";

/** A centred single-card page: sign-in, waiting, forbidden, not found, errors. */
export function CenteredCard({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-screen place-items-center p-4">
      <Card className="w-full max-w-sm">
        <CardBody>{children}</CardBody>
      </Card>
    </main>
  );
}

export function NotFoundScreen() {
  return (
    <CenteredCard>
      <h1 className="text-lg">Page not found</h1>
      <p className="text-sm text-fg-2">
        This page doesn&apos;t exist. Check the address, or go back to your home page.
      </p>
      <Link to="/" className={buttonVariants({ variant: "primary" })}>
        Go to my home page
      </Link>
    </CenteredCard>
  );
}

/** Shown when loading a page fails. Never shows raw error details. */
export function ErrorScreen({ error, reset }: ErrorComponentProps) {
  return (
    <CenteredCard>
      <h1 className="text-lg">Something went wrong</h1>
      <p className="text-sm text-fg-2">{errorMessage(error)}</p>
      <button type="button" className={buttonVariants({ variant: "primary" })} onClick={reset}>
        Try again
      </button>
    </CenteredCard>
  );
}
