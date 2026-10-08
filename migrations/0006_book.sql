-- Each account's Book of Shadows (src/book.ts): one row per entry it has
-- found, and when. No rows until the first. The valley (worker/ValleyDO.ts)
-- is the only writer (worker/d1packs.ts discover).

CREATE TABLE book (
  account_id TEXT NOT NULL REFERENCES accounts (account_id),
  entry TEXT NOT NULL,
  found_at INTEGER NOT NULL,
  PRIMARY KEY (account_id, entry)
);
