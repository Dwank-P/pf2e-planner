import {randomUUID} from 'node:crypto';
import {db,unix} from '#lib/server/db.js';
import {sessionUser,input,problem,respond} from '#lib/server/api.js';
import {emptyDocument} from '#lib/leveler-format.js';
import {emptyDnd5eDocument} from '#lib/server/characters.js';
import {toPersonal,personalRights,sharedWorlds} from '#lib/server/personal.js';

/** The player's own characters and those shared with them, plus whether any world shares compendiums. */
export function GET(event){
  const user=sessionUser(event);
  const rows=db().prepare(`SELECT c.* FROM personal_characters c WHERE c.owner_user_id=?
    UNION SELECT c.* FROM personal_characters c JOIN personal_shares s ON s.character_id=c.id WHERE s.user_id=?
    ORDER BY updated_at DESC LIMIT 300`).all(user.id,user.id);
  const worlds=sharedWorlds(user.id);
  return respond({characters:rows.map(r=>toPersonal(r,{rights:personalRights(user,r),includeDocument:false})),
    sharedWorlds:{pf2e:worlds.filter(w=>w.systemId!=='dnd5e').length,dnd5e:worlds.filter(w=>w.systemId==='dnd5e').length}});
}
/** Start a personal character: {name, system:'pf2e'|'dnd5e'}. Sources and rules are chosen next. */
export async function POST(event){
  const user=sessionUser(event);
  const body=await input(event.request,4000);
  const name=typeof body.name==='string'?body.name.trim():'';
  if(!name||name.length>80)problem(400,'character_name_required');
  if(!['pf2e','dnd5e'].includes(body.system))problem(400,'invalid_rules_system');
  const count=db().prepare('SELECT COUNT(*) AS n FROM personal_characters WHERE owner_user_id=?').get(user.id).n;
  if(count>=100)problem(409,'maximum_100_personal_characters');
  const doc=body.system==='dnd5e'?emptyDnd5eDocument():emptyDocument();
  const variants=body.system==='dnd5e'?{rulesVersion:'modern',allowFeats:true}:{freeArchetype:false,dualClass:false,ancestralParagon:false,mythic:false};
  const id=randomUUID(),now=unix();
  db().prepare(`INSERT INTO personal_characters(id,owner_user_id,name,level,system,variants_json,build_json,revision,created_at,updated_at)
    VALUES(?,?,?,1,?,?,?,1,?,?)`).run(id,user.id,name,body.system,JSON.stringify(variants),JSON.stringify(doc),now,now);
  const row=db().prepare('SELECT * FROM personal_characters WHERE id=?').get(id);
  return respond({character:toPersonal(row,{rights:personalRights(user,row)})},201);
}
