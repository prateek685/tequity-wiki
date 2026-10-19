import { type Me, type Role } from "@portal/contracts";
import { useRouterState } from "@tanstack/react-router";
import { Fragment } from "react";
import { crumbFor, NAV_BY_ROLE, type NavItem } from "./nav";
import { SideNav, TabBar } from "./nav-links";
import { WikiHeader } from "./wiki-header";
import type * as React from "react";

export function Logo({ large = false }: { large?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={
        large
          ? "grid size-9 shrink-0 place-items-center rounded-ctl bg-accent text-sm font-semibold text-on-accent"
          : "grid size-7 shrink-0 place-items-center rounded-ctl bg-accent text-xs font-semibold text-on-accent"
      }
    >
      CR
    </span>
  );
}

function Breadcrumb({ area }: { area: string }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const parts = crumbFor(pathname);
  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex items-center gap-2 truncate text-sm whitespace-nowrap text-muted">
        <li>{area}</li>
        {parts.map((part, index) => (
          <Fragment key={part}>
            <li aria-hidden="true">/</li>
            <li
              aria-current={index === parts.length - 1 ? "page" : undefined}
              className={index === parts.length - 1 ? "font-medium text-fg" : undefined}
            >
              {part}
            </li>
          </Fragment>
        ))}
      </ol>
    </nav>
  );
}

/**
 * The course frame under the Tequity.wiki header: a sidebar menu on desktop, a bottom tab bar on phones.
 * One role, one menu.
 */
export function AppShell({
  user,
  role,
  items,
  children,
}: {
  user: Me;
  role: Role;
  /** Menu items when they depend on data (the engineer's Today); defaults to the role's menu. */
  items?: NavItem[];
  children: React.ReactNode;
}) {
  const nav = NAV_BY_ROLE[role];
  const menu = items ?? nav.items;
  return (
    <div className="flex min-h-screen flex-col">
      <WikiHeader user={user} />
      <div className="shell-grid flex-1">
        <aside aria-label="Sidebar" className="hidden border-r border-line bg-surface md:block">
          <div className="sticky top-14 flex flex-col px-2 py-3">
            <p className="px-3 pb-3 text-sm font-semibold">Client-Ready 90 days plan</p>
            <p className="px-3 pt-1 pb-1 text-xs font-medium tracking-wider text-muted uppercase">
              {nav.area}
            </p>
            <SideNav items={menu} />
          </div>
        </aside>
        <div className="flex min-w-0 flex-col">
          <main className="content-safe flex w-full flex-col gap-5 px-4 pt-4 md:p-6">
            <Breadcrumb area={nav.area} />
            {children}
          </main>
        </div>
      </div>
      <TabBar items={menu} />
    </div>
  );
}
