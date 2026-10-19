import { type LibraryResponse } from "@portal/contracts";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Collapsible } from "@/components/ui/collapsible";
import { Markdown } from "@/components/ui/markdown";
import { Notice, PageHeader } from "@/components/ui/page-header";
import { FactsTable, LessonBlock } from "@/features/learning/player/blocks";
import { LIBRARY_SECTIONS, type LibrarySection, SECTION_LABELS } from "@/features/library/library";
import { libraryQuery } from "@/features/library/queries";
import { errorMessage } from "@/lib/api";
import { pageTitle } from "@/lib/title";

/** One Library section: its entries (or the mock cards), frameworks and mock cards open in place; the rest are shown in full. */
export const Route = createFileRoute("/app/library/$section")({
  params: {
    parse: (params: { section: string }): { section: LibrarySection } => ({
      section: z.enum(LIBRARY_SECTIONS).parse(params.section),
    }),
    stringify: (params: { section: LibrarySection }) => ({ section: params.section }),
  },
  head: ({ params }) => pageTitle(SECTION_LABELS[params.section]),
  component: function LibrarySectionPage() {
    const { section } = Route.useParams();
    const library = useQuery(libraryQuery);
    return (
      <>
        <PageHeader
          eyebrow="Library"
          title={SECTION_LABELS[section]}
          actions={
            <Link to="/app/library" className={buttonVariants()}>
              <ArrowLeft aria-hidden="true" className="size-4" />
              Library
            </Link>
          }
        />
        {library.isPending ? (
          <p role="status" className="text-sm text-muted">
            Loading…
          </p>
        ) : library.isError ? (
          <Notice tone="warning">{errorMessage(library.error)}</Notice>
        ) : section === "cards" ? (
          <Cards cards={library.data.cards} />
        ) : (
          <Entries
            entries={library.data.entries.filter((entry) => entry.kind === section)}
            collapsible={section === "framework"}
          />
        )}
      </>
    );
  },
});

function Empty() {
  return <Card className="px-4 py-6 text-sm text-muted">Nothing here yet.</Card>;
}

function Entries({ entries, collapsible }: { entries: LibraryResponse["entries"]; collapsible: boolean }) {
  if (entries.length === 0) return <Empty />;
  return (
    <ul className="flex flex-col gap-4">
      {entries.map((entry) => {
        const title = (
          <span className="flex flex-wrap items-baseline gap-x-2">
            {entry.ref ? <span className="text-muted tabular-nums">{entry.ref}</span> : null}
            {entry.title}
          </span>
        );
        const aside = entry.day ? `From Day ${entry.day}` : undefined;
        const body = (
          <>
            <Markdown className="text-base text-fg-2">{entry.summary}</Markdown>
            {entry.blocks.map((block, at) => (
              // Blocks have no ids; their order is fixed by the content file.
              // eslint-disable-next-line @eslint-react/no-array-index-key
              <LessonBlock key={at} block={block} />
            ))}
          </>
        );
        return (
          <li key={entry.id}>
            {collapsible ? (
              <Collapsible title={title} aside={aside}>
                <div className="flex flex-col gap-4">{body}</div>
              </Collapsible>
            ) : (
              <Card>
                <CardHeader title={title} aside={aside} />
                <CardBody>{body}</CardBody>
              </Card>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Mock cards: the public side only (the AI prompt is copied from the day's lesson). */
function Cards({ cards }: { cards: LibraryResponse["cards"] }) {
  if (cards.length === 0) return <Empty />;
  return (
    <ul className="flex flex-col gap-2">
      {cards.map((card) => (
        <li key={card.id}>
          <Collapsible
            title={
              <span className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-muted tabular-nums">{card.id}</span>
                {card.title}
              </span>
            }
            aside={
              <span className="flex items-center gap-2 tabular-nums">
                <Badge>Level {card.level}</Badge>
                {card.day ? `Day ${card.day}` : null}
              </span>
            }
          >
            <div className="flex flex-col gap-3 text-base">
              <p className="text-fg-2">
                <b className="font-semibold text-fg">{card.client}</b> · {card.clientRole}
              </p>
              <Markdown className="text-fg-2">{card.storySoFar}</Markdown>
              <FactsTable rows={card.facts} />
              <p>
                <b className="font-semibold">Your goal:</b> <Markdown inline>{card.yourGoal}</Markdown>
              </p>
              {card.day ? (
                <p className="text-sm text-muted">
                  To run it with the AI client, open it on{" "}
                  <Link
                    to="/app/day/$day"
                    params={{ day: card.day }}
                    preload={false}
                    className="text-accent-text underline underline-offset-2"
                  >
                    Day {card.day}
                  </Link>
                  .
                </p>
              ) : null}
            </div>
          </Collapsible>
        </li>
      ))}
    </ul>
  );
}
