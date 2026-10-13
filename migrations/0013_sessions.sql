-- Each account's session number (worker/tokens.ts): every refresh token
-- carries the number it was signed under, and signing out moves it on, so
-- every refresh token the account had is dead at once.

ALTER TABLE accounts ADD COLUMN session INTEGER NOT NULL DEFAULT 0;
