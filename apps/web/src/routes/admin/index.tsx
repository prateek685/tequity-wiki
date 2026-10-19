import { createFileRoute, redirect } from "@tanstack/react-router";

/** The admin area opens on Users and roles. */
export const Route = createFileRoute("/admin/")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/users", replace: true });
  },
});
