-- Remove the admin content review (user decision, 7 Oct 2026; docs/PORTAL_PLAN.md §4–§6).
-- Everything imported from content/ is live: a day is open to engineers once it is imported, and a
-- quiz draws from every question in its pool. Content stays import-only (owner role); the app role
-- only reads it. A question removed from content/ that quiz items still reference is kept with
-- `retired = true` and never picked for a new quiz.

-- Policies, grants and checks that reference the review columns go first.
DROP POLICY content_days_review ON content_days;
DROP POLICY questions_review ON questions;
DROP POLICY questions_select ON questions;

REVOKE UPDATE ON content_days FROM app_rw;
REVOKE UPDATE ON questions FROM app_rw;

ALTER TABLE content_days DROP CONSTRAINT content_days_review_consistent;
ALTER TABLE questions DROP CONSTRAINT questions_rejection_has_note;

-- DropForeignKey
ALTER TABLE "content_days" DROP CONSTRAINT "content_days_reviewed_by_fkey";

-- DropForeignKey
ALTER TABLE "questions" DROP CONSTRAINT "questions_reviewed_by_fkey";

-- DropIndex
DROP INDEX "content_days_reviewed_by_idx";

-- DropIndex
DROP INDEX "questions_pool_status_idx";

-- DropIndex
DROP INDEX "questions_reviewed_by_idx";

-- AlterTable
ALTER TABLE "content_days" DROP COLUMN "reviewed",
DROP COLUMN "reviewed_at",
DROP COLUMN "reviewed_by";

-- AlterTable
ALTER TABLE "questions" DROP COLUMN "review_note",
DROP COLUMN "reviewed_at",
DROP COLUMN "reviewed_by",
DROP COLUMN "status",
ADD COLUMN     "retired" BOOLEAN NOT NULL DEFAULT false;

-- DropEnum
DROP TYPE "question_status";

-- CreateIndex
CREATE INDEX "questions_pool_retired_idx" ON "questions"("pool", "retired");

-- Questions: any active user reads them, like the other content tables. No write policy and no
-- write grant: questions change only through the import.
CREATE POLICY questions_select ON questions FOR SELECT TO app_rw USING (app.user_role() IS NOT NULL);
