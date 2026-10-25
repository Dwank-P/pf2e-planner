/**
 * Choice schema: which Character Wizard steps and level-1 slots a character has,
 * derived from its class data, the campaign's variant rules and choices so far.
 * Mirrors Leveler's wizard (STEPS order and visibleSteps rules); nothing here is
 * a fixed per-class layout. Class-specific steps come from the Bridge's export of
 * Leveler's class handlers (levelerProgression.creationSteps).
 */
import {boostSources,skillTraining,languageAllowance,attributeModifiers} from './rules.js';
import {spellAllowance} from '../leveler-progression.js';

/** Leveler 3.12 handler steps, for catalogs synced before creationSteps was exported. */
const FALLBACK_CLASS_STEPS={cleric:['deity','sanctification','divineFont'],champion:['deity','sanctification'],
  thaumaturge:['implement'],commander:['tactics'],exemplar:['ikons'],inventor:['innovationDetails'],
  kineticist:['kineticGate'],psychic:['subconsciousMind'],wizard:['thesis'],animist:['apparitions']};
const FALLBACK_SUBCLASS_TAGS={alchemist:'alchemist-research-field',animist:'animistic-practice',
  barbarian:'barbarian-instinct',bard:'bard-muse',champion:'champion-cause',cleric:'cleric-doctrine',
  druid:'druid-order',gunslinger:'gunslinger-way',inventor:'inventor-innovation',
  investigator:'investigator-methodology',kineticist:'kineticist-kinetic-gate',magus:'magus-hybrid-study',
  oracle:'oracle-mystery',psychic:'psychic-conscious-mind',ranger:'ranger-hunters-edge',
  rogue:'rogue-racket',sorcerer:'sorcerer-bloodline',summoner:'summoner-eidolon',
  swashbuckler:'swashbuckler-style',witch:'witch-patron',wizard:'wizard-arcane-school'};

/**
 * Handler step definitions keyed by Leveler step id. `source` says where options
 * come from in the catalog; `pick` is how many to choose.
 */
export const HANDLER_STEPS={
  deity:{label:'Deity',source:{type:'deity'},pick:1,key:'deity'},
  sanctification:{label:'Sanctification',kind:'sanctification',
    visible:b=>(b.deity?.sanctification?.what?.length??0)>0},
  divineFont:{label:'Divine font',kind:'divineFont',visible:b=>(b.deity?.font?.length??0)>1},
  implement:{label:'Implement',source:{tags:['thaumaturge-implement']},pick:1,key:'implement'},
  tactics:{label:'Tactics',source:{type:'action',tags:['commander-mobility-tactic','commander-offensive-tactic']},pick:5,key:'tactics'},
  ikons:{label:'Ikons',source:{tags:['exemplar-ikon']},pick:3,key:'ikons'},
  thesis:{label:'Arcane thesis',source:{tags:['wizard-arcane-thesis']},pick:1,key:'thesis'},
  subconsciousMind:{label:'Subconscious mind',source:{tags:['psychic-subconscious-mind']},pick:1,key:'subconsciousMind'},
  apparitions:{label:'Apparitions',source:{tags:['animist-apparition']},pick:2,key:'apparitions'},
  kineticGate:{label:'Kinetic gate',kind:'kineticGate',visible:(b,subclass)=>!!subclass},
  innovationDetails:{label:'Innovation',kind:'foundryOnly',
    visible:(b,subclass)=>['weapon-innovation','armor-innovation'].includes(subclass?.slug)}
};

const progressionOf=item=>item?.metadata?.levelerProgression??null;
const slugOf=entry=>String(entry?.slug??'').toLowerCase();
export function subclassTagFor(classEntry,classItem){
  return progressionOf(classItem)?.subclassTag??classEntry?.subclassTag??FALLBACK_SUBCLASS_TAGS[slugOf(classEntry)]??null;
}
export function handlerStepIds(classEntry,classItem){
  const exported=progressionOf(classItem)?.creationSteps;
  return Array.isArray(exported)?exported:(FALLBACK_CLASS_STEPS[slugOf(classEntry)]??[]);
}
const featLevels=(item,field)=>(Array.isArray(item?.metadata?.[field])?item.metadata[field]:[]).map(Number);

/** Level-1 feat slots: built from the class Items and variants, never fixed. */
export function level1FeatSlots(creation,lookup,variants={}){
  const primary=lookup(creation?.class?.uuid),second=lookup(creation?.dualClass?.uuid);
  const slots=[{slot:'ancestry',label:'Ancestry feat',category:'ancestry'}];
  if(variants.ancestralParagon===true)slots.push({slot:'paragon',label:'Ancestral Paragon feat',category:'ancestry'});
  if(featLevels(primary,'classFeatLevels').includes(1))
    slots.push({slot:'class',label:(creation.class?.name??'Class')+' feat',category:'class',classEntry:creation.class});
  if(creation?.dualClass&&featLevels(second,'classFeatLevels').includes(1))
    slots.push({slot:'dualClass',label:creation.dualClass.name+' feat',category:'class',classEntry:creation.dualClass});
  if(featLevels(primary,'skillFeatLevels').includes(1))slots.push({slot:'skill',label:'Skill feat',category:'skill'});
  if(variants.mythic===true)slots.push({slot:'mythic',label:'Mythic calling',category:'mythic'});
  return slots;
}
const FEAT_FIELD={ancestry:'ancestryFeat',paragon:'ancestryParagonFeat',class:'classFeat',
  dualClass:'dualClassFeat',skill:'skillFeat',mythic:'mythicCalling'};
export const featField=slot=>FEAT_FIELD[slot];

/** Level-1 spell picks for the primary class, following Leveler's counts. */
export function level1Spells(creation,lookup){
  const allowance=spellAllowance(progressionOf(lookup(creation?.class?.uuid)),1);
  if(!allowance)return null;
  return {cantrips:allowance.cantrips,rank1:allowance.ranks[1]??0,granted:allowance.granted??0};
}

/**
 * Ordered wizard steps. Each: {id, label, target, complete, def?}. `target` is
 * 'class' or 'dualClass' for class-specific steps.
 */
export function creationSteps(creation,lookup,variants={}){
  const c=creation??{};
  const steps=[];
  const add=(id,label,complete,extra={})=>steps.push({id,label,complete:!!complete,...extra});
  add('ancestry','Ancestry',c.ancestry);
  add('heritage','Heritage',c.heritage);
  add('background','Background',c.background);
  add('class','Class',c.class);
  if(variants.dualClass===true&&c.class)add('dualClass','Second class',c.dualClass);

  const targets=[['class',c.class,c.subclass],['dualClass',c.dualClass,c.dualSubclass]].filter(([,entry])=>entry);
  for(const [target,classEntry,subclass] of targets){
    const classItem=lookup(classEntry.uuid);
    const bucket=c.classSelections?.[target]??(target==='class'?c:{});
    const suffix=target==='dualClass'?' ('+classEntry.name+')':'';
    const ids=handlerStepIds(classEntry,classItem);
    const handler=id=>{
      const def=HANDLER_STEPS[id];
      if(!def||!ids.includes(id))return;
      if(def.visible&&!def.visible(bucket,subclass))return;
      add(id+(target==='dualClass'?'-dual':''),def.label+suffix,stepComplete(id,def,bucket,subclass),{target,def,stepId:id});
    };
    // Leveler's order: deity, sanctification, divine font, subclass, then other handler steps.
    for(const id of ['deity','sanctification','divineFont'])handler(id);
    const tag=subclassTagFor(classEntry,classItem);
    if(tag)add(target==='dualClass'?'subclass-dual':'subclass',
      classEntry.name+' specialization',subclass,{target,tag,stepId:'subclass'});
    for(const id of ['implement','tactics','ikons','innovationDetails','kineticGate','subconsciousMind','thesis','apparitions'])handler(id);
  }

  const {mods}=attributeModifiers(c,lookup);
  add('boosts','Attribute boosts',boostSources(c,lookup).every(s=>(c.boosts?.[s.source]?.length??0)>=s.count));
  const skills=skillTraining(c,lookup,mods.int);
  add('skills','Skills',c.class&&skills.chosen.length>=skills.choices);
  const feats=level1FeatSlots(c,lookup,variants);
  add('feats','Feats',feats.every(f=>c[featField(f.slot)]));
  const languages=languageAllowance(c,lookup,mods.int);
  if(c.ancestry)add('languages','Languages',(c.languages?.length??0)>=languages.count||!languages.count);
  const spells=level1Spells(c,lookup);
  if(spells)add('spells','Spells',(c.spells?.cantrips?.length??0)>=spells.cantrips&&(c.spells?.rank1?.length??0)>=spells.rank1);
  add('equipment','Equipment',true,{optional:true});
  add('review','Review',steps.every(s=>s.complete));
  return steps;
}
function stepComplete(id,def,bucket,subclass){
  if(def.kind==='sanctification')return !!bucket.sanctification;
  if(def.kind==='divineFont')return !!bucket.divineFont;
  if(def.kind==='kineticGate'){
    if(!subclass||!bucket.kineticGateMode)return false;
    if(bucket.kineticGateMode==='dual-gate'&&!bucket.secondElement)return false;
    return (bucket.kineticImpulses?.length??0)>=2;
  }
  if(def.kind==='foundryOnly')return true;
  const value=bucket[def.key];
  return def.pick>1?(value?.length??0)>=def.pick:!!value;
}
