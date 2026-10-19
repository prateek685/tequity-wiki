/**
 * Light is the default; dark is opt-in and remembered per browser (docs/PORTAL_PLAN.md §8b).
 * Storage can be blocked (private mode, policies), so every access is guarded.
 */
const STORAGE_KEY = "portal-theme";

export type Theme = "light" | "dark";

export function storedTheme(): Theme {
  try {
    return localStorage.getItem(STORAGE_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

export function applyTheme(theme: Theme): void {
  if (theme === "dark") document.documentElement.dataset.theme = "dark";
  else delete document.documentElement.dataset.theme;
}

export function saveTheme(theme: Theme): void {
  applyTheme(theme);
  try {
    if (theme === "dark") localStorage.setItem(STORAGE_KEY, "dark");
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Not remembered: the choice still applies until the page is reloaded.
  }
}
