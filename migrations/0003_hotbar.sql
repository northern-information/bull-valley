-- The hotbar: nine slots, one per number key, each an item kind or null,
-- kept as a JSON array (src/hotbar.ts). NULL until the first assignment;
-- the client shows an empty bar until then.
ALTER TABLE accounts ADD COLUMN hotbar TEXT;
