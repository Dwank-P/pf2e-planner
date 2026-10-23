import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

let database;

/** One synchronous SQLite connection per Node process. Run only one web replica for v1. */
export function db() {
  if (database) return database;
  const path = process.env.DB_PATH || './data/planner.sqlite';
  if (path !== ':memory:') mkdirSync(dirname(resolve(path)), { recursive: true, mode: 0o700 });
  database = new DatabaseSync(path, { timeout: 5000 });
  database.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, display_name TEXT NOT NULL, username TEXT UNIQUE COLLATE NOCASE,
      password_hash TEXT, status TEXT NOT NULL CHECK(status IN ('pending','active','disabled')),
      site_role TEXT NOT NULL CHECK(site_role IN ('owner','user')) DEFAULT 'user',
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL, revoked_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS campaigns (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, owner_id TEXT NOT NULL REFERENCES users(id),
      world_id TEXT NOT NULL, system_id TEXT NOT NULL, created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS memberships (
      campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN ('gm','player')), PRIMARY KEY(campaign_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS invitations (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      code_hash TEXT NOT NULL UNIQUE, expires_at INTEGER NOT NULL,
      consumed_at INTEGER, created_by TEXT NOT NULL REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS pairing_codes (
      code_hash TEXT PRIMARY KEY, creator_id TEXT NOT NULL REFERENCES users(id),
      expires_at INTEGER NOT NULL, consumed_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS integrations (
      id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL UNIQUE REFERENCES campaigns(id) ON DELETE CASCADE,
      foundry_origin TEXT NOT NULL, world_id TEXT NOT NULL,
      created_at INTEGER NOT NULL, revoked_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS bridge_credentials (
      id TEXT PRIMARY KEY, integration_id TEXT NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id),
      access_hash TEXT NOT NULL UNIQUE, access_expires_at INTEGER NOT NULL,
      refresh_hash TEXT NOT NULL UNIQUE, refresh_expires_at INTEGER NOT NULL,
      previous_refresh_hash TEXT, revoked_at INTEGER, created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS catalog_previews (
      integration_id TEXT PRIMARY KEY REFERENCES integrations(id) ON DELETE CASCADE,
      snapshot_id TEXT NOT NULL, sha256 TEXT NOT NULL, data_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS rate_limits (
      key TEXT PRIMARY KEY, bucket INTEGER NOT NULL, hits INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_invitations_user ON invitations(user_id);
    CREATE INDEX IF NOT EXISTS idx_credentials_integration ON bridge_credentials(integration_id);
    CREATE INDEX IF NOT EXISTS idx_memberships_user ON memberships(user_id);
  `);
  return database;
}

export function unix() { return Math.floor(Date.now() / 1000); }

/** SQLite BEGIN IMMEDIATE serializes competing token/redemption writers. */
export function transaction(work) {
  const sql = db();
  sql.exec('BEGIN IMMEDIATE');
  try {
    const result = work(sql);
    sql.exec('COMMIT');
    return result;
  } catch (error) {
    sql.exec('ROLLBACK');
    throw error;
  }
}

export function limit(key, max, windowSeconds) {
  const bucket = Math.floor(unix() / windowSeconds);
  return transaction((sql) => {
    const current = sql.prepare('SELECT bucket,hits FROM rate_limits WHERE key=?').get(key);
    const count = current?.bucket === bucket ? current.hits + 1 : 1;
    sql.prepare('INSERT INTO rate_limits(key,bucket,hits) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET bucket=excluded.bucket,hits=excluded.hits').run(key, bucket, count);
    return count <= max;
  });
}
