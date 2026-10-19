/** "PR" from "Priya Rao" (or from an email: "priya@test.local" → "PT"). */
export function initials(name: string): string {
  return name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
