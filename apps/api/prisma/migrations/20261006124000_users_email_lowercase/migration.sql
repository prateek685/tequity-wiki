-- Emails are stored lowercase so sign-in matching (app.upsert_login_user lowercases input) can
-- never create a duplicate account for the same person. Found by the privacy test suite.
UPDATE users SET email = lower(email) WHERE email <> lower(email);
ALTER TABLE users ADD CONSTRAINT users_email_lowercase CHECK (email = lower(email));
