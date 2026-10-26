import {randomUUID} from 'node:crypto';
import {db,unix} from '#lib/server/db.js';
import {sessionUser,requireMembership,input,problem,respond,throttle} from '#lib/server/api.js';
import {catalogFor,validateDocument,validateDnd5eDocument,toCharacter,campaignSystem} from '#lib/server/characters.js';
import {familyOf} from '#lib/server/personal.js';
import {readExport,transplant,campaignByName} from '#lib/server/transfer.js';

/**
 * Import a character exported from a planner (this one or another): {export}. Each item is
 * matched by uuid, then by name and type, against this campaign's compendiums; the rest is
 * left out and reported. The campaign's variant rules apply.
 */
export async function POST(event){
  const user=sessionUser(event),campaignId=event.params.campaignId;
  requireMembership(user,campaignId);
  throttle(event,'character-import',30,600);
  const body=await input(event.request,2000000);
  const source=readExport(body.export);
  if(familyOf(campaignSystem(campaignId))!==source.system)problem(400,'campaign_uses_other_rules_system');
  const target=catalogFor(campaignId);
  if(!target)problem(409,'sync_compendiums_before_selecting_items');
  const {doc,report}=transplant(source,{has:target.has,byName:campaignByName(target.integrationId),variants:target.variants});
  const valid=source.system==='dnd5e'?validateDnd5eDocument(campaignId,null,doc):validateDocument(campaignId,null,doc);
  const count=db().prepare('SELECT COUNT(*) AS n FROM character_builds WHERE campaign_id=? AND owner_user_id=?').get(campaignId,user.id).n;
  if(count>=50)problem(409,'maximum_50_characters_per_player');
  const id=randomUUID(),now=unix();
  db().prepare(`INSERT INTO character_builds(id,campaign_id,owner_user_id,name,level,build_json,revision,created_at,updated_at)
    VALUES(?,?,?,?,?,?,1,?,?)`).run(id,campaignId,user.id,source.name,source.level,JSON.stringify(valid),now,now);
  return respond({character:toCharacter(db().prepare('SELECT * FROM character_builds WHERE id=?').get(id),{includeLeveler:false}),report},201);
}
