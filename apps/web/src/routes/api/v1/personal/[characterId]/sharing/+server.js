import {db,transaction} from '#lib/server/db.js';
import {sessionUser,input,problem,respond} from '#lib/server/api.js';
import {loadPersonal,newPublicToken} from '#lib/server/personal.js';

function sharing(row){
  const shares=db().prepare(`SELECT s.user_id AS userId,s.access,u.display_name AS displayName,u.username
    FROM personal_shares s JOIN users u ON u.id=s.user_id WHERE s.character_id=? ORDER BY u.display_name`).all(row.id);
  const token=db().prepare('SELECT public_token FROM personal_characters WHERE id=?').get(row.id)?.public_token??null;
  return {shares,publicToken:token};
}
/** Who a personal character is shared with, and its public view link (owner only). */
export function GET(event){
  const user=sessionUser(event);
  const {row}=loadPersonal(user,event.params.characterId,'manage');
  return respond({sharing:sharing(row)});
}
/**
 * {shares:[{userId, access:'view'|'edit'}], publicLink:'keep'|'on'|'off'|'regenerate'}.
 * Any active account can be chosen. A public link lets anyone view the build without signing in.
 */
export async function PUT(event){
  const user=sessionUser(event);
  const {row}=loadPersonal(user,event.params.characterId,'manage');
  const body=await input(event.request,32000);
  const shares=Array.isArray(body.shares)?body.shares:[];
  if(shares.length>100||!['keep','on','off','regenerate'].includes(body.publicLink??'keep'))problem(400,'invalid_sharing');
  const active=db().prepare("SELECT 1 FROM users WHERE id=? AND status='active'");
  const clean=new Map();
  for(const share of shares){
    if(typeof share?.userId!=='string'||!active.get(share.userId)||!['view','edit'].includes(share.access))problem(400,'invalid_sharing');
    if(share.userId!==row.owner_user_id)clean.set(share.userId,share.access);
  }
  transaction(sql=>{
    sql.prepare('DELETE FROM personal_shares WHERE character_id=?').run(row.id);
    const add=sql.prepare('INSERT INTO personal_shares(character_id,user_id,access) VALUES(?,?,?)');
    for(const [userId,access] of clean)add.run(row.id,userId,access);
    const link=body.publicLink??'keep';
    if(link==='off')sql.prepare('UPDATE personal_characters SET public_token=NULL WHERE id=?').run(row.id);
    else if(link==='regenerate'||(link==='on'&&!row.public_token))
      sql.prepare('UPDATE personal_characters SET public_token=? WHERE id=?').run(newPublicToken(),row.id);
  });
  return respond({sharing:sharing(row)});
}
