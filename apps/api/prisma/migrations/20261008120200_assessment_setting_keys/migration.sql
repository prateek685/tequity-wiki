-- The M0 settings seed named the assessment settings `assessment.passMarkPct` and
-- `assessment.retakeWaitHours`; the API and contracts use `assessment.passPercent` and
-- `assessment.retakeHours` (added in 20261008120000_assessment_results). Keep any value an admin set
-- under the old names, then drop the old rows so there is one setting each.
UPDATE settings n SET value = o.value
  FROM settings o
  WHERE o.key = 'assessment.passMarkPct' AND n.key = 'assessment.passPercent';
UPDATE settings n SET value = o.value
  FROM settings o
  WHERE o.key = 'assessment.retakeWaitHours' AND n.key = 'assessment.retakeHours';
DELETE FROM settings WHERE key IN ('assessment.passMarkPct', 'assessment.retakeWaitHours');
