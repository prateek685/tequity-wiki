import { type FinalReviewListResponse, GATE_AFTER_DAY, type GateListResponse } from "@portal/contracts";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";
import { Notice, PageHeader } from "@/components/ui/page-header";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { FINAL_STATUS_LABEL, FinalOutcomeBadge } from "@/features/final-review/final-review";
import { managerFinalReviewsQuery } from "@/features/final-review/queries";
import { GateStatusBadge, OutcomeBadge } from "@/features/gates/gate-result";
import { asGateNo, averageText, formatDateTime } from "@/features/gates/gates";
import { managerGatesQuery } from "@/features/gates/queries";
import { errorMessage } from "@/lib/api";
import { pageTitle } from "@/lib/title";

/** Gates to book, record or re-run (docs/design/final-mockup.html NAV "Gates", docs/PORTAL_PLAN.md §2). */
export const Route = createFileRoute("/manager/gates/")({
  // After saving a gate result, the form comes back here with the engineer's name for the status line.
  validateSearch: z.object({ recorded: z.string().max(200).optional().catch(undefined) }),
  head: () => pageTitle("Gates"),
  component: function GatesPage() {
    const { recorded } = Route.useSearch();
    const gates = useQuery(managerGatesQuery);
    const finals = useQuery(managerFinalReviewsQuery);
    return (
      <>
        <PageHeader
          title="Gates"
          description="Gate 1 follows Day 20 and Gate 2 follows Day 40: a 45-minute live call each. The final review follows Day 64. The engineer books each one with you; you score the call and record the result here."
        />
        {recorded ? (
          <p role="status" className="rounded-ctl border border-line bg-subtle px-3 py-2 text-sm text-fg-2">
            Result saved for {recorded}. They can see it now.
          </p>
        ) : null}
        {gates.isPending ? (
          <p role="status" className="text-sm text-muted">
            Loading gates…
          </p>
        ) : gates.isError ? (
          <Notice tone="warning">{errorMessage(gates.error)}</Notice>
        ) : (
          <GateTable rows={gates.data.gates} />
        )}
        {finals.data && finals.data.reviews.length > 0 ? <FinalTable rows={finals.data.reviews} /> : null}
        {finals.isError ? <Notice tone="warning">{errorMessage(finals.error)}</Notice> : null}
      </>
    );
  },
});

function When({ at }: { at: string | null }) {
  return at ? (
    <span className="tabular-nums">{formatDateTime(at)}</span>
  ) : (
    <span className="text-muted">—</span>
  );
}

function GateTable({ rows }: { rows: GateListResponse["gates"] }) {
  if (rows.length === 0)
    return (
      <Card>
        <CardBody>
          <p className="text-sm text-muted">
            No gates yet. An engineer&apos;s Gate 1 shows here once they reach Day 20, and Gate 2 once they
            reach Day 40.
          </p>
        </CardBody>
      </Card>
    );
  return (
    <Card>
      <Table>
        <thead>
          <tr>
            <Th>Engineer</Th>
            <Th>Gate</Th>
            <Th className="text-right">Round</Th>
            <Th>Status</Th>
            <Th>Gate day finished</Th>
            <Th>Recap sent</Th>
            <Th>Result</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <Tr key={`${row.engineer.id}-${row.gate}`}>
              <Td label="Engineer" lead>
                <span className="flex items-center gap-2.5">
                  <Avatar name={row.engineer.name} />
                  <Link
                    to="/manager/engineers/$id/gates/$gate"
                    params={{ id: row.engineer.id, gate: asGateNo(row.gate) }}
                    className="font-medium text-fg underline-offset-2 hover:text-accent-text hover:underline"
                  >
                    {row.engineer.name}
                    <span className="sr-only">: Gate {row.gate}</span>
                  </Link>
                </span>
              </Td>
              <Td label="Gate" className="tabular-nums">
                Gate {row.gate}
              </Td>
              <Td label="Round" className="text-right tabular-nums">
                {row.round}
              </Td>
              <Td label="Status">
                <GateStatusBadge status={row.status} />
              </Td>
              <Td label="Gate day finished" className="whitespace-nowrap">
                <span className="text-muted tabular-nums">Day {GATE_AFTER_DAY[asGateNo(row.gate)]} · </span>
                <When at={row.reachedAt} />
              </Td>
              <Td label="Recap sent">
                <When at={row.recapAt} />
              </Td>
              <Td label="Result">
                {row.result ? (
                  <span className="flex flex-wrap items-center gap-2">
                    <OutcomeBadge outcome={row.result.outcome} />
                    <span className="text-muted tabular-nums">{averageText(row.result.average)}</span>
                  </span>
                ) : (
                  <span className="text-muted">—</span>
                )}
              </Td>
            </Tr>
          ))}
        </tbody>
      </Table>
    </Card>
  );
}

function FinalTable({ rows }: { rows: FinalReviewListResponse["reviews"] }) {
  return (
    <section aria-labelledby="final-reviews-title" className="flex flex-col gap-3">
      <h2 id="final-reviews-title" className="text-lg">
        Final reviews
      </h2>
      <Card>
        <Table>
          <thead>
            <tr>
              <Th>Engineer</Th>
              <Th>Status</Th>
              <Th>Readiness case shared</Th>
              <Th>Live calls later</Th>
              <Th>Decision</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <Tr key={row.engineer.id}>
                <Td label="Engineer" lead>
                  <span className="flex items-center gap-2.5">
                    <Avatar name={row.engineer.name} />
                    <Link
                      to="/manager/engineers/$id/final-review"
                      params={{ id: row.engineer.id }}
                      className="font-medium text-fg underline-offset-2 hover:text-accent-text hover:underline"
                    >
                      {row.engineer.name}
                      <span className="sr-only">: final review</span>
                    </Link>
                  </span>
                </Td>
                <Td label="Status">
                  <Badge tone={row.status === "recorded" ? "success" : "accent"}>
                    {FINAL_STATUS_LABEL[row.status].manager}
                  </Badge>
                </Td>
                <Td label="Readiness case shared">
                  <When at={row.reachedAt} />
                </Td>
                <Td label="Live calls later" className="tabular-nums">
                  {row.pendingLive > 0 ? row.pendingLive : <span className="text-muted">—</span>}
                </Td>
                <Td label="Decision">
                  {row.result ? (
                    <span className="flex flex-wrap items-center gap-2">
                      <FinalOutcomeBadge outcome={row.result.outcome} />
                      <span className="text-muted tabular-nums">{averageText(row.result.average)}</span>
                    </span>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </section>
  );
}
