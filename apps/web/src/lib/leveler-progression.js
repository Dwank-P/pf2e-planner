/**
 * The browser consumes choice schedules computed inside the Foundry world by
 * PF2e Leveler's real getChoicesForLevel(), rather than reproducing them.
 * Only UI composition and Leveler's documented secondary-class additions
 * are handled here; actor-dependent build-state checks remain pending.
 */
const FEAT={
  classFeat:['class','Class feat'],
  skillFeat:['skill','Skill feat'],
  generalFeat:['general','General feat'],
  ancestryFeat:['ancestry','Ancestry feat'],
  archetypeFeat:['archetype','Free Archetype feat'],
  dualClassFeat:['dual-class','Dual Class feat'],
  mythicFeat:['mythic','Mythic feat']
};
const ATTR=['str','dex','con','int','wis','cha'];
export const ABILITY_LABELS={
  str:'Strength',dex:'Dexterity',con:'Constitution',
  int:'Intelligence',wis:'Wisdom',cha:'Charisma'
};
export const SKILL_LABELS={
  acrobatics:'Acrobatics',arcana:'Arcana',athletics:'Athletics',
  crafting:'Crafting',deception:'Deception',diplomacy:'Diplomacy',
  intimidation:'Intimidation',medicine:'Medicine',nature:'Nature',
  occultism:'Occultism',performance:'Performance',religion:'Religion',
  society:'Society',stealth:'Stealth',survival:'Survival',thievery:'Thievery'
};
export function validAbility(value){return ATTR.includes(value);}
const extraKey=s=>String(s??'').trim().toLowerCase()
  .replace(/[^a-z0-9-]+/g,'-').slice(0,20);

// Leveler's SPELLBOOK_CLASSES and wizard-handler counts, for catalogs synced before 0.7.1.
const SPELLBOOK_FALLBACK={wizard:{cantrips:10,rank1:5},witch:{cantrips:10,rank1:5},
  magus:{cantrips:8,rank1:5},necromancer:{cantrips:8,rank1:5},technomancer:{cantrips:10,rank1:6}};
const slotTotal=value=>Array.isArray(value)?value.reduce((n,x)=>n+(Number(x)||0),0):Number(value)||0;

/**
 * Spells learned at one character level, following Leveler's rules:
 * level 1 uses the Character Wizard counts; spontaneous casters then learn the
 * growth of their repertoire per rank; spellbook casters add two spells of any
 * available rank per level; other prepared casters learn none (they prepare from
 * their whole list). Returns null when nothing is learned at this level.
 */
export function spellAllowance(progression,level){
  const sc=progression?.spellcasting;
  const at=l=>sc?.slots?.[l]??sc?.slots?.[String(l)]??null;
  const current=at(level);
  if(!current)return null;
  const slug=progression.slug;
  const spellbook=sc.spellbook??Object.hasOwn(SPELLBOOK_FALLBACK,slug);
  if(!spellbook&&sc.type!=='spontaneous')return null;
  const maxRank=Math.max(0,...Object.keys(current).filter(r=>r!=='cantrips'&&slotTotal(current[r])>0).map(Number));
  let result;
  if(level===1){
    const counts=sc.level1Counts??SPELLBOOK_FALLBACK[slug]??
      {cantrips:slotTotal(current.cantrips),rank1:slotTotal(current[1])};
    result={cantrips:counts.cantrips||0,ranks:counts.rank1?{1:counts.rank1}:{},any:0,maxRank:1};
  }else if(spellbook){
    result={cantrips:0,ranks:{},any:2,maxRank};
  }else{
    const previous=at(level-1)||{};
    const ranks={};
    for(const rank of Object.keys(current)){
      if(rank==='cantrips')continue;
      const gained=slotTotal(current[rank])-slotTotal(previous[rank]);
      if(gained>0)ranks[rank]=gained;
    }
    result={cantrips:Math.max(0,slotTotal(current.cantrips)-slotTotal(previous.cantrips)),ranks,any:0,maxRank};
  }
  const total=result.cantrips+result.any+Object.values(result.ranks).reduce((n,x)=>n+x,0);
  return total?{...result,total}:null;
}
/** Spells chosen at a level, per view key "<level>:<cantrip|rank-N>". */
export function spellsAtLevel(build,level){
  const out={cantrip:[],ranked:{},count:0};
  for(const [key,uuids] of Object.entries(build?.spells||{})){
    const match=/^(\d{1,2}):(cantrip|rank-(\d{1,2}))$/.exec(key);
    if(!match||Number(match[1])!==level||!Array.isArray(uuids))continue;
    if(match[2]==='cantrip')out.cantrip.push(...uuids);
    else (out.ranked[match[3]]??=[]).push(...uuids);
    out.count+=uuids.length;
  }
  return out;
}
/** Class features gained automatically at a level, from the synced class Item(s). */
export function classFeaturesAt(classes,level){
  const out=[];
  for(const item of classes.filter(Boolean)){
    const granted=item.metadata?.grantedFeatures;
    const list=Array.isArray(granted)&&granted.length?granted
      :(item.metadata?.levelerProgression?.classFeatures||[]);
    for(const feature of list)
      if(Number(feature.level)===level)
        out.push({name:feature.name,uuid:feature.uuid??null,className:item.name});
  }
  return out;
}

export function levelerChoiceSlots(primary,secondary=null,variants={}) {
  const data=primary?.metadata?.levelerProgression;
  const secondData=secondary?.metadata?.levelerProgression;
  const dual=variants.dualClass===true&&!!secondary;
  const featAtOne=(item,field)=>Array.isArray(item?.metadata?.[field])&&item.metadata[field].map(Number).includes(1);
  const creation=[
    // Level-one options remain available even before the class is selected.
    ...(data?.subclassTag?[{key:'subclass-1',type:'subclass',kind:'subclass',target:'class',
      label:'Class specialization',level:1,source:'creation',tag:data.subclassTag}]:[]),
    ...(dual&&secondData?.subclassTag?[{key:'dual-subclass-1',type:'subclass',kind:'subclass',
      target:'dualClass',label:'Second class specialization',level:1,source:'creation',tag:secondData.subclassTag}]:[]),
    {key:'ancestry-1',type:'feat',kind:'ancestry',label:'Ancestry feat',level:1,source:'creation'},
    ...(featAtOne(primary,'classFeatLevels')?[{key:'class-1',type:'feat',kind:'class',
      label:'Class feat',level:1,source:'creation'}]:[]),
    ...(dual&&featAtOne(secondary,'classFeatLevels')?[{key:'dual-class-1',type:'feat',kind:'dual-class',
      label:'Second class feat',level:1,source:'creation'}]:[]),
    ...(featAtOne(primary,'skillFeatLevels')?[{key:'skill-1',type:'feat',kind:'skill',
      label:'Skill feat',level:1,source:'creation'}]:[]),
    ...[
      ['ancestry','Ancestry boosts',2],
      ['background','Background boosts',2],
      ['class','Class key ability',1],
      ['free','Free boosts',4]
    ].map(([source,label,count])=>({
      key:(source==='ancestry'?'ancestry-boost':source)+'-1',type:'ability',kind:'abilityBoosts',label,level:1,count,source:'creation'
    })),
    ...spellSlot(data,1,'Starting spells')
  ];
  if(data?.provider!=='pf2e-leveler'||!data.levels) {
    return {ready:false,source:'creation-only',slots:creation,
      error:'Select a class, then synchronize Leveler progression from Foundry to unlock levels 2–20.'};
  }
  const dualLeveler=dual&&secondData?.provider==='pf2e-leveler';
  const slots=[...creation];
  for(let level=2;level<=20;level++){
    const primaryChoices=data.levels[level]??data.levels[String(level)]??[];
    const secondaryChoices=dualLeveler?(secondData.levels[level]??[]):[];
    const choices=[...primaryChoices];
    if(dualLeveler){
      // Mirroring Leveler's getChoicesForLevel secondary-class rule:
      // extra skill feat/increase only if the primary class lacks it.
      for(const kind of ['skillFeat','skillIncrease']){
        if(secondaryChoices.some(c=>c.type===kind)&&!primaryChoices.some(c=>c.type===kind)){
          choices.push(...secondaryChoices.filter(c=>c.type===kind));
        }
      }
      for(const choice of secondaryChoices){
        if(choice.type==='skillIncrease'&&choice.source &&
          !choices.some(c=>c.type==='skillIncrease'&&c.source===choice.source)){
          choices.push(choice);
        }
      }
    }
    const duplicates={};
    for(const choice of choices){
      if(!choice||typeof choice.type!=='string')continue;
      const n=(duplicates[choice.type]=(duplicates[choice.type]??0)+1);
      const suffix=n>1?'-'+n:'';
      if(FEAT[choice.type]){
        const [kind,label]=FEAT[choice.type];
        slots.push({key:kind+'-'+level+suffix,type:'feat',kind,label,level,
          source:'leveler',levelerType:choice.type});
      }else if(choice.type==='abilityBoosts'){
        slots.push({key:'level-'+level+suffix,type:'ability',kind:'abilityBoosts',
          label:'Ability boosts',level,count:Number(choice.count)||4,
          source:'leveler',levelerType:choice.type});
      }else if(choice.type==='skillIncrease'){
        slots.push({key:'skill-increase-'+level+
          (choice.source?'-'+extraKey(choice.source):suffix),
          type:'skill',kind:'skillIncrease',label:choice.label||'Skill increase',level,
          allowedSkills:choice.allowedSkills||[],source:'leveler',levelerType:choice.type,
          choiceSource:choice.source??''});
      }else if(choice.type==='abpPotency'){
        slots.push({key:'abp-'+level,type:'informational',kind:'abp',
          label:'Automatic bonus progression',level,source:'leveler'});
      }
    }
    slots.push(...spellSlot(data,level,'Spells learned'));
  }
  return {ready:true,source:'pf2e-leveler',version:data.version,slots};
}
function spellSlot(progression,level,label){
  const allowance=spellAllowance(progression,level);
  return allowance?[{key:'spells-'+level,type:'spells',kind:'spells',label,level,
    source:level===1?'creation':'leveler',allowance}]:[];
}

export function selectedBoosts(build,key) {
  const current=build?.abilityBoosts?.[key];
  return Array.isArray(current)?current.filter(validAbility):[];
}
export function setBoost(build,key,ability,count) {
  if(!validAbility(ability)||!Number.isInteger(count)||count<1||count>6)return;
  build.abilityBoosts??={};
  const current=selectedBoosts(build,key);
  // A full slot never swaps out an earlier pick: deselect one first.
  if(!current.includes(ability)&&current.length>=count)return;
  build.abilityBoosts[key]=current.includes(ability)
    ? current.filter(x=>x!==ability) : [...current,ability];
}
export function choiceComplete(slot,build) {
  if(slot.type==='feat')return !!build?.feats?.[slot.key];
  if(slot.type==='subclass')return !!build?.[slot.target==='dualClass'?'dualSubclassUuid':'subclassUuid'];
  if(slot.type==='spells')return spellsAtLevel(build,slot.level).count>=(slot.allowance?.total??0);
  if(slot.type==='ability')return selectedBoosts(build,slot.key).length===slot.count;
  if(slot.type==='skill')return !!build?.skillIncreases?.[slot.key];
  return false;
}
export function isCompletionSlot(slot){return ['feat','ability','skill','subclass','spells'].includes(slot.type);}
