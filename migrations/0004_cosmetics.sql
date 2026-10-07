-- The cosmetics each account has (src/cosmetics.ts): one row per cosmetic,
-- had for good. Moab Coldë trades them for what the pack holds, so the
-- valley (worker/ValleyDO.ts) writes a row and takes the price out of
-- `packs` in one transaction (worker/d1packs.ts trade). trade_id is that
-- trade's own, so the price is taken only for the row it wrote. Times are
-- UTC milliseconds, like Date.now().

CREATE TABLE cosmetics (
  account_id TEXT NOT NULL REFERENCES accounts (account_id),
  cosmetic TEXT NOT NULL,
  acquired_at INTEGER NOT NULL,
  trade_id TEXT NOT NULL,
  PRIMARY KEY (account_id, cosmetic)
);
