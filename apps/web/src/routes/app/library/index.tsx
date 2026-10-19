import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Notice, PageHeader } from "@/components/ui/page-header";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { sectionRows } from "@/features/library/library";
import { libraryQuery } from "@/features/library/queries";
import { errorMessage } from "@/lib/api";
import { pageTitle } from "@/lib/title";

/** The Library index (docs/design/final-mockup.html `library()`): one row per section. */
export const Route = createFileRoute("/app/library/")({
  head: () => pageTitle("Library"),
  component: function LibraryPage() {
    const library = useQuery(libraryQuery);
    return (
      <>
        <PageHeader
          title="Library"
          description="Frameworks, templates, AI prompts, the glossary and every mock card, in one place."
        />
        {library.isPending ? (
          <p role="status" className="text-sm text-muted">
            Loading the library…
          </p>
        ) : library.isError ? (
          <Notice tone="warning">{errorMessage(library.error)}</Notice>
        ) : (
          <Card>
            <Table>
              <thead>
                <tr>
                  <Th className="w-48">Section</Th>
                  <Th>What&apos;s inside</Th>
                  <Th className="text-right">Items</Th>
                </tr>
              </thead>
              <tbody>
                {sectionRows(library.data).map((row) => (
                  <Tr key={row.section}>
                    <Td label="Section" lead>
                      <Link
                        to="/app/library/$section"
                        params={{ section: row.section }}
                        className="font-medium text-fg underline-offset-2 hover:text-accent-text hover:underline"
                      >
                        {row.label}
                      </Link>
                    </Td>
                    <Td label="Inside" className="text-fg-2">
                      {row.inside || <span className="text-muted">Coming soon</span>}
                    </Td>
                    <Td label="Items" className="text-right tabular-nums">
                      {row.count}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </Card>
        )}
      </>
    );
  },
});
