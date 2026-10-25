/**
 * PF2e character math for the web builder, computed from synced catalog Items
 * (`item.metadata.rules`, copied from PF2e system data by the Bridge) and the
 * Leveler creation document. This is presentation math for planning; Leveler's
 * actor-backed build state stays authoritative once the plan is in Foundry.
 */
export const ATTRIBUTES=['str','dex','con','int','wis','cha'];
export const ATTRIBUTE_NAMES={str:'Strength',dex:'Dexterity',con:'Constitution',
  int:'Intelligence',wis:'Wisdom',cha:'Charisma'};
export const SKILLS=['acrobatics','arcana','athletics','crafting','deception','diplomacy',
  'intimidation','medicine','nature','occultism','performance','religion','society',
  'stealth','survival','thievery'];
export const SKILL_ATTRIBUTE={acrobatics:'dex',arcana:'int',athletics:'str',crafting:'int',
  deception:'cha',diplomacy:'cha',intimidation:'cha',medicine:'wis',nature:'wis',
  occultism:'int',performance:'cha',religion:'wis',society:'int',stealth:'dex',
  survival:'wis',thievery:'dex'};
export const RANKS=['Untrained','Trained','Expert','Master','Legendary'];
export const RANK_LETTERS=['U','T','E','M','L'];

export const titleCase=slug=>String(slug??'').replace(/-/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
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

/** Skill training at level 1: class and background grants, then chosen skills. */
export function skillTraining(creation,lookup,intModifier=0){
  const classRules=rulesOf(lookup(creation?.class?.uuid));
  const backgroundRules=rulesOf(lookup(creation?.background?.uuid));
  const deity=creation?.deity??creation?.classSelections?.class?.deity;
  const granted=new Map();
  const grant=(skill,source)=>{if(SKILLS.includes(skill)&&!granted.has(skill))granted.set(skill,source);};
  for(const skill of list(classRules.trainedSkills?.value))grant(skill,creation?.class?.name??'Class');
  for(const skill of list(backgroundRules.trainedSkills?.value))grant(skill,creation?.background?.name??'Background');
  if(deity?.skill)for(const skill of list(deity.skill))grant(skill,deity.name??'Deity');
  const additional=Number(classRules.trainedSkills?.additional)||0;
  const chosen=(creation?.skills??[]).filter(s=>SKILLS.includes(s)&&!granted.has(s));
  return {granted,chosen,choices:Math.max(0,additional+Math.max(0,intModifier)),
    lores:list(backgroundRules.trainedSkills?.lore)};
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

/** Level-1 proficiency ranks from the class Item. */
export function classProficiencies(creation,lookup){
  const rules=rulesOf(lookup(creation?.class?.uuid));
  const saves=rules.savingThrows??{};
  return {perception:Number(rules.perception)||0,fortitude:Number(saves.fortitude)||0,
    reflex:Number(saves.reflex)||0,will:Number(saves.will)||0,classDC:Number(rules.classDC)||0};
}
