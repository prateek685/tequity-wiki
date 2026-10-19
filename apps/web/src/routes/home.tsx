import { createFileRoute, Link } from "@tanstack/react-router";
import { WikiShell } from "@/components/shell/wiki-shell";
import { requireArea } from "@/features/auth/session";
import { CourseCard } from "@/features/wiki/course-card";
import { pageTitle } from "@/lib/title";

/** The Tequity.wiki home: every signed-in user lands here and opens a course from it. */
export const Route = createFileRoute("/home")({
  beforeLoad: async ({ context, location }) => ({
    me: await requireArea(context.queryClient, "home", location.href),
  }),
  head: () => pageTitle("Home"),
  component: function WikiHome() {
    const { me } = Route.useRouteContext();
    // Role is always set here: the guard sends users without one to the waiting page.
    const role = me.role ?? "engineer";
    const first = me.name.split(/[\s@]+/)[0] ?? me.name;
    return (
      <WikiShell user={me}>
        <h1 className="text-2xl tracking-tight">Welcome back, {first}</h1>
        <section aria-labelledby="courses-title" className="flex flex-col gap-4">
          <h2 id="courses-title" className="text-lg font-semibold">
            {role === "engineer" ? "Your courses" : "Courses"}
          </h2>
          <CourseCard role={role} />
          <p className="rounded-card border border-dashed border-line-strong px-5 py-4 text-base text-muted">
            More courses and resources will appear here as they are added.
          </p>
        </section>
        {role === "admin" ? (
          <section aria-labelledby="admin-title" className="flex flex-col gap-4">
            <h2 id="admin-title" className="text-lg font-semibold">
              Administration
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <AdminLink
                to="/admin/users"
                title="Users and roles"
                text="Who can sign in, and whether they are an engineer, manager or admin."
              />
              <AdminLink to="/admin/teams" title="Teams" text="Which managers see which engineers." />
            </div>
          </section>
        ) : null}
      </WikiShell>
    );
  },
});

function AdminLink({
  to,
  title,
  text,
}: {
  to: "/admin/users" | "/admin/teams";
  title: string;
  text: string;
}) {
  return (
    <Link
      to={to}
      className="flex flex-col gap-1 rounded-card border border-line bg-surface p-5 shadow-card hover:bg-subtle"
    >
      <span className="text-md font-semibold">{title}</span>
      <span className="text-base text-muted">{text}</span>
    </Link>
  );
}
