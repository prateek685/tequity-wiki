-- Gate 1 and repeat blocks (docs/PORTAL_PLAN.md §1 "Repeat after a failed gate", §2, §3 "Gate pass bars",
-- §5 "gate_results"; contracts in packages/contracts/src/gates.ts).
--
-- Rounds. A day can be done more than once: round 1, then round N + 1 for the weeks a Gate result of
-- round N sends back ("repeat"). The earlier round's rows are kept. Every per-day activity row carries
-- its round:
--   * day_progress.attempt is renamed to `round` (it was always 1);
--   * step_entries, quiz_attempts (daily and assessment; `attempt` stays the retake number within the
--     round), rubric_scores, scorecards and ai_scores get `round` (default 1, so existing rows are
--     round 1), and their unique keys include it.
-- Which weeks are reopened, for which round, is not a separate table: it is `gate_results.repeat_weeks`
-- of a result with outcome 'repeat' (round N → those weeks' days are round N + 1). One source of truth,
-- so editing a result (allowed until the repeat starts) can't leave stale repeat rows behind.
--
-- New tables:
--   * gate_results  one per enrollment, gate and gate round; recorded and updated by a manager of the
--                   engineer's team; read by the engineer, their managers and admins. Criteria 1–11 live
--                   in rubric_scores (source 'gate', day = the gate's day 20/40, round = gate round).
--   * gate_recaps   the engineer's written recap per gate round (PDF: "send the recap to your manager
--                   within 2 hours"); written by the engineer until that round's result is recorded;
--                   read by the engineer, their managers and admins.
-- Nothing is deleted (no DELETE grants or policies on either table).

-- ---------------------------------------------------------------------------------------------
-- Rounds on activity tables
-- ---------------------------------------------------------------------------------------------
ALTER TABLE "day_progress" RENAME COLUMN "attempt" TO "round";
ALTER INDEX "day_progress_enrollment_id_day_attempt_key" RENAME TO "day_progress_enrollment_id_day_round_key";

ALTER TABLE "step_entries" ADD COLUMN "round" INTEGER NOT NULL DEFAULT 1;
DROP INDEX "step_entries_enrollment_id_day_lesson_id_key";
CREATE UNIQUE INDEX "step_entries_enrollment_id_day_lesson_id_round_key"
  ON "step_entries"("enrollment_id", "day", "lesson_id", "round");

ALTER TABLE "quiz_attempts" ADD COLUMN "round" INTEGER NOT NULL DEFAULT 1;
DROP INDEX "quiz_attempts_enrollment_id_kind_day_attempt_key";
CREATE UNIQUE INDEX "quiz_attempts_enrollment_id_kind_day_round_attempt_key"
  ON "quiz_attempts"("enrollment_id", "kind", "day", "round", "attempt");

ALTER TABLE "rubric_scores" ADD COLUMN "round" INTEGER NOT NULL DEFAULT 1;
DROP INDEX "rubric_scores_enrollment_id_source_day_criterion_key";
CREATE UNIQUE INDEX "rubric_scores_enrollment_id_source_day_criterion_round_key"
  ON "rubric_scores"("enrollment_id", "source", "day", "criterion", "round");

ALTER TABLE "scorecards" ADD COLUMN "round" INTEGER NOT NULL DEFAULT 1;
DROP INDEX "scorecards_enrollment_id_week_key";
CREATE UNIQUE INDEX "scorecards_enrollment_id_week_round_key" ON "scorecards"("enrollment_id", "week", "round");

ALTER TABLE "ai_scores" ADD COLUMN "round" INTEGER NOT NULL DEFAULT 1;
DROP INDEX ai_scores_lesson_key;
CREATE UNIQUE INDEX ai_scores_lesson_key ON ai_scores (enrollment_id, day, lesson_id, round) WHERE target = 'lesson';

ALTER TABLE step_entries ADD CONSTRAINT step_entries_round_valid CHECK (round >= 1);
ALTER TABLE quiz_attempts ADD CONSTRAINT quiz_attempts_round_valid CHECK (round >= 1);
ALTER TABLE rubric_scores ADD CONSTRAINT rubric_scores_round_valid CHECK (round >= 1);
ALTER TABLE scorecards ADD CONSTRAINT scorecards_round_valid CHECK (round >= 1);
ALTER TABLE ai_scores ADD CONSTRAINT ai_scores_round_valid CHECK (round >= 1);
-- day_progress_day_range already checks the renamed column (round >= 1).

-- The RLS policies and grants of these tables are column-agnostic and stay as they are.

-- ---------------------------------------------------------------------------------------------
-- gate_results
-- ---------------------------------------------------------------------------------------------
CREATE TABLE "gate_results" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "enrollment_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "gate" INTEGER NOT NULL,
    "round" INTEGER NOT NULL,
    "held_at" TIMESTAMPTZ(6) NOT NULL,
    "card_id" TEXT,
    "surprise" TEXT NOT NULL DEFAULT '',
    "scored" INTEGER NOT NULL,
    "average" DOUBLE PRECISION,
    "lowest" INTEGER,
    "recap_on_time" BOOLEAN NOT NULL,
    "outcome" TEXT NOT NULL,
    "focus_items" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "repeat_weeks" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
    "rag" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "override_note" TEXT NOT NULL DEFAULT '',
    "manager_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gate_results_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "gate_results_enrollment_id_gate_round_key" ON "gate_results"("enrollment_id", "gate", "round");
CREATE INDEX "gate_results_user_id_idx" ON "gate_results"("user_id");
CREATE INDEX "gate_results_manager_id_idx" ON "gate_results"("manager_id");

ALTER TABLE "gate_results" ADD CONSTRAINT "gate_results_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "gate_results" ADD CONSTRAINT "gate_results_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "gate_results" ADD CONSTRAINT "gate_results_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Checks: repeat ⇔ exactly 2 distinct weeks of the gate (Gate 1: Weeks 1–4, Gate 2: Weeks 5–8);
-- pass_focus ⇔ 1–2 focus items; the maths fields are consistent.
ALTER TABLE gate_results ADD CONSTRAINT gate_results_values_valid CHECK (
  gate IN (1, 2)
  AND round >= 1
  AND outcome IN ('pass', 'pass_focus', 'repeat')
  AND rag IN ('green', 'amber', 'red')
  AND length(note) BETWEEN 1 AND 300
  AND length(override_note) <= 500
  AND length(surprise) <= 500
  AND (card_id IS NULL OR card_id ~ '^[A-Z][0-9]{2}$')
  AND scored BETWEEN 0 AND 11
  AND ((scored = 0 AND average IS NULL AND lowest IS NULL)
    OR (scored > 0 AND average BETWEEN 1 AND 5 AND lowest BETWEEN 1 AND 5))
  AND (CASE WHEN outcome = 'repeat'
         THEN cardinality(repeat_weeks) = 2
              AND repeat_weeks[1] <> repeat_weeks[2]
              AND repeat_weeks <@ (CASE gate WHEN 1 THEN ARRAY[1, 2, 3, 4] ELSE ARRAY[5, 6, 7, 8] END)
         ELSE cardinality(repeat_weeks) = 0 END)
  AND (CASE WHEN outcome = 'pass_focus'
         THEN cardinality(focus_items) BETWEEN 1 AND 2
         ELSE cardinality(focus_items) = 0 END));

-- ---------------------------------------------------------------------------------------------
-- gate_recaps
-- ---------------------------------------------------------------------------------------------
CREATE TABLE "gate_recaps" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "enrollment_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "gate" INTEGER NOT NULL,
    "round" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "submitted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gate_recaps_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "gate_recaps_enrollment_id_gate_round_key" ON "gate_recaps"("enrollment_id", "gate", "round");
CREATE INDEX "gate_recaps_user_id_idx" ON "gate_recaps"("user_id");

ALTER TABLE "gate_recaps" ADD CONSTRAINT "gate_recaps_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "gate_recaps" ADD CONSTRAINT "gate_recaps_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE gate_recaps ADD CONSTRAINT gate_recaps_values_valid CHECK (
  gate IN (1, 2) AND round >= 1 AND length(text) BETWEEN 1 AND 5000);

-- ---------------------------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------------------------
ALTER TABLE gate_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE gate_results FORCE ROW LEVEL SECURITY;
ALTER TABLE gate_recaps ENABLE ROW LEVEL SECURITY;
ALTER TABLE gate_recaps FORCE ROW LEVEL SECURITY;

-- gate_results: the engineer reads their own; managers of the engineer's team and admins read. A manager
-- of the team records (and updates) a result as themselves, on the engineer's own enrollment.
CREATE POLICY gate_results_read ON gate_results FOR SELECT TO app_rw
  USING (user_id = app.uid() OR app.is_admin() OR app.manages_user(user_id));
CREATE POLICY gate_results_manager_insert ON gate_results FOR INSERT TO app_rw
  WITH CHECK (
    manager_id = app.uid()
    AND app.manages_user(user_id)
    AND EXISTS (SELECT 1 FROM enrollments e WHERE e.id = enrollment_id AND e.user_id = gate_results.user_id));
CREATE POLICY gate_results_manager_update ON gate_results FOR UPDATE TO app_rw
  USING (app.manages_user(user_id))
  WITH CHECK (manager_id = app.uid() AND app.manages_user(user_id));

-- gate_recaps: the engineer writes their own, on their own enrollment, once the gate's day is done, and
-- only while that round's result isn't recorded. The engineer, their managers and admins read.
CREATE POLICY gate_recaps_read ON gate_recaps FOR SELECT TO app_rw
  USING (user_id = app.uid() OR app.is_admin() OR app.manages_user(user_id));
CREATE POLICY gate_recaps_owner_insert ON gate_recaps FOR INSERT TO app_rw
  WITH CHECK (
    user_id = app.uid()
    AND EXISTS (SELECT 1 FROM enrollments e WHERE e.id = enrollment_id AND e.user_id = app.uid())
    AND EXISTS (
      SELECT 1 FROM day_progress p
       WHERE p.enrollment_id = gate_recaps.enrollment_id
         AND p.day = CASE gate_recaps.gate WHEN 1 THEN 20 ELSE 40 END
         AND p.completed_at IS NOT NULL)
    AND NOT EXISTS (
      SELECT 1 FROM gate_results r
       WHERE r.enrollment_id = gate_recaps.enrollment_id
         AND r.gate = gate_recaps.gate AND r.round = gate_recaps.round));
CREATE POLICY gate_recaps_owner_update ON gate_recaps FOR UPDATE TO app_rw
  USING (
    user_id = app.uid()
    AND NOT EXISTS (
      SELECT 1 FROM gate_results r
       WHERE r.enrollment_id = gate_recaps.enrollment_id
         AND r.gate = gate_recaps.gate AND r.round = gate_recaps.round))
  WITH CHECK (user_id = app.uid());

-- Grants: no DELETE. A result's owner, enrollment, gate and round never change; a recap's text can be
-- edited (submitted_at stays the first submit).
GRANT SELECT, INSERT ON gate_results, gate_recaps TO app_rw;
GRANT UPDATE (held_at, card_id, surprise, scored, average, lowest, recap_on_time, outcome, focus_items,
  repeat_weeks, rag, note, override_note, manager_id, updated_at) ON gate_results TO app_rw;
GRANT UPDATE (text, updated_at) ON gate_recaps TO app_rw;

-- rubric_scores: a manager of the engineer's team writes the gate criteria (source 'gate') as
-- themselves. Upserts only (insert or update one row per criterion and round); no delete policy.
CREATE POLICY rubric_scores_gate_insert ON rubric_scores FOR INSERT TO app_rw
  WITH CHECK (
    source = 'gate'
    AND scored_by = app.uid()
    AND app.manages_user(user_id)
    AND EXISTS (SELECT 1 FROM enrollments e WHERE e.id = enrollment_id AND e.user_id = rubric_scores.user_id));
CREATE POLICY rubric_scores_gate_update ON rubric_scores FOR UPDATE TO app_rw
  USING (source = 'gate' AND app.manages_user(user_id))
  WITH CHECK (source = 'gate' AND scored_by = app.uid() AND app.manages_user(user_id));

-- ---------------------------------------------------------------------------------------------
-- Functions
-- ---------------------------------------------------------------------------------------------

-- The Day-1 baseline is the round-1 entry (a repeated Week 1 doesn't replace the Day-1 → Day-90 baseline).
CREATE OR REPLACE FUNCTION app.baseline_ratings(p_enrollment uuid, p_lesson text)
  RETURNS TABLE (behaviour text, rating int)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT r.key, round((r.value #>> '{}')::numeric)::int
    FROM public.enrollments e
    JOIN public.step_entries s ON s.enrollment_id = e.id AND s.day = 1 AND s.lesson_id = p_lesson AND s.round = 1
    CROSS JOIN LATERAL jsonb_each(
      CASE WHEN jsonb_typeof(s.entry->'ratings') = 'object' THEN s.entry->'ratings' ELSE '{}'::jsonb END) r
   WHERE e.id = p_enrollment
     AND (e.user_id = app.uid() OR app.manages_user(e.user_id))
     AND jsonb_typeof(r.value) = 'number'
$$;

-- Author names now also cover gate results (the engineer sees who recorded their gate).
CREATE OR REPLACE FUNCTION app.author_names(p_ids uuid[])
  RETURNS TABLE (id uuid, name text)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT u.id, u.name
    FROM public.users u
   WHERE u.id = ANY(p_ids)
     AND app.user_role() IS NOT NULL
     AND (
       EXISTS (SELECT 1 FROM public.answer_reviews r WHERE r.manager_id = u.id
                 AND (r.user_id = app.uid() OR app.is_admin() OR app.manages_user(r.user_id)))
       OR EXISTS (SELECT 1 FROM public.checkins c WHERE c.manager_id = u.id
                 AND (c.user_id = app.uid() OR app.is_admin() OR app.manages_user(c.user_id)))
       OR EXISTS (SELECT 1 FROM public.manual_unlocks m WHERE m.manager_id = u.id
                 AND (m.user_id = app.uid() OR app.is_admin() OR app.manages_user(m.user_id)))
       OR EXISTS (SELECT 1 FROM public.gate_results g WHERE g.manager_id = u.id
                 AND (g.user_id = app.uid() OR app.is_admin() OR app.manages_user(g.user_id))))
$$;

REVOKE EXECUTE ON FUNCTION app.baseline_ratings(uuid, text), app.author_names(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.baseline_ratings(uuid, text), app.author_names(uuid[]) TO app_rw;
