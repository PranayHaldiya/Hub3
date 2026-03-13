import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import type { PoolClient, QueryResult, QueryResultRow } from 'pg';
import { config } from './config';

type DbPool = Pick<Pool, 'query' | 'connect' | 'end'>;
type DatabaseBundle = {
  pool: DbPool;
};
type DbClient = Pick<PoolClient, 'query' | 'release'>;

let databasePromise: Promise<DatabaseBundle> | null = null;

function migrationDirectory() {
  return resolve(dirname(fileURLToPath(import.meta.url)), '../migrations');
}

function loadMigrations() {
  const directory = migrationDirectory();
  return readdirSync(directory)
    .filter((entry) => entry.endsWith('.sql'))
    .sort()
    .map((entry) => ({
      version: entry,
      sql: readFileSync(resolve(directory, entry), 'utf8')
    }));
}

function schemaMigrationsTableSql() {
  if (config.NODE_ENV === 'test') {
    return `
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT,
        applied_at TIMESTAMPTZ
      )
    `;
  }

  return `
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL
    )
  `;
}

async function runMigrations(pool: DbPool) {
  await pool.query(schemaMigrationsTableSql());

  const applied = await pool.query<{ version: string }>('SELECT version FROM schema_migrations');
  const appliedVersions = new Set(applied.rows.map((row) => row.version));

  for (const migration of loadMigrations()) {
    if (appliedVersions.has(migration.version)) {
      continue;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(migration.sql);
      await client.query('INSERT INTO schema_migrations (version, applied_at) VALUES ($1, $2)', [
        migration.version,
        new Date().toISOString()
      ]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

async function createBundle(): Promise<DatabaseBundle> {
  if (config.NODE_ENV === 'test') {
    const { newDb } = await import('pg-mem');
    const memoryDb = newDb();
    const { Pool: MemoryPool } = memoryDb.adapters.createPg();
    const pool = new MemoryPool() as unknown as DbPool;
    await runMigrations(pool);
    return { pool };
  }

  if (!config.DATABASE_URL) {
    throw new Error('DATABASE_URL must be set for non-test environments');
  }

  const pool = new Pool({
    connectionString: config.DATABASE_URL,
    max: config.DB_POOL_MAX,
    ssl: config.dbSsl ? { rejectUnauthorized: false } : undefined
  });

  pool.on('error', (error: Error) => {
    console.error('Unexpected PostgreSQL pool error', error);
  });

  await runMigrations(pool);
  return { pool };
}

export async function getDb() {
  if (!databasePromise) {
    databasePromise = createBundle();
  }

  return (await databasePromise).pool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []) {
  const pool = await getDb();
  return pool.query(text, params) as Promise<QueryResult<T>>;
}

export async function withTransaction<T>(fn: (client: DbClient) => Promise<T>) {
  const pool = await getDb();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function closeDb() {
  if (!databasePromise) {
    return;
  }

  const { pool } = await databasePromise;
  databasePromise = null;
  await pool.end();
}

export function parseJson<T>(value: string | T): T {
  if (typeof value === 'string') {
    return JSON.parse(value) as T;
  }

  return value;
}

export function stringifyJson(value: unknown): string {
  return JSON.stringify(value);
}

export async function clearDb() {
  await withTransaction(async (client) => {
    await client.query('DELETE FROM oauth_states');
    await client.query('DELETE FROM github_sessions');
    await client.query('DELETE FROM publish_jobs');
    await client.query('DELETE FROM manifests');
    await client.query('DELETE FROM repo_files');
    await client.query('DELETE FROM repos');
  });
}
