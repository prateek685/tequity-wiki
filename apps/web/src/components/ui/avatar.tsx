import { initials } from "@/lib/initials";

/** Round initials badge (mockup `.av`). Decorative: the name is always shown beside it. */
export function Avatar({ name }: { name: string }) {
  return (
    <span
      aria-hidden="true"
      className="grid size-7.5 shrink-0 place-items-center rounded-full border border-line-strong bg-subtle text-xs font-semibold text-fg-2"
    >
      {initials(name)}
    </span>
  );
}
