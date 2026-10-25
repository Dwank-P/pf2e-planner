/**
 * Operations on PF2e Leveler's Character Wizard document (actor flag
 * pf2e-leveler.creation). Field shapes and reset rules follow Leveler's
 * scripts/creation/creation-model.js (MIT, © RoiLeaf) so a document edited here
 * opens unchanged in Leveler's wizard. Every function returns a new document.
 */
import {emptyCreation} from '../leveler-format.js';

const clone=value=>JSON.parse(JSON.stringify(value));
const HANDLER_KEYS=['implement','tactics','ikons','innovationItem','innovationModification',
  'kineticGateMode','secondElement','kineticImpulses','subconsciousMind','thesis','apparitions',
  'primaryApparition','deity','sanctification','divineFont','devotionSpell'];
const LIST_KEYS=new Set(['tactics','ikons','kineticImpulses','apparitions']);
const emptySelections=()=>Object.fromEntries(HANDLER_KEYS.map(k=>[k,LIST_KEYS.has(k)?[]:null]));
const EMPTY_SPELLS=()=>({cantrips:[],rank1:[]});

/** Minimal Item reference as Leveler stores it. */
export function entry(item,extra={}){
  if(!item)return null;
  return {uuid:item.uuid,name:item.name,img:item.img??null,
    slug:item.metadata?.slug??item.slug??null,...extra};
}
const traitsOf=item=>Array.isArray(item?.traits)?[...item.traits]:[];

function edit(data,change){
  const next=clone(data??emptyCreation());
  next.classSelections??={class:emptySelections(),dualClass:emptySelections()};
  next.classSelections.class??=emptySelections();
  next.classSelections.dualClass??=emptySelections();
  next.boosts??={free:[]};
  // Older documents keep primary-class choices only at the top level (Leveler's normalizeCreationData).
  const meaningful=v=>Array.isArray(v)?v.length>0:v&&typeof v==='object'?Object.keys(v).length>0:v!=null&&v!=='';
  for(const key of HANDLER_KEYS)
    if(!meaningful(next.classSelections.class[key])&&meaningful(next[key]))next.classSelections.class[key]=clone(next[key]);
  change(next);
  // Leveler mirrors the primary class's handler selections at the top level.
  for(const key of HANDLER_KEYS)next[key]=clone(next.classSelections.class[key]??(LIST_KEYS.has(key)?[]:null));
  return next;
}
const resetFeatGrants=d=>{d.grantedFeatSections=[];d.grantedFeatChoices={};};

export function setAncestry(data,item){
  return edit(data,d=>{
    d.ancestry=item?entry(item,{traits:traitsOf(item)}):null;
    d.heritage=null;d.mixedAncestry=null;d.languages=[];
    d.ancestryFeat=null;d.ancestryParagonFeat=null;
    d.alternateAncestryBoosts=false;delete d.boosts.ancestry;
    resetFeatGrants(d);
  });
}
export function setHeritage(data,item){
  return edit(data,d=>{
    d.heritage=item?entry(item,{traits:traitsOf(item),grantedSkills:[]}):null;
    d.ancestryFeat=null;d.ancestryParagonFeat=null;
    resetFeatGrants(d);
  });
}
export function setBackground(data,item){
  return edit(data,d=>{
    d.background=item?entry(item):null;
    delete d.boosts.background;
    resetFeatGrants(d);
  });
}
function classEntry(item){
  const progression=item?.metadata?.levelerProgression;
  return entry(item,{
    slug:progression?.slug??item.metadata?.slug??null,
    publication:item.metadata?.publication??null,sourcePack:item.pack??null,sourcePackage:null,
    keyAbility:Array.isArray(progression?.keyAbility)?[...progression.keyAbility]:null,
    subclassTag:progression?.subclassTag??null});
}
export function setClass(data,item){
  return edit(data,d=>{
    d.class=item?classEntry(item):null;
    d.dualClass=null;d.flexiblePreparation=false;d.dualFlexiblePreparation=false;
    d.subclass=null;d.dualSubclass=null;
    d.classSelections={class:emptySelections(),dualClass:emptySelections()};
    d.classFeat=null;d.dualClassFeat=null;d.skillFeat=null;
    resetFeatGrants(d);
    d.spells=EMPTY_SPELLS();d.dualSpells=EMPTY_SPELLS();
    d.curriculumSpells=EMPTY_SPELLS();d.dualCurriculumSpells=EMPTY_SPELLS();
    delete d.boosts.class;delete d.boosts.dualClass;
  });
}
export function setDualClass(data,item){
  return edit(data,d=>{
    d.dualClass=item?classEntry(item):null;
    d.dualFlexiblePreparation=false;d.dualSubclass=null;
    d.classSelections.dualClass=emptySelections();
    d.dualClassFeat=null;d.dualSpells=EMPTY_SPELLS();d.dualCurriculumSpells=EMPTY_SPELLS();
    delete d.boosts.dualClass;
  });
}
/** Subclass shape from Leveler's setSubclass; its wizard resolves curriculum and choice sets. */
export function setSubclass(data,item,target='class'){
  return edit(data,d=>{
    const value=item?entry(item,{tradition:null,spellUuids:[],grantedSkills:[],grantedLores:[],
      choiceSets:[],choices:{},choiceCurricula:{},curriculum:null}):null;
    const bucket=d.classSelections[target];
    for(const key of ['innovationItem','innovationModification','kineticGateMode','secondElement'])bucket[key]=null;
    bucket.kineticImpulses=[];
    if(target==='dualClass'){d.dualSubclass=value;d.dualSpells=EMPTY_SPELLS();d.dualCurriculumSpells=EMPTY_SPELLS();}
    else{d.subclass=value;d.spells=EMPTY_SPELLS();d.curriculumSpells=EMPTY_SPELLS();}
  });
}

const normalizeFont=value=>{
  const v=String(value??'').trim().toLowerCase();
  return ['healing','heal'].includes(v)?'healing':['harmful','harming','harm'].includes(v)?'harmful':v||null;
};
/** Deity, with automatic sanctification and font when the deity allows only one. */
export function setDeity(data,item,target='class'){
  return edit(data,d=>{
    const bucket=d.classSelections[target];
    const rules=item?.metadata?.rules??{};
    const font=(Array.isArray(rules.font)?rules.font:[]).map(normalizeFont).filter(Boolean);
    const sanctification=rules.sanctification??{};
    const skill=Array.isArray(rules.skill)?rules.skill[0]:rules.skill;
    bucket.deity=item?{...entry(item),font,sanctification,
      domains:rules.domains??{primary:[],alternate:[]},skill:skill??null}:null;
    bucket.divineFont=font.length===1?font[0]:null;
    const what=Array.isArray(sanctification.what)?sanctification.what:[];
    bucket.sanctification=what.length===1&&(sanctification.modal??'can')==='must'?what[0]:null;
    bucket.devotionSpell=null;
    if(target==='dualClass')d.dualSubclass=null;else d.subclass=null;
  });
}
export function setSanctification(data,value,target='class'){
  return edit(data,d=>{
    d.classSelections[target].sanctification=value;
    if(target==='dualClass')d.dualSubclass=null;else d.subclass=null;
  });
}
export function setDivineFont(data,value,target='class'){
  return edit(data,d=>{d.classSelections[target].divineFont=normalizeFont(value);});
}
/** Single-pick handler choices: implement, thesis, subconscious mind, second element. */
export function setHandlerItem(data,key,item,target='class'){
  return edit(data,d=>{
    const bucket=d.classSelections[target];
    bucket[key]=item?entry(item,key==='subconsciousMind'?{keyAbility:item.metadata?.keyAbility??null}:{}):null;
    if(key==='secondElement')bucket.kineticImpulses=[];
  });
}
/** Multi-pick handler choices (tactics 5, ikons 3, apparitions 2, kinetic impulses 2). */
export function toggleHandlerItem(data,key,item,max,target='class',extra={}){
  return edit(data,d=>{
    const bucket=d.classSelections[target];
    const picks=bucket[key]??=[];
    const index=picks.findIndex(e=>e.uuid===item.uuid);
    if(index>=0){
      picks.splice(index,1);
      if(key==='apparitions'&&bucket.primaryApparition===item.uuid)bucket.primaryApparition=picks[0]?.uuid??null;
      return;
    }
    if(picks.length>=max)return;
    picks.push(entry(item,extra));
    if(key==='apparitions'&&!bucket.primaryApparition)bucket.primaryApparition=item.uuid;
  });
}
export function setPrimaryApparition(data,uuid,target='class'){
  return edit(data,d=>{d.classSelections[target].primaryApparition=uuid;});
}
export function setKineticGateMode(data,value,target='class'){
  return edit(data,d=>{
    const bucket=d.classSelections[target];
    bucket.kineticGateMode=value;
    if(value!=='dual-gate')bucket.secondElement=null;
    bucket.kineticImpulses=[];
  });
}

export function setAlternateAncestryBoosts(data,enabled){
  return edit(data,d=>{d.alternateAncestryBoosts=!!enabled;delete d.boosts.ancestry;});
}
/** Toggle one boost for a source; a full source never swaps out an earlier pick. */
export function toggleBoost(data,source,attribute,max){
  return edit(data,d=>{
    const picks=[...(d.boosts[source]??[])];
    const index=picks.indexOf(attribute);
    if(index>=0)picks.splice(index,1);
    else if(picks.length<max)picks.push(attribute);
    d.boosts[source]=picks;
  });
}
export function toggleListValue(data,field,value,max){
  return edit(data,d=>{
    const values=[...(d[field]??[])];
    const index=values.indexOf(value);
    if(index>=0)values.splice(index,1);
    else if(values.length<max)values.push(value);
    d[field]=values;
  });
}

/** Level-1 feat fields in the creation document. */
export const FEAT_FIELDS={ancestry:'ancestryFeat',paragon:'ancestryParagonFeat',class:'classFeat',
  dualClass:'dualClassFeat',skill:'skillFeat',mythic:'mythicCalling'};
export function setFeat(data,slot,item){
  return edit(data,d=>{
    d[FEAT_FIELDS[slot]]=item?entry(item,{choiceSets:[],grantedSkills:[],grantedLores:[],choices:{}}):null;
  });
}

/** Level-1 spells: cantrips or rank-1 in the class (or dual class) spell list. */
export function toggleSpell(data,item,{cantrip,max,target='primary'}){
  return edit(data,d=>{
    const store=target==='secondary'?(d.dualSpells??=EMPTY_SPELLS()):(d.spells??=EMPTY_SPELLS());
    const bucket=cantrip?store.cantrips:store.rank1;
    const index=bucket.findIndex(e=>e.uuid===item.uuid);
    if(index>=0)bucket.splice(index,1);
    else if(bucket.length<max)bucket.push(entry(item));
  });
}

export function toggleEquipment(data,item){
  return edit(data,d=>{
    d.equipment??=[];
    const index=d.equipment.findIndex(e=>e.uuid===item.uuid);
    if(index>=0)d.equipment.splice(index,1);
    else d.equipment.push({...entry(item),quantity:1,price:item.metadata?.rules?.price??null,pricePer:1});
  });
}
