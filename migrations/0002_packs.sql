-- What each account carries, and how it looks. The pack is one row per
-- item the account has ever held; a row used down to zero stays, so the
-- starting items are given once (worker/d1packs.ts open). The valley
-- (worker/ValleyDO.ts) is the only writer.

CREATE TABLE packs (
  account_id TEXT NOT NULL REFERENCES accounts (account_id),
  kind TEXT NOT NULL,
  count INTEGER NOT NULL CHECK (count >= 0),
  PRIMARY KEY (account_id, kind)
);

-- The character and guitar finish chosen at the select or at Gron. NULL
-- until the first choice; the client shows the defaults until then.
ALTER TABLE accounts ADD COLUMN outfit TEXT;
ALTER TABLE accounts ADD COLUMN finish TEXT;
