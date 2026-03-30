CREATE TABLE IF NOT EXISTS repo_access_grants (
  grant_id TEXT PRIMARY KEY,
  repo_id TEXT NOT NULL,
  payer_wallet TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS repo_access_grants_repo_id_idx
  ON repo_access_grants (repo_id);

CREATE INDEX IF NOT EXISTS repo_access_grants_expires_at_idx
  ON repo_access_grants (expires_at);
