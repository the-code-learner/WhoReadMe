PRAGMA foreign_keys = off;

CREATE TABLE users_next (
  id TEXT PRIMARY KEY,
  google_sub TEXT UNIQUE,
  email TEXT NOT NULL UNIQUE,
  google_email TEXT,
  name TEXT,
  avatar_url TEXT,
  gmail_refresh_token TEXT,
  role TEXT NOT NULL DEFAULT 'owner',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO users_next (
  id,
  google_sub,
  email,
  google_email,
  name,
  avatar_url,
  gmail_refresh_token,
  role,
  created_at,
  updated_at
)
SELECT
  id,
  google_sub,
  email,
  email,
  name,
  avatar_url,
  gmail_refresh_token,
  role,
  created_at,
  updated_at
FROM users;

DROP TABLE users;
ALTER TABLE users_next RENAME TO users;

PRAGMA foreign_keys = on;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_single_owner ON users(role) WHERE role = 'owner';

CREATE TABLE IF NOT EXISTS auth_challenges (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  otp_hash TEXT NOT NULL,
  next_url TEXT,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_auth_challenges_email ON auth_challenges(email, created_at);
CREATE INDEX IF NOT EXISTS idx_auth_challenges_expiry ON auth_challenges(expires_at);
