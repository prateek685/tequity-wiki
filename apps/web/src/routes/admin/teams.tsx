import { pageQuery } from "@portal/contracts";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Pager } from "@/components/ui/pager";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { teamsQuery } from "@/features/admin/queries";
import { AddManagerForm, CreateTeamForm, RemoveManagerButton } from "@/features/admin/team-forms";
import { pageTitle } from "@/lib/title";

export const Route = createFileRoute("/admin/teams")({
  validateSearch: pageQuery,
  // Page 1 is the default: keep it out of the URL.
  search: { middlewares: [stripSearchParams({ page: 1 })] },
  loaderDeps: ({ search }) => ({ page: search.page }),
  loader: ({ context, deps }) => context.queryClient.query(teamsQuery(deps.page)),
  head: () => pageTitle("Teams"),
  component: function TeamsPage() {
    const { page } = Route.useSearch();
    const { data } = useSuspenseQuery(teamsQuery(page));
    return (
      <>
        <PageHeader
          title="Teams"
          description="Engineers join one team (set on Users and roles). A team can have several managers; managers see only their teams."
        />
        <Card>
          <CardBody>
            <CreateTeamForm />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="All teams" aside={<span className="tabular-nums">{data.total} total</span>} />
          {data.teams.length === 0 ? (
            <CardBody>
              <p className="text-sm text-muted">No teams yet. Create the first one above.</p>
            </CardBody>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Team</Th>
                  <Th>Engineers</Th>
                  <Th>Managers</Th>
                </tr>
              </thead>
              <tbody>
                {data.teams.map((team) => {
                  const assigned = new Set(team.managers.map((manager) => manager.id));
                  return (
                    <Tr key={team.id}>
                      <Td label="Team" lead>
                        {team.name}
                      </Td>
                      <Td label="Engineers" className="tabular-nums">
                        {team.engineerCount}
                      </Td>
                      <Td label="Managers" stack>
                        <div className="flex flex-col items-start gap-2">
                          {team.managers.map((manager) => (
                            <span key={manager.id} className="flex items-center gap-1">
                              {manager.name}
                              <RemoveManagerButton teamId={team.id} manager={manager} />
                            </span>
                          ))}
                          <AddManagerForm
                            teamId={team.id}
                            options={data.managers.filter((manager) => !assigned.has(manager.id))}
                          />
                        </div>
                      </Td>
                    </Tr>
                  );
                })}
              </tbody>
            </Table>
          )}
          <Pager page={page} total={data.total} />
        </Card>
      </>
    );
  },
});
