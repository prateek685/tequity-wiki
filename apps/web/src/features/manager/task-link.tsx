import { Link } from "@tanstack/react-router";
import { taskTarget } from "./manager";
import type * as React from "react";

/** A link to an app path from the API (a "This week" task), through the router when it's a known page. */
export function TaskLink({
  href,
  className,
  children,
}: {
  href: string;
  className: string;
  children: React.ReactNode;
}) {
  const target = taskTarget(href);
  switch (target?.kind) {
    case "checkin":
      return (
        <Link
          to="/manager/engineers/$id/checkins/$day"
          params={{ id: target.id, day: target.day }}
          className={className}
        >
          {children}
        </Link>
      );
    case "gate":
      return (
        <Link
          to="/manager/engineers/$id/gates/$gate"
          params={{ id: target.id, gate: target.gate }}
          className={className}
        >
          {children}
        </Link>
      );
    case "engineer":
      return (
        <Link to="/manager/engineers/$id" params={{ id: target.id }} className={className}>
          {children}
        </Link>
      );
    default:
      return (
        <a href={href} className={className}>
          {children}
        </a>
      );
  }
}
