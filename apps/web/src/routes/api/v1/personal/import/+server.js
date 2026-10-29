import {randomUUID} from 'node:crypto';
import {db,unix,transaction} from '#lib/server/db.js';
import {sessionUser,input,problem,respond,throttle} from '#lib/server/api.js';
import {validateDocument,validateDnd5eDocument} from '#lib/server/characters.js';
import {availableSources,personalCatalog,personalRights,toPersonal,packageOf} from '#lib/server/personal.js';
import {readImport,transplant,classBySlug,planCreation} from '#lib/server/transfer.js';

/**
 * Import a character export into My characters: {export}. The new character keeps the build's
 * variant rules and uses every package available to the player (most recently synced world
 * each); items are matched by uuid, then name and type, and the rest is reported.
 */
export async function POST(event){
  const user=sessionUser(event);
  throttle(event,'character-import',30,600);
  const body=await input(event.request,2000000);
  const source=readImport(body.export,body.fileName);
  const count=db().prepare('SELECT COUNT(*) AS n FROM personal_characters WHERE owner_user_id=?').get(user.id).n;
  if(count>=100)problem(409,'maximum_100_personal_characters');
  const packages=availableSources(user.id,source.system);
  if(!packages.length)problem(409,'no_synced_world_for_this_system');
  const id=randomUUID(),now=unix();
  transaction(sql=>{
    sql.prepare(`INSERT INTO personal_characters(id,owner_user_id,name,level,system,variants_json,build_json,revision,created_at,updated_at)
      VALUES(?,?,?,?,?,?,'{}',1,?,?)`).run(id,user.id,source.name,source.level,source.system,JSON.stringify(source.variants),now,now);
    const add=sql.prepare('INSERT INTO personal_sources(character_id,package,integration_id) VALUES(?,?,?)');
    for(const p of packages)add.run(id,p.package,p.worlds[0].integrationId);
  });
  const row=db().prepare('SELECT * FROM personal_characters WHERE id=?').get(id);
  const catalog=personalCatalog(row);
  const find=db().prepare(`SELECT uuid FROM catalog_entries WHERE integration_id=? AND snapshot_id=? AND type=? AND name=? COLLATE NOCASE`);
  const byName=(type,name)=>{
    for(const [pkg,w] of catalog.sources)
      for(const hit of find.all(w.integrationId,w.snapshotId,type,name))if(packageOf(hit.uuid)===pkg)return hit.uuid;
    return null;
  };
  if(source.levelerPlan)source.document.leveler.creation=planCreation(classBySlug(
    [...catalog.sources].map(([pkg,w])=>({integrationId:w.integrationId,snapshotId:w.snapshotId,package:pkg})),source.classSlug));
  try{
    const {doc,report}=transplant(source,{has:catalog.has,byName,variants:null});
    const valid=source.system==='dnd5e'?validateDnd5eDocument(null,null,doc,{catalog}):validateDocument(null,null,doc,{catalog});
    db().prepare('UPDATE personal_characters SET build_json=? WHERE id=?').run(JSON.stringify(valid),id);
    const saved=db().prepare('SELECT * FROM personal_characters WHERE id=?').get(id);
    return respond({character:toPersonal(saved,{rights:personalRights(user,saved),includeDocument:false}),report},201);
  }catch(error){
    db().prepare('DELETE FROM personal_characters WHERE id=?').run(id);
    throw error;
  }
}
