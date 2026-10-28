/**
 * PF2e character math for the web builder, computed from synced catalog Items
 * (`item.metadata.rules`, copied from PF2e system data by the Bridge) and the
 * Leveler creation document. This is presentation math for planning; Leveler's
 * actor-backed build state stays authoritative once the plan is in Foundry.
 */
export const ATTRIBUTES=['str','dex','con','int','wis','cha'];
export const ATTRIBUTE_NAMES={str:'Strength',dex:'Dexterity',con:'Constitution',
  int:'Intelligence',wis:'Wisdom',cha:'Charisma'};
const PF2E_SKILLS=['acrobatics','arcana','athletics','crafting','deception','diplomacy',
  'intimidation','medicine','nature','occultism','performance','religion','society',
  'stealth','survival','thievery'];
/** Every skill either system has: SF2e adds Computers and Piloting. */
export const ALL_SKILLS=[...PF2E_SKILLS,'computers','piloting'].sort();
export const isSkill=skill=>ALL_SKILLS.includes(skill);
/**
 * The skills shown for the current campaign (PF2e by default). setSkillSet() switches it to
 * the world's own list from the Bridge sync (variants.skills); the array is updated in place.
 */
export const SKILLS=[...PF2E_SKILLS];
export function setSkillSet(list){
  const next=Array.isArray(list)?list.filter(isSkill):[];
  SKILLS.splice(0,SKILLS.length,...(next.length?next:PF2E_SKILLS));
}
export const SKILL_ATTRIBUTE={acrobatics:'dex',arcana:'int',athletics:'str',computers:'int',crafting:'int',
  deception:'cha',diplomacy:'cha',intimidation:'cha',medicine:'wis',nature:'wis',
  occultism:'int',performance:'cha',piloting:'dex',religion:'wis',society:'int',stealth:'dex',
  survival:'wis',thievery:'dex'};
export const RANKS=['Untrained','Trained','Expert','Master','Legendary'];
export const RANK_LETTERS=['U','T','E','M','L'];

export const titleCase=slug=>String(slug??'').replace(/-/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
import {grantsAt} from './granted.js';
const rulesOf=item=>item?.metadata?.rules??{};
const list=value=>Array.isArray(value)?value:value&&typeof value==='object'?Object.values(value):[];

/** PF2e boost/flaw slots: one option = fixed, six = free, otherwise a restricted choice. */
export function boostSlots(slots){
  return list(slots).map(slot=>{
    const options=(Array.isArray(slot?.value)?slot.value:[]).filter(a=>ATTRIBUTES.includes(a));
    if(!options.length)return null;
    return options.length===1?{type:'fixed',attribute:options[0]}
      :{type:'choice',options:options.length>=6?[...ATTRIBUTES]:options};
  }).filter(Boolean);
}

/**
 * What a creation boost source asks for. Mirrors Leveler's wizard boost rows:
 * ancestry and background record only their choice slots (in order), class is
 * one key attribute, free is four different attributes.
 */
export function boostSources(creation,lookup){
  const sources=[];
  const ancestry=lookup(creation?.ancestry?.uuid);
  if(creation?.ancestry){
    if(creation.alternateAncestryBoosts){
      sources.push({source:'ancestry',label:'Ancestry (alternate boosts)',fixed:[],flaws:[],count:2,
        options:[...ATTRIBUTES]});
    }else{
      const slots=boostSlots(rulesOf(ancestry).boosts);
      const choices=slots.filter(s=>s.type==='choice');
      const fixed=slots.filter(s=>s.type==='fixed').map(s=>s.attribute);
      const flaws=boostSlots(rulesOf(ancestry).flaws).filter(s=>s.type==='fixed').map(s=>s.attribute);
      sources.push({source:'ancestry',label:'Ancestry',fixed,flaws,
        count:choices.length,options:choices.some(c=>c.options.length===6)?[...ATTRIBUTES]:(choices[0]?.options??[]),
        // Alternate boosts only differ from the default when the ancestry has fixed boosts or flaws.
        canUseAlternate:fixed.length>0||flaws.length>0});
    }
  }
  if(creation?.background){
    const slots=boostSlots(rulesOf(lookup(creation.background.uuid)).boosts);
    const choices=slots.filter(s=>s.type==='choice');
    sources.push({source:'background',label:'Background',fixed:slots.filter(s=>s.type==='fixed').map(s=>s.attribute),
      flaws:[],count:choices.length,options:[...ATTRIBUTES],
      restricted:choices.find(c=>c.options.length<6)?.options??[]});
  }
  if(creation?.class){
    const classItem=lookup(creation.class.uuid);
    const keys=keyAttributeOptions(creation,classItem);
    sources.push({source:'class',label:'Class key attribute',fixed:keys.length===1?keys:[],flaws:[],
      count:keys.length===1?0:1,options:keys});
  }
  sources.push({source:'free',label:'Free boosts',fixed:[],flaws:[],count:4,options:[...ATTRIBUTES]});
  return sources;
}
export function keyAttributeOptions(creation,classItem){
  const fromLeveler=classItem?.metadata?.levelerProgression?.keyAbility;
  const fromSystem=rulesOf(classItem).keyAbility?.value??classItem?.metadata?.keyAbility;
  const subconscious=creation?.subconsciousMind?.keyAbility;
  const keys=Array.isArray(subconscious)&&subconscious.length?subconscious
    :Array.isArray(fromLeveler)&&fromLeveler.length?fromLeveler:Array.isArray(fromSystem)?fromSystem:[];
  return keys.filter(a=>ATTRIBUTES.includes(a));
}
/** Whether a boost choice is legal for a source given what's already picked there. */
export function boostAllowed(source,picked,attribute){
  if(picked.includes(attribute))return true;
  if(picked.length>=source.count)return false;
  if(!source.options.includes(attribute))return false;
  if(source.fixed.includes(attribute))return false;
  // Background: one boost from its two listed attributes, the other free.
  if(source.restricted?.length&&source.count===2&&picked.length===1&&
     !source.restricted.includes(picked[0])&&!source.restricted.includes(attribute))return false;
  return true;
}

/**
 * Attribute modifiers from creation boosts plus planned level boosts up to `level`.
 * Remaster rule: a boost to an attribute already at +4 or more is partial; two partials make +1.
 */
export function attributeModifiers(creation,lookup,planLevels={},level=1){
  const mods=Object.fromEntries(ATTRIBUTES.map(a=>[a,0]));
  const partial=Object.fromEntries(ATTRIBUTES.map(a=>[a,false]));
  const boost=attribute=>{
    if(!ATTRIBUTES.includes(attribute))return;
    if(mods[attribute]<4){mods[attribute]++;return;}
    if(partial[attribute]){mods[attribute]++;partial[attribute]=false;}
    else partial[attribute]=true;
  };
  const sources=boostSources(creation,lookup);
  const chosen=creation?.boosts??{};
  for(const source of sources){
    for(const flaw of source.flaws)mods[flaw]--;
    for(const fixed of source.fixed)boost(fixed);
    for(const pick of (chosen[source.source]??[]).slice(0,source.count))boost(pick);
  }
  for(let l=2;l<=level;l++){
    for(const pick of planLevels?.[l]?.abilityBoosts??[])boost(String(pick).toLowerCase());
  }
  return {mods,partial};
}
export const formatModifier=n=>(n>=0?'+':'')+n;

/**
 * Skill training at level 1, following Leveler's Character Wizard: both classes'
 * trained skills (dual class), background and deity grants; picks = the larger
 * class "additional" count + Intelligence, plus one for each background skill a
 * class or deity already trains. Extra lores (selectedLoreSkills) use the same picks.
 */
export function skillTraining(creation,lookup,intModifier=0){
  const classes=[creation?.class,creation?.dualClass].filter(Boolean);
  const backgroundRules=rulesOf(lookup(creation?.background?.uuid));
  const deities=[creation?.deity??creation?.classSelections?.class?.deity,creation?.classSelections?.dualClass?.deity].filter(Boolean);
  const granted=new Map();
  const grant=(skill,source)=>{if(isSkill(skill)&&!granted.has(skill))granted.set(skill,source);};
  const classSkills=new Set();
  for(const entry of classes)for(const skill of list(rulesOf(lookup(entry.uuid)).trainedSkills?.value)){
    classSkills.add(skill);grant(skill,entry.name??'Class');
  }
  for(const deity of deities)for(const skill of list(deity.skill)){classSkills.add(skill);grant(skill,deity.name??'Deity');}
  const backgroundSkills=list(backgroundRules.trainedSkills?.value);
  for(const skill of backgroundSkills)grant(skill,creation?.background?.name??'Background');
  const additional=classes.length?Math.max(...classes.map(e=>Number(rulesOf(lookup(e.uuid)).trainedSkills?.additional)||0)):0;
  const duplicates=backgroundSkills.filter(s=>classSkills.has(s)).length;
  const chosen=(creation?.skills??[]).filter(s=>isSkill(s)&&!granted.has(s));
  const chosenLores=(creation?.selectedLoreSkills??[]).filter(l=>typeof l==='string'&&l.trim());
  return {granted,chosen,chosenLores,choices:Math.max(0,additional+intModifier+duplicates),duplicates,
    lores:list(backgroundRules.trainedSkills?.lore)};
}
/** Lore display name the way Leveler stores it: "Warfare Lore". */
export function loreName(value){
  const trimmed=String(value??'').trim().replace(/\s+/g,' ');
  if(!trimmed)return '';
  const withLore=/\blore\b/i.test(trimmed)?trimmed:trimmed+' Lore';
  return withLore.replace(/\b\p{L}/gu,c=>c.toUpperCase());
}

/** Languages: ancestry grants plus a pick per additional language and positive INT. */
export function languageAllowance(creation,lookup,intModifier=0){
  const rules=rulesOf(lookup(creation?.ancestry?.uuid));
  const granted=list(rules.languages?.value);
  const options=list(rules.additionalLanguages?.value);
  const count=(Number(rules.additionalLanguages?.count)||0)+Math.max(0,intModifier);
  return {granted,options,count};
}

/** Hit points: ancestry HP + (class HP + Constitution) per level. */
export function hitPoints(creation,lookup,conModifier,level=1){
  const ancestry=Number(rulesOf(lookup(creation?.ancestry?.uuid)).hp)||0;
  const perLevel=Number(rulesOf(lookup(creation?.class?.uuid)).hp)||0;
  if(!ancestry&&!perLevel)return null;
  return ancestry+(perLevel+conModifier)*level;
}

/**
 * Class features that raise perception or saves, by their PF2e name (remaster and
 * legacy). Leveler tags some features with `proficiencies`; these names fill the rest.
 */
const FEATURE_RANKS=[
  [/^(reflex expertise|lightning reflexes)$/i,'reflex',2],[/^(fortitude expertise|great fortitude)$/i,'fortitude',2],
  [/^(will expertise|iron will)$/i,'will',2],[/^(perception expertise|alertness)$/i,'perception',2],
  [/^(evasion|reflex mastery)$/i,'reflex',3],[/^(juggernaut|fortitude mastery)$/i,'fortitude',3],
  [/^(resolve|will mastery)$/i,'will',3],[/^(perception mastery|vigilant senses|battlefield surveyor)$/i,'perception',3],
  [/^(improved evasion|greater evasion|reflex legend)$/i,'reflex',4],[/^(greater juggernaut|fortitude legend)$/i,'fortitude',4],
  [/^(greater resolve|will legend)$/i,'will',4],[/^(perception legend|incredible senses)$/i,'perception',4],
  // Armor: "armor" raises every armor category the class is already trained in.
  [/^(armor expertise|medium armor expertise|light armor expertise|sentinel's expertise)$/i,'armor',2],
  [/^(armor mastery|medium armor mastery|light armor mastery)$/i,'armor',3],[/^(armor legend|versatile legend)$/i,'armor',4],
  [/^(defensive robes|unarmored expertise)$/i,'unarmored',2],[/^(graceful mastery|unarmored mastery)$/i,'unarmored',3],
  [/^(graceful legend|unarmored legend)$/i,'unarmored',4],
  // Weapons: "weapons" raises every weapon category the class is already trained in.
  [/^(weapon expertise|expert strikes|ranger weapon expertise|rogue weapon expertise|monk weapon expertise)$/i,'weapons',2],
  [/^(weapon mastery|fighter weapon mastery|master strikes|weapon specialist)$/i,'weapons',3],
  [/^(weapon legend|legendary strikes|versatile legend)$/i,'weapons',4]
];
const ARMOR_KEYS=['unarmored','light','medium','heavy'];
const WEAPON_KEYS=['unarmed','simple','martial','advanced'];
/**
 * Perception, save, class DC, armor and weapon ranks at `level`, from the class Item and its features,
 * plus upgrades from rules on everything the character owns (with `plan`: feats taken too).
 */
export function proficienciesAt(creation,lookup,level=1,{plan=null,variants={}}={}){
  const item=lookup(creation?.class?.uuid);
  const ranks={...classProficiencies(creation,lookup)};
  const raise=(key,rank)=>{
    if(key==='armor'||key==='weapons'){
      for(const k of key==='armor'?ARMOR_KEYS:WEAPON_KEYS)if(ranks[k]>0)ranks[k]=Math.max(ranks[k],Number(rank)||0);
      return;
    }
    if(key in ranks)ranks[key]=Math.max(ranks[key],Number(rank)||0);
  };
  for(const f of item?.metadata?.levelerProgression?.classFeatures??[]){
    if(Number(f.level)>level||!f.proficiencies)continue;
    for(const [key,rank] of Object.entries(f.proficiencies))raise(key==='classdc'?'classDC':key,rank);
  }
  for(const f of item?.metadata?.grantedFeatures??[]){
    if(Number(f.level)>level)continue;
    for(const [pattern,key,rank] of FEATURE_RANKS)if(pattern.test(String(f.name).trim()))raise(key,rank);
  }
  // ActiveEffectLike upgrades: Warpriest armor expertise at 13, Armor Proficiency, class archetypes…
  for(const [key,rank] of Object.entries(grantsAt(creation,plan,lookup,level,variants).ranks))
    if(!key.startsWith('skill:'))raise(key,rank);
  return ranks;
}
/** PF2e proficiency bonus: untrained 0, otherwise rank × 2 + level. */
/** Proficiency bonus; Proficiency Without Level (GM Core) drops the level and makes untrained −2. */
export const proficiencyBonus=(rank,level,withoutLevel=false)=>withoutLevel?(rank>0?rank*2:-2):rank>0?rank*2+level:0;
/** Level-1 proficiency ranks from the class Item. */
export function classProficiencies(creation,lookup){
  const rules=rulesOf(lookup(creation?.class?.uuid));
  const saves=rules.savingThrows??{};
  // Armor proficiencies (unarmored, light, medium, heavy) for AC; class features raise them by key.
  const defenses=rules.defenses??{},attacks=rules.attacks??{};
  const rank=v=>Number(v?.rank??v)||0;
  return {perception:Number(rules.perception)||0,fortitude:Number(saves.fortitude)||0,
    reflex:Number(saves.reflex)||0,will:Number(saves.will)||0,classDC:Number(rules.classDC)||0,
    unarmored:rank(defenses.unarmored),light:rank(defenses.light),medium:rank(defenses.medium),heavy:rank(defenses.heavy),
    unarmed:rank(attacks.unarmed),simple:rank(attacks.simple),martial:rank(attacks.martial),advanced:rank(attacks.advanced)};
}
