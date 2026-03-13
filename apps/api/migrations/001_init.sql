CREATE TABLE IF NOT EXISTS oauth_states (
  state TEXT PRIMARY KEY,
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS github_sessions (
  session_id TEXT PRIMARY KEY,
  access_token TEXT NOT NULL,
  user_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS repos (
  id TEXT PRIMARY KEY,
  repo_json JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS manifests (
  id TEXT PRIMARY KEY,
  manifest_json JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS publish_jobs (
  id TEXT PRIMARY KEY,
  job_json JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS repo_files (
  repo_id TEXT NOT NULL,
  path TEXT NOT NULL,
  contents TEXT NOT NULL,
  PRIMARY KEY (repo_id, path)
);
