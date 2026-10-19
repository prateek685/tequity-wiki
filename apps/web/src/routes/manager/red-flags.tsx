import { type RedFlag, redFlagListQuery, RED_FLAG_TEXT } from "@portal/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, stripSearchParams } from "@tanstack/react-router";
import { useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Notice, PageHeader } from "@/components/ui/page-header";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { managerKeys } from "@/features/manager/queries";
import { acknowledgeFlag, redFlagsQuery } from "@/features/red-flags/queries";
import {
  acknowledgedLine,
  emptyText,
  RED_FLAGS_INTRO,
  type RedFlagTab,
  shortDate,
} from "@/features/red-flags/red-flags";
import { errorMessage } from "@/lib/api";
import { cn } from "@/lib/cn";
import { pageTitle } from "@/lib/title";

/**
 * Red flags (docs/design/final-mockup.html `flags()`, docs/PORTAL_PLAN.md §3 "Red flags", PDF §5.4 word for
 * word): the signal, what it may mean and the suggested action. A flag stays open until acknowledged.
 */
export const Route = createFileRoute("/manager/red-flags")({
  validateSearch: redFlagListQuery,
  // Open is the default: keep it out of the URL.
  search: { middlewares: [stripSearchParams({ status: "open" })] },
  head: () => pageTitle("Red flags"),
  component: function RedFlagsPage() {
    const { status } = Route.useSearch();
    const flags = useQuery(redFlagsQuery(status));
    const [done, setDone] = useState("");
    return (
      <>
        <PageHeader title="Red flags" description={RED_FLAGS_INTRO} />
        <Tabs status={status} open={flags.data?.open ?? null} />
        {done ? (
          <p role="status" className="rounded-ctl border border-line bg-subtle px-3 py-2 text-sm text-fg-2">
            {done}
          </p>
        ) : null}
        {flags.isPending ? (
          <p role="status" className="text-sm text-muted">
            Loading red flags…
          </p>
        ) : flags.isError ? (
          <Notice tone="warning">{errorMessage(flags.error)}</Notice>
        ) : (
          <FlagTable rows={flags.data.flags} status={status} onDone={setDone} />
        )}
      </>
    );
  },
});

const TABS: { status: RedFlagTab; label: string }[] = [
  { status: "open", label: "Open" },
  { status: "acknowledged", label: "Acknowledged" },
];

function Tabs({ status, open }: { status: RedFlagTab; open: number | null }) {
  return (
    <nav aria-label="Red flag status" className="flex gap-1 border-b border-line">
      {TABS.map((tab) => (
        <Link
          key={tab.status}
          to="/manager/red-flags"
          search={{ status: tab.status }}
          aria-current={tab.status === status ? "page" : undefined}
          className={cn(
            "-mb-px flex items-center gap-1.5 border-b-2 border-transparent px-3 py-2 text-sm font-medium text-muted hover:text-fg",
            tab.status === status && "border-accent text-fg",
          )}
        >
          {tab.label}
          {tab.status === "open" && open ? (
            <span className="rounded-full bg-danger-soft px-1.5 text-xs text-danger tabular-nums">
              {open}
            </span>
          ) : null}
        </Link>
      ))}
    </nav>
  );
}

function FlagTable({
  rows,
  status,
  onDone,
}: {
  rows: RedFlag[];
  status: RedFlagTab;
  onDone: (message: string) => void;
}) {
  if (rows.length === 0)
    return (
      <Card>
        <CardBody>
          <p className="text-sm text-muted">{emptyText(status)}</p>
        </CardBody>
      </Card>
    );
  return (
    <Card>
      <Table>
        <thead>
          <tr>
            <Th>Engineer</Th>
            <Th>Signal</Th>
            <Th>Suggested action</Th>
            <Th>Since</Th>
            <Th>{status === "open" ? <span className="sr-only">Acknowledge</span> : "Acknowledged"}</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((flag) => (
            <FlagRow key={flag.id} flag={flag} onDone={onDone} />
          ))}
        </tbody>
      </Table>
    </Card>
  );
}

function FlagRow({ flag, onDone }: { flag: RedFlag; onDone: (message: string) => void }) {
  const queryClient = useQueryClient();
  const text = RED_FLAG_TEXT[flag.kind];
  const acknowledged = acknowledgedLine(flag);
  const acknowledge = useMutation({
    mutationFn: () => acknowledgeFlag(flag.id),
    onSuccess: async () => {
      onDone(`Acknowledged: ${text.signal} · ${flag.engineer.name}. It’s in the Acknowledged tab now.`);
      // Red flags, the menu badge and the Team page (flaglines, KPI).
      await queryClient.invalidateQueries({ queryKey: managerKeys.all });
    },
  });
  return (
    <Tr>
      <Td label="Engineer" lead>
        <span className="flex items-center gap-2.5">
          <Avatar name={flag.engineer.name} />
          <Link
            to="/manager/engineers/$id"
            params={{ id: flag.engineer.id }}
            className="font-medium text-fg underline-offset-2 hover:text-accent-text hover:underline"
          >
            {flag.engineer.name}
          </Link>
        </span>
      </Td>
      <Td label="Signal" stack>
        <span className="block font-semibold">{text.signal}</span>
        <span className="block text-xs text-muted">What it may mean: {text.meaning}</span>
        {flag.detail ? (
          <span className="mt-0.5 block text-xs text-fg-2 tabular-nums">{flag.detail}</span>
        ) : null}
      </Td>
      <Td label="Suggested action" stack className="text-sm text-fg-2">
        {text.action}
      </Td>
      <Td label="Since" className="whitespace-nowrap tabular-nums">
        {shortDate(flag.raisedAt)}
      </Td>
      <Td label={acknowledged ? "Acknowledged" : "Acknowledge"} className="md:text-right">
        {acknowledged ? (
          <span className="text-sm text-muted tabular-nums">{acknowledged}</span>
        ) : (
          <span className="flex flex-col items-start gap-1 md:items-end">
            <Button
              size="sm"
              disabled={acknowledge.isPending}
              aria-label={`Acknowledge “${text.signal}” for ${flag.engineer.name}`}
              onClick={() => {
                onDone("");
                acknowledge.mutate();
              }}
            >
              {acknowledge.isPending ? "Saving…" : "Acknowledge"}
            </Button>
            {acknowledge.isError ? (
              <span role="alert" className="text-xs text-danger">
                {errorMessage(acknowledge.error)}
              </span>
            ) : null}
          </span>
        )}
      </Td>
    </Tr>
  );
}
