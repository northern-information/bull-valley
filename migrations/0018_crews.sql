-- Crews (src/crews.ts, sharedworld.ts rule 35): a name, a short tag shown
-- on every member's name tag, a leader, and up to CONFIG.crews.size
-- members, an account in one at most. Starting one costs cash, taken
-- from the wallet in the same transaction that makes it; the leader
-- invites, and an invite waits here until taken up or it runs out. The
-- tag and the name are each unique in any case. The valley
-- (worker/ValleyDO.ts) is the only writer (worker/d1crews.ts). Account
-- ids stay here; only usernames and tags go on the wire.

CREATE TABLE crews (
  crew_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  tag TEXT NOT NULL,
  leader_id TEXT NOT NULL REFERENCES accounts (account_id),
  created_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX crews_tag ON crews (tag COLLATE NOCASE);

CREATE UNIQUE INDEX crews_name ON crews (name COLLATE NOCASE);

CREATE TABLE crew_members (
  account_id TEXT PRIMARY KEY REFERENCES accounts (account_id),
  crew_id TEXT NOT NULL REFERENCES crews (crew_id),
  joined_at INTEGER NOT NULL
);

CREATE INDEX crew_members_by_crew ON crew_members (crew_id);

CREATE TABLE crew_invites (
  crew_id TEXT NOT NULL REFERENCES crews (crew_id),
  account_id TEXT NOT NULL REFERENCES accounts (account_id),
  at INTEGER NOT NULL,
  PRIMARY KEY (crew_id, account_id)
);

CREATE INDEX crew_invites_by_account ON crew_invites (account_id);
