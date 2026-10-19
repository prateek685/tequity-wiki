import { PAGE_SIZE } from "@portal/contracts";
import { Link } from "@tanstack/react-router";
import { buttonVariants } from "./button-variants";

/** Previous / next links for the current paginated list (`?page=N`). Renders nothing for one page. */
export function Pager({ page, total }: { page: number; total: number }) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (pages === 1) return null;
  return (
    <nav
      aria-label="Pages"
      className="flex items-center justify-between gap-3 border-t border-line px-4 py-3 text-sm"
    >
      <span className="text-muted tabular-nums">
        Page {page} of {pages}
      </span>
      <span className="flex gap-2">
        {page > 1 ? (
          <Link to="." search={{ page: page - 1 }} className={buttonVariants({ size: "sm" })}>
            Previous
          </Link>
        ) : null}
        {page < pages ? (
          <Link to="." search={{ page: page + 1 }} className={buttonVariants({ size: "sm" })}>
            Next
          </Link>
        ) : null}
      </span>
    </nav>
  );
}
