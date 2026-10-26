import {createReadStream,statSync} from 'node:fs';
import {Readable} from 'node:stream';
import {join} from 'node:path';
import {problem,sessionUser} from '#lib/server/api.js';
import {BACKUP_NAME,backupDir} from '#lib/server/backup.js';
/** Download one backup (server owner only), to keep a copy off the server. */
export function GET(event){
  const user=sessionUser(event);
  if(user.site_role!=='owner')problem(403,'owner_required');
  const name=event.params.name;
  if(!BACKUP_NAME.test(name))problem(404,'backup_not_found');
  const path=join(backupDir(),name);
  let size;
  try{size=statSync(path).size;}catch{problem(404,'backup_not_found');}
  return new Response(Readable.toWeb(createReadStream(path)),{headers:{
    'content-type':'application/vnd.sqlite3','content-length':String(size),
    'content-disposition':`attachment; filename="${name}"`}});
}
