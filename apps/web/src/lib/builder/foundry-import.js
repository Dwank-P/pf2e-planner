/**
 * Foundry → website export. The actor is the truth for what it has (ancestry,
 * boosts including alternate ancestry boosts, skills, feats in their slots,
 * spells); PF2e Leveler's documents add what the actor doesn't record: wizard
 * choices (class selections, grants, curriculum), the skill increase taken at
 * each level, and the plan for levels above the actor's.
 */
import {importPathbuilder} from './pathbuilder.js';
import {skillRanks} from './legality.js';
import {SKILLS} from './rules.js';

const clone=value=>JSON.parse(JSON.stringify(value??null));
/** Creation fields the actor decides. */
const ACTOR_FIELDS=['ancestry','heritage','background','class','dualClass','boosts','alternateAncestryBoosts','languages',
  'skills','selectedLoreSkills','ancestryFeat','ancestryParagonFeat','classFeat','dualClassFeat','skillFeat'];
const spellCount=store=>(store?.cantrips?.length??0)+(store?.rank1?.length??0);

/** Leveler's recorded skill increases, if they reach exactly the actor's skill ranks. */
function levelerIncreasesMatch(creation,levelerPlan,lookup,level,actorRanks){
  if(!levelerPlan?.levels)return false;
  const candidate={levels:Object.fromEntries(Object.entries(levelerPlan.levels)
    .filter(([l])=>Number(l)<=level).map(([l,d])=>[l,{skillIncreases:d?.skillIncreases??[]}]))};
  if(!Object.values(candidate.levels).some(d=>d.skillIncreases.length))return false;
  const ranks=skillRanks(creation,candidate,lookup,level);
  return SKILLS.every(s=>(ranks.get(s)??0)===(actorRanks[s]??0));
}

export function importFoundryActor(snapshot,leveler,catalog,variants={}){
  const fromActor=importPathbuilder({build:snapshot},catalog,variants);
  const level=fromActor.level;
  const lc=leveler?.creation,lp=leveler?.plan;
  let creation=fromActor.creation;
  if(lc&&typeof lc==='object'){
    creation={...clone(lc)};
    for(const field of ACTOR_FIELDS)if(fromActor.creation[field]!=null)creation[field]=clone(fromActor.creation[field]);
    if(spellCount(fromActor.creation.spells))creation.spells=clone(fromActor.creation.spells);
    if(fromActor.creation.subclass)creation.subclass=clone(fromActor.creation.subclass);
    const deity=fromActor.creation.classSelections?.class?.deity;
    if(deity){creation.classSelections??={};creation.classSelections.class={...(creation.classSelections.class??{}),deity:clone(deity)};}
  }
  const actorRanks=Object.fromEntries(Object.entries(snapshot.proficiencies??{}).map(([s,v])=>[s,Math.round((Number(v)||0)/2)]));
  const useLevelerIncreases=levelerIncreasesMatch(creation,lp,catalog.get,level,actorRanks);
  const plan={...clone(lp??{}),...clone(fromActor.plan),levels:{}};
  for(let l=2;l<=20;l++){
    const actorData=fromActor.plan.levels?.[l]??{};
    const levelerData=clone(lp?.levels?.[l]??null);
    let data;
    if(l<=level){
      // Levels the actor has reached: its feats, boosts and spells, Leveler's grants and
      // (when they add up to the actor's ranks) Leveler's recorded skill increases.
      data={...(levelerData??{}),...clone(actorData)};
      if(useLevelerIncreases)data.skillIncreases=levelerData?.skillIncreases??[];
    }else data=levelerData??clone(actorData);
    if(data&&Object.values(data).some(v=>Array.isArray(v)?v.length:v))plan.levels[l]=data;
  }
  const report=fromActor.report;
  if(useLevelerIncreases)report.placed=report.placed.filter(p=>!/^Skill increases/.test(p)).concat('Skill increases from your Leveler plan');
  return {name:fromActor.name,level,creation,plan,planner:fromActor.planner,report};
}
