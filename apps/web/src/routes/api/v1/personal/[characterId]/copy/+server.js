import {randomUUID} from 'node:crypto';
import {db,unix} from '#lib/server/db.js';
import {sessionUser,requireMembership,input,problem,respond} from '#lib/server/api.js';
import {catalogFor,validateDocument,validateDnd5eDocument,toCharacter,campaignSystem} from '#lib/server/characters.js';
import {loadPersonal,personalCatalog,familyOf} from '#lib/server/personal.js';

const UUIDS=/Compendium\.[\w-]+\.[\w-]+\.Item\.[\w-]+/g;
const VARIANT_NAMES={freeArchetype:'Free Archetype',dualClass:'Dual Class',ancestralParagon:'Ancestral Paragon',mythic:'Mythic',
  gradualAbilityBoosts:'Gradual Boosts',proficiencyWithoutLevel:'Proficiency Without Level'};
const ABP_NAMES={noABP:'off',ABPFundamentalPotency:'fundamental potency',ABPRulesAsWritten:'rules as written'};

/** Drop references to items the campaign doesn't have (Leveler documents: {uuid,…} entries). */
function pruneLeveler(value,missing){
  if(Array.isArray(value))return value.filter(v=>!(v&&typeof v==='object'&&missing.has(v.uuid))&&!missing.has(v)).map(v=>pruneLeveler(v,missing));
  if(!value||typeof value!=='object')return value;
  const out={};
  for(const [key,entry] of Object.entries(value)){
    if(entry&&typeof entry==='object'&&!Array.isArray(entry)&&missing.has(entry.uuid))out[key]=null;
    else if(typeof entry==='string'&&missing.has(entry))continue;
    else out[key]=pruneLeveler(entry,missing);
  }
  return out;
}
function prune5e(build,missing){
  const has=text=>[...String(text).matchAll(UUIDS)].some(m=>missing.has(m[0]));
  const list=v=>Array.isArray(v)?v.filter(x=>!missing.has(x)):v;
  const object=(o,fn)=>Object.fromEntries(Object.entries(o??{}).filter(([k])=>!has(k)).map(([k,v])=>[k,fn(v)]).filter(([,v])=>v!==undefined));
  return {...build,speciesUuid:missing.has(build.speciesUuid)?null:build.speciesUuid,
    backgroundUuid:missing.has(build.backgroundUuid)?null:build.backgroundUuid,
    levels:list(build.levels??[]),feats:list(build.feats??[]),
    subclasses:object(build.subclasses,v=>missing.has(v)?undefined:v),
    spells:object(build.spells,list),
    choices:object(build.choices,v=>Array.isArray(v)?list(v):v?.mode==='feat'&&missing.has(v.uuid)?undefined:v)};
}

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
  const doc=JSON.parse(row.build_json);
  const text=JSON.stringify(doc);
  const byName=db().prepare(`SELECT uuid FROM catalog_entries WHERE integration_id=? AND snapshot_id=?
    AND type=? AND name=? COLLATE NOCASE LIMIT 1`);
  const pub=db().prepare('SELECT snapshot_id FROM catalog_publications WHERE integration_id=?').get(target.integrationId);
  const map=new Map(),missing=new Set(),missingNames=new Set();
  let matched=0,renamed=0;
  for(const uuid of new Set([...text.matchAll(UUIDS)].map(m=>m[0]))){
    if(target.has(uuid)){matched++;continue;}
    const item=source.resolve(uuid);
    const other=item?byName.get(target.integrationId,pub.snapshot_id,item.type,item.name)?.uuid:null;
    if(other){map.set(uuid,other);renamed++;}
    else{missing.add(uuid);missingNames.add(item?.name??uuid);}
  }
  let copied=JSON.parse(map.size?text.replace(UUIDS,m=>map.get(m)??m):text);
  if(row.system==='dnd5e')copied={...copied,build:prune5e(copied.build??{},missing)};
  else copied={...copied,leveler:pruneLeveler(copied.leveler,missing),
    planner:{...copied.planner,extraFeats:Object.fromEntries(Object.entries(copied.planner?.extraFeats??{}).filter(([,u])=>!missing.has(u)))}};
  if(copied.planner?.wishlist)copied.planner.wishlist=copied.planner.wishlist.filter(w=>!missing.has(w.uuid));
  const own=JSON.parse(row.variants_json||'{}');
  // Boosts planned for a different schedule (gradual or every five levels) don't carry over.
  const boostsDiffer=row.system!=='dnd5e'&&(own.gradualAbilityBoosts===true)!==(target.variants.gradualAbilityBoosts===true);
  if(boostsDiffer)for(const data of Object.values(copied.leveler?.plan?.levels??{}))if(data&&typeof data==='object')delete data.abilityBoosts;
  const valid=row.system==='dnd5e'?validateDnd5eDocument(campaignId,null,copied):validateDocument(campaignId,null,copied);
  // Variant rules follow the campaign; say where they differ from the character's own.
  const differences=row.system==='dnd5e'
    ?(own.rulesVersion&&target.variants.rulesVersion&&own.rulesVersion!==target.variants.rulesVersion
      ?[`Rules: ${own.rulesVersion==='modern'?'2024':'2014'} here, ${target.variants.rulesVersion==='modern'?'2024':'2014'} in the campaign`]:[])
    :Object.entries(VARIANT_NAMES).filter(([k])=>(own[k]===true)!==(target.variants[k]===true))
      .map(([k,label])=>`${label}: ${own[k]===true?'on':'off'} here, ${target.variants[k]===true?'on':'off'} in the campaign`)
      .concat((own.automaticBonusProgression??'noABP')!==(target.variants.automaticBonusProgression??'noABP')
        ?[`Automatic Bonus Progression: ${ABP_NAMES[own.automaticBonusProgression??'noABP']} here, ${ABP_NAMES[target.variants.automaticBonusProgression??'noABP']??target.variants.automaticBonusProgression} in the campaign`]:[])
      .concat(boostsDiffer?['Attribute boosts from level 2 were cleared, since the campaign uses the other boost schedule']:[]);
  const count=db().prepare('SELECT COUNT(*) AS n FROM character_builds WHERE campaign_id=? AND owner_user_id=?').get(campaignId,user.id).n;
  if(count>=50)problem(409,'maximum_50_characters_per_player');
  const id=randomUUID(),now=unix();
  db().prepare(`INSERT INTO character_builds(id,campaign_id,owner_user_id,name,level,build_json,revision,created_at,updated_at)
    VALUES(?,?,?,?,?,?,1,?,?)`).run(id,campaignId,user.id,row.name,row.level,JSON.stringify(valid),now,now);
  return respond({character:toCharacter(db().prepare('SELECT * FROM character_builds WHERE id=?').get(id),{includeLeveler:false}),
    report:{matched,renamed,missing:[...missingNames].sort(),variantDifferences:differences}},201);
}
