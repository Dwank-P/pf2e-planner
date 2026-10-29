import test from 'node:test';
import assert from 'node:assert/strict';
import { db, unix, transaction, limit } from '../src/lib/server/db.js';

process.env.DB_PATH = ':memory:';

test('schema initializes and foreign keys are enabled',()=>{
  const sql=db();
  assert.equal(sql.prepare('PRAGMA foreign_keys').get().foreign_keys,1);
  const names=sql.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(x=>x.name);
  for(const name of ['users','sessions','campaigns','memberships','invitations','pairing_codes','integrations','bridge_credentials','bridge_spent_refresh_tokens','catalog_previews']) {
    assert.ok(names.includes(name),name);
  }
});

test('failed transaction rolls back atomically',()=>{
 const sql=db();
 assert.throws(()=>transaction(tx=>{
  tx.prepare("INSERT INTO users(id,display_name,status,site_role,created_at) VALUES ('test-id','Test','pending','user',?)").run(unix());
  throw Error('abort');
 }),/abort/);
 assert.equal(sql.prepare("SELECT 1 FROM users WHERE id='test-id'").get(),undefined);
});

test('rate limit is counted within bucket',()=>{
 assert.equal(limit('test-bucket',2,600),true);
 assert.equal(limit('test-bucket',2,600),true);
 assert.equal(limit('test-bucket',2,600),false);
});
