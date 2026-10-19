-- Friday scorecard (docs/PORTAL_PLAN.md §3 "Scoring", score #5). Written by the API when the engineer
-- saves the week's scorecard lesson (one row per enrollment and week; saving again updates it).
-- ratings = behaviour → 1–5; pillar_scores = rated pillars only (average of their behaviours, 1 decimal);
-- proof = pillar → 1–2 lines; days_completed and mocks_done are filled in by the portal.
-- RLS: the engineer reads and writes their own (on their own enrollment); the engineer's managers and
-- admins read. Nobody else sees it, and managers and admins can't change it.

-- CreateTable
CREATE TABLE "scorecards" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "enrollment_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "week" INTEGER NOT NULL,
    "day" INTEGER NOT NULL,
    "ratings" JSONB NOT NULL,
    "pillar_scores" JSONB NOT NULL,
    "proof" JSONB NOT NULL,
    "win" TEXT,
    "stuck" TEXT,
    "days_completed" INTEGER NOT NULL,
    "mocks_done" INTEGER NOT NULL,
    "submitted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scorecards_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "scorecards_user_id_idx" ON "scorecards"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "scorecards_enrollment_id_week_key" ON "scorecards"("enrollment_id", "week");

-- AddForeignKey
ALTER TABLE "scorecards" ADD CONSTRAINT "scorecards_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scorecards" ADD CONSTRAINT "scorecards_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Checks: the day lies in its week; counts are sane; JSON columns are objects.
ALTER TABLE scorecards ADD CONSTRAINT scorecards_values_valid CHECK (
  week BETWEEN 1 AND 13
  AND day BETWEEN (week - 1) * 5 + 1 AND LEAST(week * 5, 65)
  AND days_completed BETWEEN 0 AND 5
  AND mocks_done >= 0
  AND jsonb_typeof(ratings) = 'object'
  AND jsonb_typeof(pillar_scores) = 'object'
  AND jsonb_typeof(proof) = 'object');

-- Row-level security.
ALTER TABLE scorecards ENABLE ROW LEVEL SECURITY;
ALTER TABLE scorecards FORCE ROW LEVEL SECURITY;

CREATE POLICY scorecards_owner ON scorecards FOR ALL TO app_rw
  USING (user_id = app.uid())
  WITH CHECK (user_id = app.uid() AND EXISTS (
    SELECT 1 FROM enrollments e WHERE e.id = enrollment_id AND e.user_id = app.uid()));
CREATE POLICY scorecards_read ON scorecards FOR SELECT TO app_rw
  USING (app.is_admin() OR app.manages_user(user_id));

-- Grants: no DELETE (a submitted scorecard is kept).
GRANT SELECT, INSERT, UPDATE ON scorecards TO app_rw;
