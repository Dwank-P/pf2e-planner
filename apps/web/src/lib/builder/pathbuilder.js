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
import {skillTraining,attributeModifiers,SKILLS,ATTRIBUTES,RANKS,titleCase,loreName} from './rules.js';
import {maxSkillRank} from './legality.js';
import {addWish,itemOptions} from './equipment.js';

export const PATHBUILDER_ID=/^\d{3,9}$/;
export const pathbuilderUrl=id=>'https://pathbuilder2e.com/json.php?id='+encodeURIComponent(id);

/** A name, or an exact {uuid,name} reference (Foundry exports send these). */
export const label=v=>v&&typeof v==='object'?v.name:v;
export const nameKey=s=>String(label(s)??'').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g,'')
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
    // An exact reference wins when the catalog has that item.
    if(name&&typeof name==='object'&&name.uuid){
      const exact=catalog.get(name.uuid);
      if(exact&&[].concat(types).some(t=>t==='physical'?itemOptions(catalog).includes(exact):exact.type===t))return exact;
    }
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
/** Slot kind from Pathbuilder's slot label ("Bard Feat 2", "Ancestry Paragon 3"), else its feat type. */
export function featKind(type,slotLabel,{className='',dualName='',ancestryName=''}={}){
  const t=String(type??'').toLowerCase();
  if(t==='heritage'||t==='awarded feat'||!t)return null;
  const label=nameKey(slotLabel);
  if(label){
    if(/^ancestry paragon/.test(label))return 'paragon';
    if(/^free archetype/.test(label))return 'archetype';
    if(dualName&&label.startsWith(nameKey(dualName)+' feat'))return 'dual-class';
    if(className&&label.startsWith(nameKey(className)+' feat'))return 'class';
    if(ancestryName&&label.startsWith(ancestryName+' feat'))return 'ancestry';
  }
  return FEAT_KIND[t]??null;
}

export function importPathbuilder(json,catalog,variants={}){
  const build=json?.build??json;
  if(!build||typeof build!=='object'||typeof label(build.class)!=='string')throw Error('pathbuilder_invalid_json');
  const find=nameIndex(catalog);
  const report={matched:[],missing:[],placed:[],notes:[]};
  const miss=(what,name)=>{if(name)report.missing.push({what,name:String(label(name)).slice(0,120)});};
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
  if(build.deity&&!/^(none|not set)$/i.test(label(build.deity))){
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
    else report.notes.push(`Choose the ${item.name} specialization yourself; the export doesn't name it in a way the planner can match.`);
  }

  // Attribute boosts (Pathbuilder's breakdown, when the export has it).
  const breakdown=build.abilities?.breakdown;
  if(breakdown){
    // Alternate ancestry boosts: two free boosts instead of the ancestry's fixed boosts and flaw.
    // Foundry exports say so; Pathbuilder shows two free boosts and no fixed ones.
    const fixedOnAncestry=Object.values(catalog.get(c.ancestry?.uuid)?.metadata?.rules?.boosts??{})
      .some(b=>Array.isArray(b?.value)&&b.value.length===1);
    const alternate=breakdown.alternate===true||(attrs(breakdown.ancestryFree).length===2&&
      !attrs(breakdown.ancestryBoosts).length&&!attrs(breakdown.ancestryFlaws).length&&fixedOnAncestry);
    if(alternate)c={...C.setAlternateAncestryBoosts(c,true)};
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
  // Extra lores share the level-1 skill picks; any beyond them came from feats (Additional Lore).
  const backgroundLores=new Set(training.lores.map(loreSlug));
  const loreNames=(Array.isArray(build.lores)?build.lores:[]).map(([name])=>loreName(name))
    .filter(n=>n&&!backgroundLores.has(loreSlug(n)));
  const loreRoom=Math.max(0,training.choices-c.skills.length);
  c={...c,selectedLoreSkills:loreNames.slice(0,loreRoom)};
  for(const name of loreNames.slice(loreRoom))
    report.notes.push(`${name} probably comes from a feat such as Additional Lore; Leveler asks for it in Foundry.`);
  c={...c,languages:(Array.isArray(build.languages)?build.languages:[]).map(l=>nameKey(l).replace(/ /g,'-')).filter(Boolean)
    .filter(l=>l!=='none'&&l!=='none selected')};

  // Feats go where Pathbuilder's own slot label says ("Bard Feat 2", "Ancestry Paragon 3",
  // "Free Archetype 4"); level-1 feats into the creation, never into plan.levels[1].
  let plan=P.ensurePlan(null,c);
  const slots=levelerChoiceSlots(classItem,dualItem,variants).slots.filter(s=>s.level>1);
  const taken=new Set();
  const ancestryName=nameKey(c.ancestry?.name??build.ancestry);
  for(const entry of Array.isArray(build.feats)?build.feats:[]){
    const [name,extra,type,featLevel,slotLabel,choiceType,parent]=Array.isArray(entry)?entry:[entry?.name,null,entry?.type,entry?.level];
    const kind=featKind(type,slotLabel,{className:label(build.class),dualName:label(build.dualClass),ancestryName});
    if(!kind)continue; // Heritage, Awarded and class features come with other choices.
    if(choiceType==='childChoice'){
      report.notes.push(`${label(name)} comes from ${String(slotLabel??parent??'another feat').replace(/Free Archetype \d+$/,'').trim()||'another feat'}; Leveler asks for it in Foundry.`);
      continue;
    }
    const item=find('feat',name);
    if(!item){miss('Feat',label(name)+(extra?` (${extra})`:''));continue;}
    const at=Math.max(1,Number(featLevel)||1);
    if(at===1){
      const field={ancestry:'ancestry',paragon:'paragon',class:'class',skill:'skill','dual-class':'dualClass',mythic:'mythic'}[kind];
      if(kind==='paragon'&&variants.ancestralParagon!==true)
        report.notes.push(`${item.name} is an Ancestral Paragon feat, but that variant is off in this campaign.`);
      else if(field&&!c[C.FEAT_FIELDS[field]]){c=C.setFeat(c,field,item);report.matched.push('Feat');}
      else report.notes.push(`${item.name} (level 1) had no free level-1 ${kind} feat; add it yourself.`);
      continue;
    }
    const kinds=kind==='paragon'?['ancestry']:kind==='archetype'?['archetype','class']:kind==='class'?['class','dual-class']:[kind];
    const slot=slots.find(s=>s.type==='feat'&&s.level===at&&kinds.includes(s.kind)&&!taken.has(s.key));
    if(slot){plan=P.setPlanFeat(plan,slot,item);taken.add(slot.key);report.matched.push('Feat');}
    else report.notes.push(`${item.name} (level ${at}) had no matching ${kind==='paragon'?'ancestry':kind} feat slot; add it yourself.`);
  }

  // Skill increases. Pathbuilder keeps final ranks, not when each was raised, so each
  // increase goes to the skill with the most ranks still to gain (your main skills first),
  // within the level's rank limit. Training an untrained skill uses spare increases last.
  const base=new Map([...training.granted.keys(),...c.skills].map(s=>[s,1]));
  for(const lore of [...backgroundLores,...c.selectedLoreSkills.map(loreSlug)])base.set(lore,1);
  const current=new Map(base);
  const increaseSlots=slots.filter(s=>s.type==='skill'&&s.level<=level).sort((a,b)=>a.level-b.level);
  const remaining=skill=>(wanted.get(skill)??0)-(current.get(skill)??0);
  const allowed=(slot,skill)=>!slot.allowedSkills?.length||slot.allowedSkills.includes(skill);
  const spare=[];
  for(const slot of increaseSlots){
    const pick=[...wanted.keys()].filter(s=>(current.get(s)??0)>=1&&remaining(s)>0&&(current.get(s)+1)<=maxSkillRank(slot.level)&&allowed(slot,s))
      .sort((a,b)=>remaining(b)-remaining(a)||wanted.get(b)-wanted.get(a)||a.localeCompare(b))[0];
    if(!pick){spare.push(slot);continue;}
    current.set(pick,current.get(pick)+1);
    plan=P.setSkillIncrease(plan,slot,pick,current.get(pick));
  }
  for(const skill of [...wanted.keys()].filter(s=>!(current.get(s)>=1)).sort()){
    const slot=spare.find(s=>allowed(s,skill));
    if(!slot)continue;
    spare.splice(spare.indexOf(slot),1);
    current.set(skill,1);
    plan=P.setSkillIncrease(plan,slot,skill,1);
  }
  for(const [skill,rank] of wanted)if((current.get(skill)??0)<rank)
    report.notes.push(`${titleCase(skill)} ${RANKS[current.get(skill)??0]} → ${RANKS[rank]} didn't fit the skill increases; it may come from a feat or class feature.`);
  if(increaseSlots.length)report.placed.push('Skill increases guessed from final ranks (Pathbuilder doesn’t record which level each was raised at): check them');

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
