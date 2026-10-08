-- Each account's progress on each daily task (src/dailytask.ts): the
-- Central day it counts (src/daily.ts dayKey), the shadowmen burned with
-- their beam on them that day, and whether that day's reward has been
-- paid. One row an account and task, overwritten as the days turn; no row
-- until the first burn. The valley (worker/ValleyDO.ts) is the only
-- writer, and pays the reward into the wallet in the same batch that marks
-- it claimed (worker/d1packs.ts scoreTask).

CREATE TABLE tasks (
  account_id TEXT NOT NULL REFERENCES accounts (account_id),
  task TEXT NOT NULL,
  day TEXT NOT NULL,
  count INTEGER NOT NULL CHECK (count >= 0),
  claimed INTEGER NOT NULL DEFAULT 0 CHECK (claimed IN (0, 1)),
  PRIMARY KEY (account_id, task)
);
