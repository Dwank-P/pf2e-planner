import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readdirSync, statSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { db } from './db.js';
import { dbPath, freeSpace } from './storage.js';

/**
 * Database backups: a consistent copy made by SQLite itself (VACUUM INTO, safe while
 * the site runs), checked with PRAGMA integrity_check, kept in PLANNER_BACKUP_DIR
 * (default: a backups folder next to the database) and pruned to PLANNER_BACKUP_KEEP.
 * Made every PLANNER_BACKUP_HOURS (default 24; 0 turns it off) and on demand.
 * Copy them off the server too: they live on the same volume as the database.
 */
export const BACKUP_NAME = /^planner-\d{8}-\d{6}\.sqlite$/;
export function backupDir() { return resolve(process.env.PLANNER_BACKUP_DIR || join(dirname(resolve(dbPath())), 'backups')); }
const keep = () => Math.max(1, Number(process.env.PLANNER_BACKUP_KEEP) || 7);
const hours = () => { const h = Number(process.env.PLANNER_BACKUP_HOURS ?? 24); return Number.isFinite(h) && h >= 0 ? h : 24; };
const stamp = (d = new Date()) => d.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);

export function listBackups() {
  try {
    return readdirSync(backupDir()).filter(n => BACKUP_NAME.test(n)).map(name => {
      const s = statSync(join(backupDir(), name));
      return { name, size: s.size, createdAt: Math.floor(s.mtimeMs / 1000) };
    }).sort((a, b) => b.name.localeCompare(a.name));
  } catch { return []; }
}
/** Check a backup opens and passes SQLite's integrity check (a restore drill without restoring). */
export function verifyBackup(path) {
  const copy = new DatabaseSync(path, { readOnly: true });
  try {
    const result = copy.prepare('PRAGMA integrity_check').get();
    const users = copy.prepare('SELECT COUNT(*) AS n FROM users').get().n;
    return { ok: Object.values(result)[0] === 'ok', users: Number(users) };
  } finally { copy.close(); }
}
export function backupNow() {
  if (dbPath() === ':memory:') throw Object.assign(Error('backup_unavailable'), { status: 409 });
  const dir = backupDir();
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const needed = statSync(dbPath()).size;
  const free = freeSpace();
  if (free != null && free < needed * 1.5 + 32 * 1024 * 1024)
    throw Object.assign(Error('not_enough_free_space_for_backup'), { status: 507 });
  const name = 'planner-' + stamp() + '.sqlite';
  const path = join(dir, name);
  db().exec(`VACUUM INTO '${path.replaceAll("'", "''")}'`);
  const check = verifyBackup(path);
  if (!check.ok) { rmSync(path, { force: true }); throw Object.assign(Error('backup_failed_integrity_check'), { status: 500 }); }
  const removed = [];
  for (const old of listBackups().slice(keep())) { rmSync(join(dir, old.name), { force: true }); removed.push(old.name); }
  return { name, size: statSync(path).size, verified: true, users: check.users, removed };
}

let timer = null;
/** Hourly check: back up when the newest backup is older than PLANNER_BACKUP_HOURS. */
export function startBackupSchedule() {
  if (timer || hours() === 0 || dbPath() === ':memory:') return;
  const due = () => {
    const newest = listBackups()[0];
    if (newest && Date.now() / 1000 - newest.createdAt < hours() * 3600) return;
    try { const r = backupNow(); console.info('[PF2e Planner] Backup', r.name, 'verified'); }
    catch (error) { console.warn('[PF2e Planner] Scheduled backup failed:', error.message); }
  };
  timer = setInterval(due, 3600 * 1000);
  timer.unref?.();
  setTimeout(due, 5 * 60 * 1000).unref?.();
}
