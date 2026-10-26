/**
 * Foundry → website export. Only what is known goes in:
 *  - from the actor: its ancestry, heritage, background, class and deity items, the boosts chosen
 *    at character creation (ancestry incl. alternate boosts, background, class key, level-1 free),
 *    languages and feats in the slots they fill on the sheet;
 *  - from PF2e Leveler: wizard choices and level-1 skills and spells (when it has a creation
 *    document), and the plan: level boosts, skill increases, spells and grants per level.
 * Nothing is inferred from final values (later boosts, skill ranks, known spells); anything the
 * plan doesn't say is left for the player to fill in.
 */
import {importPathbuilder} from './pathbuilder.js';

const clone=value=>JSON.parse(JSON.stringify(value??null));
/** Creation fields the actor decides. */
const ACTOR_FIELDS=['ancestry','heritage','background','class','dualClass','boosts','alternateAncestryBoosts','languages',
  'ancestryFeat','ancestryParagonFeat','classFeat','dualClassFeat','skillFeat'];
/** Per-level data the sheet doesn't record; only Leveler's plan knows it. */
const PLAN_ONLY=['abilityBoosts','skillIncreases','customSkillIncreases','spells','signatureSpells','featGrants'];
const hasData=data=>data&&Object.values(data).some(v=>Array.isArray(v)?v.length:v);

export function importFoundryActor(snapshot,leveler,catalog,variants={}){
  const fromActor=importPathbuilder({build:{...snapshot,spellCasters:[]}},catalog,variants);
  const level=fromActor.level;
  const lc=leveler?.creation,lp=leveler?.plan;
  let creation=fromActor.creation;
  if(lc&&typeof lc==='object'){
    creation={...clone(lc)};
    for(const field of ACTOR_FIELDS)if(fromActor.creation[field]!=null)creation[field]=clone(fromActor.creation[field]);
    if(fromActor.creation.subclass)creation.subclass=clone(fromActor.creation.subclass);
    const deity=fromActor.creation.classSelections?.class?.deity;
    if(deity){creation.classSelections??={};creation.classSelections.class={...(creation.classSelections.class??{}),deity:clone(deity)};}
  }else if(level>1){
    // Without Leveler's creation document, which trained skills were level-1 picks isn't known.
    creation={...creation,skills:[],selectedLoreSkills:[]};
  }
  const plan={...clone(lp??{}),...clone(fromActor.plan),levels:{}};
  for(let l=2;l<=20;l++){
    const actorData=clone(fromActor.plan.levels?.[l]??{});
    for(const key of PLAN_ONLY)delete actorData[key];
    const levelerData=clone(lp?.levels?.[l]??null);
    // Levels the actor has reached: its feats by slot, everything else from the plan.
    const data=l<=level?{...(levelerData??{}),...actorData}:levelerData;
    if(hasData(data))plan.levels[l]=data;
  }
  const report={...fromActor.report,placed:[],
    notes:fromActor.report.notes.filter(n=>!/didn't fit the skill increases|spells? didn't fit/.test(n))};
  report.notes.push(lp?'Level boosts, skill increases and spells come from your Leveler plan.'
    :'Level boosts, skill increases and spells after level 1 aren\'t on the sheet in a form the planner can place; add them in the planner.');
  if(!lc&&level>1)report.notes.push('Level-1 skill picks aren\'t known without Leveler\'s creation data; choose them in the Skills step.');
  return {name:fromActor.name,level,creation,plan,planner:fromActor.planner,report};
}
