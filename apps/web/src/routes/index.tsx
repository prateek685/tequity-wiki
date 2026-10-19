import { homePathFor } from "@portal/contracts";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { meQuery } from "@/features/auth/session";

/** "/" sends everyone to the right place: sign-in, the waiting page, or their role's home. */
export const Route = createFileRoute("/")({
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.query(meQuery);
    throw redirect({ href: me ? homePathFor(me) : "/sign-in", replace: true });
  },
});
