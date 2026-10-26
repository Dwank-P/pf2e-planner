/**
 * Runesmith rune planning (website only; Leveler has no runes, so nothing is exported).
 *
 * planner.runes = {[level]: {count?, picks?}} holds only what was set at that level. A level
 * without its own value follows the nearest earlier level that has one, so changing level 1
 * also changes level 2 unless level 2 was set itself; levels above a changed level follow it.
 */
const clone=value=>JSON.parse(JSON.stringify(value??{}));
export const DEFAULT_RUNE_COUNT=3;
export const isRunesmith=creation=>[creation?.class,creation?.dualClass].some(c=>String(c?.slug??c?.name??'').toLowerCase()==='runesmith');

/** Runes in the catalog: rune-trait abilities, not the runes etched on weapons and armour. */
const PHYSICAL=['weapon','armor','shield','equipment','consumable','backpack','treasure','kit'];
export function runeOptions(catalog){
  const all=catalog.types?.()??[];
  return all.filter(t=>!PHYSICAL.includes(t)).flatMap(t=>catalog.ofType(t))
    .filter(item=>(item.traits??[]).includes('rune')||(item.metadata?.otherTags??[]).some(t=>/runesmith-rune/.test(t)));
}

/** What applies at `level`: its picks and count, and the levels they come from. */
export function effectiveRunes(planner,level){
  const runes=planner?.runes??{};
  let picks=[],pickLevel=null,count=DEFAULT_RUNE_COUNT,countLevel=null;
  for(let l=1;l<=level;l++){
    const own=runes[l];
    if(Array.isArray(own?.picks)){picks=own.picks;pickLevel=l;}
    if(Number.isInteger(own?.count)){count=own.count;countLevel=l;}
  }
  return {picks:[...picks],count,pickLevel,countLevel,own:runes[level]??null};
}
function setAt(planner,level,change){
  const next=clone(planner);
  next.runes=clone(next.runes);
  const own={...(next.runes[level]??{})};
  change(own);
  if(own.picks===undefined&&own.count===undefined)delete next.runes[level];
  else next.runes[level]=own;
  return next;
}
/** Pick or drop a rune at this level; the level stops following earlier levels' picks. */
export function toggleRune(planner,level,uuid){
  const {picks,count}=effectiveRunes(planner,level);
  const index=picks.indexOf(uuid);
  if(index>=0)picks.splice(index,1);
  else if(picks.length<count)picks.push(uuid);
  else return planner;
  return setAt(planner,level,own=>{own.picks=picks;});
}
/** How many runes are known from this level on (new slots gained, or a GM's extra). */
export function setRuneCount(planner,level,count){
  const n=Math.max(0,Math.min(50,Math.round(Number(count))||0));
  const inherited=effectiveRunes(planner,level-1);
  return setAt(planner,level,own=>{
    if(level>1&&n===inherited.count)delete own.count;else own.count=n;
  });
}
/** Follow earlier levels again at this level. */
export function resetRunes(planner,level){
  return setAt(planner,level,own=>{delete own.picks;delete own.count;});
}
