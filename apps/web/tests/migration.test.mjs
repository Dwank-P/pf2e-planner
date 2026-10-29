import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

// A database as v0.12 left it: icons copied per world, no Foundry-address, sharing or reset tables.
const dir=mkdtempSync(join(tmpdir(),'planner-migration-'));
const path=join(dir,'planner.sqlite');
const old=new DatabaseSync(path);
old.exec(`
  CREATE TABLE users (id TEXT PRIMARY KEY, display_name TEXT NOT NULL, username TEXT UNIQUE COLLATE NOCASE,
    password_hash TEXT, status TEXT NOT NULL, site_role TEXT NOT NULL DEFAULT 'user', created_at INTEGER NOT NULL);
  CREATE TABLE campaigns (id TEXT PRIMARY KEY, title TEXT NOT NULL, owner_id TEXT NOT NULL REFERENCES users(id),
    world_id TEXT NOT NULL, system_id TEXT NOT NULL, created_at INTEGER NOT NULL);
  CREATE TABLE integrations (id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL UNIQUE REFERENCES campaigns(id) ON DELETE CASCADE,
    foundry_origin TEXT NOT NULL, world_id TEXT NOT NULL, created_at INTEGER NOT NULL, revoked_at INTEGER);
  CREATE TABLE bridge_credentials (id TEXT PRIMARY KEY, integration_id TEXT NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id), access_hash TEXT NOT NULL UNIQUE, access_expires_at INTEGER NOT NULL,
    refresh_hash TEXT NOT NULL UNIQUE, refresh_expires_at INTEGER NOT NULL, previous_refresh_hash TEXT, revoked_at INTEGER, created_at INTEGER NOT NULL);
  CREATE TABLE character_builds (id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, name TEXT NOT NULL, level INTEGER NOT NULL,
    build_json TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
  CREATE TABLE catalog_icons (integration_id TEXT NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
    path TEXT NOT NULL, sha256 TEXT NOT NULL, content_type TEXT NOT NULL, bytes BLOB NOT NULL,
    updated_at INTEGER NOT NULL, PRIMARY KEY(integration_id,path));
  INSERT INTO users VALUES ('u1','GM','gm','x','active','owner',1);
  INSERT INTO campaigns VALUES ('c1','One','u1','w1','pf2e',1),('c2','Two','u1','w2','pf2e',1);
  INSERT INTO integrations VALUES ('i1','c1','https://one.example',  'w1',1,NULL),('i2','c2','https://two.example','w2',1,NULL);
  INSERT INTO bridge_credentials VALUES ('k1','i1','u1','a1',9,'r1',9,NULL,NULL,1);
  INSERT INTO character_builds VALUES ('b1','c1','u1','Hero',3,'{}',1,1,1);
  INSERT INTO catalog_icons VALUES ('i1','systems/pf2e/a.webp','aaa','image/webp',x'52494646',1),
    ('i2','systems/pf2e/a.webp','aaa','image/webp',x'52494646',2),('i2','systems/pf2e/b.webp','bbb','image/webp',x'52494647',2);
`);
old.close();

test('a v0.12 database upgrades in place without losing data',async()=>{
  process.env.DB_PATH=path;
  const {db}=await import('../src/lib/server/db.js');
  const sql=db();
  assert.equal(sql.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  assert.deepEqual(sql.prepare('PRAGMA foreign_key_check').all(),[]);
  // Icons: one shared image per hash, each world keeps its own paths.
  assert.equal(sql.prepare("SELECT 1 FROM sqlite_master WHERE name='catalog_icons'").get(),undefined);
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM icon_blobs').get().n,2);
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM integration_icons').get().n,3);
  // Foundry addresses, sharing default, credential origin column.
  assert.deepEqual(sql.prepare('SELECT integration_id,origin FROM integration_origins ORDER BY integration_id').all()
    .map(r=>[r.integration_id,r.origin]),[['i1','https://one.example'],['i2','https://two.example']]);
  assert.equal(sql.prepare("SELECT visibility FROM character_builds WHERE id='b1'").get().visibility,'private');
  assert.equal(sql.prepare("SELECT origin FROM bridge_credentials WHERE id='k1'").get().origin,null);
  for(const table of ['character_shares','password_resets','campaign_invite_links'])
    assert.ok(sql.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table),table);
});

test('backups are consistent copies that pass an integrity check and are pruned',async()=>{
  process.env.PLANNER_BACKUP_DIR=join(dir,'backups');
  process.env.PLANNER_BACKUP_KEEP='2';
  const {backupNow,listBackups,verifyBackup}=await import('../src/lib/server/backup.js');
  const first=backupNow();
  assert.ok(first.verified);
  assert.equal(first.users,1);
  const copy=new DatabaseSync(join(dir,'backups',first.name),{readOnly:true});
  assert.equal(copy.prepare("SELECT name FROM character_builds WHERE id='b1'").get().name,'Hero','a restore would have the data');
  copy.close();
  // Names have one-second resolution; make older copies to exercise pruning.
  const {copyFileSync}=await import('node:fs');
  for(const stamp of ['20200101-000000','20200102-000000'])copyFileSync(join(dir,'backups',first.name),join(dir,'backups',`planner-${stamp}.sqlite`));
  await new Promise(r=>setTimeout(r,1100));
  const second=backupNow();
  assert.ok(second.removed.length>=1,'older backups beyond PLANNER_BACKUP_KEEP are removed');
  assert.equal(listBackups().length,2);
  assert.ok(verifyBackup(join(dir,'backups',second.name)).ok);
});

test.after(async()=>{
  const {db}=await import('../src/lib/server/db.js');
  try{db().close();}catch{}
  try{rmSync(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100});}catch(error){console.warn('left',dir,error.code);}
});

test('invite links expiring in months keep to the end of short months',async()=>{
  const {expiryFor}=await import('../src/lib/server/invite-links.js');
  const at=iso=>Math.floor(Date.parse(iso)/1000);
  const iso=t=>new Date(t*1000).toISOString().slice(0,10);
  assert.equal(iso(expiryFor({unit:'months',amount:1},at('2026-01-31T10:00:00Z'))),'2026-02-28');
  assert.equal(iso(expiryFor({unit:'months',amount:1},at('2028-01-31T10:00:00Z'))),'2028-02-29','leap year');
  assert.equal(iso(expiryFor({unit:'years',amount:1},at('2028-02-29T10:00:00Z'))),'2029-02-28');
  assert.equal(iso(expiryFor({unit:'months',amount:13},at('2026-03-15T10:00:00Z'))),'2027-04-15');
  assert.equal(expiryFor({unit:'never'}),null);
});

test('cleanup removes an abandoned sync with its pack digests',async()=>{
  const {db}=await import('../src/lib/server/db.js');
  const {cleanup}=await import('../src/lib/server/storage.js');
  const sql=db();
  sql.prepare(`INSERT INTO catalog_imports(id,integration_id,expected_count,packs_json,variants_json,sources_json,created_at)
    VALUES('old-import','i1',1,'[]','{}','{}',1)`).run();
  sql.prepare(`INSERT INTO catalog_import_digests(integration_id,import_id,pack,sha256,count) VALUES('i1','old-import','p','x',1)`).run();
  const removed=cleanup();
  assert.ok(removed.some(r=>/Pack digests/.test(r.label)));
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM catalog_import_digests').get().n,0);
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM catalog_imports').get().n,0);
});
