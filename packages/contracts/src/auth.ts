import { z } from "zod";

/** POST /api/auth/dev-login — local development only; the route doesn't exist in production. */
export const devLoginRequest = z.object({ email: z.email("Enter an email address.") });
export type DevLoginRequest = z.infer<typeof devLoginRequest>;

/** POST /api/auth/admin-login — admins only; everyone else signs in with Google. */
export const adminLoginRequest = z.object({
  email: z.email("Enter an email address."),
  password: z.string().min(1, "Enter your password.").max(200),
});
export type AdminLoginRequest = z.infer<typeof adminLoginRequest>;

/** Shortest password an admin can set (also enforced by `pnpm admin:set-password`). */
export const ADMIN_PASSWORD_MIN_LENGTH = 12;

/** GET /api/auth/admin-password — whether the signed-in admin already has a password. */
export const adminPasswordStatus = z.object({ hasPassword: z.boolean() });
export type AdminPasswordStatus = z.infer<typeof adminPasswordStatus>;

/** POST /api/auth/admin-password — the current password is required once one exists. */
export const setAdminPasswordRequest = z.object({
  currentPassword: z.string().max(200).optional(),
  newPassword: z
    .string()
    .min(ADMIN_PASSWORD_MIN_LENGTH, `Use at least ${String(ADMIN_PASSWORD_MIN_LENGTH)} characters.`)
    .max(200),
});
export type SetAdminPasswordRequest = z.infer<typeof setAdminPasswordRequest>;

/** Where the web app should go after signing in. */
export const signInResponse = z.object({ next: z.string().startsWith("/") });
export type SignInResponse = z.infer<typeof signInResponse>;

/** `?error=` values the sign-in page understands. */
export const SIGN_IN_ERRORS = ["AccessDenied", "Configuration"] as const;
export type SignInError = (typeof SIGN_IN_ERRORS)[number];

/** GET /api/auth/options — which sign-in methods the sign-in page should offer. */
/**
 * Test accounts (local test login, seed, automated tests) use this reserved domain. It can never be a
 * real Google account, so a test user can't collide with a real person; real accounts always use Google.
 */
export const TEST_EMAIL_DOMAIN = "test.local";

export const signInOptions = z.object({
  google: z.boolean(),
  /** The company email domain (Google pre-selects it). */
  emailDomain: z.string(),
});
export type SignInOptions = z.infer<typeof signInOptions>;
