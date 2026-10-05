-- What each account carries, what it has to spend, and how it looks. The
-- pack is one row per item the account has ever held; a row used down to
-- zero stays, so the starting items are given once (worker/d1packs.ts
-- open), and so is the starting wallet. The valley (worker/ValleyDO.ts) is
-- the only writer of both.

CREATE TABLE packs (
  account_id TEXT NOT NULL REFERENCES accounts (account_id),
  kind TEXT NOT NULL,
  count INTEGER NOT NULL CHECK (count >= 0),
  PRIMARY KEY (account_id, kind)
);

-- In cents; carries from raid to raid.
CREATE TABLE wallets (
  account_id TEXT PRIMARY KEY REFERENCES accounts (account_id),
  cash INTEGER NOT NULL CHECK (cash >= 0)
);

-- The character and guitar finish chosen at the select or at Gron. NULL
-- until the first choice; the client shows the defaults until then.
ALTER TABLE accounts ADD COLUMN outfit TEXT;
ALTER TABLE accounts ADD COLUMN finish TEXT;
