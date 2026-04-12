CREATE TABLE IF NOT EXISTS agent_wallets (
  owner_id TEXT PRIMARY KEY,
  wallet_json JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_policies (
  owner_id TEXT PRIMARY KEY,
  policy_json JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_activity_logs (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  activity_json JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS agent_activity_logs_owner_created_idx
  ON agent_activity_logs (owner_id, created_at DESC);

CREATE TABLE IF NOT EXISTS payment_receipts (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  receipt_json JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS payment_receipts_owner_created_idx
  ON payment_receipts (owner_id, created_at DESC);
