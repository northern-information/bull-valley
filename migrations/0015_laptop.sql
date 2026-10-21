-- The files on the laptop in the Citgo bathroom (src/laptop.ts,
-- sharedworld.ts rule 31): one pretend file system every raider shares.
-- Each file is its writer's, who alone may change it; its name is theirs
-- alone in any case. The valley (worker/ValleyDO.ts) is the only writer
-- (worker/d1accounts.ts saveLaptopFile).

CREATE TABLE laptop_files (
  file_id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts (account_id),
  name TEXT NOT NULL,
  body TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX laptop_files_name ON laptop_files (account_id, name COLLATE NOCASE);
