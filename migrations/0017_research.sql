-- Each account's research at the Recycling Center by the wreck
-- (src/recycling.ts, sharedworld.ts rule 33): the level reached on each
-- line, bought with empties out of the pack. One row an account and line,
-- made the first time a level is bought; no row is level 0. The valley
-- (worker/ValleyDO.ts) is the only writer, and writes the level with the
-- empties it took out of the pack in one transaction (worker/d1packs.ts
-- recycle).

CREATE TABLE research (
  account_id TEXT NOT NULL REFERENCES accounts (account_id),
  line TEXT NOT NULL,
  level INTEGER NOT NULL DEFAULT 0 CHECK (level >= 0),
  PRIMARY KEY (account_id, line)
);
