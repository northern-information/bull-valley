-- Each account's Cabbage Stand (src/stand.ts, sharedworld.ts rule 23): its
-- level, what is out on its table (a JSON object of kind to count), the
-- cents it had banked by `since` (fractional: it earns by the millisecond)
-- and the server ms that was. `rev` counts the writes, so a write made from
-- a stale read is refused. One row an account, made the first time the
-- valley reads it. The valley (worker/ValleyDO.ts) is the only writer, and
-- writes the ledger with what it took out of the pack and paid into or
-- took out of the wallet in one transaction (worker/d1packs.ts tend).

CREATE TABLE stands (
  account_id TEXT PRIMARY KEY REFERENCES accounts (account_id),
  level INTEGER NOT NULL DEFAULT 1 CHECK (level >= 1),
  stock TEXT NOT NULL DEFAULT '{}',
  banked REAL NOT NULL DEFAULT 0 CHECK (banked >= 0),
  since INTEGER NOT NULL DEFAULT 0,
  rev INTEGER NOT NULL DEFAULT 0 CHECK (rev >= 0)
);
