import {randomUUID} from 'node:crypto';
import {copyPortrait} from '#lib/server/portraits.js';
import {db,unix} from '#lib/server/db.js';
import {sessionUser,requireMembership,input,problem,respond} from '#lib/server/api.js';
import {catalogFor,validateDocument,validateDnd5eDocument,toCharacter,campaignSystem} from '#lib/server/characters.js';
import {loadPersonal,personalCatalog,familyOf} from '#lib/server/personal.js';
import {transplant,campaignByName} from '#lib/server/transfer.js';

/**
 * Copy a personal character into one of the requester's campaigns as a normal campaign
 * character: each pick is matched by uuid, then by name and type, against the campaign's
 * synced compendiums; picks the world doesn't have are left out and reported.
 */
export async function POST(event){
  const user=sessionUser(event);
  const {row}=loadPersonal(user,event.params.characterId,'view');
  const body=await input(event.request,2000);
  const campaignId=String(body.campaignId||'');
  requireMembership(user,campaignId);
  if(familyOf(campaignSystem(campaignId))!==row.system)problem(400,'campaign_uses_other_rules_system');
  const target=catalogFor(campaignId);
  if(!target)problem(409,'sync_compendiums_before_selecting_items');
  const source=personalCatalog(row);
  const {doc,report}=transplant({system:row.system,document:JSON.parse(row.build_json),variants:JSON.parse(row.variants_json||'{}'),
    nameOf:uuid=>source.resolve(uuid)},{has:target.has,byName:campaignByName(target.integrationId),variants:target.variants});
  const valid=row.system==='dnd5e'?validateDnd5eDocument(campaignId,null,doc):validateDocument(campaignId,null,doc);
  const count=db().prepare('SELECT COUNT(*) AS n FROM character_builds WHERE campaign_id=? AND owner_user_id=?').get(campaignId,user.id).n;
  if(count>=50)problem(409,'maximum_50_characters_per_player');
  const id=randomUUID(),now=unix();
  db().prepare(`INSERT INTO character_builds(id,campaign_id,owner_user_id,name,level,build_json,revision,created_at,updated_at,portrait_id)
    VALUES(?,?,?,?,?,?,1,?,?,?)`).run(id,campaignId,user.id,row.name,row.level,JSON.stringify(valid),now,now,copyPortrait(row.portrait_id));
  return respond({character:toCharacter(db().prepare('SELECT * FROM character_builds WHERE id=?').get(id),{includeLeveler:false}),report},201);
}
