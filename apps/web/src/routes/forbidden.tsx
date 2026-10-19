import { createFileRoute, Link } from "@tanstack/react-router";
import { CenteredCard } from "@/components/shell/status-screens";
import { buttonVariants } from "@/components/ui/button-variants";
import { pageTitle } from "@/lib/title";

/** Shown when someone opens another role's area. The API refuses that role's data with 403 anyway. */
export const Route = createFileRoute("/forbidden")({
  head: () => pageTitle("Not allowed"),
  component: () => (
    <CenteredCard>
      <h1 className="text-lg">You don&apos;t have access to this page</h1>
      <p className="text-sm text-fg-2">This part of the portal belongs to a different role.</p>
      <Link to="/" className={buttonVariants({ variant: "primary" })}>
        Go to my home page
      </Link>
    </CenteredCard>
  ),
});
