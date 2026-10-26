import {input,respond,problem,sessionUser} from '#lib/server/api.js';
import {listBackups,backupNow,backupDir} from '#lib/server/backup.js';

function requireOwner(event){
  const user=sessionUser(event);
  if(user.site_role!=='owner')problem(403,'owner_required');
}
/** Backups on the server (newest first) and where they are kept. */
export function GET(event){
  requireOwner(event);
  return respond({dir:backupDir(),backups:listBackups(),
    every:Number(process.env.PLANNER_BACKUP_HOURS??24),keep:Number(process.env.PLANNER_BACKUP_KEEP)||7});
}
/** Make a verified backup now. */
export async function POST(event){
  requireOwner(event);
  await input(event.request);
  try{return respond({backup:backupNow(),backups:listBackups()},201);}
  catch(error){
    if(error?.status)problem(error.status,error.message);
    throw error;
  }
}
