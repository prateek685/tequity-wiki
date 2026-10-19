-- Gate 2 (docs/PORTAL_PLAN.md §2, §3 "Gate pass bars", §5 "gate_results"; contracts in
-- packages/contracts/src/gates.ts). Gate 1's tables already take gate 2 (gate IN (1, 2), Day 40 for the
-- recap policy, Weeks 5–8 for repeats). Gate 2 adds:
--   * gate_recaps.follow_up_type / follow_up_text: the written follow-up (recap + one of a bad-news email,
--     an escalation message or a weekly status report). Required for Gate 2, never set for Gate 1.
--   * gate_results.healthcare_terms: basic healthcare terms used correctly (part of the Gate 2 pass bar).
--   * gate_results.live_call_plan: the Phase 3 live-call plan (which real calls to shadow, co-lead, lead).
--     Both are required for Gate 2 and null for Gate 1.
-- The policies are column-agnostic; only the column grants change.

ALTER TABLE "gate_recaps" ADD COLUMN "follow_up_type" TEXT;
ALTER TABLE "gate_recaps" ADD COLUMN "follow_up_text" TEXT;

ALTER TABLE gate_recaps ADD CONSTRAINT gate_recaps_follow_up_valid CHECK (
  (follow_up_type IS NULL) = (follow_up_text IS NULL)
  AND (follow_up_type IS NULL OR follow_up_type IN ('bad_news_email', 'escalation', 'weekly_status'))
  AND (follow_up_text IS NULL OR length(follow_up_text) BETWEEN 1 AND 5000)
  AND (CASE gate WHEN 1 THEN follow_up_type IS NULL ELSE follow_up_type IS NOT NULL END));

ALTER TABLE "gate_results" ADD COLUMN "healthcare_terms" BOOLEAN;
ALTER TABLE "gate_results" ADD COLUMN "live_call_plan" TEXT;

ALTER TABLE gate_results ADD CONSTRAINT gate_results_gate2_valid CHECK (
  CASE gate
    WHEN 1 THEN healthcare_terms IS NULL AND live_call_plan IS NULL
    ELSE healthcare_terms IS NOT NULL AND length(live_call_plan) BETWEEN 1 AND 1000
  END);

-- The engineer edits the follow-up with the recap; the manager records the Gate 2 fields with the result.
GRANT UPDATE (follow_up_type, follow_up_text) ON gate_recaps TO app_rw;
GRANT UPDATE (healthcare_terms, live_call_plan) ON gate_results TO app_rw;
