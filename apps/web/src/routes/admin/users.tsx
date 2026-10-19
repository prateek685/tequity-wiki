import { pageQuery } from "@portal/contracts";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { Card, CardHeader } from "@/components/ui/card";
import { Notice, PageHeader } from "@/components/ui/page-header";
import { Pager } from "@/components/ui/pager";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { usersQuery } from "@/features/admin/queries";
import { StatusBadge } from "@/features/admin/status-badge";
import { UserAccessForm } from "@/features/admin/user-access-form";
import { formatDate } from "@/lib/dates";
import { pageTitle } from "@/lib/title";

export const Route = createFileRoute("/admin/users")({
  validateSearch: pageQuery,
  // Page 1 is the default: keep it out of the URL.
  search: { middlewares: [stripSearchParams({ page: 1 })] },
  loaderDeps: ({ search }) => ({ page: search.page }),
  loader: ({ context, deps }) => context.queryClient.query(usersQuery(deps.page)),
  head: () => pageTitle("Users and roles"),
  component: function UsersPage() {
    const { page } = Route.useSearch();
    const { data } = useSuspenseQuery(usersQuery(page));
    return (
      <>
        <PageHeader
          title="Users and roles"
          description="Sign-in is Google only, on the company domain. New sign-ins wait here until you give them a role."
        />
        {data.pendingTotal > 0 ? (
          <Notice tone="warning">
            {data.pendingTotal} {data.pendingTotal === 1 ? "person is" : "people are"} waiting for access.
          </Notice>
        ) : null}
        <Card>
          <CardHeader title="People" aside={<span className="tabular-nums">{data.total} total</span>} />
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Status</Th>
                <Th>Finish by</Th>
                <Th>Access</Th>
              </tr>
            </thead>
            <tbody>
              {data.users.map((user) => (
                <Tr key={user.id}>
                  <Td label="Name" lead>
                    <span className="block font-medium">{user.name}</span>
                    <span className="block text-xs text-muted">{user.email}</span>
                  </Td>
                  <Td label="Status">
                    <StatusBadge status={user.status} />
                  </Td>
                  <Td label="Finish by" className="tabular-nums">
                    {user.targetDate ? formatDate(user.targetDate) : "—"}
                  </Td>
                  <Td label="Access" stack>
                    <UserAccessForm user={user} teams={data.teams} />
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
          <Pager page={page} total={data.total} />
        </Card>
        <Notice>
          Several admins are allowed. The last active admin can&apos;t be removed or disabled. Every change is
          recorded in the audit log.
        </Notice>
      </>
    );
  },
});
