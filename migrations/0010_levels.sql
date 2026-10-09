-- Each account's XP in all (src/progression.ts, sharedworld.ts rule 22):
-- one bar fed by everything a raider does, its level read off
-- CONFIG.progression's curve. No row until the first XP. The valley
-- (worker/ValleyDO.ts) is the only writer, and adds to it in one statement
-- (worker/d1packs.ts gainXp), so two grants at once both count.

CREATE TABLE levels (
  account_id TEXT PRIMARY KEY REFERENCES accounts (account_id),
  xp INTEGER NOT NULL CHECK (xp >= 0)
);
