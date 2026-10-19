-- Allow the `assessment.*` audit actions (assessment.completed). Same function as in
-- 20261006130000_harden_security with one more prefix; CREATE OR REPLACE keeps its grants.
CREATE OR REPLACE FUNCTION app.audit(p_action text, p_entity text, p_entity_id text, p_before jsonb, p_after jsonb)
  RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF app.user_role() IS NULL THEN
    RAISE EXCEPTION 'AUDIT_REQUIRES_ACTIVE_USER';
  END IF;
  IF p_action !~ '^(user|team|enrollment|pause|setting|content|question|card|gate|checkin|override|unlock|prompt|assessment)\.[a-z_]{2,40}$' THEN
    RAISE EXCEPTION 'AUDIT_UNKNOWN_ACTION';
  END IF;
  INSERT INTO public.audit_log (actor_id, action, entity, entity_id, before, after)
  VALUES (app.uid(), p_action, p_entity, p_entity_id, p_before, p_after);
END
$$;
