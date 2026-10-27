import {randomUUID} from 'node:crypto';
import {db,unix,transaction} from '#lib/server/db.js';
import {bridgeAuth,input,respond,problem} from '#lib/server/api.js';
import {validateBuild,validateLevelerDocuments,mergeView,characterRights} from '#lib/server/characters.js';
import {combineViews,documentFromLeveler,projectView,viewUuids} from '#lib/leveler-format.js';
import {importCatalog} from '#lib/server/import-catalog.js';
import {importFoundryActor} from '#lib/builder/foundry-import.js';

/**
 * Explicit GM-initiated Foundry actor import. Only metadata and selected Item
 * references are transferred. Private actor notes, biography, secrets, and
 * arbitrary rule data are not exported.
 *
 * Site ownership is the GM account bound to the bridge credential; importing
 * again does not overwrite a website-edited character without overwrite=true.
 *
 * `leveler` carries PF2e Leveler's own creation/plan documents, stored verbatim.
 * `build` (choices read from the actor's Items) only fills gaps Leveler lacks.
 */
export async function POST(event) {
  const auth=bridgeAuth(event,event.params.integrationId,{allowPlayer:true});
  const b=await input(event.request,1000000);
  // A player's own connection sends to their own account, and only updates builds they can edit.
  if(auth.player)b.ownerUserId=auth.user_id;
  const actorId=String(b.actorId||'');
  const name=String(b.name||'').trim();
  if(!/^[a-zA-Z0-9_-]{8,32}$/.test(actorId)||!name||name.length>80||
     !Number.isInteger(b.level)||b.level<1||b.level>20)
    problem(400,'invalid_foundry_actor');
  const actorBuild=validateBuild(b.build??{},{acceptCreationChoices:true});
  const levelerDocs=validateLevelerDocuments(b.leveler);
  // The actor as it is (Bridge ≥0.15); bounded plain JSON shaped like a Pathbuilder export.
  const snapshot=b.actor&&typeof b.actor==='object'&&!Array.isArray(b.actor)&&b.actor.class?b.actor:null;
  if(snapshot&&JSON.stringify(snapshot).length>400000)problem(413,'oversized_actor_snapshot');
  const now=unix(),integrationId=event.params.integrationId;
  const requestedOwner=typeof b.ownerUserId==='string'?b.ownerUserId:auth.user_id;
  const activeMember=db().prepare(`SELECT 1 FROM users u JOIN memberships m ON m.user_id=u.id
    WHERE m.campaign_id=? AND u.id=? AND u.status='active'`)
    .get(auth.campaign_id,requestedOwner);
  if(requestedOwner!==auth.user_id&&!activeMember)
    problem(403,'requested_owner_is_not_campaign_member');
  const owner=requestedOwner;
  const result=transaction(sql=>{
    const published=sql.prepare('SELECT snapshot_id FROM catalog_publications WHERE integration_id=?')
      .get(integrationId);
    if(!published)problem(409,'sync_catalog_before_importing_characters');
    const exists=sql.prepare(`SELECT 1 FROM catalog_entries
      WHERE integration_id=? AND snapshot_id=? AND uuid=?`);
    const known=uuid=>!!exists.get(integrationId,published.snapshot_id,uuid);
    // Actor-derived references must exist in the catalog (dropped and counted);
    // Leveler entries are kept verbatim and counted when their pack isn't synchronized.
    let dropped=0;
    const keep=uuid=>known(uuid)||(dropped++,false);
    const build=actorBuild;
    for(const key of ['classUuid','secondClassUuid','ancestryUuid','heritageUuid','backgroundUuid'])
      if(build[key]&&!keep(build[key]))build[key]=null;
    for(const [key,uuid] of Object.entries(build.feats))if(!keep(uuid))delete build.feats[key];
    build.equipment=build.equipment.filter(keep);
    for(const [rank,uuids] of Object.entries(build.spells))build.spells[rank]=uuids.filter(keep);
    let characterDoc,skipped,report=null;
    const loaded=snapshot?importCatalog(integrationId):null;
    if(loaded){
      // Bridge ≥0.15: the actor itself (items, boosts, feats by slot) plus Leveler's documents.
      const result=importFoundryActor(snapshot,levelerDocs,loaded.catalog,loaded.variants);
      characterDoc=documentFromLeveler({creation:result.creation,plan:result.plan},
        {modifiers:build.modifiers,wishlist:result.planner.wishlist});
      report=result.report;
      skipped=report.missing.length+viewUuids(projectView(characterDoc)).filter(uuid=>!known(uuid)).length;
    }else{
      // Bridge ≤0.6.1 sends only the wizard's class choices inside build.creationChoices.
      const {dualClassBoosts,...choices}=build.creationChoices;
      const creation=levelerDocs.creation??(Object.keys(build.creationChoices).length
        ? {...choices,...(dualClassBoosts?{boosts:{dualClass:dualClassBoosts}}:{})}:null);
      const base=documentFromLeveler({...levelerDocs,creation},{modifiers:build.modifiers});
      const view=combineViews(projectView(base),build);
      characterDoc=mergeView(auth.campaign_id,base,view);
      skipped=dropped+viewUuids(projectView(characterDoc)).filter(uuid=>!known(uuid)).length;
    }
    const link=sql.prepare(`SELECT character_id FROM foundry_actor_links
      WHERE integration_id=? AND actor_id=?`).get(integrationId,actorId);
    if(link){
      const old=sql.prepare('SELECT * FROM character_builds WHERE id=?').get(link.character_id);
      if(old&&auth.player&&!characterRights({id:auth.user_id,site_role:auth.site_role},old).edit)
        problem(403,'actor_linked_to_a_character_you_cannot_edit');
      if(old && !b.overwrite)
        return {characterId:old.id,existing:true,updated:false,skipped,report,
          message:'Already linked; website changes were preserved.'};
      if(old){
        // Explicit GM overwrite may also reassign to a different campaign member.
        sql.prepare(`UPDATE character_builds SET name=?,level=?,build_json=?,owner_user_id=?,revision=revision+1,
          updated_at=? WHERE id=?`)
          .run(name,b.level,JSON.stringify(characterDoc),owner,now,old.id);
        return {characterId:old.id,existing:true,updated:true,skipped,report};
      }
    }
    const id=randomUUID();
    sql.prepare(`INSERT INTO character_builds(id,campaign_id,owner_user_id,name,level,
      build_json,revision,created_at,updated_at)
      VALUES(?,?,?,?,?,?,1,?,?)`)
      .run(id,auth.campaign_id,owner,name,b.level,JSON.stringify(characterDoc),now,now);
    sql.prepare(`INSERT INTO foundry_actor_links(integration_id,actor_id,character_id)
      VALUES(?,?,?) ON CONFLICT(integration_id,actor_id)
      DO UPDATE SET character_id=excluded.character_id`).run(integrationId,actorId,id);
    return {characterId:id,existing:false,updated:true,skipped,report};
  });
  return respond({
    ...result,
    editorPath:'/campaigns/'+encodeURIComponent(auth.campaign_id)+'/characters/'+result.characterId
  },result.existing?200:201);
}
