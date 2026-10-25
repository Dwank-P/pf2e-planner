/**
 * Planning-grade legality: the character's state at a level and whether a feat
 * fits it. Prerequisites this can read (skill ranks, attributes, other feats)
 * block; anything else is reported as "check with your GM" and never blocks,
 * because this is a planner. Leveler re-validates against the actor in Foundry.
 */
import {attributeModifiers,skillTraining,SKILLS,ATTRIBUTES,RANKS,titleCase} from './rules.js';
import {ancestryFeatBlock} from '../wizard/options.js';

const FEAT_FIELDS=['ancestryFeat','ancestryParagonFeat','classFeat','dualClassFeat','skillFeat','mythicCalling'];
const FEAT_CATEGORIES=['classFeats','skillFeats','generalFeats','ancestryFeats','archetypeFeats','dualClassFeats','mythicFeats'];
const ATTRIBUTE_WORDS={strength:'str',dexterity:'dex',constitution:'con',intelligence:'int',wisdom:'wis',charisma:'cha'};
const RANK_WORDS={trained:1,expert:2,master:3,legendary:4};
const norm=s=>String(s??'').trim().toLowerCase();

/** Highest skill rank a skill increase may reach at a character level. */
export const maxSkillRank=level=>level>=15?4:level>=7?3:2;

/** Every feat in the build with the level it was taken at. */
export function takenFeats(creation,plan){
  const out=[];
  for(const field of FEAT_FIELDS)if(creation?.[field]?.uuid)out.push({...creation[field],level:1,field});
  for(const [lvl,data] of Object.entries(plan?.levels??{}))
    for(const category of FEAT_CATEGORIES)
      for(const entry of data?.[category]??[])if(entry?.uuid)out.push({...entry,level:Number(lvl),category});
  return out;
}

/** Skill ranks after level-1 training and planned increases up to `level`. */
export function skillRanks(creation,plan,lookup,level){
  const {mods}=attributeModifiers(creation,lookup);
  const training=skillTraining(creation,lookup,mods.int);
  const ranks=new Map();
  for(const skill of [...training.granted.keys(),...training.chosen])ranks.set(skill,1);
  for(const lore of training.lores)ranks.set(norm(lore).replace(/ lore$/,'')+' lore',1);
  for(const lore of [...(creation?.lores??[]),...(creation?.selectedLoreSkills??[])])
    ranks.set(norm(lore).replace(/ lore$/,'')+' lore',1);
  for(let l=2;l<=level;l++){
    for(const inc of plan?.levels?.[l]?.skillIncreases??[]){
      // Leveler stores lores as slugs ("scribing-lore"); ranks use "scribing lore".
      const raw=norm(inc?.skill);
      const skill=/-lore$/.test(raw)?raw.replace(/-/g,' '):raw;
      if(!skill)continue;
      const to=Number(inc.toRank)||((ranks.get(skill)??0)+1);
      ranks.set(skill,Math.max(ranks.get(skill)??0,Math.min(4,to)));
    }
  }
  return ranks;
}

export function buildState(creation,plan,lookup,level,variants={}){
  const feats=takenFeats(creation,plan);
  return {level,variants,grants:grantedNames(creation,lookup,level),
    mods:attributeModifiers(creation,lookup,plan?.levels??{},level).mods,
    skills:skillRanks(creation,plan,lookup,level),
    feats,
    classSlugs:[creation?.class?.slug,creation?.dualClass?.slug].filter(Boolean).map(norm),
    creation};
}

/**
 * Names of what the character has without picking it as a feat, by `level`:
 * class features of both classes (Magnum Opus at 19 counts for a level-20 feat),
 * specializations, ancestry, heritage and feats a background grants.
 */
export function grantedNames(creation,lookup,level){
  const out=new Set();
  const add=name=>{const n=norm(name);if(n)out.add(n);};
  for(const entry of [creation?.class,creation?.dualClass]){
    const item=lookup(entry?.uuid);
    if(!item)continue;
    for(const f of item.metadata?.grantedFeatures??[])if(Number(f.level)<=level)add(f.name);
    for(const f of item.metadata?.levelerProgression?.classFeatures??[])if(Number(f.level)<=level)add(f.name);
  }
  for(const entry of [creation?.subclass,creation?.dualSubclass,creation?.ancestry,creation?.heritage])add(entry?.name);
  for(const name of lookup(creation?.background?.uuid)?.metadata?.grantedFeats??[])add(name);
  return out;
}
/** "Enigma Muse" is met by the Enigma specialization, "Magnum Opus" by the class feature. */
function hasGranted(state,p){
  if(state.grants?.has(p))return true;
  for(const g of state.grants??[])if(p.startsWith(g+' ')||p.endsWith(' '+g))return true;
  return false;
}
function checkPrerequisite(text,state,featNames){
  const p=norm(text).replace(/\.$/,'');
  const skill=/^(trained|expert|master|legendary) in (.+)$/.exec(p);
  if(skill){
    const need=RANK_WORDS[skill[1]];
    const names=skill[2].split(/,\s*|\s+or\s+/).map(s=>s.replace(/^(?:a|an|the)\s+/,'').trim()).filter(Boolean);
    if(names.some(n=>/at least one skill|any skill/.test(n)))
      return [...state.skills.values()].some(r=>r>=need)?null:`Needs ${RANKS[need]} in a skill`;
    const known=names.filter(n=>SKILLS.includes(n)||n.endsWith(' lore'));
    if(!known.length)return undefined;
    return known.some(n=>(state.skills.get(n)??0)>=need)?null:`Needs ${RANKS[need]} in ${known.map(titleCase).join(' or ')}`;
  }
  const attribute=/^(strength|dexterity|constitution|intelligence|wisdom|charisma)\s*\+?(\d+)/.exec(p);
  if(attribute){
    const key=ATTRIBUTE_WORDS[attribute[1]];
    return state.mods[key]>=Number(attribute[2])?null:`Needs ${attribute[1][0].toUpperCase()+attribute[1].slice(1)} +${attribute[2]}`;
  }
  if(hasGranted(state,p))return null;
  if(featNames.has(p)){
    const before=state.feats.some(f=>norm(f.name)===p&&f.level<state.level);
    return before?null:`Needs the feat ${text.trim()} first`;
  }
  return undefined;
}

/**
 * Check a feat for a slot at `state.level`. Returns {blocked, unknown}:
 * blocked = first reason it can't be taken (or null); unknown = prerequisites
 * this check can't read.
 */
export function checkFeat(feat,state,{kind='',featNames=new Set(),currentUuid=null}={}){
  const unknown=[];
  if(Number.isFinite(feat.level)&&feat.level>state.level)return {blocked:`Level ${feat.level} feat`,unknown};
  const maxTakable=Number(feat.metadata?.rules?.maxTakable??1);
  const takenAt=state.feats.find(f=>f.uuid===feat.uuid&&f.uuid!==currentUuid);
  // Taking a feat twice would add it twice in Foundry, so this one can't be overridden.
  if(takenAt&&maxTakable<=1)return {blocked:`Already taken at level ${takenAt.level}`,unknown,hard:true};
  if(kind==='ancestry'){
    const reason=ancestryFeatBlock(feat,state.creation);
    if(reason)return {blocked:reason,unknown};
  }
  const traits=(feat.traits??[]).map(norm);
  if(traits.includes('dedication')&&state.variants?.ignoreArchetypeDedicationLock!==true){
    const before=state.feats.filter(f=>f.level<state.level&&f.uuid!==currentUuid);
    const dedications=before.filter(f=>(f.traits??[]).map(norm).includes('dedication')).length;
    const archetype=before.filter(f=>{const t=(f.traits??[]).map(norm);return t.includes('archetype')&&!t.includes('dedication');}).length;
    if(dedications&&archetype<2*dedications)return {blocked:'Take two feats from your current archetype first',unknown};
  }
  for(const text of feat.metadata?.prerequisites??[]){
    const result=checkPrerequisite(text,state,featNames);
    if(result===undefined)unknown.push(text);
    else if(result)return {blocked:result,unknown};
  }
  return {blocked:null,unknown};
}
export const featNameIndex=catalog=>new Set(catalog.ofType('feat').map(f=>norm(f.name)));
export {ATTRIBUTES};
