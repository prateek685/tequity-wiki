import { type Me, type Role } from "@portal/contracts";
import { Link } from "@tanstack/react-router";
import { LogOut } from "lucide-react";
import { BookMark, Wordmark } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { useSignOut } from "@/features/auth/use-sign-out";
import { initials } from "@/lib/initials";
import { ThemeToggle } from "./theme-toggle";

const ROLE_LABEL: Record<Role, string> = { engineer: "Engineer", manager: "Manager", admin: "Admin" };

/** The Tequity.wiki top bar, on every signed-in page: brand (home link), theme, who you are, sign out. */
export function WikiHeader({ user }: { user: Me }) {
  const signOut = useSignOut();
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-line bg-surface px-4 md:px-8">
      <Link to="/home" aria-label="Tequity.wiki home" className="flex items-center gap-2.5">
        <BookMark className="size-8" />
        <Wordmark className="text-lg" />
      </Link>
      <div className="flex items-center gap-3">
        <ThemeToggle />
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className="grid size-8 shrink-0 place-items-center rounded-full border border-line-strong bg-subtle text-xs font-semibold text-fg-2"
          >
            {initials(user.name)}
          </span>
          <div className="hidden min-w-0 sm:block">
            <p className="truncate text-sm leading-tight font-semibold">{user.name}</p>
            {user.role ? <p className="text-xs leading-tight text-muted">{ROLE_LABEL[user.role]}</p> : null}
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          aria-label="Sign out"
          title="Sign out"
          disabled={signOut.isPending}
          onClick={() => {
            signOut.mutate();
          }}
        >
          <LogOut aria-hidden="true" className="size-4" />
        </Button>
      </div>
    </header>
  );
}
