import { type ContentBlock, type DayViewResponse, type Pillar, type ReadinessModel } from "@portal/contracts";
import { CornerUpLeft, Info, Play, TriangleAlert } from "lucide-react";
import { Markdown } from "@/components/ui/markdown";
import { cn } from "@/lib/cn";
import { CopyButton } from "./copy-button";
import type * as React from "react";

/** Content blocks of a lesson, as in docs/design/course-player.html. */

export const panelClass = "min-w-0 rounded-card border border-line bg-surface px-5.5 py-5";
export const labelClass = "text-xs font-semibold tracking-wider text-muted uppercase";

/** Pillar colours (globals.css pillar tints), as literal classes so Tailwind sees them. */
export const PILLAR_TONE: Record<Pillar, { top: string; left: string; dot: string }> = {
  understand: { top: "border-t-pillar-und", left: "border-l-pillar-und", dot: "bg-pillar-und" },
  communicate: { top: "border-t-pillar-com", left: "border-l-pillar-com", dot: "bg-pillar-com" },
  own: { top: "border-t-pillar-own", left: "border-l-pillar-own", dot: "bg-pillar-own" },
  stand_firm: { top: "border-t-pillar-sf", left: "border-l-pillar-sf", dot: "bg-pillar-sf" },
};

export function PillarDot({ pillar }: { pillar: Pillar }) {
  return <i aria-hidden="true" className={cn("size-2.5 shrink-0 rounded-full", PILLAR_TONE[pillar].dot)} />;
}

export function Heading({ children }: { children: React.ReactNode }) {
  return <h2 className="text-lg">{children}</h2>;
}

/** Label / value rows ("What you know before the call", facts, recalls). */
export function FactsTable({
  rows,
}: {
  rows: { label: string; value: React.ReactNode; warn?: boolean; muted?: boolean }[];
}) {
  return (
    <dl className="kv">
      {rows.map((row, index) => (
        // Labels can repeat (e.g. two "Question" rows), so the index is part of the key.
        // eslint-disable-next-line @eslint-react/no-array-index-key
        <Row key={`${row.label}-${index}`} {...row} />
      ))}
    </dl>
  );
}

function Row({
  label,
  value,
  warn,
  muted,
}: {
  label: string;
  value: React.ReactNode;
  warn?: boolean;
  muted?: boolean;
}) {
  return (
    <>
      <dt>{label}</dt>
      <dd className={cn(warn && "text-warning", muted && "text-muted")}>
        {typeof value === "string" ? <Markdown inline>{value}</Markdown> : value}
      </dd>
    </>
  );
}

const TIMELINE_COLS = ["", "grid-cols-1", "grid-cols-2", "grid-cols-3", "lg:grid-cols-4", "lg:grid-cols-5"];

function Timeline({ items }: { items: Extract<ContentBlock, { type: "timeline" }>["items"] }) {
  return (
    <ol
      className={cn(
        "grid grid-cols-3 gap-1.5 text-sm",
        items.length >= 6 ? "lg:grid-cols-6" : TIMELINE_COLS[items.length],
      )}
    >
      {items.map((item) => (
        <li
          key={item.title}
          className={cn(
            "rounded-ctl bg-subtle px-2.5 py-2 leading-snug",
            item.state === "done" && "bg-success-soft",
            item.state === "now" && "bg-accent-50 inset-ring-2 inset-ring-accent",
          )}
        >
          <b
            className={cn(
              "block text-xs font-semibold",
              item.state === "done" && "text-success",
              item.state === "now" && "text-accent-text",
            )}
          >
            {item.title}
          </b>
          {item.text}
        </li>
      ))}
    </ol>
  );
}

export function Avatar({
  initials,
  you = false,
  large = false,
}: {
  initials: string;
  you?: boolean;
  large?: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid shrink-0 place-items-center rounded-full font-bold",
        large ? "size-11 text-base" : "size-9 text-xs",
        you ? "bg-accent text-on-accent" : "bg-info-soft text-info",
      )}
    >
      {initials}
    </span>
  );
}

function People({ items }: { items: Extract<ContentBlock, { type: "people" }>["items"] }) {
  return (
    <ul className="grid grid-cols-1 gap-3 lg:grid-cols-3">
      {items.map((person) => (
        <li key={person.name} className={cn(panelClass, "flex items-start gap-3")}>
          <Avatar initials={person.initials} you={person.you} />
          <div className="min-w-0">
            <b className="block text-base font-semibold">
              {person.name}
              {person.tag ? (
                <span className="ml-1.5 inline-block rounded-full bg-accent-50 px-1.75 text-xs font-semibold text-accent-text">
                  {person.tag}
                </span>
              ) : null}
            </b>
            <span className="block text-sm text-muted">
              <Markdown inline>{person.role}</Markdown>
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Framework boxes: as many columns as items (4 stays one row on wide screens), up to 3 otherwise. */
function stepCols(count: number): string {
  if (count === 2) return "sm:grid-cols-2";
  if (count === 4) return "sm:grid-cols-2 lg:grid-cols-4";
  return "sm:grid-cols-3";
}

function Steps({ items }: { items: Extract<ContentBlock, { type: "steps" }>["items"] }) {
  return (
    <ol className={cn("grid grid-cols-1 gap-3", stepCols(items.length))}>
      {items.map((step) => (
        <li
          key={step.title}
          className="flex flex-col gap-1 rounded-card border border-line bg-surface px-3.5 py-3"
        >
          <b className="text-sm font-semibold text-accent-text">{step.title}</b>
          <span className="text-base text-fg-2">
            <Markdown inline>{step.text}</Markdown>
          </span>
        </li>
      ))}
    </ol>
  );
}

function SayBox({ tone, label, children }: { tone: "good" | "bad"; label: string; children: string }) {
  return (
    <div
      className={cn(
        "rounded-card px-3.5 py-3 text-base",
        tone === "good" ? "bg-success-soft" : "bg-danger-soft",
      )}
    >
      <span
        className={cn(
          "mb-1 block text-xs font-semibold tracking-wider uppercase",
          tone === "good" ? "text-success" : "text-danger",
        )}
      >
        {label}
      </span>
      <Markdown inline>{children}</Markdown>
    </div>
  );
}

export function Note({ tone, title, text }: { tone: "info" | "warn"; title?: string; text: string }) {
  const Icon = tone === "warn" ? TriangleAlert : Info;
  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-card px-3.5 py-3 text-base",
        tone === "warn" ? "bg-warning-soft" : "bg-info-soft",
      )}
    >
      <Icon
        aria-hidden="true"
        className={cn("mt-0.5 size-4 shrink-0", tone === "warn" ? "text-warning" : "text-info")}
      />
      <span className="min-w-0">
        {title ? <b className="font-semibold">{title} </b> : null}
        <Markdown inline>{text}</Markdown>
      </span>
    </div>
  );
}

function Watch({ url, title, meta }: { url: string; title: string; meta: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3.5 rounded-card border border-line bg-surface px-4 py-3.5 text-fg hover:bg-subtle"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-card bg-accent-50 text-accent">
        <Play aria-hidden="true" className="size-4 fill-current" />
      </span>
      <span className="min-w-0">
        <b className="block text-base font-semibold">{title}</b>
        <span className="text-sm text-muted">
          {meta}
          <span className="sr-only"> (opens in a new tab)</span>
        </span>
      </span>
    </a>
  );
}

/** The four pillars: name and summary, with the pillar colour on top. */
export function Pillars({ model }: { model: Pick<ReadinessModel, "pillars"> }) {
  return (
    <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {model.pillars.map((pillar) => (
        <li
          key={pillar.id}
          className={cn(
            "rounded-card border border-t-3 border-line bg-surface px-4 py-3.5",
            PILLAR_TONE[pillar.id].top,
          )}
        >
          <b className="block text-read font-semibold">{pillar.name}</b>
          <span className="mt-0.5 block text-base text-fg-2">
            <Markdown inline>{pillar.summary}</Markdown>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** The 14 behaviours grouped by pillar; each row opens to "Sounds like" / "Watch out for". */
export function Behaviours({ model }: { model: Pick<ReadinessModel, "pillars" | "behaviours"> }) {
  return (
    <div className="flex flex-col gap-6">
      {model.pillars.map((pillar, pillarIndex) => (
        <section key={pillar.id} aria-labelledby={`pillar-${pillar.id}`} className="flex flex-col gap-2">
          <h3 id={`pillar-${pillar.id}`} className="flex items-center gap-2 text-md">
            <PillarDot pillar={pillar.id} />
            {pillar.name}
          </h3>
          {model.behaviours
            .filter((behaviour) => behaviour.pillar === pillar.id)
            .map((behaviour, index) => (
              <details
                key={behaviour.id}
                open={pillarIndex === 0 && index === 0}
                className="group overflow-hidden rounded-card border border-line bg-surface"
              >
                <summary className="plain-summary flex cursor-pointer items-center gap-2.5 px-4 py-3 text-base font-medium">
                  <span className="w-5.5 shrink-0 text-xs font-semibold text-muted">{behaviour.id}</span>
                  <span className="min-w-0 flex-1">{behaviour.name}</span>
                  <span aria-hidden="true" className="text-lg leading-none text-muted group-open:hidden">
                    +
                  </span>
                  <span
                    aria-hidden="true"
                    className="hidden text-lg leading-none text-muted group-open:inline"
                  >
                    –
                  </span>
                </summary>
                <div className="grid grid-cols-1 gap-2.5 px-4 pb-3.5 sm:grid-cols-2">
                  <SayBox tone="good" label="✓ Sounds like">
                    {behaviour.soundsLike}
                  </SayBox>
                  <SayBox tone="bad" label="✕ Watch out for">
                    {behaviour.watchOut}
                  </SayBox>
                </div>
              </details>
            ))}
        </section>
      ))}
    </div>
  );
}

function Recall({
  block,
  recalls,
}: {
  block: Extract<ContentBlock, { type: "recall" }>;
  recalls: DayViewResponse["recalls"];
}) {
  const saved = recalls.find((entry) => entry.day === block.day && entry.lesson === block.lesson);
  return (
    <div className={panelClass}>
      <span className={labelClass}>{block.label}</span>
      <div className="mt-1.5">
        <FactsTable
          rows={block.fields.map((field) => {
            const value = saved?.values[field.id]?.trim() ?? "";
            return value
              ? { label: field.label, value: <span className="whitespace-pre-wrap">{value}</span> }
              : { label: field.label, value: `Nothing saved on Day ${block.day}.`, muted: true };
          })}
        />
      </div>
    </div>
  );
}

/** Day 1 → now per pillar (the readiness case): the Day-1 baseline next to the latest scorecard score. */
function PillarCompare({
  label,
  model,
  rows,
}: {
  label: string | undefined;
  model: ReadinessModel | undefined;
  rows: DayViewResponse["pillarNow"];
}) {
  const score = (value: number | null) => (value === null ? "–" : value.toFixed(1));
  return (
    <div className={panelClass}>
      <span className={labelClass}>{label ?? "Your self-score: Day 1 → now"}</span>
      <ul className="mt-2 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {(rows ?? []).map((row) => {
          const pillar = row.pillar as Pillar;
          return (
            <li
              key={row.pillar}
              className={cn(
                "rounded-card border border-t-3 border-line px-3.5 py-3",
                PILLAR_TONE[pillar].top,
              )}
            >
              <b className="block text-sm font-semibold">
                {model?.pillars.find((p) => p.id === pillar)?.name ?? row.pillar}
              </b>
              <span className="mt-1 block text-lg font-semibold tabular-nums">
                {score(row.dayOne)} → {score(row.now)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function LessonBlock({
  block,
  model,
  recalls = [],
  pillarNow = null,
}: {
  block: ContentBlock;
  /** Missing in the Library (no pillar or behaviour blocks there). */
  model?: ReadinessModel;
  recalls?: DayViewResponse["recalls"];
  pillarNow?: DayViewResponse["pillarNow"];
}) {
  switch (block.type) {
    case "scene":
      return (
        <div className={cn(panelClass, "flex flex-col gap-2.5")}>
          <span className="text-sm font-semibold text-accent-text">{block.when}</span>
          <Markdown className="max-w-none text-read leading-relaxed">{block.text}</Markdown>
        </div>
      );
    case "yesterday":
      return (
        <div className="flex items-start gap-2.5 border-l-3 border-line-strong py-1 pl-3.5 text-base text-muted">
          <CornerUpLeft aria-hidden="true" className="mt-1 size-3.5 shrink-0" />
          <span>
            <b className="font-semibold text-fg-2">Yesterday:</b> <Markdown inline>{block.text}</Markdown>
          </span>
        </div>
      );
    case "text":
      return <Markdown className="text-read text-fg-2">{block.text}</Markdown>;
    case "heading":
      // Sits close to the block it introduces (the article spaces blocks 24px apart).
      return (
        <div className="-mb-3.5">
          <Heading>{block.text}</Heading>
        </div>
      );
    case "facts":
      return (
        <div className={panelClass}>
          {block.label ? <span className={labelClass}>{block.label}</span> : null}
          <div className={block.label ? "mt-1.5" : undefined}>
            <FactsTable rows={block.rows} />
          </div>
        </div>
      );
    case "timeline":
      return <Timeline items={block.items} />;
    case "people":
      return <People items={block.items} />;
    case "steps":
      return <Steps items={block.items} />;
    case "compare":
      return (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <SayBox tone="bad" label={`✕ ${block.beforeLabel}`}>
            {block.before}
          </SayBox>
          <SayBox tone="good" label={`✓ ${block.afterLabel}`}>
            {block.after}
          </SayBox>
        </div>
      );
    case "example":
      return (
        <div className="rounded-card bg-success-soft px-3.5 py-3 text-read">
          <Markdown inline>{block.text}</Markdown>
        </div>
      );
    case "note":
      return <Note tone={block.tone} title={block.title} text={block.text} />;
    case "watch":
      return <Watch url={block.url} title={block.title} meta={block.meta} />;
    case "message":
      return (
        <div className="rounded-card bg-subtle px-3.5 py-3 text-base text-fg-2">
          <b className="mb-1 block text-xs font-semibold text-muted">{block.label}</b>
          <Markdown inline>{block.text}</Markdown>
        </div>
      );
    case "copy":
      return (
        <div>
          <CopyButton label={block.label} getText={() => Promise.resolve(block.text)} />
        </div>
      );
    case "pillars":
      return model ? <Pillars model={model} /> : null;
    case "behaviours":
      return model ? <Behaviours model={model} /> : null;
    case "pillarCompare":
      return <PillarCompare label={block.label} model={model} rows={pillarNow} />;
    case "recall":
      return <Recall block={block} recalls={recalls} />;
    case "field":
      // Rendered by the lesson screen (it owns the form state).
      return null;
  }
}
