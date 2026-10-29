import {randomBytes} from 'node:crypto';
import {db,unix} from './db.js';
import {problem} from './api.js';

/** Largest stored picture. The website crops and compresses to 320×320 (about 20–60 KB) first. */
export const PORTRAIT_MAX_BYTES=200*1024;
const TYPES=[
  ['image/webp',b=>b.subarray(0,4).toString('latin1')==='RIFF'&&b.subarray(8,12).toString('latin1')==='WEBP'],
  ['image/jpeg',b=>b[0]===0xff&&b[1]===0xd8&&b[2]===0xff],
  ['image/png',b=>b.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))]
];
export const portraitUrl=id=>id?'/api/v1/portraits/'+id:null;

/** A data: URL from the website's crop tool → {contentType, bytes}; the bytes decide the type. */
export function readPortrait(value){
  const match=typeof value==='string'?/^data:image\/[\w.+-]+;base64,([A-Za-z0-9+/=]+)$/.exec(value):null;
  if(!match)problem(400,'invalid_picture');
  const bytes=Buffer.from(match[1],'base64');
  if(!bytes.length)problem(400,'invalid_picture');
  if(bytes.length>PORTRAIT_MAX_BYTES)problem(413,'picture_too_large');
  const type=TYPES.find(([,test])=>test(bytes));
  if(!type)problem(400,'invalid_picture');
  return {contentType:type[0],bytes};
}
/**
 * Store a character's new picture (or remove it with null). The database triggers delete the
 * previous picture when portrait_id changes. table: 'character_builds' or 'personal_characters'.
 */
export function setPortrait(table,characterId,picture){
  if(!['character_builds','personal_characters'].includes(table))throw Error('bad table');
  const sql=db();
  sql.exec('BEGIN IMMEDIATE');
  try{
    let id=null;
    if(picture){
      id=randomBytes(18).toString('base64url');
      sql.prepare('INSERT INTO portraits(id,content_type,bytes,created_at) VALUES(?,?,?,?)').run(id,picture.contentType,picture.bytes,unix());
    }
    sql.prepare(`UPDATE ${table} SET portrait_id=? WHERE id=?`).run(id,characterId);
    sql.exec('COMMIT');
    return portraitUrl(id);
  }catch(error){sql.exec('ROLLBACK');throw error;}
}
/** A copy of a picture for a copied character (each character owns its own). */
export function copyPortrait(id){
  if(!id)return null;
  const row=db().prepare('SELECT content_type,bytes FROM portraits WHERE id=?').get(id);
  if(!row)return null;
  const copy=randomBytes(18).toString('base64url');
  db().prepare('INSERT INTO portraits(id,content_type,bytes,created_at) VALUES(?,?,?,?)').run(copy,row.content_type,row.bytes,unix());
  return copy;
}
