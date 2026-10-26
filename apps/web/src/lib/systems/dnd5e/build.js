/**
 * D&D 5e plan: reads the synced items' advancement data (dnd5e's own description of a
 * class's progression) and the player's picks, and derives everything the builder shows.
 *
 * build = {abilities:{method,base}, speciesUuid, backgroundUuid,
 *          levels:[classUuid per character level], subclasses:{classUuid:subclassUuid},
 *          choices:{key:value}, spells:{classUuid:[uuid]}, feats:[uuid], hp:'average'|'max'}
 *
 * Choice keys are "<source uuid>|<advancement id>|L<level>" (level = class level for class and
 * subclass items, character level otherwise), with "|c<i>" for each "choose N" pool of a Trait
 * advancement; nested items (a feat taken at an ASI, a granted feature) prefix their parent's
 * key and ">". Values: arrays of uuids or trait keys, or {mode:'asi',points} / {mode:'feat',uuid}.
 */
import {ABILITIES,modifier,proficiencyBonus,identifier,multiclassRequirement,meetsRequirement,
  casterLevel,slotsForCasterLevel,pactSlots,maxSpellLevel,isModern} from './rules.js';

export function emptyBuild(){
  return {abilities:{method:'standard',base:{}},speciesUuid:null,backgroundUuid:null,levels:[],
    subclasses:{},choices:{},spells:{},feats:[],hp:'average'};
}
export function normalizeBuild(value){
  const base=emptyBuild();
  const b=value&&typeof value==='object'?value:{};
  return {...base,...b,abilities:{...base.abilities,...(b.abilities??{}),base:{...(b.abilities?.base??{})}},
    levels:[...(b.levels??[])],subclasses:{...(b.subclasses??{})},choices:{...(b.choices??{})},
    spells:{...(b.spells??{})},feats:[...(b.feats??[])]};
}

/** Items made for the other edition (2014 vs 2024); third-party items without a tag always match. */
export function editionMatches(item,variants){
  const edition=item?.metadata?.edition;
  if(!edition)return true;
  return isModern(variants)?edition==='2024':edition==='2014';
}

const asArray=value=>Array.isArray(value)?value:value&&typeof value==='object'?Object.values(value):[];
const uuidOf=entry=>typeof entry==='string'?entry:entry?.uuid??null;
const levelOf=adv=>Math.max(1,Number(adv.level)||1);

/** Levels at which an advancement asks something (ItemChoice lists its own). */
function advancementLevels(adv){
  if(adv.type==='ItemChoice'){
    return Object.entries(adv.configuration?.choices??{})
      .filter(([,c])=>(typeof c==='number'?c:c?.count)>0).map(([l])=>Math.max(1,Number(l)||1));
  }
  if(adv.type==='HitPoints'||adv.type==='ScaleValue')return [];
  return [levelOf(adv)];
}
function choiceCount(adv,level){
  // Origins store their first choices at level 0, which applies at character level 1.
  const choices=adv.configuration?.choices??{};
  const c=choices[level]??(level===1?choices[0]:undefined);
  return typeof c==='number'?c:Number(c?.count)||0;
}
function restrictionAllows(adv,isOriginal){
  const r=adv.classRestriction;
  return !r||(r==='primary'&&isOriginal)||(r==='secondary'&&!isOriginal);
}

// ---- Traits ----------------------------------------------------------------------------------

const TRAIT_NAMES={skills:'Skill',saves:'Saving throw',languages:'Language',tool:'Tool',armor:'Armor',weapon:'Weapon',
  di:'Damage immunity',dr:'Damage resistance',dv:'Damage vulnerability',ci:'Condition immunity',dm:'Damage modification'};
export function traitLabel(key,variants){
  const category=String(key).split(':')[0];
  const known=variants?.traits?.[category]?.[key]?.label;
  if(known)return known;
  if(category==='skills')return variants?.skills?.[key.split(':')[1]]?.label??key.split(':').pop();
  if(category==='saves')return (variants?.abilities?.[key.split(':')[1]]?.label??key.split(':')[1])+' saves';
  const last=key.split(':').pop();
  return last==='*'?'Any '+(TRAIT_NAMES[category]??category).toLowerCase():last.replace(/-/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
}
/** Expand a pool ("skills:*", "tool:art", "languages:standard:*") into selectable keys. */
export function expandPool(pool,variants){
  const out=new Set();
  for(const raw of asArray(pool)){
    const key=String(raw);
    const category=key.split(':')[0];
    const table=variants?.traits?.[category]??(category==='skills'
      ?Object.fromEntries(Object.keys(variants?.skills??{}).map(k=>['skills:'+k,{label:variants.skills[k].label}])):{});
    const prefix=key.endsWith(':*')?key.slice(0,-1):table[key]?.group?key+':':null;
    if(prefix===null){out.add(key);continue;}
    for(const [k,v] of Object.entries(table))if(k.startsWith(prefix)&&!v.group)out.add(k);
  }
  return [...out];
}

// ---- Derivation ------------------------------------------------------------------------------

/**
 * Walk the plan level by level. Returns per-level choice cards and features, ability
 * scores, proficiencies, HP, spellcasting and warnings.
 */
export function derive(input,catalog,variants={}){
  // First pass finds everything the character ends up proficient in, so a choice never offers
  // what another source (an earlier or later card, the background) already grants.
  const final=deriveOnce(input,catalog,variants,null).proficiencies;
  return deriveOnce(input,catalog,variants,final);
}
function deriveOnce(input,catalog,variants,known){
  const build=normalizeBuild(input);
  const get=uuid=>catalog?.get?.(uuid)??null;
  const modern=isModern(variants);
  const allowFeats=modern||variants.allowFeats!==false;
  const species=get(build.speciesUuid),background=get(build.backgroundUuid);
  const pages=Array.from({length:Math.max(1,build.levels.length)},(_,i)=>({level:i+1,choices:[],features:[],classUuid:build.levels[i]??null}));
  const increments=[];// {level, ability, amount, max}
  const prof={saves:new Set(),skills:new Map(),tools:new Map(),languages:new Set(),armor:new Set(),weapon:new Set(),mastery:new Set(),other:new Set()};
  const grantedSpells=[];// {uuid, source}
  const feats=[];// {uuid, level, source}
  const scales=new Map();// identifier → {title, value, source}
  const warnings=[];
  const classLevels=new Map();

  function applyTrait(key,mode){
    const [category]=key.split(':');
    if(category==='saves')prof.saves.add(key.split(':')[1]);
    else if(category==='skills'||category==='tool'){
      const map=category==='skills'?prof.skills:prof.tools;
      const id=category==='skills'?key.split(':')[1]:key;
      const now=map.get(id)??0;
      const next=mode==='expertise'||mode==='forcedExpertise'?2:mode==='upgrade'?Math.min(2,now+1):Math.max(1,now);
      map.set(id,Math.max(now,next));
    }
    else if(mode==='mastery')prof.mastery.add(key);
    else if(category==='languages')prof.languages.add(key);
    else if(category==='armor')prof.armor.add(key);
    else if(category==='weapon')prof.weapon.add(key);
    else prof.other.add(key);
  }
  const proficient=key=>has(prof,key)||(known?has(known,key):false);
  const has=(prof,key)=>{
    const [category]=key.split(':');
    if(category==='skills')return (prof.skills.get(key.split(':')[1])??0)>=1;
    if(category==='tool')return (prof.tools.get(key)??0)>=1;
    if(category==='saves')return prof.saves.has(key.split(':')[1]);
    return prof.languages.has(key)||prof.armor.has(key)||prof.weapon.has(key)||prof.mastery.has(key);
  };

  /** Process one item's advancements that apply at `level` (in that item's own level terms). */
  function processItem(item,{level,page,keyPrefix='',isOriginal=true,classUuid=null,depth=0,source=item}){
    if(!item||depth>3)return;
    for(const adv of item.metadata?.advancement??[]){
      if(!restrictionAllows(adv,isOriginal))continue;
      if(adv.type==='ScaleValue'){
        const id=adv.configuration?.identifier||identifier({name:adv.title});
        const scale=adv.configuration?.scale??{};
        const reached=Object.keys(scale).map(Number).filter(l=>l<=level).sort((a,b)=>b-a)[0];
        if(reached!==undefined)scales.set(id,{title:adv.title||id,value:scaleText(scale[reached],adv.configuration?.type),source:item.name,classUuid});
        continue;
      }
      // Classes count class levels, origins character levels; granted items apply as level 1.
      const matches=advancementLevels(adv).filter(l=>l===level);
      for(const at of matches){
        const key=keyPrefix+item.uuid+'|'+adv._id+'|L'+at;
        const base={key,advancement:adv,source:item,title:adv.title||defaultTitle(adv),level:page.level};
        switch(adv.type){
          case 'ItemGrant':{
            const declined=new Set(asArray(build.choices[key]));
            const entries=asArray(adv.configuration?.items).map(e=>({uuid:uuidOf(e),optional:!!(e?.optional||adv.configuration?.optional)})).filter(e=>e.uuid);
            if(entries.some(e=>e.optional))page.choices.push({...base,kind:'grant',options:entries.filter(e=>e.optional).map(e=>e.uuid),
              value:[...declined],done:true});
            for(const e of entries){
              if(e.optional&&declined.has(e.uuid))continue;
              granted(e.uuid,{page,key,classUuid,depth,parent:item});
            }
            break;
          }
          case 'ItemChoice':{
            const count=choiceCount(adv,at);
            const picked=asArray(build.choices[key]).slice(0,count);
            const cfg=adv.configuration??{};
            page.choices.push({...base,kind:'itemChoice',count,value:picked,done:picked.length>=count,
              pool:asArray(cfg.pool).map(uuidOf).filter(Boolean),restriction:{type:cfg.type??cfg.restriction?.type??null,
                ...(cfg.restriction??{})},replacement:!!(adv.configuration?.choices?.[at]??{}).replacement});
            for(const uuid of picked)granted(uuid,{page,key,classUuid,depth,parent:item});
            break;
          }
          case 'Trait':{
            const cfg=adv.configuration??{};
            const mode=cfg.mode??'default';
            for(const key of asArray(cfg.grants))applyTrait(String(key),mode);
            asArray(cfg.choices).forEach((choice,i)=>{
              const ckey=key+'|c'+i;
              const mine=asArray(build.choices[ckey]);
              // Expertise needs proficiency first; other modes skip what the character already has.
              const options=expandPool(choice.pool,variants).filter(k=>mine.includes(k)||
                (mode==='upgrade'?true:mode==='expertise'||mode==='forcedExpertise'?proficient(k):!proficient(k)));
              const count=Number(choice.count)||1;
              const picked=asArray(build.choices[ckey]).filter(k=>options.includes(k)).slice(0,count);
              page.choices.push({...base,key:ckey,kind:'trait',mode,count,options,value:picked,done:picked.length>=Math.min(count,options.length)});
              for(const k of picked)applyTrait(k,mode);
            });
            break;
          }
          case 'AbilityScoreImprovement':{
            const cfg=adv.configuration??{};
            const fixed=cfg.fixed??{};
            const max=source?.metadata?.featSubtype==='epicBoon'?30:20;
            for(const a of ABILITIES)if(Number(fixed[a]))increments.push({level:page.level,ability:a,amount:Number(fixed[a]),max});
            const points=Number(cfg.points)||0;
            const featAllowed=allowFeats&&['class','subclass'].includes(item.type);
            if(!points&&!featAllowed)break;
            const value=build.choices[key];
            const card={...base,kind:'asi',points,cap:Number(cfg.cap)||2,locked:asArray(cfg.locked),fixed,featAllowed,
              value:value??null,done:false};
            if(value?.mode==='feat'&&featAllowed&&value.uuid){
              card.done=true;
              granted(value.uuid,{page,key,classUuid:null,depth,parent:item,asFeat:true});
            }else if(value?.mode==='asi'||!featAllowed){
              const chosen=value?.points??{};
              let used=0;
              for(const a of ABILITIES){
                const n=Math.min(Number(chosen[a])||0,card.cap);
                if(n&&!card.locked.includes(a)){used+=n;increments.push({level:page.level,ability:a,amount:n,max});}
              }
              card.done=used>=points;
            }
            page.choices.push(card);
            break;
          }
          case 'Subclass':{
            const chosen=classUuid?build.subclasses[classUuid]??null:null;
            page.choices.push({...base,kind:'subclass',classUuid,classIdentifier:identifier(item),value:chosen,done:!!chosen});
            break;
          }
          case 'Size':{
            const sizes=asArray(adv.configuration?.sizes);
            if(sizes.length>1){
              const picked=asArray(build.choices[key]).slice(0,1);
              page.choices.push({...base,kind:'size',count:1,options:sizes,value:picked,done:picked.length===1});
            }
            break;
          }
        }
      }
    }
  }
  function granted(uuid,{page,key,classUuid,depth,parent,asFeat=false}){
    const item=get(uuid);
    if(!item){page.features.push({uuid,name:'Unknown item (not synced)',missing:true,from:parent?.name});return;}
    if(item.type==='spell'){grantedSpells.push({uuid,source:parent?.name??''});return;}
    if(asFeat||item.type==='feat'&&item.metadata?.featType==='feat')
      feats.push({uuid,level:page.level,source:parent?.name??''});
    page.features.push({uuid,name:item.name,from:parent?.name,type:item.type});
    processItem(item,{level:1,page,keyPrefix:key+'>',classUuid,depth:depth+1,source:item});
  }

  // Origin: species and background apply at every character level they mention.
  for(const page of pages){
    for(const item of [species,background])
      if(item)processItem(item,{level:page.level,page,source:item,classUuid:null});
    const classUuid=page.classUuid;
    const cls=get(classUuid);
    if(classUuid){
      const n=(classLevels.get(classUuid)??0)+1;
      classLevels.set(classUuid,n);
      page.classLevel=n;
      page.isOriginal=classUuid===build.levels[0];
      if(!cls){warnings.push('Level '+page.level+': class not in the synced compendiums.');continue;}
      page.className=cls.name;
      processItem(cls,{level:n,page,isOriginal:page.isOriginal,classUuid});
      const sub=get(build.subclasses[classUuid]);
      if(sub)processItem(sub,{level:n,page,isOriginal:page.isOriginal,classUuid});
    }
  }
  // Extra feats the GM allowed (taken "at level 1" unless noted).
  build.feats.forEach((uuid,i)=>granted(uuid,{page:pages[0],key:'extra|'+i,classUuid:null,depth:0,parent:{name:'Extra feat'},asFeat:true}));

  // Ability scores, applying increments in level order with their caps.
  const scoresAt=level=>{
    const s=Object.fromEntries(ABILITIES.map(a=>[a,Number(build.abilities.base?.[a])||10]));
    for(const inc of increments)if(inc.level<=level)s[inc.ability]=Math.min(inc.max,s[inc.ability]+inc.amount);
    return s;
  };
  const total=build.levels.length;
  const scores=scoresAt(Math.max(1,total));

  // Multiclass prerequisites: checked against scores before the new class's level.
  const seen=[];
  for(const page of pages){
    if(!page.classUuid)continue;
    if(!seen.includes(page.classUuid)){
      if(seen.length){
        const before=scoresAt(page.level-1);
        for(const uuid of [...seen,page.classUuid]){
          const item=get(uuid);
          const need=multiclassRequirement(item,variants);
          if(item&&!meetsRequirement(need,before)){
            page.multiclassProblem=true;
            warnings.push('Level '+page.level+': multiclassing needs '+item.name+'’s prerequisite.');
          }
        }
      }
      seen.push(page.classUuid);
    }
  }

  // HP: max hit die at level 1, then average (or max) per level, plus Con each level.
  let hp=0;
  for(const page of pages){
    const faces=dieFaces(get(page.classUuid)?.metadata?.hitDie);
    if(!faces)continue;
    hp+=page.level===1||build.hp==='max'?faces:Math.floor(faces/2)+1;
  }
  hp+=modifier(scores.con)*total;

  // Spellcasting.
  const classes=[...classLevels.entries()].map(([uuid,levels])=>{
    const item=get(uuid),sub=get(build.subclasses[uuid]);
    const casting=item?.metadata?.spellcasting?.progression&&item.metadata.spellcasting.progression!=='none'
      ?item.metadata.spellcasting:sub?.metadata?.spellcasting?.progression&&sub.metadata.spellcasting.progression!=='none'?sub.metadata.spellcasting:null;
    return {uuid,item,levels,subclass:sub,subclassUuid:build.subclasses[uuid]??null,
      spellcasting:casting?{...casting,maxLevel:maxSpellLevel(casting.progression,levels,modern)}:null};
  });
  const casters=classes.filter(c=>c.spellcasting&&c.spellcasting.progression!=='pact');
  const multi=casters.length>1;
  const slotLevel=casters.reduce((n,c)=>n+casterLevel(c.spellcasting.progression,c.levels,{multiclass:multi,modern}),0);
  const pactClass=classes.find(c=>c.spellcasting?.progression==='pact');
  const spellcasting={slots:slotsForCasterLevel(slotLevel),casterLevel:slotLevel,
    pact:pactClass?pactSlots(pactClass.levels):null};

  const complete=pages.every(p=>p.choices.every(c=>c.done));
  return {build,species,background,pages,classes,scores,scoresAt,increments,
    proficiencyBonus:proficiencyBonus(Math.max(1,total)),level:total,hp:total?hp:0,
    proficiencies:prof,grantedSpells,feats,scales:[...scales.entries()].map(([id,v])=>({id,...v})),
    spellcasting,warnings,complete};
}
function dieFaces(die){
  const m=/d(\d+)/.exec(String(die??''));
  return m?Number(m[1]):0;
}
function scaleText(entry,type){
  if(!entry||typeof entry!=='object')return String(entry??'');
  if(type==='dice'||entry.faces)return (entry.number??1)+'d'+entry.faces;
  if(type==='distance')return entry.value+' ft.';
  return String(entry.value??'');
}
function defaultTitle(adv){
  return {ItemGrant:'Features',ItemChoice:'Choose',Trait:'Proficiencies',AbilityScoreImprovement:'Ability Score Improvement',
    Subclass:'Subclass',Size:'Size'}[adv.type]??adv.type;
}

// ---- Edits (pure; return a new build) ---------------------------------------------------------

export const setChoice=(build,key,value)=>{
  const choices={...build.choices};
  if(value===null||value===undefined||(Array.isArray(value)&&!value.length))delete choices[key];
  else choices[key]=value;
  return {...build,choices};
};
export const addLevel=(build,classUuid)=>build.levels.length>=20?build:{...build,levels:[...build.levels,classUuid]};
/** Remove the last level (choices are kept, so re-adding the class restores them). */
export const removeLastLevel=build=>({...build,levels:build.levels.slice(0,-1)});
/** Change the class taken at one level; later class levels renumber. */
export function setLevelClass(build,index,classUuid){
  const levels=[...build.levels];
  levels[index]=classUuid;
  const subclasses={...build.subclasses};
  for(const uuid of Object.keys(subclasses))if(!levels.includes(uuid))delete subclasses[uuid];
  const spells={...build.spells};
  for(const uuid of Object.keys(spells))if(!levels.includes(uuid))delete spells[uuid];
  return {...build,levels,subclasses,spells};
}
export const setSubclass=(build,classUuid,subclassUuid)=>{
  const subclasses={...build.subclasses};
  if(subclassUuid)subclasses[classUuid]=subclassUuid;else delete subclasses[classUuid];
  return {...build,subclasses};
};
export function toggleSpell(build,classUuid,uuid){
  const list=build.spells[classUuid]??[];
  return {...build,spells:{...build.spells,[classUuid]:list.includes(uuid)?list.filter(x=>x!==uuid):[...list,uuid]}};
}

/** Names saved alongside the plan so the party roster shows them without the catalog. */
export function summaryLabels(derived){
  const classes=derived.classes.map(c=>(c.item?.name??'?')+' '+c.levels+(c.subclass?' ('+c.subclass.name+')':'')).join(' / ');
  return {species:derived.species?.name??null,background:derived.background?.name??null,classes:classes||null};
}

// ---- Options for cards ------------------------------------------------------------------------

/** Items a choice card offers: its pool, or catalog items matching its restriction. */
export function itemChoiceOptions(card,catalog,variants,{showAll=false}={}){
  const r=card.restriction??{};
  let items=card.pool.length?card.pool.map(u=>catalog.get(u)).filter(Boolean)
    :catalog.ofType(r.type==='spell'?'spell':'feat').filter(item=>{
      if(r.type&&r.type!=='spell'&&item.type!==r.type&&!(r.type==='feat'&&item.type==='feat'))return false;
      if(r.subtype&&item.metadata?.featSubtype!==r.subtype)return false;
      if(r.type==='feat'&&!r.subtype&&item.metadata?.featType&&item.metadata.featType!=='feat'&&item.metadata.featType!==r.type)return false;
      if(item.type==='spell'&&r.level!==undefined&&r.level!==''&&r.level!==null&&String(r.level)!=='available'&&Number(item.metadata?.level??item.level)!==Number(r.level))return false;
      if(r.list?.length&&item.type==='spell'&&!(item.metadata?.spellLists??[]).some(l=>r.list.includes(l)||r.list.includes(l.split(':')[1])))return false;
      return true;
    });
  if(!showAll)items=items.filter(i=>editionMatches(i,variants)||card.value.includes(i.uuid));
  return items;
}
/** Feats offered at an ASI (or as an extra feat): general feats the character qualifies for by level. */
export function featOptions(catalog,variants,level,{showAll=false,taken=[]}={}){
  return catalog.ofType('feat').filter(item=>{
    const m=item.metadata??{};
    if(m.featType&&m.featType!=='feat')return false;
    if(!showAll&&!editionMatches(item,variants))return false;
    if(isModern(variants)&&!showAll&&m.featSubtype&&!['general','epicBoon','origin','fightingStyle'].includes(m.featSubtype))return false;
    if(isModern(variants)&&!showAll&&m.featSubtype==='epicBoon'&&level<19)return false;
    if(Number(m.prerequisites?.level??m.level)>level)return false;
    if(taken.includes(item.uuid)&&!m.prerequisites?.repeatable)return false;
    return true;
  });
}
/** Spells a class can learn (by spell list, at or below the level it can cast). */
export function spellOptions(catalog,cls,variants,{showAll=false}={}){
  const all=catalog.ofType('spell');
  const anyLists=all.some(s=>s.metadata?.spellLists?.length);
  const id=identifier(cls.item);
  const subId=cls.subclass?identifier(cls.subclass):null;
  const lists=new Set(['class:'+id,...(subId?['subclass:'+subId]:[])]);
  // Eldritch Knights and Arcane Tricksters use the wizard list.
  if(cls.spellcasting?.progression==='third'&&cls.subclass?.metadata?.spellcasting?.progression==='third')lists.add('class:wizard');
  const max=cls.spellcasting?.maxLevel??0;
  return all.filter(spell=>{
    const level=Number(spell.metadata?.level??spell.level)||0;
    if(level>max)return false;
    if(!showAll&&!editionMatches(spell,variants))return false;
    if(showAll||!anyLists)return true;
    return (spell.metadata?.spellLists??[]).some(l=>lists.has(l));
  });
}
