import {db} from '#lib/server/db.js';
import {problem} from '#lib/server/api.js';

/**
 * A character picture. Its address is random and changes with every new picture, so it's
 * cached for good and shown to anyone the character's page reaches (including public links).
 */
export function GET({params}){
  const row=/^[\w-]{20,40}$/.test(params.id)?db().prepare('SELECT content_type,bytes FROM portraits WHERE id=?').get(params.id):null;
  if(!row)problem(404,'picture_not_found');
  return new Response(row.bytes,{headers:{'content-type':row.content_type,
    'cache-control':'public, max-age=31536000, immutable','x-content-type-options':'nosniff',
    'content-security-policy':"default-src 'none'"}});
}
