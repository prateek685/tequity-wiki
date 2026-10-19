import { homePathFor, safeRedirectPath } from "@portal/contracts";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useLayoutEffect } from "react";
import { z } from "zod";
import { BookMark, Wordmark } from "@/components/brand/logo";
import { SignInArt } from "@/components/brand/sign-in-art";
import { AdminLoginForm } from "@/features/auth/admin-login-form";
import { meQuery } from "@/features/auth/session";
import { applyTheme, storedTheme } from "@/lib/theme";
import { pageTitle } from "@/lib/title";

/** Admins only: sign in with email and password. Everyone else uses Google on /sign-in. */
export const Route = createFileRoute("/admin-login")({
  validateSearch: z.object({ next: z.string().optional().catch(undefined) }),
  head: () => pageTitle("Admin sign in"),
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.query(meQuery);
    if (me?.status === "active") throw redirect({ href: homePathFor(me), replace: true });
  },
  component: function AdminLoginPage() {
    const { next } = Route.useSearch();
    // Same as the sign-in page: always light; the saved theme comes back when the user leaves.
    useLayoutEffect(() => {
      applyTheme("light");
      return () => {
        applyTheme(storedTheme());
      };
    }, []);

    return (
      <main className="flex min-h-screen flex-col lg:flex-row">
        <section
          aria-label="Welcome"
          className="hidden flex-1 flex-col items-center justify-center gap-8 bg-accent-50 px-10 py-12 text-center lg:flex"
        >
          <SignInArt />
          <div className="flex max-w-sm flex-col gap-2">
            <h2 className="text-2xl font-bold tracking-tight">Manage the wiki.</h2>
            <p className="text-md text-fg-2">People, teams, courses and settings, all in one place.</p>
          </div>
        </section>
        <section className="relative z-10 flex flex-1 flex-col items-center justify-center gap-8 border-line bg-surface px-6 py-12 shadow-panel lg:border-l">
          <div className="flex w-full max-w-sm flex-col gap-8">
            <div className="flex items-center gap-3">
              <BookMark className="size-10" />
              <Wordmark className="text-xl" />
            </div>
            <div className="flex flex-col gap-2">
              <h1 className="text-2xl font-bold tracking-tight">Admin sign in</h1>
              <p className="text-read text-muted">Use the email and password for your admin account.</p>
            </div>
            <AdminLoginForm next={safeRedirectPath(next, window.location.origin)} />
          </div>
          <p className="text-xs text-muted">© Tequity</p>
        </section>
      </main>
    );
  },
});
