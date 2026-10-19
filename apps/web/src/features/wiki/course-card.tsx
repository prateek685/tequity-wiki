import { type Role } from "@portal/contracts";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { buttonVariants } from "@/components/ui/button-variants";
import { Card } from "@/components/ui/card";
import { MeterBar } from "@/components/ui/meter-bar";
import { myPlanQuery } from "@/features/learning/queries";
import { CLIENT_READY_COURSE } from "./courses";

/** A course on the wiki home: its cover, title, the engineer's progress, and where to go next. */
export function CourseCard({ role }: { role: Role }) {
  const course = CLIENT_READY_COURSE;
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-5 p-5">
        <div
          aria-hidden="true"
          className="flex h-32 w-24 shrink-0 flex-col justify-between rounded-card bg-accent p-3 text-on-accent"
        >
          <span className="h-1 w-6 rounded-full bg-accent-100" />
          <span className="flex flex-col text-xs leading-snug font-semibold">
            <span>{course.cover[0]}</span>
            <span>{course.cover[1]}</span>
          </span>
        </div>
        <div className="flex min-w-0 flex-1 basis-72 flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h3 className="text-lg font-bold">{course.title}</h3>
            <p className="text-base text-muted">{course.summary}</p>
          </div>
          {role === "engineer" ? <EngineerProgress /> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <CourseActions role={role} />
        </div>
      </div>
    </Card>
  );
}

function EngineerProgress() {
  const plan = useQuery(myPlanQuery);
  if (plan.isPending)
    return (
      <p role="status" className="text-sm text-muted">
        Loading your progress…
      </p>
    );
  // The course page shows the error; here the card simply has no progress line.
  if (plan.isError) return null;
  const total = plan.data.days.length;
  const done = plan.data.days.filter((day) => day.status === "done").length;
  return (
    <div className="flex max-w-md flex-col gap-2">
      <div className="flex justify-between text-sm text-muted">
        <span>Your progress</span>
        <span className="tabular-nums">
          {done} of {total} days
        </span>
      </div>
      <MeterBar percent={(done / Math.max(total, 1)) * 100} />
    </div>
  );
}

function CourseActions({ role }: { role: Role }) {
  const plan = useQuery({ ...myPlanQuery, enabled: role === "engineer" });
  if (role === "admin")
    return (
      <Link to="/admin/settings" className={buttonVariants({ size: "lg" })}>
        Course settings
      </Link>
    );
  const done = plan.data?.days.filter((day) => day.status === "done").length ?? 0;
  const label = role === "manager" ? "Open course" : done === 0 ? "Start" : "Resume";
  return (
    <Link
      to={role === "manager" ? "/manager" : "/app"}
      aria-label={`${label}: ${CLIENT_READY_COURSE.title}`}
      className={buttonVariants({ variant: "primary", size: "lg" })}
    >
      {label}
    </Link>
  );
}
