-- The session lookup now goes through app.session_user_by_token (20261007090000_sessions), and the
-- signed-in user comes from that. Nothing calls app.current_session_user() any more: remove it so
-- the app role can execute only the functions it actually needs.
DROP FUNCTION app.current_session_user();
