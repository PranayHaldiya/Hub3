import crypto from 'node:crypto';
import type { GithubUser } from '@hub3/shared';
import { config } from './config';
import { parseJson, query, stringifyJson } from './db';

export type GithubSession = {
  accessToken: string;
  user: GithubUser;
  createdAt: string;
};

async function pruneOauthStates() {
  await query('DELETE FROM oauth_states WHERE created_at < $1', [Date.now() - config.HUB3_OAUTH_STATE_TTL_SECONDS * 1000]);
}

async function pruneSessions() {
  const cutoff = new Date(Date.now() - config.HUB3_SESSION_TTL_SECONDS * 1000).toISOString();
  await query('DELETE FROM github_sessions WHERE created_at < $1', [cutoff]);
}

export async function createOauthState() {
  await pruneOauthStates();
  const state = crypto.randomUUID();
  await query(
    `
      INSERT INTO oauth_states (state, created_at)
      VALUES ($1, $2)
      ON CONFLICT(state) DO UPDATE SET created_at = excluded.created_at
    `,
    [state, Date.now()]
  );
  return state;
}

export async function consumeOauthState(state: string) {
  await pruneOauthStates();
  const result = await query<{ state: string }>('SELECT state FROM oauth_states WHERE state = $1', [state]);
  if (result.rowCount === 0) {
    return false;
  }

  await query('DELETE FROM oauth_states WHERE state = $1', [state]);
  return true;
}

export async function createGithubSession(input: { accessToken: string; user: GithubUser }) {
  await pruneSessions();
  const sessionId = crypto.randomUUID();
  await query(
    `
      INSERT INTO github_sessions (session_id, access_token, user_json, created_at)
      VALUES ($1, $2, $3::jsonb, $4)
      ON CONFLICT(session_id) DO UPDATE SET
        access_token = excluded.access_token,
        user_json = excluded.user_json,
        created_at = excluded.created_at
    `,
    [sessionId, input.accessToken, stringifyJson(input.user), new Date().toISOString()]
  );
  return sessionId;
}

export async function getGithubSession(sessionId?: string) {
  if (!sessionId) {
    return null;
  }

  await pruneSessions();
  const result = await query<{ access_token: string; user_json: GithubUser | string; created_at: string }>(
    `
      SELECT access_token, user_json, created_at
      FROM github_sessions
      WHERE session_id = $1
    `,
    [sessionId]
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  return {
    accessToken: row.access_token,
    user: parseJson<GithubUser>(row.user_json),
    createdAt: row.created_at
  } satisfies GithubSession;
}
