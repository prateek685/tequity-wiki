import { homePathFor, safeRedirectPath, SIGN_IN_ERRORS } from "@portal/contracts";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useLayoutEffect } from "react";
import { z } from "zod";
import { BookMark, Wordmark } from "@/components/brand/logo";
import { SignInArt } from "@/components/brand/sign-in-art";
import { buttonVariants } from "@/components/ui/button-variants";
import { Notice } from "@/components/ui/page-header";
import { meQuery } from "@/features/auth/session";
import { applyTheme, storedTheme } from "@/lib/theme";
import { pageTitle } from "@/lib/title";

const ERRORS = {
  AccessDenied:
    "This account can't sign in. Use your company Google account, or ask an admin to check your access.",
  Configuration: "Sign-in isn't configured correctly. Please tell an admin.",
} as const;

const searchSchema = z.object({
  error: z.enum(SIGN_IN_ERRORS).optional().catch("AccessDenied"),
  next: z.string().optional().catch(undefined),
});

export const Route = createFileRoute("/sign-in")({
  validateSearch: searchSchema,
  head: () => pageTitle("Sign in"),
  beforeLoad: async ({ context }) => {
    // Already signed in and active: go straight home.
    const me = await context.queryClient.query(meQuery);
    if (me?.status === "active") throw redirect({ href: homePathFor(me), replace: true });
  },
  component: function SignInPage() {
    const { error, next } = Route.useSearch();
    const target = safeRedirectPath(next, window.location.origin);
    // The sign-in page is always light; the saved theme comes back once the user leaves it.
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
            <h2 className="text-2xl font-bold tracking-tight">Welcome back.</h2>
            <p className="text-md text-fg-2">Pick up where you left off, or find something new to learn.</p>
          </div>
        </section>
        <section className="relative z-10 flex flex-1 flex-col items-center justify-center gap-8 border-line bg-surface px-6 py-12 shadow-panel lg:border-l">
          <div className="flex w-full max-w-sm flex-col gap-8">
            <div className="flex items-center gap-3">
              <BookMark className="size-10" />
              <Wordmark className="text-xl" />
            </div>
            <div className="flex flex-col gap-2">
              <h1 className="text-2xl font-bold tracking-tight">Sign in</h1>
              <p className="text-read text-muted">
                Find the courses and resources your colleagues have built for your work.
              </p>
            </div>
            {error ? <Notice tone="danger">{ERRORS[error]}</Notice> : null}
            {/* A full page navigation: the API runs the Google flow and sets the session cookie. */}
            <a
              href={`/api/auth/google?next=${encodeURIComponent(target)}`}
              className={buttonVariants({ block: true, className: "h-12 gap-3 text-read shadow-card" })}
            >
              <GoogleMark />
              Continue with Google
            </a>
            <p className="text-sm text-muted">
              Use your Tequity Google account. Can&apos;t sign in? Ask an admin to check your access.
            </p>
            <Link to="/admin-login" className="text-sm text-muted underline">
              Admin sign in
            </Link>
          </div>
          <p className="text-xs text-muted">© Tequity</p>
        </section>
      </main>
    );
  },
});

/** Google's "G" mark (brand colours are allowed here only; tokens in globals.css). */
function GoogleMark() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 48 48" className="shrink-0">
      <path
        className="fill-google-red"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        className="fill-google-blue"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        className="fill-google-yellow"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        className="fill-google-green"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}
