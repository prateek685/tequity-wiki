import { type Me } from "@portal/contracts";
import { Link } from "@tanstack/react-router";
import { WikiHeader } from "./wiki-header";
import type * as React from "react";

/** Wiki-level administration (people, not one course): the Tequity.wiki header, two tabs, the page. */
export function AdminShell({ user, children }: { user: Me; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <WikiHeader user={user} />
      <main className="flex w-full flex-1 flex-col gap-5 px-4 py-6 md:px-8">
        <nav aria-label="Administration" className="flex gap-1 border-b border-line">
          {(
            [
              ["/admin/users", "Users and roles"],
              ["/admin/teams", "Teams"],
            ] as const
          ).map(([to, label]) => (
            <Link
              key={to}
              to={to}
              className="-mb-px border-b-2 border-transparent px-3 py-2 text-base font-medium text-muted hover:text-fg current:border-accent current:text-fg"
            >
              {label}
            </Link>
          ))}
        </nav>
        {children}
      </main>
    </div>
  );
}
