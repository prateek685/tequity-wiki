import {
  FOLLOW_UP_LABELS,
  GATE_AFTER_DAY,
  type GateCriteria,
  type GateFormResponse,
  type GateOutcome,
  gateMaths,
  gatePillarAverages,
  managerGateParam,
  meetsBar,
  type Rag,
  type SaveGateRequest,
  suggestRepeatWeeks,
} from "@portal/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useId, useState } from "react";
import { ActionBar } from "@/components/ui/action-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Collapsible } from "@/components/ui/collapsible";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Notice, PageHeader } from "@/components/ui/page-header";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { GateHistory, GateStatusBadge } from "@/features/gates/gate-result";
import {
  againstBar,
  asGateNo,
  averageText,
  barPill,
  followUpText,
  formatDateTime,
  GATE_COPY,
  heldAtIso,
  heldAtParts,
  LIVE_CALL_PLAN_EXAMPLE,
  liveCallPlanOk,
  OUTCOME_LABEL,
  passLine,
  recapOnTime,
  repeatWeeksText,
  suggestedOutcome,
  weekDays,
} from "@/features/gates/gates";
import { gateFormQuery, saveGate } from "@/features/gates/queries";
import { criterionPillars, GATE_RUBRIC } from "@/features/gates/rubric";
import { Anchors, RateRow } from "@/features/learning/player/lesson-inputs";
import { managerKeys } from "@/features/manager/queries";
import { RagChoice } from "@/features/manager/rag-choice";
import { ApiError, errorMessage } from "@/lib/api";
import { pageTitle } from "@/lib/title";

/**
 * Record a gate (docs/design/final-mockup.html `gate()`, docs/PORTAL_PLAN.md §2–§3): score the live call on
 * criteria 1–11 (skip what didn't come up), see the average, lowest score and the pass bar live, and pick
 * the outcome. Below the bar the form suggests the 2 weeks to repeat.
 */
export const Route = createFileRoute("/manager/engineers/$id/gates/$gate")({
  params: {
    parse: (params: { id: string; gate: string }): { id: string; gate: number } =>
      managerGateParam.parse(params),
    stringify: (params: { id: string; gate: number }) => ({ id: params.id, gate: String(params.gate) }),
  },
  head: ({ params }) => pageTitle(`Record Gate ${params.gate}`),
  component: function GateFormPage() {
    const { id, gate } = Route.useParams();
    const form = useQuery(gateFormQuery(id, gate));
    if (form.isPending)
      return (
        <p role="status" className="text-sm text-muted">
          Loading…
        </p>
      );
    if (form.isError)
      return (
        <>
          <PageHeader title={`Record Gate ${gate}`} />
          <Notice tone="warning">{errorMessage(form.error)}</Notice>
          <div>
            <Link to="/manager/gates" className={buttonVariants()}>
              Back to Gates
            </Link>
          </div>
        </>
      );
    // Re-mount per engineer and round, so the form starts from that round's saved values.
    return <GateForm key={`${id}-${gate}-${form.data.round}`} id={id} data={form.data} />;
  },
});

const NO_CARD = "none";

type Criteria = Record<string, number | null>;

function GateForm({ id, data }: { id: string; data: GateFormResponse }) {
  const formId = useId();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const saved = data.saved;
  const gate = asGateNo(data.gate);
  const copy = GATE_COPY[gate];
  const afterDay = GATE_AFTER_DAY[gate];

  const [cardId, setCardId] = useState<string>(
    () =>
      saved?.cardId ??
      data.cards.find((card) => card.id === copy.defaultCard)?.id ??
      data.cards[0]?.id ??
      NO_CARD,
  );
  const [surprise, setSurprise] = useState(saved?.surprise ?? "");
  const [criteria, setCriteria] = useState<Criteria>(() => ({ ...(saved?.result.criteria ?? {}) }));
  const [held, setHeld] = useState(() => heldAtParts(saved ? new Date(saved.result.heldAt) : new Date()));
  /** Null: follow the recap time (ticked when the recap came within 2 hours of the call). */
  const [onTimeChoice, setOnTimeChoice] = useState<boolean | null>(saved?.result.recapOnTime ?? null);
  /** Null: follow the pass bar (pass at or above it, repeat below). */
  const [outcomeChoice, setOutcomeChoice] = useState<GateOutcome | null>(saved?.result.outcome ?? null);
  const [focusItems, setFocusItems] = useState<[string, string]>(() => [
    saved?.result.focusItems[0] ?? "",
    saved?.result.focusItems[1] ?? "",
  ]);
  /** Null: the suggested weeks. */
  const [weeksChoice, setWeeksChoice] = useState<number[] | null>(
    saved?.result.repeatWeeks.length ? saved.result.repeatWeeks : null,
  );
  const [overrideNote, setOverrideNote] = useState("");
  const [rag, setRag] = useState<Rag>(saved?.result.rag ?? "green");
  const [note, setNote] = useState(saved?.result.note ?? "");
  /** Gate 2 only. */
  const [healthcareTerms, setHealthcareTerms] = useState(saved?.result.healthcareTerms ?? false);
  const [liveCallPlan, setLiveCallPlan] = useState(saved?.result.liveCallPlan ?? "");
  const [tried, setTried] = useState(false);

  const heldAt = heldAtIso(held.date, held.time);
  const onTime = onTimeChoice ?? recapOnTime(data.recap?.submittedAt, heldAt);
  const scores = criteria as GateCriteria;
  const maths = gateMaths(scores);
  const meets = meetsBar(gate, scores, onTime, healthcareTerms);
  const pill = barPill(meets);
  const outcome = outcomeChoice ?? suggestedOutcome(meets);
  const suggestedWeeks = suggestRepeatWeeks(gatePillarAverages(scores, criterionPillars()), data.weeks);
  const repeatWeeks = weeksChoice ?? suggestedWeeks;
  const needsOverride = againstBar(outcome, meets);

  const save = useMutation({
    mutationFn: (request: SaveGateRequest) => saveGate(id, data.gate, request),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: managerKeys.all });
      await navigate({ to: "/manager/gates", search: { recorded: data.engineer.name } });
    },
  });
  const apiError = save.error instanceof ApiError ? save.error : null;
  const fields = apiError?.body.fields ?? {};
  const blocked = !data.reached || apiError?.code === "GATE_NOT_REACHED";

  // Client-side checks, shown once Save was pressed.
  const problems: Record<string, string> = {};
  if (maths.scored === 0) problems.criteria = "Score at least one criterion.";
  if (!heldAt) problems.heldAt = "Enter the date and time of the call.";
  if (note.trim() === "") problems.note = "Add a one-line note.";
  if (outcome === "pass_focus" && focusItems.every((item) => item.trim() === ""))
    problems.focusItems = "Add one or two focus items.";
  if (outcome === "repeat" && repeatWeeks.length !== 2) problems.repeatWeeks = "Pick 2 weeks to repeat.";
  if (!liveCallPlanOk(gate, liveCallPlan, outcome))
    problems.liveCallPlan = "Add the Phase 3 live-call plan: which calls to shadow, co-lead and lead.";
  if (needsOverride && overrideNote.trim() === "")
    problems.overrideNote = "This outcome goes against the pass bar. Add a note saying why.";
  const show = (key: string) =>
    (tried ? problems[key] : undefined) ??
    fields[key] ??
    Object.entries(fields).find(([field]) => field.startsWith(`${key}.`))?.[1];
  const overrideError =
    show("overrideNote") ?? (apiError?.code === "OVERRIDE_NOTE_REQUIRED" ? apiError.message : undefined);

  const submit = () => {
    setTried(true);
    if (blocked || Object.keys(problems).length > 0 || !heldAt) return;
    save.mutate({
      heldAt,
      cardId: cardId === NO_CARD ? null : cardId,
      surprise: surprise.trim(),
      criteria: scores,
      recapOnTime: onTime,
      outcome,
      focusItems:
        outcome === "pass_focus" ? focusItems.map((item) => item.trim()).filter((item) => item !== "") : [],
      repeatWeeks: outcome === "repeat" ? repeatWeeks : [],
      rag,
      note: note.trim(),
      overrideNote: needsOverride ? overrideNote.trim() : "",
      healthcareTerms: gate === 2 ? healthcareTerms : false,
      liveCallPlan: gate === 2 ? liveCallPlan.trim() : "",
    });
  };

  const generalError =
    apiError &&
    apiError.code !== "OVERRIDE_NOTE_REQUIRED" &&
    apiError.code !== "GATE_NOT_REACHED" &&
    Object.keys(fields).length === 0
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
        eyebrow={`${data.engineer.name} · after Day ${afterDay}`}
        title={`Record Gate ${data.gate}${data.round > 1 ? ` · round ${data.round}` : ""}`}
        description={`${passLine(gate)} Skip criteria that didn’t come up.`}
        actions={
          <>
            <GateStatusBadge status={data.status} />
            <Link to="/manager/engineers/$id" params={{ id }} className={buttonVariants()}>
              Back to {data.engineer.name}
            </Link>
          </>
        }
      />
      {blocked ? (
        <Notice tone="warning">
          Gate {data.gate} opens once {data.engineer.name} has finished Day {afterDay}. You can read the form,
          but it can&apos;t be saved yet.
        </Notice>
      ) : null}

      <Card>
        <CardHeader title="Scenario" aside={copy.scenarioAside} />
        <CardBody className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor={`${formId}-card`}>Mock card</Label>
            <Select value={cardId} onValueChange={setCardId}>
              <SelectTrigger id={`${formId}-card`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {data.cards.map((card) => (
                  <SelectItem key={card.id} value={card.id}>
                    {card.id} · {card.title} · {card.client}
                  </SelectItem>
                ))}
                <SelectItem value={NO_CARD}>Another scenario (not a card)</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-xs text-muted">Pick one the engineer hasn&apos;t practised.</span>
          </div>
          <Field id={`${formId}-surprise`} label="Surprise" error={show("surprise")}>
            <Input
              id={`${formId}-surprise`}
              value={surprise}
              maxLength={500}
              placeholder={copy.surprisePlaceholder}
              onChange={(event) => {
                setSurprise(event.target.value);
              }}
            />
          </Field>
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Call rubric" aside={<span className="tabular-nums">{copy.rubricAside}</span>} />
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
                note={criterion.number === 11 ? "from the written follow-up" : undefined}
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
          <CardHeader title="Result" />
          <CardBody>
            <dl className="kv">
              <dt>Scored</dt>
              <dd className="tabular-nums">{maths.scored} of 11</dd>
              <dt>Average</dt>
              <dd className="tabular-nums">{averageText(maths.average)}</dd>
              <dt>Lowest</dt>
              <dd className="tabular-nums">{maths.lowest ?? "—"}</dd>
            </dl>
            {gate === 2 ? (
              <div className="flex flex-col gap-1">
                <label
                  htmlFor={`${formId}-terms`}
                  className="flex cursor-pointer items-center gap-3 text-base"
                >
                  <input
                    id={`${formId}-terms`}
                    type="checkbox"
                    className="size-4.25 shrink-0 accent-accent"
                    checked={healthcareTerms}
                    onChange={(event) => {
                      setHealthcareTerms(event.target.checked);
                    }}
                  />
                  Basic healthcare terms used correctly
                </label>
                <span className="pl-7.25 text-sm text-muted tabular-nums">
                  Written follow-up:{" "}
                  {data.recap
                    ? `${followUpText(data.recap.followUpType)} · sent ${formatDateTime(data.recap.submittedAt)}`
                    : "not sent yet"}
                </span>
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                <label
                  htmlFor={`${formId}-ontime`}
                  className="flex cursor-pointer items-center gap-3 text-base"
                >
                  <input
                    id={`${formId}-ontime`}
                    type="checkbox"
                    className="size-4.25 shrink-0 accent-accent"
                    checked={onTime}
                    onChange={(event) => {
                      setOnTimeChoice(event.target.checked);
                    }}
                  />
                  Recap received within 2 hours
                </label>
                <span className="pl-7.25 text-sm text-muted tabular-nums">
                  {data.recap ? `Recap sent ${formatDateTime(data.recap.submittedAt)}` : "No recap yet"}
                </span>
              </div>
            )}
            <p aria-live="polite">
              <Badge tone={pill.tone} dot={pill.dot}>
                {pill.label}
              </Badge>
            </p>
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor={`${formId}-outcome`}>Outcome</Label>
              <Select
                value={outcome}
                onValueChange={(value) => {
                  setOutcomeChoice(value as GateOutcome);
                }}
              >
                <SelectTrigger id={`${formId}-outcome`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(["pass", "pass_focus", "repeat"] as const).map((value) => (
                    <SelectItem key={value} value={value}>
                      {OUTCOME_LABEL[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {show("outcome") ? (
                <span role="alert" className="text-xs text-danger">
                  {show("outcome")}
                </span>
              ) : null}
            </div>

            {outcome === "pass_focus" ? (
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1.5 text-sm font-medium text-fg-2">
                  Focus items for the next weeks&apos; mocks
                </legend>
                {focusItems.map((item, index) => (
                  <Input
                    // Two fixed slots.
                    // eslint-disable-next-line @eslint-react/no-array-index-key
                    key={index}
                    aria-label={`Focus item ${index + 1}`}
                    value={item}
                    maxLength={200}
                    placeholder={index === 0 ? "e.g. Name the risk before the client asks" : "Optional"}
                    onChange={(event) => {
                      const next: [string, string] = [...focusItems];
                      next[index] = event.target.value;
                      setFocusItems(next);
                    }}
                  />
                ))}
                {show("focusItems") ? (
                  <span role="alert" className="text-xs text-danger">
                    {show("focusItems")}
                  </span>
                ) : null}
              </fieldset>
            ) : null}

            {outcome === "repeat" ? (
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1 text-sm font-medium text-fg-2">Weeks to repeat (2)</legend>
                <span className="text-sm text-muted tabular-nums">
                  Suggested: {repeatWeeksText(suggestedWeeks) || "—"}, from the weakest pillars.
                </span>
                {data.weeks.map((week) => (
                  <label
                    key={week.week}
                    htmlFor={`${formId}-week-${week.week}`}
                    className="flex cursor-pointer items-center gap-3 text-base"
                  >
                    <input
                      id={`${formId}-week-${week.week}`}
                      type="checkbox"
                      className="size-4.25 shrink-0 accent-accent"
                      checked={repeatWeeks.includes(week.week)}
                      onChange={(event) => {
                        const on = event.target.checked;
                        setWeeksChoice(
                          (on
                            ? [...repeatWeeks, week.week]
                            : repeatWeeks.filter((value) => value !== week.week)
                          ).sort((a, b) => a - b),
                        );
                      }}
                    />
                    Week {week.week} · {weekDays(week.week)}
                    <span className="min-w-0 text-muted">{week.title}</span>
                  </label>
                ))}
                {show("repeatWeeks") ? (
                  <span role="alert" className="text-xs text-danger">
                    {show("repeatWeeks")}
                  </span>
                ) : null}
              </fieldset>
            ) : null}

            {needsOverride ? (
              <Field
                id={`${formId}-override`}
                label="Why this outcome? (required: it goes against the pass bar)"
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
                placeholder="e.g. Amber: strong opener, froze on the surprise"
                onChange={(event) => {
                  setNote(event.target.value);
                }}
              />
            </Field>
            {gate === 2 ? (
              <Field
                id={`${formId}-plan`}
                label="Phase 3 live-call plan"
                hint="Which real client calls to shadow, co-lead and lead."
                error={show("liveCallPlan")}
              >
                <Input
                  id={`${formId}-plan`}
                  value={liveCallPlan}
                  maxLength={1000}
                  required
                  placeholder={`e.g. ${LIVE_CALL_PLAN_EXAMPLE}`}
                  onChange={(event) => {
                    setLiveCallPlan(event.target.value);
                  }}
                />
              </Field>
            ) : null}
          </CardBody>
        </Card>
      </div>

      <Collapsible
        title="The recap"
        aside={
          data.recap
            ? `${gate === 2 ? `${followUpText(data.recap.followUpType)} · ` : ""}Sent ${formatDateTime(data.recap.submittedAt)}`
            : "Not sent yet"
        }
      >
        {data.recap ? (
          <div className="flex flex-col gap-3">
            <p className="text-base whitespace-pre-wrap text-fg-2">{data.recap.text}</p>
            {gate === 2 && data.recap.followUpType ? (
              <div className="flex flex-col gap-1 border-t border-line pt-3">
                <h3 className="text-sm font-medium text-fg-2">{FOLLOW_UP_LABELS[data.recap.followUpType]}</h3>
                <p className="text-base whitespace-pre-wrap text-fg-2">{data.recap.followUpText ?? ""}</p>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-muted">
            {data.engineer.name} hasn&apos;t sent the recap yet. It appears here once they do.
          </p>
        )}
      </Collapsible>
      <GateHistory history={data.history} />

      {generalError ? <Notice tone="danger">{generalError}</Notice> : null}
      <ActionBar
        status={
          tried && Object.keys(problems).length > 0
            ? "Fill in the highlighted parts first."
            : saved
              ? "Saving updates the recorded result."
              : outcome === "repeat"
                ? `Saving reopens ${repeatWeeksText(repeatWeeks) || "the repeat weeks"} as round 2.`
                : `Saving opens Day ${afterDay + 1} for the engineer.`
        }
      >
        <Button type="submit" variant="primary" disabled={blocked || save.isPending}>
          {save.isPending ? "Saving…" : "Save gate result"}
        </Button>
      </ActionBar>
    </form>
  );
}
