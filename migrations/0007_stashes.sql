-- Frozen: this file and 0007_tasks.sql share a number. Both were applied
-- to production under these names, in lexical order (stashes, then tasks),
-- and wrangler records a migration by its file name, so neither may ever
-- be renamed: a renamed one would run its CREATE TABLE again and fail the
-- deploy. tests/unit/migrations.test.ts allows this pair alone.
--
-- What each account keeps in its locker in the back room of every Citgo
-- (src/stash.ts, sharedworld.ts rule 19): one row per item the account has
-- ever stowed, beside the pack. A row taken down to zero stays. The valley
-- (worker/ValleyDO.ts) is the only writer, and moves units between the pack
-- and the locker in one transaction (worker/d1packs.ts stow).

CREATE TABLE stashes (
  account_id TEXT NOT NULL REFERENCES accounts (account_id),
  kind TEXT NOT NULL,
  count INTEGER NOT NULL CHECK (count >= 0),
  PRIMARY KEY (account_id, kind)
);
