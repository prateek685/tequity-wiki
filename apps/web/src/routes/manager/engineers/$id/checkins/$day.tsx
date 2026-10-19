import { type CheckinFormResponse, checkinParam, PILLARS, type SaveCheckinRequest } from "@portal/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useId, useState } from "react";
import { ActionBar } from "@/components/ui/action-bar";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Notice, PageHeader } from "@/components/ui/page-header";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { PillarDot } from "@/features/learning/player/blocks";
import { pillarValue, todayIso } from "@/features/manager/manager";
import { checkinQuery, managerKeys, saveCheckin } from "@/features/manager/queries";
import { RagChoice } from "@/features/manager/rag-choice";
import { PILLAR_NAMES } from "@/features/progress/progress";
import { ApiError, errorMessage } from "@/lib/api";
import { cn } from "@/lib/cn";
import { pageTitle } from "@/lib/title";

/** The bi-weekly check-in form (PDF §5.2, docs/PORTAL_PLAN.md §2 "Manager check-in"). */
export const Route = createFileRoute("/manager/engineers/$id/checkins/$day")({
  params: {
    parse: (params: { id: string; day: string }) => checkinParam.parse(params),
    stringify: (params: { id: string; day: number }) => ({ id: params.id, day: String(params.day) }),
  },
  head: ({ params }) => pageTitle(`Check-in after Day ${params.day}`),
  component: function CheckinPage() {
    const { id, day } = Route.useParams();
    const form = useQuery(checkinQuery(id, day));
    if (form.isPending)
      return (
        <p role="status" className="text-sm text-muted">
          Loading…
        </p>
      );
    if (form.isError)
      return (
        <>
          <PageHeader title={`Check-in after Day ${day}`} />
          <Notice tone="warning">{errorMessage(form.error)}</Notice>
        </>
      );
    // Re-mount when another check-in loads, so the form starts from its saved values.
    return <CheckinForm key={`${id}-${day}`} id={id} data={form.data} />;
  },
});

const PREP_NOTES = [
  { key: "spotCheck", label: "Live spot-check: how did it go?" },
  { key: "stuck", label: "Where am I stuck?" },
  { key: "support", label: "Support I need" },
] as const;

function CheckinForm({ id, data }: { id: string; data: CheckinFormResponse }) {
  const formId = useId();
  const saved = data.checkin;
  const [values, setValues] = useState<SaveCheckinRequest>(() => ({
    heldOn: saved?.heldOn ?? todayIso(),
    rag: saved?.rag ?? "green",
    note: saved?.note ?? "",
  }));
  const [message, setMessage] = useState("");
  const set = <K extends keyof SaveCheckinRequest>(key: K, value: SaveCheckinRequest[K]) => {
    setMessage("");
    setValues((current) => ({ ...current, [key]: value }));
  };
  const queryClient = useQueryClient();
  const save = useMutation({
    mutationFn: () => saveCheckin(id, data.afterDay, values),
    onSuccess: async () => {
      setMessage("Check-in saved. The engineer sees the rating and the note.");
      await queryClient.invalidateQueries({ queryKey: managerKeys.all });
    },
  });
  const fields = save.error instanceof ApiError ? (save.error.body.fields ?? {}) : {};
  const noteMissing = values.note.trim().length === 0;
  const blocked =
    !data.reached || (save.error instanceof ApiError && save.error.code === "CHECKIN_NOT_REACHED");
  return (
    <form
      noValidate
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        if (!blocked && !noteMissing) save.mutate();
      }}
    >
      <PageHeader
        eyebrow={`Week ${data.week} · ${saved ? "recorded" : "not recorded yet"}`}
        title={`Check-in after Day ${data.afterDay} · ${data.engineer.name}`}
        description="About 30 minutes. Read the engineer's notes, then record the rating and one line. The engineer sees both."
        actions={
          <Link to="/manager/engineers/$id" params={{ id }} className={buttonVariants()}>
            Back to {data.engineer.name}
          </Link>
        }
      />
      {!data.reached ? (
        <Notice tone="warning">
          This check-in opens once {data.engineer.name} has finished Day {data.afterDay}. You can read the
          form, but it can&apos;t be saved yet.
        </Notice>
      ) : null}

      <Card>
        <CardHeader title="1. Score trend" aside="The last two weekly scorecards" />
        {data.scorecards.length === 0 ? (
          <CardBody>
            <p className="text-sm text-muted">No weekly scorecards yet.</p>
          </CardBody>
        ) : (
          <Table stacked={false}>
            <thead>
              <tr>
                <Th>Pillar</Th>
                {data.scorecards.map((card) => (
                  <Th key={card.week} className="text-right">
                    Week {card.week}
                  </Th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PILLARS.map((pillar) => (
                <Tr key={pillar}>
                  <Td label="Pillar" lead>
                    <span className="flex items-center gap-2">
                      <PillarDot pillar={pillar} />
                      {PILLAR_NAMES[pillar]}
                    </span>
                  </Td>
                  {data.scorecards.map((card) => {
                    const score = card.scores[pillar];
                    return (
                      <Td
                        key={card.week}
                        label={`Week ${card.week}`}
                        className={cn(
                          "text-right tabular-nums",
                          score !== null && score <= 2 && "font-medium text-danger",
                        )}
                      >
                        {pillarValue(score)}
                        {card.rated.includes(pillar) ? null : (
                          <span className="text-xs font-normal text-muted"> (carried)</span>
                        )}
                      </Td>
                    );
                  })}
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Card>
        <CardHeader title="2. The engineer's notes" aside="Written by the engineer before the check-in" />
        <CardBody>
          {data.prep === null ? (
            <p className="text-sm text-muted">{data.engineer.name} hasn&apos;t written any notes yet.</p>
          ) : (
            <dl className="flex flex-col gap-4 text-sm">
              {PREP_NOTES.map(({ key, label }) => (
                <div key={key}>
                  <dt className="font-medium text-fg-2">{label}</dt>
                  <dd className="mt-1 whitespace-pre-wrap text-fg">{data.prep?.[key] || "—"}</dd>
                </div>
              ))}
            </dl>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Outcome" />
        <CardBody>
          <Field id={`${formId}-held`} label="Held on" error={fields.heldOn} className="max-w-xs">
            <Input
              id={`${formId}-held`}
              type="date"
              value={values.heldOn}
              onChange={(event) => {
                set("heldOn", event.target.value);
              }}
            />
          </Field>
          <RagChoice
            labelId={`${formId}-rag`}
            value={values.rag}
            onChange={(rag) => {
              set("rag", rag);
            }}
          />
          <Field
            id={`${formId}-note`}
            label="One-line note (for the tracker)"
            error={fields.note ?? (save.isError && noteMissing ? "Add a one-line note." : undefined)}
          >
            <Input
              id={`${formId}-note`}
              value={values.note}
              maxLength={300}
              required
              placeholder="e.g. Own is behind: two status updates without dates. Pairing with Aarav."
              onChange={(event) => {
                set("note", event.target.value);
              }}
            />
          </Field>
        </CardBody>
      </Card>

      {save.isError && !fields.note && Object.keys(fields).length === 0 ? (
        <Notice tone="danger">{errorMessage(save.error)}</Notice>
      ) : null}
      <ActionBar
        status={
          message ? (
            <span role="status">{message}</span>
          ) : noteMissing ? (
            "Add a one-line note to save."
          ) : saved ? (
            "Saving updates the recorded check-in."
          ) : null
        }
      >
        <Button type="submit" variant="primary" disabled={blocked || noteMissing || save.isPending}>
          {save.isPending ? "Saving…" : "Save check-in"}
        </Button>
      </ActionBar>
    </form>
  );
}
