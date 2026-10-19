import {
  FINAL_OUTCOME_TEXT,
  FINAL_OUTCOMES,
  type FinalOutcome,
  finalOutcome,
  type FinalReviewFormResponse,
  type GateCriteria,
  gateMaths,
  type Rag,
  type SaveFinalReviewRequest,
} from "@portal/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useId, useState } from "react";
import { ActionBar } from "@/components/ui/action-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Notice, PageHeader } from "@/components/ui/page-header";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FINAL_STATUS_LABEL, FinalBars, LiveCallsCard } from "@/features/final-review/final-review";
import { finalReviewFormQuery, saveFinalReview } from "@/features/final-review/queries";
import { averageText, formatDateTime, heldAtIso, heldAtParts } from "@/features/gates/gates";
import { GATE_RUBRIC } from "@/features/gates/rubric";
import { Anchors, RateRow } from "@/features/learning/player/lesson-inputs";
import { managerKeys } from "@/features/manager/queries";
import { RagChoice } from "@/features/manager/rag-choice";
import { ApiError, errorMessage } from "@/lib/api";
import { pageTitle } from "@/lib/title";

/**
 * Record the final review (docs/PORTAL_PLAN.md §3 "Final review"; PDF "Final review — Day 90"): the manager
 * or PM observed a real client call the engineer led; score it on criteria 1–11 (skip what didn't come up),
 * read the readiness case, and confirm the decision the scores point to.
 */
export const Route = createFileRoute("/manager/engineers/$id/final-review")({
  head: () => pageTitle("Record the final review"),
  component: function FinalReviewFormPage() {
    const { id } = Route.useParams();
    const form = useQuery(finalReviewFormQuery(id));
    if (form.isPending)
      return (
        <p role="status" className="text-sm text-muted">
          Loading…
        </p>
      );
    if (form.isError)
      return (
        <>
          <PageHeader title="Record the final review" />
          <Notice tone="warning">{errorMessage(form.error)}</Notice>
          <div>
            <Link to="/manager/gates" className={buttonVariants()}>
              Back to Gates
            </Link>
          </div>
        </>
      );
    return <FinalReviewForm key={id} id={id} data={form.data} />;
  },
});

type Criteria = Record<string, number | null>;

function FinalReviewForm({ id, data }: { id: string; data: FinalReviewFormResponse }) {
  const formId = useId();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const saved = data.saved;

  const [criteria, setCriteria] = useState<Criteria>(() => ({ ...(saved?.criteria ?? {}) }));
  const [held, setHeld] = useState(() => heldAtParts(saved ? new Date(saved.heldAt) : new Date()));
  const [observer, setObserver] = useState<"manager" | "pm">(saved?.observer ?? "manager");
  const [call, setCall] = useState(saved?.call ?? "");
  /** Null: follow the scores. */
  const [outcomeChoice, setOutcomeChoice] = useState<FinalOutcome | null>(saved?.outcome ?? null);
  const [overrideNote, setOverrideNote] = useState("");
  const [rag, setRag] = useState<Rag>(saved?.rag ?? "green");
  const [note, setNote] = useState(saved?.note ?? "");
  const [tried, setTried] = useState(false);

  const heldAt = heldAtIso(held.date, held.time);
  const scores = criteria as GateCriteria;
  const maths = gateMaths(scores);
  const suggested = finalOutcome(scores);
  const outcome = outcomeChoice ?? suggested ?? "another_cycle";
  const needsOverride = suggested !== null && outcome !== suggested;
  const pendingLive = data.liveCalls.filter((row) => row.path === "later");

  const save = useMutation({
    mutationFn: (request: SaveFinalReviewRequest) => saveFinalReview(id, request),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: managerKeys.all });
      await navigate({ to: "/manager/gates", search: { recorded: data.engineer.name } });
    },
  });
  const apiError = save.error instanceof ApiError ? save.error : null;
  const fields = apiError?.body.fields ?? {};
  const blocked = !data.reached || apiError?.code === "FINAL_NOT_REACHED";

  const problems: Record<string, string> = {};
  if (maths.scored === 0) problems.criteria = "Score at least one criterion.";
  if (!heldAt) problems.heldAt = "Enter the date and time of the call.";
  if (call.trim() === "") problems.call = "Name the observed call.";
  if (note.trim() === "") problems.note = "Add a one-line note.";
  if (needsOverride && overrideNote.trim() === "")
    problems.overrideNote = "This decision isn't the one the scores point to. Add a note saying why.";
  const show = (key: string) =>
    (tried ? problems[key] : undefined) ??
    fields[key] ??
    Object.entries(fields).find(([field]) => field.startsWith(`${key}.`))?.[1];
  const overrideError =
    show("overrideNote") ?? (apiError?.code === "OVERRIDE_NOTE_REQUIRED" ? apiError.message : undefined);

  const submit = () => {
    setTried(true);
    if (blocked || pendingLive.length > 0 || Object.keys(problems).length > 0 || !heldAt) return;
    save.mutate({
      heldAt,
      observer,
      call: call.trim(),
      criteria: scores,
      outcome,
      rag,
      note: note.trim(),
      overrideNote: needsOverride ? overrideNote.trim() : "",
    });
  };

  const generalError =
    apiError && apiError.code !== "OVERRIDE_NOTE_REQUIRED" && Object.keys(fields).length === 0
      ? errorMessage(save.error)
      : !apiError && save.isError
        ? errorMessage(save.error)
        : null;

  return (
    <form
      noValidate
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <PageHeader
        eyebrow={`${data.engineer.name} · Day 65`}
        title="Record the final review"
        description="Score the observed client call. Skip criteria that didn’t come up."
        actions={
          <>
            <Badge
              tone={data.status === "recorded" ? "success" : data.status === "to_book" ? "accent" : "neutral"}
            >
              {FINAL_STATUS_LABEL[data.status].manager}
            </Badge>
            <Link to="/manager/engineers/$id" params={{ id }} className={buttonVariants()}>
              Back to {data.engineer.name}
            </Link>
          </>
        }
      />
      {blocked ? (
        <Notice tone="warning">
          The final review opens once {data.engineer.name} has finished Day 64 and shared their readiness
          case. You can read the form, but it can&apos;t be saved yet.
        </Notice>
      ) : null}
      {pendingLive.length > 0 ? (
        <Notice tone="warning">
          Still scheduled for later: {pendingLive.map((row) => `Day ${row.day}`).join(", ")}. The final review
          can be recorded once {data.engineer.name} has done{" "}
          {pendingLive.length === 1 ? "that call" : "those calls"}.
        </Notice>
      ) : null}

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Call rubric" aside={<span className="tabular-nums">Criteria 1–11</span>} />
          <CardBody className="gap-0 py-2">
            {show("criteria") ? (
              <p role="alert" className="pb-1.5 text-sm text-danger">
                {show("criteria")}
              </p>
            ) : null}
            {GATE_RUBRIC.map((criterion) => (
              <RateRow
                key={criterion.number}
                label={`${criterion.number}. ${criterion.name}`}
                note={criterion.number === 11 ? "from the written follow-ups" : undefined}
                notScored
                detail={<Anchors anchors={criterion.anchors} />}
                value={criteria[String(criterion.number)]}
                onChange={(score) => {
                  setCriteria((current) => ({ ...current, [String(criterion.number)]: score }));
                }}
              />
            ))}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Decision" />
          <CardBody>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field id={`${formId}-call`} label="Observed call" error={show("call")}>
                <Input
                  id={`${formId}-call`}
                  value={call}
                  maxLength={200}
                  required
                  placeholder="e.g. Day 62 solo call: weekly sync"
                  onChange={(event) => {
                    setCall(event.target.value);
                  }}
                />
              </Field>
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor={`${formId}-observer`}>Observed by</Label>
                <Select
                  value={observer}
                  onValueChange={(value) => {
                    setObserver(value === "pm" ? "pm" : "manager");
                  }}
                >
                  <SelectTrigger id={`${formId}-observer`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manager">Manager</SelectItem>
                    <SelectItem value="pm">PM</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <dl className="kv">
              <dt>Scored</dt>
              <dd className="tabular-nums">{maths.scored} of 11</dd>
              <dt>Average</dt>
              <dd className="tabular-nums">{averageText(maths.average)}</dd>
              <dt>Lowest</dt>
              <dd className="tabular-nums">{maths.lowest ?? "—"}</dd>
              <dt>The scores say</dt>
              <dd aria-live="polite">{suggested ? FINAL_OUTCOME_TEXT[suggested].label : "—"}</dd>
            </dl>
            <FinalBars />
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor={`${formId}-outcome`}>Decision</Label>
              <Select
                value={outcome}
                onValueChange={(value) => {
                  setOutcomeChoice(value as FinalOutcome);
                }}
              >
                <SelectTrigger id={`${formId}-outcome`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FINAL_OUTCOMES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {FINAL_OUTCOME_TEXT[value].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {needsOverride ? (
              <Field
                id={`${formId}-override`}
                label="Why this decision? (required: the scores point to another one)"
                error={overrideError}
              >
                <Textarea
                  id={`${formId}-override`}
                  value={overrideNote}
                  maxLength={500}
                  aria-invalid={overrideError ? true : undefined}
                  className="min-h-16"
                  onChange={(event) => {
                    setOverrideNote(event.target.value);
                  }}
                />
              </Field>
            ) : null}
            <div className="grid grid-cols-2 gap-3">
              <Field id={`${formId}-date`} label="Held on" error={show("heldAt")}>
                <Input
                  id={`${formId}-date`}
                  type="date"
                  value={held.date}
                  onChange={(event) => {
                    setHeld((current) => ({ ...current, date: event.target.value }));
                  }}
                />
              </Field>
              <Field id={`${formId}-time`} label="At">
                <Input
                  id={`${formId}-time`}
                  type="time"
                  value={held.time}
                  onChange={(event) => {
                    setHeld((current) => ({ ...current, time: event.target.value }));
                  }}
                />
              </Field>
            </div>
            <RagChoice
              labelId={`${formId}-rag`}
              label="Green / Amber / Red and note"
              value={rag}
              onChange={setRag}
            />
            <Field id={`${formId}-note`} label="One-line note (for the tracker)" error={show("note")}>
              <Input
                id={`${formId}-note`}
                value={note}
                maxLength={300}
                required
                placeholder="e.g. Led the call end to end; recap within the hour"
                onChange={(event) => {
                  setNote(event.target.value);
                }}
              />
            </Field>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="My readiness case"
          aside={
            data.readinessCase ? `Shared ${formatDateTime(data.readinessCase.submittedAt)}` : "Not shared yet"
          }
        />
        <CardBody>
          {data.readinessCase ? (
            <dl className="flex flex-col text-base">
              {data.readinessCase.fields.map((field) => (
                <div
                  key={field.id}
                  className="border-b border-line py-3 first:pt-0 last:border-b-0 last:pb-0"
                >
                  <dt className="text-sm text-muted">{field.label}</dt>
                  <dd className="mt-1 whitespace-pre-wrap">{field.value || "—"}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-sm text-muted">It appears here once {data.engineer.name} finishes Day 64.</p>
          )}
        </CardBody>
      </Card>

      <LiveCallsCard liveCalls={data.liveCalls} />

      {generalError ? <Notice tone="danger">{generalError}</Notice> : null}
      <ActionBar
        status={
          tried && Object.keys(problems).length > 0
            ? "Fill in the highlighted parts first."
            : saved
              ? "Saving updates the recorded decision."
              : "The engineer sees the decision once it's saved."
        }
      >
        <Button
          type="submit"
          variant="primary"
          disabled={blocked || pendingLive.length > 0 || save.isPending}
        >
          {save.isPending ? "Saving…" : "Save final review"}
        </Button>
      </ActionBar>
    </form>
  );
}
