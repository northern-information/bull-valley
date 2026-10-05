-- Accounts and the providers that sign them in. One account per person,
-- any number of linked providers, one username, set once and unique
-- case-insensitively. Times are UTC milliseconds, like Date.now().

CREATE TABLE accounts (
  account_id TEXT PRIMARY KEY,
  username TEXT,
  role TEXT NOT NULL DEFAULT 'user',
  primary_provider TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_login_at INTEGER NOT NULL
);

-- NULLs are distinct in SQLite, so any number of accounts may still be
-- choosing a username.
CREATE UNIQUE INDEX accounts_username ON accounts (username COLLATE NOCASE);

CREATE TABLE providers (
  -- `provider:id`, for example `github:12345`.
  provider_key TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts (account_id),
  provider TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  linked_at INTEGER NOT NULL
);

CREATE INDEX providers_account ON providers (account_id);
