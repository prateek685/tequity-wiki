-- Managers no longer review written assessment answers: the AI score is the only score. Remove the
-- review table (every saved review is deleted with it) and the two read policies that only existed so a
-- manager could open an engineer's written assessment answer and its AI score.

-- Author names no longer look at reviews (CREATE OR REPLACE keeps the function's grants).
CREATE OR REPLACE FUNCTION app.author_names(p_ids uuid[])
  RETURNS TABLE (id uuid, name text)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT u.id, u.name
    FROM public.users u
   WHERE u.id = ANY(p_ids)
     AND app.user_role() IS NOT NULL
     AND (
       EXISTS (SELECT 1 FROM public.checkins c WHERE c.manager_id = u.id
                 AND (c.user_id = app.uid() OR app.is_admin() OR app.manages_user(c.user_id)))
       OR EXISTS (SELECT 1 FROM public.manual_unlocks m WHERE m.manager_id = u.id
                 AND (m.user_id = app.uid() OR app.is_admin() OR app.manages_user(m.user_id)))
       OR EXISTS (SELECT 1 FROM public.gate_results g WHERE g.manager_id = u.id
                 AND (g.user_id = app.uid() OR app.is_admin() OR app.manages_user(g.user_id)))
       OR EXISTS (SELECT 1 FROM public.red_flags f WHERE f.acknowledged_by = u.id
                 AND (app.is_admin() OR app.manages_user(f.user_id)))
       OR EXISTS (SELECT 1 FROM public.final_reviews v WHERE v.manager_id = u.id
                 AND (v.user_id = app.uid() OR app.is_admin() OR app.manages_user(v.user_id))))
$$;

DROP POLICY ai_scores_assessment_read ON ai_scores;
DROP POLICY quiz_items_assessment_read ON quiz_items;
DROP TABLE answer_reviews;
