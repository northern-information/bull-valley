-- Each account's quests (src/quests.ts, sharedworld.ts rule 25): where it
-- stands on each ('given', 'laid', 'done'; no row is 'none'), and the id of
-- the step that last wrote it, which the pack change written with it
-- checks, so the two land together or not at all. The valley
-- (worker/ValleyDO.ts) is the only writer (worker/d1packs.ts quest).

CREATE TABLE quests (
  account_id TEXT NOT NULL REFERENCES accounts (account_id),
  quest TEXT NOT NULL,
  stage TEXT NOT NULL CHECK (stage IN ('given', 'laid', 'done')),
  step_id TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (account_id, quest)
);
