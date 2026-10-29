import {input,respond,problem,sessionUser} from '#lib/server/api.js';
import {setSiteSetting} from '#lib/server/db.js';
import {listBackups,backupNow,backupDir,backupKeep,backupHours,pruneBackups} from '#lib/server/backup.js';

function requireOwner(event){
  const user=sessionUser(event);
  if(user.site_role!=='owner')problem(403,'owner_required');
}
const state=()=>({dir:backupDir(),backups:listBackups(),every:backupHours(),keep:backupKeep()});
/** Backups on the server (newest first), where they are kept, and the schedule. */
export function GET(event){
  requireOwner(event);
  return respond(state());
}
/** Make a verified backup now. */
export async function POST(event){
  requireOwner(event);
  await input(event.request);
  try{return respond({backup:backupNow(),...state()},201);}
  catch(error){
    if(error?.status)problem(error.status,error.message);
    throw error;
  }
}
/** Set the schedule: {every: hours between backups (0 = off), keep: how many to keep}. Extra old ones go now. */
export async function PUT(event){
  requireOwner(event);
  const body=await input(event.request,1000);
  if(!Number.isInteger(body.every)||body.every<0||body.every>24*30)problem(400,'backup_every_0_to_720_hours');
  if(!Number.isInteger(body.keep)||body.keep<1||body.keep>100)problem(400,'backup_keep_1_to_100');
  setSiteSetting('backupHours',body.every);
  setSiteSetting('backupKeep',body.keep);
  const removed=pruneBackups();
  return respond({...state(),removed});
}
