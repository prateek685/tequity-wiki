import { type CardPublic, type Lesson } from "@portal/contracts";
import { Markdown } from "@/components/ui/markdown";
import { cn } from "@/lib/cn";
import { fetchCardPrompt } from "../queries";
import { Avatar, FactsTable, labelClass, panelClass } from "./blocks";
import { CopyButton } from "./copy-button";

function firstName(name: string): string {
  return name.split(" ")[0] ?? name;
}

/**
 * A mock call (docs/LESSON_FORMAT.md "Mock lessons"): the fact sheet and the client, "Make the call"
 * with the prompt copy, the safety line, then the example script folded.
 */
export function MockCard({
  day,
  lesson,
  card: cardData,
}: {
  day: number;
  lesson: Lesson;
  card: CardPublic | undefined;
}) {
  // `brief: false` (e.g. a repeat drill) shows only "Make the call".
  const card = lesson.brief ? cardData : undefined;
  return (
    <>
      {card ? (
        <div className="call-grid">
          <div className={panelClass}>
            <span className={labelClass}>What you know before the call</span>
            <div className="mt-1.5">
              <FactsTable rows={card.facts} />
            </div>
          </div>
          <div className={cn(panelClass, "flex flex-col gap-3.5")}>
            <div className="flex items-center gap-3">
              <Avatar initials={card.clientInitials} large />
              <div className="min-w-0">
                <b className="block font-semibold">{card.client}</b>
                <span className="block text-sm text-muted">
                  {card.clientRole} · Level {lesson.level ?? card.level}
                </span>
              </div>
            </div>
            <Markdown className="text-base text-fg-2">{card.clientMood}</Markdown>
            <div className="flex flex-col gap-0.5 rounded-card bg-info-soft px-3.5 py-3 text-base">
              <b className="font-semibold">Your goal</b>
              <Markdown inline>{card.yourGoal}</Markdown>
            </div>
            {card.mayAsk.length > 0 ? (
              <>
                <span className={labelClass}>{card.clientPronoun} may ask</span>
                <ul className="flex flex-col items-start gap-2">
                  {card.mayAsk.map((line) => (
                    <li key={line} className="rounded-card rounded-bl-ctl bg-subtle px-3 py-2 text-base">
                      “<Markdown inline>{line}</Markdown>”
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      <section aria-labelledby={`make-call-${lesson.id}`} className={panelClass}>
        <h2 id={`make-call-${lesson.id}`} className="mb-2.5 text-lg">
          Make the call
        </h2>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-fg-2">
            <li>
              Copy the prompt. It tells the AI to play {cardData ? firstName(cardData.client) : "the client"}.
            </li>
            <li>Paste it as text into Claude, ChatGPT or Gemini, then switch to voice mode.</li>
            <li>Speak first. When you&apos;re done, say “End the call. Give me feedback.”</li>
            {lesson.callStep ? (
              <li>
                <Markdown inline>{lesson.callStep}</Markdown>
              </li>
            ) : null}
          </ol>
          <CopyButton primary label="Copy prompt" getText={() => fetchCardPrompt(day, lesson.id)} />
        </div>
        <p className="mt-3 text-sm text-muted">
          Never put patient details, passwords or client documents into an AI tool.
        </p>
      </section>

      {card && card.script.length > 0 ? (
        <details className="group rounded-card border border-line bg-surface">
          <summary className="plain-summary flex cursor-pointer flex-wrap justify-between gap-x-3 gap-y-1 px-5 py-3.5 text-base font-semibold">
            Example script
            {lesson.scriptNote ? (
              <span className="text-sm font-normal text-muted">{lesson.scriptNote}</span>
            ) : null}
          </summary>
          <table className="script-table w-full border-collapse text-base">
            <tbody>
              {card.script.map((line) => (
                <tr key={line.step}>
                  <th
                    scope="row"
                    className="border-t border-line px-5 py-2.5 text-left align-top font-semibold text-fg-2"
                  >
                    {line.step}
                  </th>
                  <td className="border-t border-line px-5 py-2.5 align-top">
                    “<Markdown inline>{line.line}</Markdown>”
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      ) : null}
    </>
  );
}
