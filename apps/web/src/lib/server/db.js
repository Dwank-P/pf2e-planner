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
  // journal_size_limit shrinks the WAL back to 64 MB after checkpoints instead of keeping its peak size.
  database.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA journal_size_limit = 67108864;');
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
    CREATE TABLE IF NOT EXISTS bridge_spent_refresh_tokens (
      token_hash TEXT PRIMARY KEY,
      credential_id TEXT NOT NULL REFERENCES bridge_credentials(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS catalog_previews (
      integration_id TEXT PRIMARY KEY REFERENCES integrations(id) ON DELETE CASCADE,
      snapshot_id TEXT NOT NULL, sha256 TEXT NOT NULL, data_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS catalog_imports (
      id TEXT PRIMARY KEY, integration_id TEXT NOT NULL UNIQUE REFERENCES integrations(id) ON DELETE CASCADE,
      expected_count INTEGER NOT NULL, packs_json TEXT NOT NULL, variants_json TEXT NOT NULL,
      sources_json TEXT NOT NULL, created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS catalog_pack_digests (
      integration_id TEXT NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
      pack TEXT NOT NULL, sha256 TEXT NOT NULL, count INTEGER NOT NULL,
      PRIMARY KEY(integration_id,pack)
    );
    CREATE TABLE IF NOT EXISTS catalog_import_digests (
      integration_id TEXT NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
      import_id TEXT NOT NULL, pack TEXT NOT NULL, sha256 TEXT NOT NULL, count INTEGER NOT NULL,
      PRIMARY KEY(integration_id,import_id,pack)
    );
    CREATE TABLE IF NOT EXISTS catalog_staging (
      integration_id TEXT NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
      snapshot_id TEXT NOT NULL, batch_number INTEGER NOT NULL, uuid TEXT NOT NULL,
      item_json TEXT NOT NULL, PRIMARY KEY(integration_id,snapshot_id,uuid)
    );
    CREATE TABLE IF NOT EXISTS catalog_publications (
      integration_id TEXT PRIMARY KEY REFERENCES integrations(id) ON DELETE CASCADE,
      snapshot_id TEXT NOT NULL, sha256 TEXT NOT NULL, entry_count INTEGER NOT NULL,
      variants_json TEXT NOT NULL, packs_json TEXT NOT NULL, sources_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS catalog_entries (
      integration_id TEXT NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
      snapshot_id TEXT NOT NULL, uuid TEXT NOT NULL, type TEXT NOT NULL, pack TEXT NOT NULL,
      level INTEGER, rarity TEXT,name TEXT NOT NULL,traits_json TEXT NOT NULL,
      item_json TEXT NOT NULL, PRIMARY KEY(integration_id,snapshot_id,uuid)
    );
    CREATE INDEX IF NOT EXISTS idx_catalog_query ON catalog_entries(integration_id,snapshot_id,type,level,rarity,pack,name);
    -- Icon images stored once by content hash, shared by every world that uses them.
    CREATE TABLE IF NOT EXISTS icon_blobs (
      sha256 TEXT PRIMARY KEY, content_type TEXT NOT NULL, bytes BLOB NOT NULL, created_at INTEGER NOT NULL
    );
    -- Each world's own icon paths, pointing at a shared image.
    CREATE TABLE IF NOT EXISTS integration_icons (
      integration_id TEXT NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
      path TEXT NOT NULL, sha256 TEXT NOT NULL REFERENCES icon_blobs(sha256),
      updated_at INTEGER NOT NULL, PRIMARY KEY(integration_id,path)
    );
    CREATE INDEX IF NOT EXISTS idx_integration_icons_sha ON integration_icons(sha256);
    CREATE TABLE IF NOT EXISTS character_builds (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
      owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL, level INTEGER NOT NULL CHECK(level BETWEEN 1 AND 20),
      build_json TEXT NOT NULL,
      revision INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_builds_campaign_owner
      ON character_builds(campaign_id, owner_user_id, updated_at DESC);
    CREATE TABLE IF NOT EXISTS foundry_actor_links (
      integration_id TEXT NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
      actor_id TEXT NOT NULL, character_id TEXT NOT NULL REFERENCES character_builds(id) ON DELETE CASCADE,
      PRIMARY KEY(integration_id,actor_id), UNIQUE(character_id)
    );
    CREATE TABLE IF NOT EXISTS rate_limits (
      key TEXT PRIMARY KEY, bucket INTEGER NOT NULL, hits INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_invitations_user ON invitations(user_id);
    CREATE INDEX IF NOT EXISTS idx_credentials_integration ON bridge_credentials(integration_id);
    CREATE INDEX IF NOT EXISTS idx_memberships_user ON memberships(user_id);
    -- Every Foundry address a paired world may be opened from (one world, several domains).
    CREATE TABLE IF NOT EXISTS integration_origins (
      integration_id TEXT NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
      origin TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY(integration_id,origin)
    );
    -- Characters shared with chosen campaign members (visibility 'custom').
    CREATE TABLE IF NOT EXISTS character_shares (
      character_id TEXT NOT NULL REFERENCES character_builds(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      access TEXT NOT NULL CHECK(access IN ('view','edit')), PRIMARY KEY(character_id,user_id)
    );
    -- Reusable campaign invite links (one link for a whole group); expires_at NULL = never.
    CREATE TABLE IF NOT EXISTS campaign_invite_links (
      id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
      code TEXT NOT NULL UNIQUE, created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL, expires_at INTEGER, revoked_at INTEGER, uses INTEGER NOT NULL DEFAULT 0
    );
    -- Personal characters: owned by one player, outside any campaign, built from compendiums
    -- that worlds the player belongs to share (personal_sources). system is 'pf2e' (PF2e/SF2e) or 'dnd5e'.
    CREATE TABLE IF NOT EXISTS personal_characters (
      id TEXT PRIMARY KEY, owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL, level INTEGER NOT NULL CHECK(level BETWEEN 1 AND 20),
      system TEXT NOT NULL CHECK(system IN ('pf2e','dnd5e')), variants_json TEXT NOT NULL DEFAULT '{}',
      build_json TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1,
      public_token TEXT UNIQUE, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_personal_owner ON personal_characters(owner_user_id, updated_at DESC);
    CREATE TABLE IF NOT EXISTS personal_shares (
      character_id TEXT NOT NULL REFERENCES personal_characters(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      access TEXT NOT NULL CHECK(access IN ('view','edit')), PRIMARY KEY(character_id,user_id)
    );
    -- One world per package (a compendium id's first part: "pf2e", "pf2e-battlezoo-…", "world").
    CREATE TABLE IF NOT EXISTS personal_sources (
      character_id TEXT NOT NULL REFERENCES personal_characters(id) ON DELETE CASCADE,
      package TEXT NOT NULL, integration_id TEXT NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
      PRIMARY KEY(character_id,package)
    );
    CREATE INDEX IF NOT EXISTS idx_personal_sources_integration ON personal_sources(integration_id);
    -- Items a character had picked from a source that went away, kept for that character only.
    CREATE TABLE IF NOT EXISTS personal_kept_items (
      character_id TEXT NOT NULL REFERENCES personal_characters(id) ON DELETE CASCADE,
      uuid TEXT NOT NULL, item_json TEXT NOT NULL, icon_sha256 TEXT, source TEXT NOT NULL,
      kept_at INTEGER NOT NULL, PRIMARY KEY(character_id,uuid)
    );
    CREATE INDEX IF NOT EXISTS idx_personal_kept_icon ON personal_kept_items(icon_sha256);
    -- One-time password reset codes issued by the server owner.
    CREATE TABLE IF NOT EXISTS password_resets (
      code_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL, consumed_at INTEGER
    );
  `);
  migrate(database);
  return database;
}

/** Additive schema changes for databases created by earlier versions. */
function migrate(sql) {
  const columns = table => new Set(sql.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name));
  const addColumn = (table, column, definition) => {
    if (!columns(table).has(column)) sql.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  };
  // A Bridge credential works only from the Foundry address it was issued to.
  addColumn('bridge_credentials', 'origin', 'TEXT');
  addColumn('character_builds', 'visibility',
    "TEXT NOT NULL DEFAULT 'private' CHECK(visibility IN ('private','campaign-view','campaign-edit','custom'))");
  // GMs opt a world in before members may use its compendiums for personal characters.
  addColumn('campaigns', 'share_compendiums', 'INTEGER NOT NULL DEFAULT 0');
  // Read-only public view links for campaign characters (personal ones have their own column).
  addColumn('character_builds', 'public_token', 'TEXT');
  sql.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_builds_public_token ON character_builds(public_token) WHERE public_token IS NOT NULL');
  sql.exec(`INSERT OR IGNORE INTO integration_origins(integration_id,origin,created_at)
    SELECT id,foundry_origin,created_at FROM integrations`);
  // v0.12 kept a copy of every icon per world; v0.14 shares identical images.
  if (sql.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='catalog_icons'").get()) {
    sql.exec('BEGIN IMMEDIATE');
    try {
      sql.exec(`INSERT OR IGNORE INTO icon_blobs(sha256,content_type,bytes,created_at)
          SELECT sha256,content_type,bytes,MIN(updated_at) FROM catalog_icons GROUP BY sha256;
        INSERT OR IGNORE INTO integration_icons(integration_id,path,sha256,updated_at)
          SELECT integration_id,path,sha256,updated_at FROM catalog_icons;
        DROP TABLE catalog_icons;`);
      sql.exec('COMMIT');
    } catch (error) { sql.exec('ROLLBACK'); throw error; }
  }
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
