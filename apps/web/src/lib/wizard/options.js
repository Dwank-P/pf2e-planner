/** Option lists for each Character Wizard step, from the synced catalog. */
import {titleCase} from '../builder/rules.js';

const slug=v=>String(v??'').toLowerCase();
const meta=item=>item?.metadata??{};
const memo=new WeakMap();
/** Items of any type carrying one of these otherTags (subclasses, theses, tactics…). */
export function taggedItems(catalog,tags,type=null){
  let byTag=memo.get(catalog);
  if(!byTag){
    byTag=new Map();
    for(const t of catalog.types())for(const item of catalog.ofType(t))
      for(const tag of meta(item).otherTags??[]){
        if(!byTag.has(tag))byTag.set(tag,[]);
        byTag.get(tag).push(item);
      }
    memo.set(catalog,byTag);
  }
  const seen=new Set(),out=[];
  for(const tag of tags)for(const item of byTag.get(tag)??[])
    if(!seen.has(item.uuid)&&(!type||item.type===type)){seen.add(item.uuid);out.push(item);}
  return out.sort((a,b)=>a.name.localeCompare(b.name));
}
export function heritagesFor(catalog,creation){
  const ancestry=creation?.ancestry;
  return catalog.ofType('heritage').filter(h=>{
    const m=meta(h);
    if(m.versatile===true||(!m.ancestryUuid&&!m.ancestrySlug))return true;
    return !!ancestry&&(m.ancestryUuid===ancestry.uuid||slug(m.ancestrySlug)===slug(ancestry.slug));
  });
}
/** Why an ancestry feat isn't available to this ancestry/heritage, or null. */
export function ancestryFeatBlock(feat,creation){
  const ancestry=slug(creation?.ancestry?.slug),heritage=slug(creation?.heritage?.slug);
  if(!ancestry)return 'Choose an ancestry first';
  const access=meta(feat).ancestryAccess;
  const own=new Set([ancestry,heritage,...(creation?.ancestry?.traits??[]).map(slug)].filter(Boolean));
  if(access?.universal)return null;
  const needed=(access?.restrictedTo??[]).map(slug);
  if(needed.length&&!needed.some(t=>own.has(t)))return 'Requires '+needed.map(titleCase).join(' or ');
  return null;
}
const category=item=>meta(item).category??meta(item).featType;
/**
 * Feats a slot can hold, by slot kind (class, archetype, dual-class, skill,
 * general, ancestry, mythic). Level, prerequisites and access are judged by
 * legality.checkFeat so unavailable options can still be shown with a reason.
 */
export function featOptions(catalog,kind,creation){
  const feats=catalog.ofType('feat').filter(f=>category(f)!=='classfeature');
  const has=(f,t)=>(f.traits??[]).includes(t);
  const classSlug=slug(creation?.class?.slug),dualSlug=slug(creation?.dualClass?.slug);
  switch(kind){
    case 'ancestry':return feats.filter(f=>category(f)==='ancestry');
    case 'class':return feats.filter(f=>category(f)==='class'&&(has(f,classSlug)||has(f,'archetype')));
    case 'dual-class':return feats.filter(f=>category(f)==='class'&&(has(f,dualSlug)||has(f,'archetype')));
    case 'archetype':return feats.filter(f=>has(f,'archetype'));
    case 'skill':return feats.filter(f=>category(f)==='skill');
    case 'general':return feats.filter(f=>category(f)==='general'||category(f)==='skill');
    case 'mythic':return feats.filter(f=>has(f,'mythic'));
    default:return [];
  }
}
/** Spell options for level-1 picks; a non-standard tradition (e.g. "bloodline") lists all. */
export function spellOptions(catalog,{cantrip,tradition,rank=1}){
  const known=['arcane','divine','occult','primal'].includes(tradition);
  return catalog.ofType('spell').filter(s=>{
    const isCantrip=(s.traits??[]).includes('cantrip');
    if(isCantrip!==cantrip)return false;
    if(!cantrip&&Number(meta(s).spellRank??s.level)!==rank)return false;
    if((s.traits??[]).includes('focus'))return false;
    return !known||(meta(s).spellTraditions??[]).includes(tradition);
  });
}
/**
 * A spell's targeted defense from PF2e's system.defense: 'ac', 'fortitude',
 * 'reflex', 'will', 'none' (no defense), or null when not synced (Bridge < 0.10).
 */
export function spellDefense(spell){
  const rules=meta(spell).rules;
  if(!rules||!('defense' in rules))return null;
  const d=rules.defense;
  return d?.passive?.statistic==='ac'?'ac':d?.save?.statistic??(d?.passive?.statistic||'none');
}
const GEAR_TYPES=['weapon','armor','shield','equipment','consumable','backpack','kit','treasure'];
export function equipmentOptions(catalog){
  return GEAR_TYPES.flatMap(t=>catalog.ofType(t)).filter(i=>!Number.isFinite(i.level)||i.level<=1)
    .sort((a,b)=>a.name.localeCompare(b.name));
}
/** PF2e remaster language rarities, used until the Bridge sends the world's own list. */
export const COMMON_LANGUAGES=['common','draconic','dwarven','elven','fey','gnomish','goblin','halfling','jotun','orcish','sakvroth'];
const FALLBACK_UNCOMMON=['aklo','alghollthu','amurrun','anadi','arboreal','boggard','calda','caligni','chthonian','cyclops',
  'daemonic','diabolic','empyrean','grippli','hallit','iruxi','jistkan','kholo','kitsune','kobold','muan','mzunu',
  'nagaji','necril','petran','protean','pyric','requian','shadowtongue','shoony','sussuran','talican','tengu',
  'thalassic','utopian','vanara','vishkanya','wayang','ysoki'];
const FALLBACK_RARE=['ancient-osiriani','azlanti','elder-thing','jyoti','sphinx','thassilonian','tien','varisian'];
const FALLBACK_SECRET=['wildsong'];
/** Language → rarity from the world's PF2e setting (Bridge 0.9+) or the remaster defaults. */
export function languageRarityMap(world,extra=[]){
  const map=new Map();
  if(world?.all?.length){
    for(const l of world.all)map.set(l,'uncommon');
    for(const r of ['common','uncommon','rare','secret'])for(const l of world[r]??[])map.set(l,r);
    for(const l of world.unavailable??[])map.delete(l);
  }else{
    for(const l of COMMON_LANGUAGES)map.set(l,'common');
    for(const l of FALLBACK_UNCOMMON)map.set(l,'uncommon');
    for(const l of FALLBACK_RARE)map.set(l,'rare');
    for(const l of FALLBACK_SECRET)map.set(l,'secret');
  }
  for(const l of extra)if(!map.has(l))map.set(l,'uncommon');
  return map;
}
