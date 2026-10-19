/** Company-domain check, on top of the Google OAuth client being "Internal" to the Workspace. */
export function isAllowedEmail(email: string | null | undefined, allowedDomain: string): boolean {
  if (!email) return false;
  const normalised = email.trim().toLowerCase();
  const at = normalised.lastIndexOf("@");
  if (at <= 0 || at !== normalised.indexOf("@")) return false;
  return normalised.slice(at + 1) === allowedDomain.trim().toLowerCase().replace(/^@/, "");
}
