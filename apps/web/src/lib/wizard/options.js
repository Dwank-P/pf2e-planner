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
export function featOptions(catalog,slot,creation,level=1){
  const feats=catalog.ofType('feat').filter(f=>!Number.isFinite(f.level)||f.level<=level);
  if(slot.category==='ancestry')return feats.filter(f=>category(f)==='ancestry');
  if(slot.category==='class'){
    const cls=slug(slot.classEntry?.slug);
    return feats.filter(f=>category(f)==='class'&&(f.traits??[]).includes(cls)&&!(f.traits??[]).includes('archetype'));
  }
  if(slot.category==='skill')return feats.filter(f=>category(f)==='skill');
  if(slot.category==='general')return feats.filter(f=>category(f)==='general'||category(f)==='skill');
  if(slot.category==='mythic')return feats.filter(f=>(f.traits??[]).includes('mythic')&&(f.traits??[]).includes('calling'));
  return [];
}
/** Spell options for level-1 picks; a non-standard tradition (e.g. "bloodline") lists all. */
export function spellOptions(catalog,{cantrip,tradition}){
  const known=['arcane','divine','occult','primal'].includes(tradition);
  return catalog.ofType('spell').filter(s=>{
    const isCantrip=(s.traits??[]).includes('cantrip');
    if(isCantrip!==cantrip)return false;
    if(!cantrip&&Number(meta(s).spellRank??s.level)!==1)return false;
    if((s.traits??[]).includes('focus'))return false;
    return !known||(meta(s).spellTraditions??[]).includes(tradition);
  });
}
const GEAR_TYPES=['weapon','armor','shield','equipment','consumable','backpack','kit','treasure'];
export function equipmentOptions(catalog){
  return GEAR_TYPES.flatMap(t=>catalog.ofType(t)).filter(i=>!Number.isFinite(i.level)||i.level<=1)
    .sort((a,b)=>a.name.localeCompare(b.name));
}
/** PF2e remaster common languages, offered alongside the ancestry's own list. */
export const COMMON_LANGUAGES=['common','draconic','dwarven','elven','fey','gnomish','goblin','halfling','jotun','orcish','sakvroth'];
