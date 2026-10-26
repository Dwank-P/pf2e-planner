import {db,unix,transaction} from '#lib/server/db.js';
import {sessionUser,input,problem,respond} from '#lib/server/api.js';
import {loadPersonal,availableSources,retainPicks,listSources} from '#lib/server/personal.js';

const PF2E_VARIANTS=['freeArchetype','dualClass','ancestralParagon','mythic','ignoreArchetypeDedicationLock',
  'gradualAbilityBoosts','proficiencyWithoutLevel'];
const ABP=['noABP','ABPFundamentalPotency','ABPRulesAsWritten'];

/**
 * The character's own variant rules and sources (owner only):
 * {variants, sources:[{package, integrationId}]}. Sources must be packages that a world
 * the owner belongs to shares; a package comes from one world. Items picked from a source
 * that is removed or switched are kept for the character.
 */
export async function PUT(event){
  const user=sessionUser(event);
  const {row}=loadPersonal(user,event.params.characterId,'manage');
  const body=await input(event.request,64000);
  const raw=body.variants??{};
  if(!raw||typeof raw!=='object'||Array.isArray(raw))problem(400,'invalid_variants');
  let variants;
  if(row.system==='dnd5e'){
    if(!['modern','legacy'].includes(raw.rulesVersion))problem(400,'invalid_variants');
    variants={rulesVersion:raw.rulesVersion,allowFeats:raw.allowFeats!==false};
  }else{
    variants=Object.fromEntries(PF2E_VARIANTS.map(k=>[k,raw[k]===true]));
    variants.automaticBonusProgression=ABP.includes(raw.automaticBonusProgression)?raw.automaticBonusProgression:'noABP';
  }
  const wanted=Array.isArray(body.sources)?body.sources:[];
  if(wanted.length>300)problem(400,'invalid_sources');
  const offered=new Map(availableSources(user.id,row.system).map(s=>[s.package,new Set(s.worlds.map(w=>w.integrationId))]));
  const chosen=new Map();
  for(const s of wanted){
    if(typeof s?.package!=='string'||typeof s?.integrationId!=='string'||!offered.get(s.package)?.has(s.integrationId))
      problem(400,'source_not_shared_with_you');
    if(chosen.has(s.package))problem(400,'one_world_per_package');
    chosen.set(s.package,s.integrationId);
  }
  transaction(sql=>{
    const current=sql.prepare('SELECT package,integration_id FROM personal_sources WHERE character_id=?').all(row.id);
    // Keep what the character picked from sources it is leaving (or switching to another world).
    const leaving=new Map();
    for(const c of current)if(chosen.get(c.package)!==c.integration_id){
      if(!leaving.has(c.integration_id))leaving.set(c.integration_id,new Set());
      leaving.get(c.integration_id).add(c.package);
    }
    for(const [integrationId,packages] of leaving)retainPicks(sql,{integrationId,packages,characterId:row.id});
    sql.prepare('DELETE FROM personal_sources WHERE character_id=?').run(row.id);
    const add=sql.prepare('INSERT INTO personal_sources(character_id,package,integration_id) VALUES(?,?,?)');
    for(const [name,integrationId] of chosen)add.run(row.id,name,integrationId);
    sql.prepare('UPDATE personal_characters SET variants_json=?,updated_at=? WHERE id=?').run(JSON.stringify(variants),unix(),row.id);
  });
  const updated=db().prepare('SELECT * FROM personal_characters WHERE id=?').get(row.id);
  return respond({variants,sources:listSources(updated)});
}
