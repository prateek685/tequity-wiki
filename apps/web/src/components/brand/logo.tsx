import { cn } from "@/lib/cn";

/** The Tequity.Wiki mark: an open book on an accent tile. Colours are tokens, so it follows dark mode. */
export function BookMark({ className }: { className?: string }) {
  return (
    <svg
      role="img"
      aria-label="Tequity.Wiki"
      viewBox="0 0 64 64"
      className={cn("size-8 shrink-0", className)}
    >
      <rect width="64" height="64" rx="16" className="fill-accent" />
      <path d="M31 20C25 16 17 16 11 18V46C17 44 25 44 31 48Z" className="fill-on-accent" />
      <path d="M33 20C39 16 47 16 53 18V46C47 44 39 44 33 48Z" className="fill-accent-100" />
    </svg>
  );
}

/** "Tequity.wiki" with the ".wiki" in the accent colour. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("font-bold tracking-tight", className)}>
      Tequity<span className="text-accent-text">.wiki</span>
    </span>
  );
}
