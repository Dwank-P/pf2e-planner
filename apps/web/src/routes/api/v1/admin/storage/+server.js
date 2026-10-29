import {input,respond,problem,sessionUser} from '#lib/server/api.js';
import {storageReport,checkpoint,cleanup,optimize,vacuum} from '#lib/server/storage.js';

function requireOwner(event){
  const user=sessionUser(event);
  if(user.site_role!=='owner')problem(403,'owner_required');
  return user;
}
/** Database, WAL, compendium, character and icon usage, overall and per world. */
export function GET(event){
  requireOwner(event);
  return respond(storageReport());
}
/** Maintenance: checkpoint, cleanup, optimize or vacuum (one at a time). */
export async function POST(event){
  requireOwner(event);
  const body=await input(event.request);
  let result;
  try{
    switch(body.action){
      case 'checkpoint':result=checkpoint('TRUNCATE');break;
      case 'cleanup':result={removed:cleanup(),checkpoint:checkpoint('TRUNCATE')};break;
      case 'optimize':result=optimize();break;
      case 'vacuum':result=vacuum();break;
      default:problem(400,'unknown_storage_action');
    }
  }catch(error){
    if(error?.status===507)problem(507,'not_enough_free_space_for_vacuum');
    throw error;
  }
  return respond({action:body.action,result,report:storageReport()});
}
