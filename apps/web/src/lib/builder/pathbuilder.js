/**
 * Pathbuilder 2e import: turn a Pathbuilder JSON export ({success, build}) into
 * Leveler creation and plan documents, matching names against the campaign's
 * synced catalog. Pathbuilder records final results, not the level each choice
 * was made at, so skill increases and higher-rank spells are placed at the
 * earliest legal level; the report says what was placed, guessed or not found.
 */
import {emptyCreation} from '../leveler-format.js';
import {levelerChoiceSlots,spellAllowance} from '../leveler-progression.js';
import * as C from './creation.js';
import * as P from './plan.js';
import {skillTraining,attributeModifiers,SKILLS,ATTRIBUTES} from './rules.js';
import {maxSkillRank} from './legality.js';
import {addWish,itemOptions} from './equipment.js';

export const PATHBUILDER_ID=/^\d{3,9}$/;
export const pathbuilderUrl=id=>'https://pathbuilder2e.com/json.php?id='+encodeURIComponent(id);

export const nameKey=s=>String(s??'').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g,'')
  .replace(/\((?:legacy|remastered|premaster)\)/g,'').replace(/[’‘]/g,"'").replace(/[^a-z0-9']+/g,' ').trim();
const attr=s=>{const a=String(s??'').toLowerCase().slice(0,3);return ATTRIBUTES.includes(a)?a:null;};
const attrs=list=>(Array.isArray(list)?list:[]).map(attr).filter(Boolean);
const loreSlug=name=>{
  const base=String(name??'').trim().replace(/\s+lore$/i,'');
  return (base+' lore').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
};

/** Name → item lookup per catalog type, ignoring case, accents and punctuation. */
function nameIndex(catalog){
  const cache=new Map();
  return (types,name)=>{
    const key=nameKey(name);
    if(!key)return null;
    for(const type of [].concat(types)){
      if(!cache.has(type)){
        const map=new Map();
        for(const item of type==='physical'?itemOptions(catalog):catalog.ofType(type)){
          const k=nameKey(item.name);
          if(!map.has(k))map.set(k,item);
        }
        cache.set(type,map);
      }
      const hit=cache.get(type).get(key);
      if(hit)return hit;
    }
    return null;
  };
}
const FEAT_KIND={'ancestry feat':'ancestry','class feat':'class','skill feat':'skill','general feat':'general',
  'archetype feat':'archetype','dual class feat':'dual-class','mythic feat':'mythic'};

export function importPathbuilder(json,catalog,variants={}){
  const build=json?.build??json;
  if(!build||typeof build!=='object'||typeof build.class!=='string')throw Error('pathbuilder_invalid_json');
  const find=nameIndex(catalog);
  const report={matched:[],missing:[],placed:[],notes:[]};
  const miss=(what,name)=>{if(name)report.missing.push({what,name:String(name).slice(0,120)});};
  const level=Math.max(1,Math.min(20,Number(build.level)||1));
  let c=emptyCreation();

  // Origin and class.
  const pick=(what,type,name,set)=>{
    if(!name)return null;
    const item=find(type,name);
    if(item){c=set(c,item);report.matched.push(what);}else miss(what,name);
    return item;
  };
  pick('Ancestry','ancestry',build.ancestry,C.setAncestry);
  pick('Heritage','heritage',build.heritage,C.setHeritage);
  pick('Background','background',build.background,C.setBackground);
  const classItem=pick('Class','class',build.class,C.setClass);
  const dualItem=variants.dualClass===true&&build.dualClass?pick('Second class','class',build.dualClass,C.setDualClass):null;
  if(build.dualClass&&variants.dualClass!==true)report.notes.push('Pathbuilder has a dual class, but Dual Class is off in this campaign.');
  if(build.deity&&!/^(none|not set)$/i.test(build.deity)){
    const deity=find('deity',build.deity);
    if(deity){c=C.setDeity(c,deity,'class');report.matched.push('Deity');}else miss('Deity',build.deity);
  }
  // Specialization: a class feature carrying the class's subclass tag named in Pathbuilder's specials.
  const specials=new Set((build.specials??[]).map(nameKey));
  for(const [target,item] of [['class',classItem],['dualClass',dualItem]]){
    const tag=item?.metadata?.levelerProgression?.subclassTag;
    if(!tag)continue;
    const subclass=catalog.ofType('feat').find(f=>(f.metadata?.otherTags??[]).includes(tag)&&
      [...specials].some(s=>s===nameKey(f.name)||s.includes(nameKey(f.name))||nameKey(f.name).includes(s)));
    if(subclass){c=C.setSubclass(c,subclass,target);report.matched.push('Specialization');}
    else report.notes.push(`Choose the ${item.name} specialization yourself; Pathbuilder doesn't name it in a way the planner can match.`);
  }

  // Attribute boosts (Pathbuilder's breakdown, when the export has it).
  const breakdown=build.abilities?.breakdown;
  if(breakdown){
    c={...c,boosts:{...c.boosts,
      ancestry:attrs(breakdown.ancestryFree),background:attrs(breakdown.backgroundBoosts),
      class:attrs(breakdown.classBoosts).slice(0,1),free:attrs(breakdown.mapLevelledBoosts?.['1']??breakdown.mapLevelledBoosts?.[1])}};
    if(attrs(breakdown.ancestryBoosts).length&&!attrs(breakdown.ancestryFree).length&&
      !(c.ancestry&&catalog.get(c.ancestry.uuid)))report.notes.push('Check ancestry boosts.');
  }else report.notes.push('This export has no boost breakdown; set attribute boosts yourself.');

  // Skills: trained at level 1, then raised by skill increases.
  const prof=build.proficiencies??{};
  const rankOf=v=>Math.max(0,Math.min(4,Math.round((Number(v)||0)/2)));
  const {mods}=attributeModifiers(c,catalog.get);
  const training=skillTraining(c,catalog.get,mods.int);
  const wanted=new Map(SKILLS.map(s=>[s,rankOf(prof[s])]).filter(([,r])=>r>0));
  for(const [name,value] of Array.isArray(build.lores)?build.lores:[]){
    const r=rankOf(value);if(r>0)wanted.set(loreSlug(name),r);
  }
  const free=[...wanted.keys()].filter(s=>SKILLS.includes(s)&&!training.granted.has(s))
    .sort((a,b)=>wanted.get(b)-wanted.get(a)||a.localeCompare(b));
  c={...c,skills:free.slice(0,training.choices)};
  const backgroundLores=new Set(training.lores.map(loreSlug));
  const loreNames=(Array.isArray(build.lores)?build.lores:[]).map(([name])=>String(name).replace(/\s+lore$/i,'')+' Lore');
  c={...c,selectedLoreSkills:loreNames.filter(n=>!backgroundLores.has(loreSlug(n)))};
  c={...c,languages:(Array.isArray(build.languages)?build.languages:[]).map(l=>nameKey(l).replace(/ /g,'-')).filter(Boolean)
    .filter(l=>l!=='none'&&l!=='none selected')};

  // Level-1 feats into the creation, later ones into the first open slot of their kind at their level.
  let plan=P.ensurePlan(null,c);
  const slots=levelerChoiceSlots(classItem,dualItem,variants).slots;
  const taken=new Set();
  for(const entry of Array.isArray(build.feats)?build.feats:[]){
    const [name,extra,type,featLevel]=Array.isArray(entry)?entry:[entry?.name,null,entry?.type,entry?.level];
    const kind=FEAT_KIND[String(type??'').toLowerCase()];
    if(!kind)continue; // Heritage, Awarded and class features come with other choices.
    const item=find('feat',name);
    if(!item){miss('Feat',name+(extra?` (${extra})`:''));continue;}
    const at=Math.max(1,Number(featLevel)||1);
    if(at===1){
      const field={ancestry:'ancestry',class:'class',skill:'skill','dual-class':'dualClass',mythic:'mythic'}[kind];
      if(field&&!c[C.FEAT_FIELDS[field]]){c=C.setFeat(c,field,item);report.matched.push('Feat');continue;}
    }
    const kinds=kind==='archetype'?['archetype','class']:kind==='class'?['class','dual-class']:[kind];
    const slot=slots.find(s=>s.type==='feat'&&s.level===at&&kinds.includes(s.kind)&&!taken.has(s.key));
    if(slot){plan=P.setPlanFeat(plan,slot,item);taken.add(slot.key);report.matched.push('Feat');}
    else report.notes.push(`${item.name} (level ${at}) had no matching ${kind} feat slot; add it yourself.`);
  }

  // Skill increases: each rank above level-1 training, at the earliest legal slot.
  const base=new Map([...training.granted.keys(),...c.skills].map(s=>[s,1]));
  for(const lore of [...backgroundLores,...c.selectedLoreSkills.map(loreSlug)])base.set(lore,1);
  const steps=[];
  for(const [skill,rank] of wanted)for(let r=(base.get(skill)??0)+1;r<=rank;r++)steps.push({skill,rank:r});
  steps.sort((a,b)=>a.rank-b.rank||a.skill.localeCompare(b.skill));
  const increaseSlots=slots.filter(s=>s.type==='skill'&&s.level<=level).sort((a,b)=>a.level-b.level);
  const used=new Set(),reached=new Map();
  for(const step of steps){
    const slot=increaseSlots.find(s=>!used.has(s.key)&&maxSkillRank(s.level)>=step.rank&&s.level>(reached.get(step.skill)??1)
      &&(!s.allowedSkills?.length||s.allowedSkills.includes(step.skill)));
    if(!slot){report.notes.push(`Couldn't place ${step.skill.replace(/-/g,' ')} rank ${step.rank}; it may come from a feat or class feature.`);continue;}
    used.add(slot.key);reached.set(step.skill,slot.level);
    plan=P.setSkillIncrease(plan,slot,step.skill,step.rank);
  }
  if(steps.length)report.placed.push('Skill increases at the earliest level each rank was allowed');

  // Level boosts 5/10/15/20.
  for(const [lvl,list] of Object.entries(breakdown?.mapLevelledBoosts??{})){
    const l=Number(lvl);
    if(l<2||l>level)continue;
    for(const a of attrs(list).slice(0,4))plan=P.toggleLevelBoost(plan,l,a,4);
  }

  // Spells: level-1 picks, then later ones over the levels where they could be learned.
  for(const [target,item] of [['class',classItem],['dualClass',dualItem]]){
    if(!item)continue;
    const caster=(build.spellCasters??[]).find(s=>!s.innate&&nameKey(s.name)===nameKey(item.name))
      ??(target==='class'?(build.spellCasters??[]).find(s=>!s.innate&&!(build.dualClass&&nameKey(s.name)===nameKey(build.dualClass))):null);
    if(!caster)continue;
    const progression=item.metadata?.levelerProgression;
    const entryType=target==='class'?'primary':'class:'+String(progression?.slug??'').toLowerCase();
    const pool=new Map();
    for(const group of caster.spells??[]){
      const rank=Number(group.spellLevel)||0;
      for(const name of group.list??[]){
        const spell=find('spell',name);
        if(!spell){miss('Spell',name);continue;}
        if(!pool.has(rank))pool.set(rank,[]);
        if(!pool.get(rank).some(s=>s.uuid===spell.uuid))pool.get(rank).push(spell);
      }
    }
    const first=spellAllowance(progression,1);
    if(first){
      for(const spell of (pool.get(0)??[]).splice(0,first.cantrips))
        c=C.toggleSpell(c,spell,{cantrip:true,max:first.cantrips,target:target==='class'?'primary':'secondary'});
      for(const spell of (pool.get(1)??[]).splice(0,first.ranks[1]??0))
        c=C.toggleSpell(c,spell,{cantrip:false,max:first.ranks[1],target:target==='class'?'primary':'secondary'});
    }
    for(let l=2;l<=level;l++){
      const a=spellAllowance(progression,l);
      if(!a)continue;
      const take=(rank,n,cantrip)=>{for(const spell of (pool.get(rank)??[]).splice(0,n))
        plan=P.togglePlanSpell(plan,l,spell,{rank,cantrip,entryType});};
      if(a.cantrips)take(0,a.cantrips,true);
      for(const [rank,n] of Object.entries(a.ranks))take(Number(rank),n,false);
      for(let left=a.any,rank=a.maxRank;left>0&&rank>=1;rank--){
        const n=Math.min(left,pool.get(rank)?.length??0);
        take(rank,n,false);left-=n;
      }
    }
    const leftover=[...pool.values()].reduce((n,list)=>n+list.length,0);
    if(leftover)report.notes.push(`${leftover} ${item.name} spell${leftover===1?'':'s'} didn't fit Leveler's per-level picks (prepared casters prepare from their whole list).`);
    else if(pool.size)report.placed.push(`${item.name} spells at the earliest level each rank was available`);
  }

  // Gear goes to the equipment plan as already bought.
  let planner={modifiers:{},notes:'',extraFeats:{},wishlist:[]};
  const gear=[...(build.weapons??[]).map(w=>[w?.name,w?.qty]),...(build.armor??[]).map(a=>[a?.name,a?.qty]),
    ...(build.equipment??[]).map(e=>Array.isArray(e)?[e[0],e[1]]:[e?.name,e?.qty])];
  for(const [name,qty] of gear.slice(0,200)){
    if(!name)continue;
    const item=find('physical',name);
    if(!item){miss('Item',name);continue;}
    planner=addWish(planner,item,level);
    const wish=planner.wishlist[planner.wishlist.length-1];
    wish.status='bought';wish.quantity=Math.max(1,Math.min(999,Number(qty)||1));
  }
  plan=P.ensurePlan(plan,c);
  return {name:String(build.name||'Imported character').trim().slice(0,80)||'Imported character',level,
    creation:c,plan,planner,report:{...report,matched:report.matched.length}};
}
