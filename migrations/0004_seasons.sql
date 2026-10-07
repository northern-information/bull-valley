-- Each account's progress through each season (src/season.ts): the
-- Caretaker unmade with their beam on him, and whether the season's reward
-- has been paid. No row until the first unmaking. The valley
-- (worker/ValleyDO.ts) is the only writer, and pays the reward into the
-- wallet and the pack in the same batch that marks it claimed
-- (worker/d1packs.ts score).

CREATE TABLE seasons (
  account_id TEXT NOT NULL REFERENCES accounts (account_id),
  season TEXT NOT NULL,
  kills INTEGER NOT NULL CHECK (kills >= 0),
  claimed INTEGER NOT NULL DEFAULT 0 CHECK (claimed IN (0, 1)),
  PRIMARY KEY (account_id, season)
);
