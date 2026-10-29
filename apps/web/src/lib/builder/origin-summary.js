/**
 * At-a-glance facts for ancestries, heritages, backgrounds and classes (PF2e) and species,
 * backgrounds, classes and subclasses (D&D 5e), shown above their description in the details panel.
 * Returns {facts: [[label, value]], notes: [[label, text]]}: facts are short tiles, notes are
 * lines (skills, features) too long for a tile. Both empty for other items.
 */
import {traitLabel} from '../systems/dnd5e/build.js';

const ATTR={str:'Str',dex:'Dex',con:'Con',int:'Int',wis:'Wis',cha:'Cha'};
const SIZES={tiny:'Tiny',sm:'Small',med:'Medium',lg:'Large',huge:'Huge',grg:'Gargantuan'};
const RANKS=['Untrained','Trained','Expert','Master','Legendary'];
const TRADITIONS={arcane:'Arcane',divine:'Divine',occult:'Occult',primal:'Primal'};
const title=s=>String(s??'').replace(/[-_]/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
const list=v=>Array.isArray(v)?v:typeof v==='string'&&v?[v]:v&&typeof v==='object'?Object.values(v):[];
const join=v=>v.filter(Boolean).join(', ');

/** PF2e boost sets ({0:{value:[…]},…}): "Dex, Int, Free". A set offering every attribute is free. */
function boosts(sets){
  return list(sets).map(set=>list(set?.value)).filter(v=>v.length)
    .map(v=>v.length>=6?'Free':v.map(a=>ATTR[a]??title(a)).join(' or ')).join(', ');
}
function pf2e(item){
  const m=item.metadata??{},r=m.rules??{};
  const facts=[],notes=[];
  const fact=(label,value)=>{if(value!==null&&value!==undefined&&value!=='')facts.push([label,String(value)]);};
  const note=(label,value)=>{if(value)notes.push([label,value]);};
  switch(item.type){
    case 'ancestry':{
      fact('Hit Points',r.hp);
      fact('Size',SIZES[r.size]??title(r.size));
      fact('Speed',r.speed?r.speed+' ft.':null);
      fact('Vision',r.vision&&r.vision!=='normal'?title(r.vision):null);
      note('Boosts',boosts(r.boosts));
      note('Flaws',boosts(r.flaws));
      const languages=list(r.languages?.value).map(title);
      const extra=Number(r.additionalLanguages?.count)||0;
      note('Languages',join([...languages,extra?extra+' more + Int':'Int']));
      break;
    }
    case 'heritage':
      fact('Ancestry',m.versatile?'Any (versatile)':title(m.ancestrySlug));
      break;
    case 'deity':{
      const font=list(r.font).map(f=>/harm/.test(f)?'Harm':/heal/.test(f)?'Heal':title(f));
      fact('Divine font',font.join(' or '));
      fact('Skill',list(r.skill).map(title).join(', '));
      fact('Favored weapon',list(r.weapons).map(title).join(', '));
      fact('Divine attribute',list(r.attribute).map(a=>ATTR[a]??title(a)).join(' or '));
      const sanct=r.sanctification;
      if(sanct?.what?.length)fact('Sanctification',(sanct.modal==='must'?'Must be ':'Can be ')+list(sanct.what).map(title).join(' or '));
      break;
    }
    case 'background':{
      note('Boosts',boosts(r.boosts));
      note('Trained skills',join([...list(r.trainedSkills?.value??m.trainedSkills).map(title),
        ...list(r.trainedSkills?.lore??m.loreSkills).map(l=>title(l)+(/lore$/i.test(l)?'':' Lore'))]));
      note('Skill feat',join(list(m.grantedFeats)));
      break;
    }
    case 'class':{
      fact('Hit Points',r.hp!=null?r.hp+' + Con':null);
      const key=list(r.keyAbility?.value??m.keyAbility).map(a=>ATTR[a]??title(a));
      fact('Key attribute',key.length?key.join(' or '):null);
      fact('Perception',RANKS[Number(r.perception)]??null);
      const saves=r.savingThrows??m.savingThrows;
      fact('Spellcasting',m.spellTradition?TRADITIONS[m.spellTradition]??title(m.spellTradition):r.spellcasting||m.spellcasting?'Yes':null);
      const rank=v=>Number(v?.rank??v)||0;
      const armor=['unarmored','light','medium','heavy'].filter(k=>rank(r.defenses?.[k])>0).map(title);
      const weapons=['unarmed','simple','martial','advanced'].filter(k=>rank(r.attacks?.[k])>0).map(title);
      if(saves)note('Saves',['fortitude','reflex','will'].map(s=>title(s)+' '+(RANKS[Number(saves[s])||0]??'').toLowerCase()).join(', '));
      note('Armor',armor.join(', '));
      note('Weapons',weapons.join(', '));
      const skills=list(r.trainedSkills?.value??m.trainedSkills).map(title);
      const additional=Number(r.trainedSkills?.additional)||0;
      note('Trained skills',join([...skills,additional?additional+' more + Int':'']));
      note('Level 1 features',join(list(m.grantedFeatures).filter(f=>f.level===1).map(f=>f.name)));
      const feats=[['Class feats',m.classFeatLevels],['Skill feats',m.skillFeatLevels],['General feats',m.generalFeatLevels],
        ['Ancestry feats',m.ancestryFeatLevels]].filter(([,levels])=>list(levels).length)
        .map(([label,levels])=>label+' at '+list(levels).slice(0,6).join(', ')+(list(levels).length>6?'…':''));
      note('Feats',feats.join('; '));
      break;
    }
  }
  return {facts,notes};
}

/** D&D 5e: what an origin or class grants, from its level-1 advancements. */
function dnd5e(item,variants){
  const m=item.metadata??{};
  const facts=[],notes=[];
  const fact=(label,value)=>{if(value!==null&&value!==undefined&&value!=='')facts.push([label,String(value)]);};
  const note=(label,value)=>{if(value)notes.push([label,value]);};
  const adv=list(m.advancement).filter(a=>a.level==null||Number(a.level)<=1);
  const label=key=>traitLabel(key,variants);
  // Trait grants and "choose N" pools, grouped by what they grant (skills, saves, armor…).
  const traits=new Map();
  for(const a of adv.filter(a=>a.type==='Trait')){
    const cfg=a.configuration??{};
    if(cfg.mode&&cfg.mode!=='default')continue;
    for(const key of list(cfg.grants)){
      const group=String(key).split(':')[0];
      traits.set(group,[...(traits.get(group)??[]),label(key)]);
    }
    for(const choice of list(cfg.choices)){
      const pool=list(choice.pool);
      const group=String(pool[0]??'').split(':')[0];
      const options=pool.length>6?'':' from '+pool.map(label).join(', ');
      traits.set(group,[...(traits.get(group)??[]),'choose '+(Number(choice.count)||1)+(options||' '+label(pool[0]??'').toLowerCase())]);
    }
  }
  const trait=(group,name)=>note(name,join(traits.get(group)??[]));
  const asi=adv.find(a=>a.type==='AbilityScoreImprovement')?.configuration;
  const asiText=asi?join([...Object.entries(asi.fixed??{}).filter(([,n])=>Number(n)).map(([a,n])=>(ATTR[a]??a)+' +'+n),
    asi.points?asi.points+' points to spend':'']):'';
  const features=adv.filter(a=>a.type==='ItemGrant').map(a=>a.title).filter(Boolean);
  switch(item.type){
    case 'race':{
      const sizes=adv.find(a=>a.type==='Size')?.configuration?.sizes;
      fact('Size',list(sizes).map(s=>SIZES[s]??title(s)).join(' or '));
      fact('Type',title(m.creatureType));
      fact('Speed',m.movement?.walk?m.movement.walk+' ft.':null);
      const senses=Object.entries(m.senses??{}).filter(([k,v])=>Number(v)>0&&k!=='units').map(([k,v])=>title(k)+' '+v+' ft.');
      fact('Senses',senses.join(', '));
      note('Ability scores',asiText);
      trait('languages','Languages');
      trait('skills','Skills');
      note('Traits',join(features));
      break;
    }
    case 'background':
      note('Ability scores',asiText);
      trait('skills','Skills');
      trait('tool','Tools');
      trait('languages','Languages');
      note('Feature',join(features));
      break;
    case 'class':{
      fact('Hit die',m.hitDie?String(m.hitDie).replace(/^(\d)/,'d$1'):null);
      const primary=list(m.primaryAbility?.value).map(a=>ATTR[a]??title(a));
      fact('Primary',primary.join(m.primaryAbility?.all===false?' or ':' and '));
      fact('Saves',(traits.get('saves')??[]).map(s=>s.replace(/ saves$/,'')).join(', '));
      const caster=m.spellcasting;
      fact('Spellcasting',caster&&caster.progression!=='none'?title(caster.progression)+(caster.ability?' ('+(ATTR[caster.ability]??caster.ability)+')':''):null);
      trait('armor','Armor');
      trait('weapon','Weapons');
      trait('tool','Tools');
      trait('skills','Skills');
      note('Level 1 features',join(features));
      break;
    }
    case 'subclass':{
      const caster=m.spellcasting;
      fact('Spellcasting',caster&&caster.progression!=='none'?title(caster.progression)+(caster.ability?' ('+(ATTR[caster.ability]??caster.ability)+')':''):null);
      const byLevel=list(m.advancement).filter(a=>a.type==='ItemGrant'&&a.title)
        .sort((a,b)=>(a.level??0)-(b.level??0)).map(a=>a.title+(a.level?' ('+a.level+')':''));
      note('Features',join(byLevel.slice(0,8)));
      break;
    }
  }
  return {facts,notes};
}

export function originSummary(item,variants={}){
  if(!item)return {facts:[],notes:[]};
  return item.metadata?.advancement||['race','subclass'].includes(item.type)&&!item.metadata?.rules
    ?dnd5e(item,variants):pf2e(item);
}
