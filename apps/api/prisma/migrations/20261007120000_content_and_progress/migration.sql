-- M1: content (imported from content/ by `pnpm content:import`) and the first engineer activity
-- tables (docs/M1_SPEC.md "Data and privacy", docs/PORTAL_PLAN.md §5). Tables first (as Prisma
-- generates them), then checks, row-level security, grants and app.card_prompt().

-- CreateEnum
CREATE TYPE "question_status" AS ENUM ('draft', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "quiz_kind" AS ENUM ('daily', 'assessment');

-- CreateTable
CREATE TABLE "content_plan" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "data" JSONB NOT NULL,
    "content_hash" TEXT NOT NULL,
    "imported_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_blocks" (
    "number" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "content_hash" TEXT NOT NULL,
    "imported_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_blocks_pkey" PRIMARY KEY ("number")
);

-- CreateTable
CREATE TABLE "content_days" (
    "day" INTEGER NOT NULL,
    "block_number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "write_scoring" JSONB,
    "content_hash" TEXT NOT NULL,
    "reviewed" BOOLEAN NOT NULL DEFAULT false,
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "imported_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_days_pkey" PRIMARY KEY ("day")
);

-- CreateTable
CREATE TABLE "content_cards" (
    "id" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "content_hash" TEXT NOT NULL,
    "imported_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_card_prompts" (
    "card_id" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,

    CONSTRAINT "content_card_prompts_pkey" PRIMARY KEY ("card_id")
);

-- CreateTable
CREATE TABLE "content_library" (
    "kind" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "content_hash" TEXT NOT NULL,
    "imported_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_library_pkey" PRIMARY KEY ("kind","id")
);

-- CreateTable
CREATE TABLE "questions" (
    "id" TEXT NOT NULL,
    "pool" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" "question_status" NOT NULL DEFAULT 'draft',
    "version" INTEGER NOT NULL DEFAULT 1,
    "data" JSONB NOT NULL,
    "content_hash" TEXT NOT NULL,
    "review_note" TEXT,
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "imported_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "day_progress" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "enrollment_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "day" INTEGER NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "opened_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),

    CONSTRAINT "day_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "step_entries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "enrollment_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "day" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "entry" JSONB NOT NULL,
    "done_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "step_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rubric_scores" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "enrollment_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "scored_by" UUID NOT NULL,
    "source" TEXT NOT NULL,
    "day" INTEGER NOT NULL,
    "criterion" INTEGER NOT NULL,
    "score" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rubric_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quiz_attempts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "enrollment_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "kind" "quiz_kind" NOT NULL,
    "day" INTEGER NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),

    CONSTRAINT "quiz_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quiz_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "attempt_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "kind" "quiz_kind" NOT NULL,
    "position" INTEGER NOT NULL,
    "question_id" TEXT NOT NULL,
    "question_version" INTEGER NOT NULL,
    "question_data" JSONB NOT NULL,
    "choice" INTEGER,
    "correct" BOOLEAN,
    "text_answer" TEXT,
    "score_status" TEXT NOT NULL DEFAULT 'not_applicable',
    "answered_at" TIMESTAMPTZ(6),

    CONSTRAINT "quiz_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "content_days_block_number_idx" ON "content_days"("block_number");

-- CreateIndex
CREATE INDEX "content_days_reviewed_by_idx" ON "content_days"("reviewed_by");

-- CreateIndex
CREATE INDEX "questions_pool_status_idx" ON "questions"("pool", "status");

-- CreateIndex
CREATE INDEX "questions_reviewed_by_idx" ON "questions"("reviewed_by");

-- CreateIndex
CREATE INDEX "day_progress_user_id_idx" ON "day_progress"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "day_progress_enrollment_id_day_attempt_key" ON "day_progress"("enrollment_id", "day", "attempt");

-- CreateIndex
CREATE INDEX "step_entries_user_id_idx" ON "step_entries"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "step_entries_enrollment_id_day_kind_key" ON "step_entries"("enrollment_id", "day", "kind");

-- CreateIndex
CREATE INDEX "rubric_scores_user_id_idx" ON "rubric_scores"("user_id");

-- CreateIndex
CREATE INDEX "rubric_scores_scored_by_idx" ON "rubric_scores"("scored_by");

-- CreateIndex
CREATE UNIQUE INDEX "rubric_scores_enrollment_id_source_day_criterion_key" ON "rubric_scores"("enrollment_id", "source", "day", "criterion");

-- CreateIndex
CREATE INDEX "quiz_attempts_user_id_idx" ON "quiz_attempts"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "quiz_attempts_enrollment_id_kind_day_attempt_key" ON "quiz_attempts"("enrollment_id", "kind", "day", "attempt");

-- CreateIndex
CREATE INDEX "quiz_items_question_id_idx" ON "quiz_items"("question_id");

-- CreateIndex
CREATE INDEX "quiz_items_user_id_idx" ON "quiz_items"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "quiz_items_attempt_id_position_key" ON "quiz_items"("attempt_id", "position");

-- AddForeignKey
ALTER TABLE "content_days" ADD CONSTRAINT "content_days_block_number_fkey" FOREIGN KEY ("block_number") REFERENCES "content_blocks"("number") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_days" ADD CONSTRAINT "content_days_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_card_prompts" ADD CONSTRAINT "content_card_prompts_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "content_cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "day_progress" ADD CONSTRAINT "day_progress_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "day_progress" ADD CONSTRAINT "day_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "step_entries" ADD CONSTRAINT "step_entries_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "step_entries" ADD CONSTRAINT "step_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rubric_scores" ADD CONSTRAINT "rubric_scores_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rubric_scores" ADD CONSTRAINT "rubric_scores_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rubric_scores" ADD CONSTRAINT "rubric_scores_scored_by_fkey" FOREIGN KEY ("scored_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_items" ADD CONSTRAINT "quiz_items_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "quiz_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_items" ADD CONSTRAINT "quiz_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_items" ADD CONSTRAINT "quiz_items_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------------------------
-- Checks (the import validates shapes with zod; these keep key columns sane).
-- ---------------------------------------------------------------------------------------------
ALTER TABLE content_plan ADD CONSTRAINT content_plan_single_row CHECK (id = 1);
ALTER TABLE content_blocks ADD CONSTRAINT content_blocks_number_range CHECK (number BETWEEN 1 AND 13);
ALTER TABLE content_days ADD CONSTRAINT content_days_day_range CHECK (day BETWEEN 1 AND 65);
ALTER TABLE content_days ADD CONSTRAINT content_days_type_valid
  CHECK (type IN ('normal', 'live_call', 'real_action', 'final_review'));
ALTER TABLE content_days ADD CONSTRAINT content_days_review_consistent
  CHECK (reviewed OR (reviewed_by IS NULL AND reviewed_at IS NULL));
ALTER TABLE content_library ADD CONSTRAINT content_library_kind_valid CHECK (kind IN ('section', 'template', 'prompt'));
ALTER TABLE questions ADD CONSTRAINT questions_pool_valid CHECK (pool ~ '^(day|assessment)-[0-9]{2}$');
ALTER TABLE questions ADD CONSTRAINT questions_type_valid CHECK (type IN ('mcq', 'scenario', 'written'));
ALTER TABLE questions ADD CONSTRAINT questions_version_positive CHECK (version >= 1);
ALTER TABLE questions ADD CONSTRAINT questions_rejection_has_note
  CHECK (status <> 'rejected' OR coalesce(length(trim(review_note)), 0) > 0);

ALTER TABLE day_progress ADD CONSTRAINT day_progress_day_range CHECK (day BETWEEN 1 AND 65 AND attempt >= 1);
ALTER TABLE step_entries ADD CONSTRAINT step_entries_day_range CHECK (day BETWEEN 1 AND 65);
ALTER TABLE step_entries ADD CONSTRAINT step_entries_kind_valid CHECK (kind IN ('prep', 'learn', 'mock', 'write'));
ALTER TABLE rubric_scores ADD CONSTRAINT rubric_scores_values_valid
  CHECK (criterion BETWEEN 1 AND 11 AND (score IS NULL OR score BETWEEN 1 AND 5) AND day BETWEEN 1 AND 65);
ALTER TABLE rubric_scores ADD CONSTRAINT rubric_scores_source_valid CHECK (source IN ('mock_self', 'gate'));
ALTER TABLE quiz_attempts ADD CONSTRAINT quiz_attempts_day_range CHECK (day BETWEEN 1 AND 65 AND attempt >= 1);
ALTER TABLE quiz_items ADD CONSTRAINT quiz_items_values_valid
  CHECK (position >= 0 AND (choice IS NULL OR choice BETWEEN 0 AND 3));
ALTER TABLE quiz_items ADD CONSTRAINT quiz_items_score_status_valid
  CHECK (score_status IN ('not_applicable', 'pending', 'scored', 'failed'));

-- ---------------------------------------------------------------------------------------------
-- Row-level security: every new table, ENABLE + FORCE.
-- ---------------------------------------------------------------------------------------------
ALTER TABLE content_plan ENABLE ROW LEVEL SECURITY;          ALTER TABLE content_plan FORCE ROW LEVEL SECURITY;
ALTER TABLE content_blocks ENABLE ROW LEVEL SECURITY;        ALTER TABLE content_blocks FORCE ROW LEVEL SECURITY;
ALTER TABLE content_days ENABLE ROW LEVEL SECURITY;          ALTER TABLE content_days FORCE ROW LEVEL SECURITY;
ALTER TABLE content_cards ENABLE ROW LEVEL SECURITY;         ALTER TABLE content_cards FORCE ROW LEVEL SECURITY;
ALTER TABLE content_card_prompts ENABLE ROW LEVEL SECURITY;  ALTER TABLE content_card_prompts FORCE ROW LEVEL SECURITY;
ALTER TABLE content_library ENABLE ROW LEVEL SECURITY;       ALTER TABLE content_library FORCE ROW LEVEL SECURITY;
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;             ALTER TABLE questions FORCE ROW LEVEL SECURITY;
ALTER TABLE day_progress ENABLE ROW LEVEL SECURITY;          ALTER TABLE day_progress FORCE ROW LEVEL SECURITY;
ALTER TABLE step_entries ENABLE ROW LEVEL SECURITY;          ALTER TABLE step_entries FORCE ROW LEVEL SECURITY;
ALTER TABLE rubric_scores ENABLE ROW LEVEL SECURITY;         ALTER TABLE rubric_scores FORCE ROW LEVEL SECURITY;
ALTER TABLE quiz_attempts ENABLE ROW LEVEL SECURITY;         ALTER TABLE quiz_attempts FORCE ROW LEVEL SECURITY;
ALTER TABLE quiz_items ENABLE ROW LEVEL SECURITY;            ALTER TABLE quiz_items FORCE ROW LEVEL SECURITY;

-- Content: any active user reads lessons, blocks, cards and library entries. Writes come from the
-- import (owner role) only; admins may update the review columns (column-level grants below).
CREATE POLICY content_plan_select ON content_plan FOR SELECT TO app_rw USING (app.user_role() IS NOT NULL);
CREATE POLICY content_blocks_select ON content_blocks FOR SELECT TO app_rw USING (app.user_role() IS NOT NULL);
CREATE POLICY content_days_select ON content_days FOR SELECT TO app_rw USING (app.user_role() IS NOT NULL);
CREATE POLICY content_cards_select ON content_cards FOR SELECT TO app_rw USING (app.user_role() IS NOT NULL);
CREATE POLICY content_library_select ON content_library FOR SELECT TO app_rw USING (app.user_role() IS NOT NULL);

CREATE POLICY content_days_review ON content_days FOR UPDATE TO app_rw
  USING (app.is_admin())
  WITH CHECK (app.is_admin() AND (reviewed_by IS NULL OR reviewed_by = app.uid()));

-- Card prompts: admins only. Engineers copy a prompt through app.card_prompt() and never read the table.
CREATE POLICY content_card_prompts_select ON content_card_prompts FOR SELECT TO app_rw USING (app.is_admin());

-- Questions: engineers and managers see approved questions only; admins see all and review them.
CREATE POLICY questions_select ON questions FOR SELECT TO app_rw
  USING (app.is_admin() OR (status = 'approved' AND app.user_role() IS NOT NULL));
CREATE POLICY questions_review ON questions FOR UPDATE TO app_rw
  USING (app.is_admin())
  WITH CHECK (app.is_admin() AND (reviewed_by IS NULL OR reviewed_by = app.uid()));

-- Activity rows are always the caller's own, on the caller's own enrollment (the enrollments policy
-- lets an engineer see only their own enrollments).
-- day_progress: owner read/write; the engineer's managers and admins read.
CREATE POLICY day_progress_owner ON day_progress FOR ALL TO app_rw
  USING (user_id = app.uid())
  WITH CHECK (user_id = app.uid() AND EXISTS (
    SELECT 1 FROM enrollments e WHERE e.id = enrollment_id AND e.user_id = app.uid()));
CREATE POLICY day_progress_read ON day_progress FOR SELECT TO app_rw
  USING (app.is_admin() OR app.manages_user(user_id));

-- step_entries 🔒: owner only. No manager or admin policy at all.
CREATE POLICY step_entries_owner ON step_entries FOR ALL TO app_rw
  USING (user_id = app.uid())
  WITH CHECK (user_id = app.uid() AND EXISTS (
    SELECT 1 FROM enrollments e WHERE e.id = enrollment_id AND e.user_id = app.uid()));

-- rubric_scores: the engineer writes their own mock self-scores; managers and admins read.
CREATE POLICY rubric_scores_owner ON rubric_scores FOR ALL TO app_rw
  USING (user_id = app.uid() AND scored_by = app.uid() AND source = 'mock_self')
  WITH CHECK (user_id = app.uid() AND scored_by = app.uid() AND source = 'mock_self' AND EXISTS (
    SELECT 1 FROM enrollments e WHERE e.id = enrollment_id AND e.user_id = app.uid()));
CREATE POLICY rubric_scores_read ON rubric_scores FOR SELECT TO app_rw
  USING (user_id = app.uid() OR app.is_admin() OR app.manages_user(user_id));

-- quiz_attempts: owner read/write; managers and admins read (completion, later scores).
CREATE POLICY quiz_attempts_owner ON quiz_attempts FOR ALL TO app_rw
  USING (user_id = app.uid())
  WITH CHECK (user_id = app.uid() AND EXISTS (
    SELECT 1 FROM enrollments e WHERE e.id = enrollment_id AND e.user_id = app.uid()));
CREATE POLICY quiz_attempts_read ON quiz_attempts FOR SELECT TO app_rw
  USING (app.is_admin() OR app.manages_user(user_id));

-- quiz_items: owner read/write (kind must match the attempt's); daily items 🔒 owner only;
-- assessment items readable by the engineer's managers and admins.
CREATE POLICY quiz_items_owner ON quiz_items FOR ALL TO app_rw
  USING (user_id = app.uid())
  WITH CHECK (user_id = app.uid() AND EXISTS (
    SELECT 1 FROM quiz_attempts a WHERE a.id = attempt_id AND a.user_id = app.uid() AND a.kind = quiz_items.kind));
CREATE POLICY quiz_items_assessment_read ON quiz_items FOR SELECT TO app_rw
  USING (kind = 'assessment' AND (app.is_admin() OR app.manages_user(user_id)));

-- ---------------------------------------------------------------------------------------------
-- Grants: least privilege; row-level security decides which rows.
-- ---------------------------------------------------------------------------------------------
GRANT SELECT ON content_plan, content_blocks, content_days, content_cards, content_card_prompts,
  content_library, questions TO app_rw;
GRANT UPDATE (reviewed, reviewed_by, reviewed_at) ON content_days TO app_rw;
GRANT UPDATE (status, review_note, reviewed_by, reviewed_at) ON questions TO app_rw;
GRANT SELECT, INSERT, UPDATE ON day_progress, step_entries, quiz_attempts, quiz_items TO app_rw;
GRANT SELECT, INSERT, UPDATE, DELETE ON rubric_scores TO app_rw;

-- ---------------------------------------------------------------------------------------------
-- Copy a card's private prompt (engineers and admins). The API checks the day is open and audits
-- `prompt.copied`; this function only guarantees managers and others can never get the text.
-- ---------------------------------------------------------------------------------------------
CREATE FUNCTION app.card_prompt(p_card text) RETURNS text
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF app.user_role() IS NULL OR app.user_role() NOT IN ('engineer', 'admin') THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  RETURN (SELECT p.prompt FROM public.content_card_prompts p WHERE p.card_id = p_card);
END
$$;
REVOKE EXECUTE ON FUNCTION app.card_prompt(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.card_prompt(text) TO app_rw;
