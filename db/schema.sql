CREATE TABLE IF NOT EXISTS pastes (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  format TEXT NOT NULL CHECK(format IN ('html', 'markdown')),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  expires_at INTEGER NOT NULL,
  ip_hash TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_expires_at ON pastes(expires_at);
CREATE INDEX IF NOT EXISTS idx_ip_hash ON pastes(ip_hash, created_at);
