CREATE TABLE IF NOT EXISTS agent_wallet_secrets (
  owner_id TEXT PRIMARY KEY,
  mnemonic TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
