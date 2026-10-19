import { homePathFor } from "@portal/contracts";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { CenteredCard } from "@/components/shell/status-screens";
import { Button } from "@/components/ui/button";
import { meQuery } from "@/features/auth/session";
import { useSignOut } from "@/features/auth/use-sign-out";
import { pageTitle } from "@/lib/title";

export const Route = createFileRoute("/pending")({
  head: () => pageTitle("Waiting for access"),
  beforeLoad: async ({ context }) => {
    // Always ask the API: an approval must take effect without signing in again.
    const me = await context.queryClient.query({ ...meQuery, staleTime: 0 });
    if (!me) throw redirect({ to: "/sign-in", replace: true });
    if (me.status !== "pending") throw redirect({ href: homePathFor(me), replace: true });
  },
  component: function PendingPage() {
    const { data: me } = useSuspenseQuery(meQuery);
    const signOut = useSignOut();
    return (
      <CenteredCard>
        <h1 className="text-lg">Waiting for access</h1>
        <p className="text-sm text-fg-2">
          You&apos;re signed in as <span className="font-medium">{me?.email}</span>. An admin needs to give
          you a role before you can start. You don&apos;t need to do anything else.
        </p>
        <Button
          onClick={() => {
            signOut.mutate();
          }}
          disabled={signOut.isPending}
        >
          Sign out
        </Button>
      </CenteredCard>
    );
  },
});
