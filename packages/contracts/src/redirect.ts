/**
 * Turn an untrusted "next" value into a same-site path, or "/" if it is anything else. Resolving
 * against our own origin and comparing origins catches every trick at once: "//evil.com",
 * "/\\evil.com", "https://evil.com", "javascript:", encoded slashes and control characters.
 * Shared: the API uses it after sign-in, the web app before navigating.
 */
export function safeRedirectPath(candidate: unknown, origin: string): string {
  if (typeof candidate !== "string" || candidate.length === 0 || candidate.length > 2048) return "/";
  // eslint-disable-next-line no-control-regex -- control characters are exactly what we reject here
  if (!candidate.startsWith("/") || /[\\\u0000-\u001f\u007f]/.test(candidate)) return "/";
  let url: URL;
  try {
    url = new URL(candidate, origin);
  } catch {
    return "/";
  }
  if (url.origin !== new URL(origin).origin) return "/";
  return `${url.pathname}${url.search}${url.hash}`;
}
