-- Revoked JWT access tokens (SHA-256 of raw bearer string). Safe to DELETE WHERE expires_at < now().
CREATE TABLE IF NOT EXISTS token_blacklist (
  token_hash VARCHAR(64) PRIMARY KEY,
  user_id INTEGER REFERENCES users (id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  reason VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_token_blacklist_expires_at ON token_blacklist (expires_at);
