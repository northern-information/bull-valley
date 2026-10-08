-- The raider's settings (src/settings.ts), kept as a JSON object: for now
-- the music volume. NULL until first changed; the client reads the
-- defaults until then.
ALTER TABLE accounts ADD COLUMN settings TEXT;
