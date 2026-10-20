-- Each account's expedition (src/expeditions.ts, sharedworld.ts rule 30):
-- the run out, if any (`kind` null when none), when it left and comes
-- home (server ms), the seed the valley drew for it, and the matching
-- ward's level as it left. `rev` counts the writes, so a write made from
-- a stale read is refused. One row an account, made the first time the
-- valley sends a run. The valley (worker/ValleyDO.ts) is the only writer:
-- it writes a run sent, and a run home with what it brought into the pack
-- and the wallet, in one transaction (worker/d1packs.ts embark,
-- homecoming).

CREATE TABLE expeditions (
  account_id TEXT PRIMARY KEY REFERENCES accounts (account_id),
  kind TEXT,
  started_at INTEGER NOT NULL DEFAULT 0,
  ends_at INTEGER NOT NULL DEFAULT 0,
  seed INTEGER NOT NULL DEFAULT 0,
  ward REAL NOT NULL DEFAULT 0,
  rev INTEGER NOT NULL DEFAULT 0 CHECK (rev >= 0)
);
