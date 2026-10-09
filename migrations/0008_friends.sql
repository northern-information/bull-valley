-- Friendships (src/friends.ts, sharedworld.ts rule 20). A row is one
-- account's side: `accepted` 0 means account_id has asked friend_id and is
-- waiting; a friendship is two rows, one each way, both accepted. The
-- valley (worker/ValleyDO.ts) is the only writer. Account ids stay here;
-- only usernames go on the wire.

CREATE TABLE friends (
  account_id TEXT NOT NULL REFERENCES accounts (account_id),
  friend_id TEXT NOT NULL REFERENCES accounts (account_id),
  accepted INTEGER NOT NULL DEFAULT 0 CHECK (accepted IN (0, 1)),
  since INTEGER NOT NULL,
  PRIMARY KEY (account_id, friend_id),
  CHECK (account_id <> friend_id)
);

CREATE INDEX friends_by_friend ON friends (friend_id);
