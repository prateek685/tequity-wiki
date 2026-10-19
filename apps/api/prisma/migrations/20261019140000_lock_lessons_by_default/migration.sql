-- Lessons unlock in order: a day opens only when the previous one is done.
-- `learning.unlockAll` was the content-review switch (every day and lesson open); the first migration
-- that added it set it to true. Turn it off, so fresh installs and this database both start locked.
UPDATE settings SET value = 'false' WHERE key = 'learning.unlockAll';
