import { type Me } from "@portal/contracts";
import { WikiHeader } from "./wiki-header";
import type * as React from "react";

/** The Tequity.wiki home frame: the top bar above a centred page. */
export function WikiShell({ user, children }: { user: Me; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <WikiHeader user={user} />
      <main className="flex w-full flex-1 justify-center px-4 py-10 md:px-8 md:py-14">
        <div className="flex w-full max-w-4xl flex-col gap-10">{children}</div>
      </main>
    </div>
  );
}
