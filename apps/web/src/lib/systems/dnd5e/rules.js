/**
 * D&D 5e rules the builder needs that items don't describe: ability-score methods,
 * proficiency bonus, multiclass prerequisites (2014) and the spell-slot tables.
 * Everything else comes from the synced items' advancement data (see build.js).
 */

export const ABILITIES=['str','dex','con','int','wis','cha'];
export const ABILITY_NAMES={str:'Strength',dex:'Dexterity',con:'Constitution',int:'Intelligence',wis:'Wisdom',cha:'Charisma'};
export const STANDARD_ARRAY=[15,14,13,12,10,8];
export const POINT_BUY_COST={8:0,9:1,10:2,11:3,12:4,13:5,14:7,15:9};
export const POINT_BUY_BUDGET=27;

export const modifier=score=>Math.floor((Number(score)||10)/2)-5;
export const signed=n=>(n>=0?'+':'')+n;
export const proficiencyBonus=level=>2+Math.floor((Math.max(1,level)-1)/4);
export const pointBuyCost=base=>ABILITIES.reduce((n,a)=>n+(POINT_BUY_COST[base?.[a]??8]??99),0);
export const isModern=variants=>variants?.rulesVersion==='modern';

/** Default base scores for a method. */
export function defaultScores(method){
  if(method==='pointbuy')return Object.fromEntries(ABILITIES.map(a=>[a,8]));
  if(method==='manual')return Object.fromEntries(ABILITIES.map(a=>[a,10]));
  return {};
}
/** Base scores are complete and legal for their method. */
export function scoresValid(method,base={}){
  if(method==='standard'){
    const values=ABILITIES.map(a=>base[a]).filter(Number.isInteger).sort((a,b)=>b-a);
    return values.length===6&&values.every((v,i)=>v===STANDARD_ARRAY[i]);
  }
  if(method==='pointbuy')return ABILITIES.every(a=>POINT_BUY_COST[base[a]]!==undefined)&&pointBuyCost(base)<=POINT_BUY_BUDGET;
  return ABILITIES.every(a=>Number.isInteger(base[a])&&base[a]>=1&&base[a]<=30);
}

// 2014 multiclassing prerequisites (PHB p.163); [[a,b]] means a OR b, [a,b] means a AND b.
const LEGACY_PREREQUISITES={
  artificer:['int'],barbarian:['str'],bard:['cha'],cleric:['wis'],druid:['wis'],fighter:[['str','dex']],
  monk:['dex','wis'],paladin:['str','cha'],ranger:['dex','wis'],rogue:['dex'],sorcerer:['cha'],
  warlock:['cha'],wizard:['int']
};
/**
 * The scores a class needs for multiclassing into or out of it, as a list of
 * alternatives: [['str'],['dex']] = Str 13 or Dex 13; [['dex','wis']] = both.
 * 2024 rules use the class's primary ability; 2014 the PHB table; unknown
 * (third-party) classes without a primary ability have no prerequisite.
 */
export function multiclassRequirement(classItem,variants){
  const primary=classItem?.metadata?.primaryAbility;
  const list=(primary?.value??[]).filter(a=>ABILITIES.includes(a));
  if(list.length&&(isModern(variants)||!LEGACY_PREREQUISITES[identifier(classItem)]))
    return primary.all===false?list.map(a=>[a]):[list];
  const legacy=LEGACY_PREREQUISITES[identifier(classItem)];
  if(!legacy)return list.length?(primary?.all===false?list.map(a=>[a]):[list]):[];
  return legacy.length===1&&Array.isArray(legacy[0])?legacy[0].map(a=>[a]):[legacy];
}
export function meetsRequirement(requirement,scores){
  return !requirement.length||requirement.some(group=>group.every(a=>(scores[a]??0)>=13));
}
export const requirementText=requirement=>requirement.map(group=>group.map(a=>ABILITY_NAMES[a]+' 13').join(' and ')).join(' or ');

export function identifier(item){
  return item?.metadata?.identifier||String(item?.name??'').toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
}

// Spell slots by caster level (rows 1–20; columns = spell levels 1–9).
const FULL=[
  [2],[3],[4,2],[4,3],[4,3,2],[4,3,3],[4,3,3,1],[4,3,3,2],[4,3,3,3,1],[4,3,3,3,2],
  [4,3,3,3,2,1],[4,3,3,3,2,1],[4,3,3,3,2,1,1],[4,3,3,3,2,1,1],[4,3,3,3,2,1,1,1],[4,3,3,3,2,1,1,1],
  [4,3,3,3,2,1,1,1,1],[4,3,3,3,3,1,1,1,1],[4,3,3,3,3,2,1,1,1],[4,3,3,3,3,2,2,1,1]
];
const PACT=[[1,1],[2,1],[2,2],[2,2],[2,3],[2,3],[2,4],[2,4],[2,5],[2,5],[3,5],[3,5],[3,5],[3,5],[3,5],[3,5],[4,5],[4,5],[4,5],[4,5]];
export const slotsForCasterLevel=level=>level>=1?FULL[Math.min(20,level)-1]:[];
export function pactSlots(level){
  if(level<1)return null;
  const [count,slotLevel]=PACT[Math.min(20,level)-1];
  return {count,level:slotLevel};
}
/**
 * Caster level a class contributes. Single-class half/third casters round up
 * (that's how their own tables work); multiclassed they round down, except
 * artificers, and 2024 rules round half casters up.
 */
export function casterLevel(progression,levels,{multiclass=false,modern=false}={}){
  if(!levels)return 0;
  switch(progression){
    case 'full':return levels;
    case 'artificer':return Math.ceil(levels/2);
    case 'half':
      if(modern||!multiclass)return modern||levels>=2?Math.ceil(levels/2):0;
      return Math.floor(levels/2);
    case 'third':
      if(!multiclass)return levels>=3?Math.ceil(levels/3):0;
      return Math.floor(levels/3);
    default:return 0;
  }
}
/** Highest spell level a class (on its own) can cast at its class level. */
export function maxSpellLevel(progression,levels,modern){
  if(progression==='pact')return pactSlots(levels)?.level??0;
  return slotsForCasterLevel(casterLevel(progression,levels,{modern})).length;
}
