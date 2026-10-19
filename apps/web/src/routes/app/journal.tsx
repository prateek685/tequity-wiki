import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Lock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Notice, PageHeader } from "@/components/ui/page-header";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { DayLink } from "@/features/learning/day-link";
import { journalDays } from "@/features/progress/progress";
import { journalQuery } from "@/features/progress/queries";
import { errorMessage } from "@/lib/api";
import { pageTitle } from "@/lib/title";

/** Everything the engineer wrote in lessons, newest day first (docs/design/final-mockup.html `journal()`). */
export const Route = createFileRoute("/app/journal")({
  head: () => pageTitle("Journal"),
  component: function JournalPage() {
    const journal = useQuery(journalQuery);
    const days = journal.data ? journalDays(journal.data.entries) : [];
    return (
      <>
        <PageHeader
          title="Journal"
          description={
            <span className="inline-flex items-start gap-1.5">
              <Lock aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
              Only you can read this. Your manager sees that lessons were done, not what you wrote.
            </span>
          }
        />
        {journal.isPending ? (
          <p role="status" className="text-sm text-muted">
            Loading your journal…
          </p>
        ) : journal.isError ? (
          <Notice tone="warning">{errorMessage(journal.error)}</Notice>
        ) : days.length === 0 ? (
          <Card className="px-4 py-6 text-sm text-muted">
            Nothing here yet. What you write in your lessons (notes, rewrites, reflections) collects here.
          </Card>
        ) : (
          <Card>
            <Table>
              <thead>
                <tr>
                  <Th className="w-24">Day</Th>
                  <Th className="w-1/4">Entry</Th>
                  <Th>Text</Th>
                </tr>
              </thead>
              {days.map((group) => (
                <tbody key={group.day}>
                  {group.entries.map((entry, index) => (
                    <Tr key={`${entry.lessonId}-${entry.label}-${String(index)}`}>
                      <Td label="Day" lead className={index === 0 ? "align-top" : "align-top max-md:hidden"}>
                        {index === 0 ? (
                          <>
                            <span className="block font-semibold tabular-nums">Day {entry.day}</span>
                            <span className="block text-xs font-normal text-muted">{group.storyDate}</span>
                          </>
                        ) : (
                          <span className="sr-only">Day {entry.day}</span>
                        )}
                      </Td>
                      <Td label="Entry" stack className="align-top">
                        <DayLink
                          day={entry.day}
                          lesson={entry.lessonId}
                          className="font-medium text-fg underline-offset-2 hover:text-accent-text hover:underline"
                        >
                          {entry.label}
                        </DayLink>
                        <span className="block text-xs text-muted">{entry.lessonTitle}</span>
                      </Td>
                      <Td label="Text" stack className="align-top whitespace-pre-line text-muted">
                        {entry.text}
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              ))}
            </Table>
          </Card>
        )}
      </>
    );
  },
});
