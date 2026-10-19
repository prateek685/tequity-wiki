import {
  type DayViewResponse,
  type FormField,
  type Lesson,
  type LessonEntry,
  type Pillar,
  type ReadinessModel,
  SCORECARD_FIELDS,
} from "@portal/contracts";
import { Info } from "lucide-react";
import { useId, useState } from "react";
import { Input } from "@/components/ui/input";
import { Markdown } from "@/components/ui/markdown";
import { ScoreScale } from "@/components/ui/score-scale";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/cn";
import { mockRubric, pillarAverages } from "../plan";
import { ratedPillars } from "../player-nav";
import { panelClass, PILLAR_TONE, PillarDot } from "./blocks";
import type * as React from "react";

/** What the engineer fills in on a lesson (docs/LESSON_FORMAT.md "Inputs"). Controlled by the lesson screen. */

export type SetEntry = (update: (entry: LessonEntry) => LessonEntry) => void;

interface InputProps {
  lesson: Lesson;
  entry: LessonEntry;
  setEntry: SetEntry;
  errors: Record<string, string>;
}

function ErrorText({ id, message }: { id: string; message: string | undefined }) {
  if (!message) return null;
  return (
    <span id={id} role="alert" className="text-sm font-normal text-danger">
      {message}
    </span>
  );
}

function TextField({
  field,
  value,
  error,
  onChange,
}: {
  field: FormField;
  value: string;
  error: string | undefined;
  onChange: (value: string) => void;
}) {
  const id = useId();
  const control = {
    id,
    value,
    placeholder: field.placeholder || undefined,
    required: field.required,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": error ? `${id}-error` : undefined,
    className: "px-3 text-base",
  } as const;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-base font-semibold">
        {field.label}
        {field.required ? null : <span className="sr-only"> (optional)</span>}
      </label>
      {field.kind === "line" ? (
        <Input
          {...control}
          maxLength={2000}
          onChange={(event) => {
            onChange(event.target.value);
          }}
        />
      ) : (
        <Textarea
          {...control}
          rows={field.rows ?? 4}
          maxLength={20_000}
          className="min-h-20 px-3 text-base"
          onChange={(event) => {
            onChange(event.target.value);
          }}
        />
      )}
      <ErrorText id={`${id}-error`} message={error} />
    </div>
  );
}

/** Field ids placed inline by `{ type: "field" }` blocks (not repeated after the blocks). */
export function inlineFieldIds(lesson: Lesson): Set<string> {
  return new Set(lesson.blocks.flatMap((block) => (block.type === "field" ? [block.id] : [])));
}

/** One field placed among the blocks (e.g. a rewrite box under each message). */
export function InlineField({ id, lesson, entry, setEntry, errors }: InputProps & { id: string }) {
  const field = lesson.fields.find((item) => item.id === id);
  if (!field) return null;
  return (
    <TextField
      field={field}
      value={entry.values[field.id] ?? ""}
      error={errors[field.id]}
      onChange={(value) => {
        setEntry((current) => ({ ...current, values: { ...current.values, [field.id]: value } }));
      }}
    />
  );
}

/** Text fields: two boxes side by side (the reflect notes), otherwise stacked in a card. */
export function Fields({ lesson, entry, setEntry, errors, skip }: InputProps & { skip?: Set<string> }) {
  const inline = inlineFieldIds(lesson);
  const rest = lesson.fields.filter((field) => !inline.has(field.id) && !skip?.has(field.id));
  if (rest.length === 0) return null;
  const pair = rest.length === 2 && rest.every((field) => field.kind === "area");
  const fields = rest.map((field) => (
    <TextField
      key={field.id}
      field={field}
      value={entry.values[field.id] ?? ""}
      error={errors[field.id]}
      onChange={(value) => {
        setEntry((current) => ({ ...current, values: { ...current.values, [field.id]: value } }));
      }}
    />
  ));
  if (pair) return <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{fields}</div>;
  return <div className={cn(panelClass, "flex flex-col gap-3.5")}>{fields}</div>;
}

export function Checks({ lesson, entry, setEntry }: InputProps) {
  const titleId = useId();
  if (lesson.checks.length === 0) return null;
  return (
    <section aria-labelledby={lesson.checksTitle ? titleId : undefined} className={panelClass}>
      {lesson.checksTitle ? (
        <h2 id={titleId} className="mb-1 text-lg">
          {lesson.checksTitle}
        </h2>
      ) : null}
      <ul>
        {lesson.checks.map((check, index) => (
          <li key={check} className="border-b border-line last:border-b-0">
            {/* The check's text is Markdown (a component), which the rule can't see. */}
            {/* eslint-disable-next-line jsx-a11y-x/label-has-associated-control */}
            <label className="flex cursor-pointer items-center gap-3 py-2.75 text-base">
              <input
                type="checkbox"
                className="size-4.25 shrink-0 accent-accent"
                checked={entry.checked.includes(index)}
                onChange={(event) => {
                  const on = event.target.checked;
                  setEntry((current) => ({
                    ...current,
                    checked: on
                      ? [...current.checked.filter((item) => item !== index), index].sort((a, b) => a - b)
                      : current.checked.filter((item) => item !== index),
                  }));
                }}
              />
              <span>
                <Markdown inline>{check}</Markdown>
              </span>
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Repeat-the-call rounds: a 1–5 score and the AI's one fix per round. */
export function Rounds({ lesson, entry, setEntry }: InputProps) {
  const id = useId();
  if (!lesson.rounds) return null;
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {entry.rounds.map((round, index) => {
        const update = (patch: Partial<LessonEntry["rounds"][number]>) => {
          setEntry((current) => ({
            ...current,
            rounds: current.rounds.map((item, at) => (at === index ? { ...item, ...patch } : item)),
          }));
        };
        return (
          // Rounds are positional.
          // eslint-disable-next-line @eslint-react/no-array-index-key
          <li key={index} className="flex flex-col gap-2.5 rounded-card border border-line bg-surface p-3.5">
            <b id={`${id}-${index}`} className="text-base font-semibold">
              Round {index + 1}
            </b>
            <ScoreScale
              large
              notScored={false}
              labelId={`${id}-${index}`}
              value={round.score ?? undefined}
              onChange={(score) => {
                update({ score });
              }}
            />
            <Input
              aria-label={`Round ${index + 1}: the AI's one fix`}
              placeholder="The AI's one fix"
              className="px-3 text-base"
              maxLength={2000}
              value={round.fix}
              onChange={(event) => {
                update({ fix: event.target.value });
              }}
            />
          </li>
        );
      })}
    </ul>
  );
}

/** One "name … [1][2][3][4][5]" row, optionally with an info toggle that opens `detail` below it. */
export function RateRow({
  label,
  note,
  value,
  notScored = false,
  detail,
  onChange,
}: {
  label: string;
  note?: string;
  value: number | null | undefined;
  notScored?: boolean;
  detail?: React.ReactNode;
  onChange: (value: number | null) => void;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  return (
    <div className="border-t border-line py-2.25 text-base first:border-t-0">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="flex min-w-0 flex-1 items-center gap-1.5">
          <span id={id}>
            {label}
            {note ? <span className="text-sm text-muted"> · {note}</span> : null}
          </span>
          {detail ? (
            <button
              type="button"
              aria-expanded={open}
              aria-controls={`${id}-detail`}
              aria-label={`What the scores mean: ${label}`}
              title="What the scores mean"
              className="grid size-6 shrink-0 place-items-center rounded-ctl text-muted hover:bg-subtle hover:text-fg"
              onClick={() => {
                setOpen((current) => !current);
              }}
            >
              <Info aria-hidden="true" className="size-3.5" />
            </button>
          ) : null}
        </span>
        <ScoreScale large notScored={notScored} labelId={id} value={value} onChange={onChange} />
      </div>
      {detail ? (
        <div
          id={`${id}-detail`}
          hidden={!open}
          className="mt-2 rounded-ctl bg-subtle px-3 py-2 text-sm text-fg-2"
        >
          {detail}
        </div>
      ) : null}
    </div>
  );
}

/** What 1, 3 and 5 mean for a rubric criterion; 2 and 4 sit between. */
export function Anchors({ anchors }: { anchors: ReadinessModel["rubric"][number]["anchors"] }) {
  return (
    <ul className="flex flex-col gap-1">
      {(
        [
          ["1", anchors.one],
          ["3", anchors.three],
          ["5", anchors.five],
        ] as const
      ).map(([score, text]) => (
        <li key={score}>
          <b className="font-semibold tabular-nums">{score}</b> — <Markdown inline>{text}</Markdown>
        </li>
      ))}
      <li className="text-muted">2 and 4 sit between.</li>
    </ul>
  );
}

/** Reflect: score the call on criteria 1–10 (at least one; n/a for what didn't come up). */
export function Rubric({ lesson, entry, setEntry, errors, model }: InputProps & { model: ReadinessModel }) {
  const titleId = useId();
  if (!lesson.rubric) return null;
  const filled = Object.values(entry.rubric).filter((score) => score !== null).length;
  return (
    <section aria-labelledby={titleId} className={cn(panelClass, "py-4")}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id={titleId} className="text-lg">
          Score the call
        </h2>
        <span className="text-sm text-muted tabular-nums">{filled} of 10 scored</span>
      </div>
      <p className="mb-1.5 text-sm text-muted">
        Use the AI&apos;s feedback as a guide. Skip what didn&apos;t come up (n/a).
      </p>
      {errors.rubric ? (
        <p role="alert" className="pb-1.5 text-sm text-danger">
          {errors.rubric}
        </p>
      ) : null}
      {mockRubric(model).map((criterion) => (
        <RateRow
          key={criterion.number}
          label={`${criterion.number}. ${criterion.name}`}
          notScored
          detail={<Anchors anchors={criterion.anchors} />}
          value={entry.rubric[String(criterion.number)]}
          onChange={(score) => {
            setEntry((current) => ({
              ...current,
              rubric: { ...current.rubric, [String(criterion.number)]: score },
            }));
          }}
        />
      ))}
    </section>
  );
}

/** The 1–5 self-rating scale and what each score means. */
function ScaleStrip({ model }: { model: Pick<ReadinessModel, "scale"> }) {
  return (
    <ol aria-label="The 1–5 scale" className="grid grid-cols-1 gap-2 text-sm text-fg-2 sm:grid-cols-5">
      {model.scale.map((level) => (
        <li key={level.score} className="rounded-ctl bg-subtle px-2.5 py-2 leading-snug">
          <b className="mr-1 text-fg tabular-nums">{level.score}</b>
          <Markdown inline>{level.meaning}</Markdown>
        </li>
      ))}
    </ol>
  );
}

function setRating(setEntry: SetEntry, id: string) {
  return (score: number | null) => {
    if (score === null) return;
    setEntry((current) => ({ ...current, ratings: { ...current.ratings, [id]: score } }));
  };
}

/** Rate: the 1–5 scale, live pillar averages, then all 14 behaviours by pillar. */
export function Baseline({ lesson, entry, setEntry, errors, model }: InputProps & { model: ReadinessModel }) {
  if (!lesson.baseline) return null;
  const averages = pillarAverages(model, entry.ratings);
  return (
    <>
      <ScaleStrip model={model} />
      <ul aria-label="Your averages" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {averages.map((pillar) => (
          <li
            key={pillar.id}
            className={cn(
              "rounded-card border border-l-3 border-line bg-surface px-3.5 py-3",
              PILLAR_TONE[pillar.id].left,
            )}
          >
            <span className="text-sm text-muted">{pillar.name}</span>
            <b className="block text-xl font-semibold tabular-nums">
              {pillar.average === null ? "–" : pillar.average.toFixed(1)} / 5
            </b>
          </li>
        ))}
      </ul>
      {errors.ratings ? (
        <p role="alert" className="text-sm text-danger">
          {errors.ratings}
        </p>
      ) : null}
      <div className="flex flex-col gap-4">
        {model.pillars.map((pillar) => (
          <section key={pillar.id} aria-labelledby={`rate-${pillar.id}`} className={cn(panelClass, "py-4")}>
            <h2 id={`rate-${pillar.id}`} className="mb-1.5 flex items-center gap-2 text-lg">
              <PillarDot pillar={pillar.id} />
              {pillar.name}
            </h2>
            {model.behaviours
              .filter((behaviour) => behaviour.pillar === pillar.id)
              .map((behaviour) => (
                <RateRow
                  key={behaviour.id}
                  label={behaviour.name}
                  value={entry.ratings[behaviour.id]}
                  onChange={setRating(setEntry, behaviour.id)}
                />
              ))}
          </section>
        ))}
      </div>
    </>
  );
}

/** Field ids the scorecard draws itself (proof per pillar, win, stuck): not repeated by `Fields`. */
export function scorecardFieldIds(model: Pick<ReadinessModel, "pillars">): Set<string> {
  return new Set([
    ...model.pillars.map((pillar) => SCORECARD_FIELDS.proof(pillar.id)),
    SCORECARD_FIELDS.win,
    SCORECARD_FIELDS.stuck,
  ]);
}

function ProofField({
  pillar,
  name,
  entry,
  setEntry,
  error,
}: {
  pillar: Pillar;
  name: string;
  entry: LessonEntry;
  setEntry: SetEntry;
  error: string | undefined;
}) {
  const id = useId();
  const key = SCORECARD_FIELDS.proof(pillar);
  return (
    <div className="flex flex-col gap-1.5 border-t border-line pt-3">
      <label htmlFor={id} className="text-base font-semibold">
        Proof<span className="sr-only"> for {name}</span>
      </label>
      <span id={`${id}-hint`} className="text-sm text-muted">
        What did you learn or struggle with? 1–2 lines.
      </span>
      <Textarea
        id={id}
        rows={2}
        maxLength={2000}
        required
        value={entry.values[key] ?? ""}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-hint ${id}-error` : `${id}-hint`}
        className="min-h-16 px-3 text-base"
        onChange={(event) => {
          const value = event.target.value;
          setEntry((current) => ({ ...current, values: { ...current.values, [key]: value } }));
        }}
      />
      <ErrorText id={`${id}-error`} message={error} />
    </div>
  );
}

/**
 * Friday scorecard: per pillar with listed behaviours, a live pillar score (average of its rated
 * behaviours) next to its Day-1 average, the behaviours 1–5 with "Day 1: n", and one line of proof.
 * Other pillars carry forward. Then the week's facts, filled in by the portal.
 */
export function Scorecard({
  lesson,
  entry,
  setEntry,
  errors,
  model,
  baseline,
  weekStats,
}: InputProps & {
  model: ReadinessModel;
  baseline: DayViewResponse["baseline"];
  weekStats: DayViewResponse["weekStats"];
}) {
  if (lesson.scorecard.length === 0) return null;
  const pillars = ratedPillars(lesson.scorecard, model.behaviours);
  const listed = model.behaviours.filter((behaviour) => lesson.scorecard.includes(behaviour.id));
  const now = pillarAverages({ pillars: model.pillars, behaviours: listed }, entry.ratings);
  const dayOne = baseline ? pillarAverages(model, baseline) : null;
  return (
    <>
      <ScaleStrip model={model} />
      {errors.ratings ? (
        <p role="alert" className="text-sm text-danger">
          {errors.ratings}
        </p>
      ) : null}
      <div className="flex flex-col gap-4">
        {pillars.map((pillarId) => {
          const pillar = model.pillars.find((item) => item.id === pillarId);
          const name = pillar?.name ?? pillarId;
          const score = now.find((item) => item.id === pillarId)?.average ?? null;
          const before = dayOne?.find((item) => item.id === pillarId)?.average ?? null;
          return (
            <section
              key={pillarId}
              aria-labelledby={`card-${pillarId}`}
              className={cn(panelClass, "flex flex-col gap-1 py-4")}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <h2 id={`card-${pillarId}`} className="flex items-center gap-2 text-lg">
                  <PillarDot pillar={pillarId} />
                  {name}
                </h2>
                <p className="text-sm text-muted tabular-nums">
                  <b className="text-lg font-semibold text-fg">{score === null ? "–" : score.toFixed(1)}</b> /
                  5{before === null ? null : <> · Day 1: {before.toFixed(1)}</>}
                </p>
              </div>
              <div>
                {listed
                  .filter((behaviour) => behaviour.pillar === pillarId)
                  .map((behaviour) => {
                    const was = baseline?.[behaviour.id];
                    return (
                      <RateRow
                        key={behaviour.id}
                        label={behaviour.name}
                        note={was === undefined ? undefined : `Day 1: ${was}`}
                        value={entry.ratings[behaviour.id]}
                        onChange={setRating(setEntry, behaviour.id)}
                      />
                    );
                  })}
              </div>
              <ProofField
                pillar={pillarId}
                name={name}
                entry={entry}
                setEntry={setEntry}
                error={errors[SCORECARD_FIELDS.proof(pillarId)]}
              />
            </section>
          );
        })}
      </div>
      <p className="text-sm text-muted">Other pillars carry forward their last score.</p>
      {weekStats ? (
        <p className="text-sm text-fg-2 tabular-nums">
          <span className="text-muted">This week:</span> Days completed {weekStats.daysCompleted} / 5 · Mocks
          done {weekStats.mocksDone}
        </p>
      ) : null}
    </>
  );
}

/** Scorecard: "Biggest win this week" and "Where I'm stuck / what help I need" (optional). */
export function ScorecardNotes({ lesson, entry, setEntry, errors }: InputProps) {
  if (lesson.scorecard.length === 0) return null;
  const notes: FormField[] = [
    {
      id: SCORECARD_FIELDS.win,
      label: "Biggest win this week",
      kind: "area",
      placeholder: "",
      rows: 2,
      required: false,
    },
    {
      id: SCORECARD_FIELDS.stuck,
      label: "Where I'm stuck / what help I need",
      kind: "area",
      placeholder: "",
      rows: 2,
      required: false,
    },
  ];
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {notes.map((field) => (
        <TextField
          key={field.id}
          field={field}
          value={entry.values[field.id] ?? ""}
          error={errors[field.id]}
          onChange={(value) => {
            setEntry((current) => ({ ...current, values: { ...current.values, [field.id]: value } }));
          }}
        />
      ))}
    </div>
  );
}

/**
 * Write lessons with `source: both | real_project`: "I used my own project's material" (optional). Real
 * project answers aren't AI-scored while `ai.scoreRealProjectAnswers` is off.
 */
export function RealProjectCheck({ lesson, entry, setEntry }: Omit<InputProps, "errors">) {
  const id = useId();
  if (lesson.kind !== "write" || lesson.source === "carebook") return null;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="flex cursor-pointer items-center gap-3 text-base">
        <input
          id={id}
          type="checkbox"
          aria-describedby={`${id}-hint`}
          className="size-4.25 shrink-0 accent-accent"
          checked={entry.realProject}
          onChange={(event) => {
            const on = event.target.checked;
            setEntry((current) => ({ ...current, realProject: on }));
          }}
        />
        I used my own project&apos;s material
      </label>
      <span id={`${id}-hint`} className="pl-7.25 text-sm text-muted">
        Optional. Leave it unticked if you used the CareBook story.
      </span>
    </div>
  );
}
