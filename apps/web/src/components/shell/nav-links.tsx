import { Link, useRouterState } from "@tanstack/react-router";
import { isBelow, type NavItem } from "./nav";
import type * as React from "react";

/** One menu link; day links aren't preloaded (opening a day is recorded). */
function NavLink({
  item,
  className,
  children,
}: {
  item: NavItem;
  className: string;
  children: React.ReactNode;
}) {
  if ("day" in item) {
    if (item.to === "/app/assessment/$day")
      return (
        <Link to="/app/assessment/$day" params={{ day: item.day }} className={className}>
          {children}
        </Link>
      );
    return (
      <Link to="/app/day/$day" params={{ day: item.day }} preload={false} className={className}>
        {children}
      </Link>
    );
  }
  return (
    <PathLink item={item} className={className}>
      {children}
    </PathLink>
  );
}

function PathLink({
  item,
  className,
  children,
}: {
  item: Exclude<NavItem, { day: number }>;
  className: string;
  children: React.ReactNode;
}) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const below = item.activeBelow !== undefined && isBelow(pathname, item.activeBelow);
  return (
    <Link
      to={item.to}
      activeOptions={{ exact: item.exact ?? false }}
      className={className}
      {...(below ? { "aria-current": "page" as const } : {})}
    >
      {children}
    </Link>
  );
}

export function SideNav({ items }: { items: NavItem[] }) {
  return (
    <nav aria-label="Main" className="flex flex-col gap-0.5">
      {items.map((item) => (
        <NavLink
          key={item.label}
          item={item}
          className="group flex items-center gap-3 rounded-ctl px-3 py-1.5 font-medium text-fg-2 hover:bg-subtle current:bg-accent-50 current:text-accent-text"
        >
          <item.icon aria-hidden="true" className="size-4 shrink-0 text-muted group-current:text-accent" />
          <span className="min-w-0 flex-1 truncate">{item.label}</span>
          {item.count ? (
            <span className="text-xs font-medium text-muted tabular-nums group-current:text-accent-text">
              {item.count}
            </span>
          ) : null}
        </NavLink>
      ))}
    </nav>
  );
}

export function TabBar({ items }: { items: NavItem[] }) {
  return (
    <nav
      aria-label="Main"
      className="tabbar-safe fixed inset-x-0 bottom-0 z-20 flex border-t border-line bg-surface px-1 pt-1.5 md:hidden"
    >
      {items
        .filter((item) => item.tab !== false)
        .map((item) => (
          <NavLink
            key={item.label}
            item={item}
            className="flex min-w-0 flex-1 flex-col items-center gap-0.5 py-1.5 text-xs font-medium text-muted current:text-accent"
          >
            <item.icon aria-hidden="true" className="size-5" />
            {item.short}
          </NavLink>
        ))}
    </nav>
  );
}
