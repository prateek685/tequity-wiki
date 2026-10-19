-- Managers get email for new red flags only. The engineer books their own check-ins, so the "check-in
-- coming due" email and its function are gone. Existing email_log rows are kept as they are: the new
-- constraint is NOT VALID, so it applies to new rows without rewriting or deleting old ones.
DROP FUNCTION app.checkin_due_email(uuid, int);

ALTER TABLE email_log DROP CONSTRAINT email_log_values_valid;
ALTER TABLE email_log ADD CONSTRAINT email_log_values_valid CHECK (
  template = 'red_flag'
  AND status IN ('pending', 'sent', 'failed')
  AND (status = 'sent') = (sent_at IS NOT NULL)
  AND length(dedupe_key) BETWEEN 1 AND 300
  AND jsonb_typeof(payload) = 'object') NOT VALID;
