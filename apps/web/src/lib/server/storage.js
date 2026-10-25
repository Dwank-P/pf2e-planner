import { statSync, statfsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { db, unix } from './db.js';

/**
 * Storage reporting and maintenance for the server owner. SQLite runs in WAL
 * mode: writes land in planner.sqlite-wal and are copied into the main file by
 * checkpoints. Large catalog syncs can leave a big WAL and free pages behind.
 */
export function dbPath() { return process.env.DB_PATH || './data/planner.sqlite'; }
const size = path => { try { return statSync(path).size; } catch { return 0; } };
const one = (sql, ...args) => db().prepare(sql).get(...args);

/** Free space on the volume holding the database, in bytes (null if unknown). */
export function freeSpace() {
  try {
    const s = statfsSync(dirname(resolve(dbPath())));
    return Number(s.bavail) * Number(s.bsize);
  } catch { return null; }
}

/** Bytes per table and index from SQLite's dbstat (main file only). */
function tableBytes() {
  try {
    return Object.fromEntries(db().prepare(`SELECT name,SUM(pgsize) AS bytes FROM dbstat GROUP BY name`)
      .all().map(r => [r.name, Number(r.bytes)]));
  } catch { return {}; }
}
const sum = (bytes, names) => names.reduce((n, name) => n + (bytes[name] ?? 0), 0);

export function storageReport() {
  const path = dbPath();
  const pageSize = one('PRAGMA page_size').page_size;
  const pages = one('PRAGMA page_count').page_count;
  const free = one('PRAGMA freelist_count').freelist_count;
  const bytes = tableBytes();
  const index = prefix => Object.keys(bytes).filter(n => n.startsWith(prefix));
  const groups = {
    compendiums: sum(bytes, ['catalog_entries', 'catalog_publications', 'catalog_previews', 'catalog_pack_digests',
      ...index('sqlite_autoindex_catalog_entries'), 'idx_catalog_query']),
    syncInProgress: sum(bytes, ['catalog_staging', 'catalog_imports', 'catalog_import_digests',
      ...index('sqlite_autoindex_catalog_staging')]),
    icons: sum(bytes, ['catalog_icons', ...index('sqlite_autoindex_catalog_icons')]),
    characters: sum(bytes, ['character_builds', 'character_shares', 'foundry_actor_links', 'idx_builds_campaign_owner',
      ...index('sqlite_autoindex_character'), ...index('sqlite_autoindex_foundry_actor_links')])
  };
  const accounted = Object.values(groups).reduce((a, b) => a + b, 0);
  const worlds = db().prepare(`SELECT i.id AS integrationId,c.id AS campaignId,c.title,i.revoked_at AS revokedAt,
      p.updated_at AS syncedAt,
      (SELECT COUNT(*) FROM catalog_entries e WHERE e.integration_id=i.id) AS items,
      (SELECT COALESCE(SUM(LENGTH(item_json)),0) FROM catalog_entries e WHERE e.integration_id=i.id) AS itemBytes,
      (SELECT COUNT(DISTINCT snapshot_id) FROM catalog_entries e WHERE e.integration_id=i.id) AS snapshots,
      (SELECT COUNT(*) FROM catalog_staging s WHERE s.integration_id=i.id) AS staged,
      (SELECT COUNT(*) FROM catalog_icons x WHERE x.integration_id=i.id) AS icons,
      (SELECT COALESCE(SUM(LENGTH(bytes)),0) FROM catalog_icons x WHERE x.integration_id=i.id) AS iconBytes,
      (SELECT COUNT(*) FROM character_builds b WHERE b.campaign_id=c.id) AS characters,
      (SELECT COALESCE(SUM(LENGTH(build_json)),0) FROM character_builds b WHERE b.campaign_id=c.id) AS characterBytes
    FROM integrations i JOIN campaigns c ON c.id=i.campaign_id
    LEFT JOIN catalog_publications p ON p.integration_id=i.id
    ORDER BY c.title`).all();
  const unpaired = db().prepare(`SELECT c.id AS campaignId,c.title,COUNT(b.id) AS characters,
      COALESCE(SUM(LENGTH(b.build_json)),0) AS characterBytes
    FROM campaigns c LEFT JOIN character_builds b ON b.campaign_id=c.id
    WHERE NOT EXISTS(SELECT 1 FROM integrations i WHERE i.campaign_id=c.id)
    GROUP BY c.id ORDER BY c.title`).all();
  return {
    path,
    files: { database: size(path), wal: size(path + '-wal'), shm: size(path + '-shm') },
    pageSize, pages, freePages: free, reclaimable: free * pageSize,
    groups: { ...groups, other: Math.max(0, pages * pageSize - accounted - free * pageSize) },
    freeSpace: freeSpace(),
    worlds, unpaired,
    cleanup: cleanupCounts()
  };
}

const DAY = 86400;
/** Rows that maintenance can safely delete. */
function cleanupTargets(now = unix()) {
  return [
    ['Abandoned syncs (staged over a day ago)', `DELETE FROM catalog_staging WHERE integration_id IN
      (SELECT integration_id FROM catalog_imports WHERE created_at<${now - DAY})`,
      `SELECT COUNT(*) AS n FROM catalog_staging WHERE integration_id IN
      (SELECT integration_id FROM catalog_imports WHERE created_at<${now - DAY})`],
    ['Abandoned sync records', `DELETE FROM catalog_imports WHERE created_at<${now - DAY}`,
      `SELECT COUNT(*) AS n FROM catalog_imports WHERE created_at<${now - DAY}`],
    ['Old compendium snapshots', `DELETE FROM catalog_entries WHERE NOT EXISTS (SELECT 1 FROM catalog_publications p
      WHERE p.integration_id=catalog_entries.integration_id AND p.snapshot_id=catalog_entries.snapshot_id)`,
      `SELECT COUNT(*) AS n FROM catalog_entries WHERE NOT EXISTS (SELECT 1 FROM catalog_publications p
      WHERE p.integration_id=catalog_entries.integration_id AND p.snapshot_id=catalog_entries.snapshot_id)`],
    ['Expired sign-in sessions', `DELETE FROM sessions WHERE expires_at<${now} OR revoked_at<${now - 30 * DAY}`,
      `SELECT COUNT(*) AS n FROM sessions WHERE expires_at<${now} OR revoked_at<${now - 30 * DAY}`],
    ['Expired pairing codes', `DELETE FROM pairing_codes WHERE expires_at<${now - DAY}`,
      `SELECT COUNT(*) AS n FROM pairing_codes WHERE expires_at<${now - DAY}`],
    ['Expired password reset codes', `DELETE FROM password_resets WHERE expires_at<${now - DAY}`,
      `SELECT COUNT(*) AS n FROM password_resets WHERE expires_at<${now - DAY}`],
    ['Used Bridge refresh tokens', `DELETE FROM bridge_spent_refresh_tokens WHERE expires_at<${now}`,
      `SELECT COUNT(*) AS n FROM bridge_spent_refresh_tokens WHERE expires_at<${now}`]
  ];
}
function cleanupCounts() {
  return cleanupTargets().map(([label, , count]) => ({ label, rows: Number(one(count).n) }));
}

/**
 * Copy the WAL into the database and shrink it (TRUNCATE). Safe while serving:
 * if a reader holds the WAL, SQLite reports busy and nothing is lost.
 */
export function checkpoint(mode = 'TRUNCATE') {
  if (!['PASSIVE', 'FULL', 'RESTART', 'TRUNCATE'].includes(mode)) throw Error('bad checkpoint mode');
  const before = size(dbPath() + '-wal');
  const r = one(`PRAGMA wal_checkpoint(${mode})`);
  return { busy: !!r.busy, walPages: r.log, checkpointed: r.checkpointed, walBefore: before, walAfter: size(dbPath() + '-wal') };
}
/** After a large catalog sync: fold the WAL back once it has grown past `thresholdBytes`. */
export function checkpointIfLarge(thresholdBytes = 32 * 1024 * 1024) {
  try {
    if (size(dbPath() + '-wal') < thresholdBytes) return null;
    return checkpoint('TRUNCATE');
  } catch { return null; }
}
export function cleanup() {
  const removed = [];
  db().exec('BEGIN IMMEDIATE');
  try {
    for (const [label, sql] of cleanupTargets()) {
      const r = db().prepare(sql).run();
      if (r.changes) removed.push({ label, rows: Number(r.changes) });
    }
    db().exec('COMMIT');
  } catch (error) { db().exec('ROLLBACK'); throw error; }
  return removed;
}
export function optimize() {
  db().exec('PRAGMA optimize');
  return { optimized: true };
}
/**
 * Rebuild the database file to return free pages to the disk. Needs about the
 * database's size again in free space and blocks writes while it runs.
 */
export function vacuum() {
  const needed = size(dbPath()) + size(dbPath() + '-wal');
  const free = freeSpace();
  if (free != null && free < needed * 1.2) {
    const error = Error('not_enough_free_space_for_vacuum');
    error.status = 507;
    throw error;
  }
  const before = size(dbPath());
  db().exec('VACUUM');
  const result = checkpoint('TRUNCATE');
  return { before, after: size(dbPath()), wal: result.walAfter };
}
