import { bigint, jsonb, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';
import type { GithubUser, Hub3Repo, PublishJob, RepoManifest } from '@hub3/shared';

export const oauthStates = pgTable('oauth_states', {
  state: text('state').primaryKey(),
  createdAt: bigint('created_at', { mode: 'number' }).notNull()
});

export const githubSessions = pgTable('github_sessions', {
  sessionId: text('session_id').primaryKey(),
  accessToken: text('access_token').notNull(),
  userJson: jsonb('user_json').$type<GithubUser>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull()
});

export const repos = pgTable('repos', {
  id: text('id').primaryKey(),
  repoJson: jsonb('repo_json').$type<Hub3Repo>().notNull()
});

export const manifests = pgTable('manifests', {
  id: text('id').primaryKey(),
  manifestJson: jsonb('manifest_json').$type<RepoManifest>().notNull()
});

export const publishJobs = pgTable('publish_jobs', {
  id: text('id').primaryKey(),
  jobJson: jsonb('job_json').$type<PublishJob>().notNull()
});

export const repoFiles = pgTable('repo_files', {
  repoId: text('repo_id').notNull(),
  path: text('path').notNull(),
  contents: text('contents').notNull()
}, (table) => ({
  pk: primaryKey({ columns: [table.repoId, table.path] })
}));

export const repoAccessGrants = pgTable('repo_access_grants', {
  grantId: text('grant_id').primaryKey(),
  repoId: text('repo_id').notNull(),
  payerWallet: text('payer_wallet'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'string' }).notNull()
});
