import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/** Our extra type sizes (globals.css @theme), so `text-read` isn't mistaken for a colour. */
const twMerge = extendTailwindMerge({ extend: { theme: { text: ["read", "title", "score"] } } });

/** Join class names, resolving Tailwind conflicts (`cn("p-4", "p-2")` → "p-2"). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
