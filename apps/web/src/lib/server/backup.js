import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readdirSync, statSync, rmSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { db, siteSetting } from './db.js';
import { dbPath, freeSpace } from './storage.js';

/**
 * Database backups: a consistent copy made by SQLite itself (VACUUM INTO, safe while
 * the site runs), checked with PRAGMA integrity_check, kept in PLANNER_BACKUP_DIR
 * (default: a backups folder next to the database) and pruned to the newest few.
 * Made every so many hours (0 turns it off) and on demand. The server owner sets both on the
 * admin page; PLANNER_BACKUP_KEEP (7) and PLANNER_BACKUP_HOURS (24) are the defaults.
 * Copy them off the server too: they live on the same volume as the database.
 */
// A second backup in the same second gets a -2, -3… suffix.
export const BACKUP_NAME = /^planner-\d{8}-\d{6}(?:-\d{1,2})?\.sqlite$/;
export function backupDir() { return resolve(process.env.PLANNER_BACKUP_DIR || join(dirname(resolve(dbPath())), 'backups')); }
export const backupKeep = () => Math.min(100, Math.max(1, Number(siteSetting('backupKeep') ?? process.env.PLANNER_BACKUP_KEEP) || 7));
export const backupHours = () => {
  const h = Number(siteSetting('backupHours') ?? process.env.PLANNER_BACKUP_HOURS ?? 24);
  return Number.isFinite(h) && h >= 0 ? h : 24;
};
const stamp = (d = new Date()) => d.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);

// Newest first: by timestamp, then same-second suffix (no suffix = 1).
const order = name => { const m = /^planner-(\d{8}-\d{6})(?:-(\d{1,2}))?\.sqlite$/.exec(name); return m ? m[1] + '-' + String(m[2] ?? 1).padStart(2, '0') : name; };
export function listBackups() {
  try {
    return readdirSync(backupDir()).filter(n => BACKUP_NAME.test(n)).map(name => {
      const s = statSync(join(backupDir(), name));
      return { name, size: s.size, createdAt: Math.floor(s.mtimeMs / 1000) };
    }).sort((a, b) => order(b.name).localeCompare(order(a.name)));
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
  const base = 'planner-' + stamp();
  let name = base + '.sqlite';
  for (let n = 2; existsSync(join(dir, name)) && n < 100; n++) name = base + '-' + n + '.sqlite';
  const path = join(dir, name);
  db().exec(`VACUUM INTO '${path.replaceAll("'", "''")}'`);
  const check = verifyBackup(path);
  if (!check.ok) { rmSync(path, { force: true }); throw Object.assign(Error('backup_failed_integrity_check'), { status: 500 }); }
  return { name, size: statSync(path).size, verified: true, users: check.users, removed: pruneBackups() };
}

/** Delete backups beyond the number to keep (oldest first). */
export function pruneBackups() {
  const removed = [];
  for (const old of listBackups().slice(backupKeep())) { rmSync(join(backupDir(), old.name), { force: true }); removed.push(old.name); }
  return removed;
}
export function deleteBackup(name) {
  if (!BACKUP_NAME.test(name)) return false;
  const path = join(backupDir(), name);
  try { statSync(path); } catch { return false; }
  rmSync(path, { force: true });
  return true;
}

let timer = null;
/** Hourly check: back up when the newest backup is older than the schedule (read each time, so changes apply). */
export function startBackupSchedule() {
  if (timer || dbPath() === ':memory:') return;
  const due = () => {
    if (backupHours() === 0) return;
    const newest = listBackups()[0];
    if (newest && Date.now() / 1000 - newest.createdAt < backupHours() * 3600) return;
    try { const r = backupNow(); console.info('[PF2e Planner] Backup', r.name, 'verified'); }
    catch (error) { console.warn('[PF2e Planner] Scheduled backup failed:', error.message); }
  };
  timer = setInterval(due, 3600 * 1000);
  timer.unref?.();
  setTimeout(due, 5 * 60 * 1000).unref?.();
}
