-- Gate 2: the Phase 3 live-call plan is required only when the gate is passed (pass / pass_focus). After a
-- repeat Phase 3 doesn't start yet, so the plan may be missing (stored as NULL).
ALTER TABLE gate_results DROP CONSTRAINT gate_results_gate2_valid;
ALTER TABLE gate_results ADD CONSTRAINT gate_results_gate2_valid CHECK (
  CASE gate
    WHEN 1 THEN healthcare_terms IS NULL AND live_call_plan IS NULL
    ELSE healthcare_terms IS NOT NULL
      AND (live_call_plan IS NULL OR length(live_call_plan) BETWEEN 1 AND 1000)
      AND (outcome = 'repeat' OR live_call_plan IS NOT NULL)
  END);
