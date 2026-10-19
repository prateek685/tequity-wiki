import {
  type CardPublic,
  type Lesson,
  type LessonEntry,
  LIVE_PATH_LABELS,
  LIVE_PATHS,
  LIVE_ROLE_LABELS,
  type LivePath,
} from "@portal/contracts";
import { RadioGroup as RadioGroupPrimitive } from "radix-ui";
import { Badge } from "@/components/ui/badge";
import { Markdown } from "@/components/ui/markdown";
import { Heading, Note } from "./blocks";
import { MockCard } from "./mock-card";

/** What each path means for the rest of the day. */
const PATH_HINTS: Record<LivePath, string> = {
  had_call: "Fill in the call sheet below.",
  shadowed_other: "Another team's client call counts too. Fill in the call sheet for it.",
  later:
    "The next day still opens. Come back and update this once the call has happened: it must be done before your final review.",
  substitute: "Run the mock below instead, then fill in the call sheet for it.",
};

/**
 * A Phase 3 live-call lesson (docs/PORTAL_PLAN.md §2 "Live-call days"): today's role, the live-call plan the
 * manager recorded at Gate 2, and what happened (had the call / another team's call / later / substitute
 * mock). The substitute shows its mock card. The call sheet fields follow (rendered by the lesson inputs).
 */
export function LiveCall({
  day,
  lesson,
  card,
  plan,
  entry,
  setEntry,
  error,
}: {
  day: number;
  lesson: Lesson;
  card: CardPublic | undefined;
  plan: string | null;
  entry: LessonEntry;
  setEntry: (entry: LessonEntry) => void;
  error: string | undefined;
}) {
  const labelId = `${lesson.id}-path`;
  return (
    <>
      <div className="flex flex-wrap items-center gap-2 text-sm text-fg-2">
        <span>Your role today:</span>
        {lesson.liveRole ? <Badge tone="info">{LIVE_ROLE_LABELS[lesson.liveRole]}</Badge> : null}
      </div>
      {plan ? (
        <Note tone="info" title="Your live-call plan (agreed at Gate 2)" text={plan} />
      ) : (
        <Note
          tone="info"
          title="No live-call plan yet"
          text="Agree with your manager which real calls you'll shadow, co-lead and lead."
        />
      )}
      <div className="flex flex-col gap-2">
        <Heading>
          <span id={labelId}>What happened with today&apos;s live call?</span>
        </Heading>
        <RadioGroupPrimitive.Root
          aria-labelledby={labelId}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${labelId}-error` : undefined}
          value={entry.livePath ?? ""}
          onValueChange={(value) => {
            setEntry({ ...entry, livePath: value as LivePath });
          }}
          className="grid grid-cols-1 gap-2 sm:grid-cols-2"
        >
          {LIVE_PATHS.map((path) => (
            <RadioGroupPrimitive.Item
              key={path}
              value={path}
              className="flex flex-col items-start gap-0.5 rounded-card border border-line-strong bg-surface p-3 text-left hover:bg-subtle state-checked:border-accent state-checked:bg-accent-50"
            >
              <b className="text-sm font-semibold">{LIVE_PATH_LABELS[path]}</b>
              <span className="text-xs text-fg-2">{PATH_HINTS[path]}</span>
            </RadioGroupPrimitive.Item>
          ))}
        </RadioGroupPrimitive.Root>
        {error ? (
          <p id={`${labelId}-error`} role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
      </div>
      {entry.livePath === "substitute" ? (
        <>
          {lesson.fallback ? (
            <Markdown className="max-w-prose text-read text-fg-2">{lesson.fallback}</Markdown>
          ) : null}
          <MockCard day={day} lesson={lesson} card={card} />
        </>
      ) : null}
    </>
  );
}
