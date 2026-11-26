CREATE TABLE users (
  sub        TEXT PRIMARY KEY,
  email      TEXT NOT NULL,
  name       TEXT,
  created_at INTEGER NOT NULL,
  reset_at   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_expires ON sessions(expires_at);

CREATE TABLE entries (
  user_id      TEXT NOT NULL,
  date         TEXT NOT NULL,
  weight_grams INTEGER,
  updated_at   INTEGER NOT NULL,
  deleted      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, date)
);
