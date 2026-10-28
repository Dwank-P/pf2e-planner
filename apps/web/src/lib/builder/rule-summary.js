/**
 * A short, rules-based summary of what an item does when a character gets it, for the bottom of its
 * details: what it grants (fixed items, a pick among options, or what another choice decides), the
 * choices it asks for, the training it gives, and flags it sets for other features (a cleric
 * doctrine telling First Doctrine what to grant). Built from the Bridge's synced rule data, so it
 * shows what the website detected, not what the description says.
 */
import {effectsOf} from './granted.js';

const RANKS=['Untrained','Trained','Expert','Master','Legendary'];
const LABELS={unarmored:'Unarmored defense',light:'Light armor',medium:'Medium armor',heavy:'Heavy armor',
  unarmed:'Unarmed attacks',simple:'Simple weapons',martial:'Martial weapons',advanced:'Advanced weapons',
  perception:'Perception',fortitude:'Fortitude',reflex:'Reflex',will:'Will',classDC:'Class DC','class-dc':'Class DC'};
const SKILL_SHORT={acr:'acrobatics',arc:'arcana',ath:'athletics',cra:'crafting',dec:'deception',dip:'diplomacy',itm:'intimidation',
  med:'medicine',nat:'nature',occ:'occultism',prf:'performance',rel:'religion',soc:'society',ste:'stealth',sur:'survival',thi:'thievery'};
const title=s=>String(s??'').replace(/([a-z])([A-Z])/g,'$1 $2').replace(/[-_]/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
const UUID_NAME=/^Compendium\.[^.]+\.[^.]+\.Item\.(.+)$/;
/** A rule's own name for an item it references by name ("…Item.Shield Block"); null for ids. */
export function nameInUuid(uuid){
  const m=UUID_NAME.exec(String(uuid??''));
  return m&&/[\s()']/.test(m[1])?m[1]:null;
}

/** "level 13+, with Divine Defense": a predicate in words; null when there is none. */
export function describePredicate(predicate,picks=new Map()){
  if(predicate===undefined||predicate===null)return null;
  const one=p=>{
    if(typeof p==='string'){
      const [domain,...rest]=p.split(':');const value=rest.join(':');
      if(p==='self:level')return null;
      // A pick on this item ("guard-skill:athletics"): in the words of its option.
      if(picks.has(domain))return 'if you pick '+(picks.get(domain).get(value)??title(value));
      if(['feature','feat'].includes(domain))return 'with '+title(value);
      if(domain==='class')return 'for '+title(value);
      if(['ancestry','heritage'].includes(domain))return 'for '+title(value);
      return 'when '+p;
    }
    if(Array.isArray(p))return p.map(one).filter(Boolean).join(', ');
    if(!p||typeof p!=='object')return null;
    if(Array.isArray(p.and))return p.and.map(one).filter(Boolean).join(', ');
    if(Array.isArray(p.or))return p.or.map(one).filter(Boolean).join(' or ');
    if('not' in p){const t=one(p.not);return t?'not '+t.replace(/^(with|for|when) /,''):null;}
    for(const [op,word] of [['gte','+'],['gt','+'],['lte',' or lower'],['lt',' or lower']]){
      if(!Array.isArray(p[op]))continue;
      const [a,b]=p[op];
      if(a==='self:level')return 'level '+(op==='gt'?Number(b)+1:op==='lt'?Number(b)-1:b)+word;
      return 'when '+a+' '+op+' '+b;
    }
    return 'conditional';
  };
  return one(predicate)||null;
}
function rankTarget(path){
  let m;
  if(path==='system.perception.rank')return 'Perception';
  if((m=/^system\.saves\.(\w+)\.rank$/.exec(path)))return LABELS[m[1]]??title(m[1]);
  if((m=/^system\.proficiencies\.(?:defenses|attacks)\.([\w-]+)\.rank$/.exec(path)))return LABELS[m[1]]??title(m[1]);
  if(/^system\.proficiencies\.classDCs\./.test(path))return 'Class DC';
  if((m=/^system\.skills\.([\w-]+)\.rank$/.exec(path)))return title(SKILL_SHORT[m[1]]??m[1]);
  return null;
}
const MAX_OPTIONS=8;

/**
 * {grants:[{uuid,name,options,condition,decidedBy}], choices:[{prompt,options,more}],
 *  training:[{rank,what,condition}], sets:[{label,uuid,name}], synced}
 * `synced` is false when the Bridge didn't send rule data for this item (an older Bridge).
 */
export function ruleSummary(item){
  const m=item?.metadata??{};
  const out={grants:[],choices:[],training:[],sets:[],synced:Array.isArray(m.ruleEffects)};
  const sets=m.choiceSets??[];
  const used=new Set();
  const slug=s=>String(s??'').toLowerCase().replace(/['’]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  const picks=new Map(sets.filter(s=>s.rollOption).map(s=>[s.rollOption,new Map((s.options??[]).map(o=>[slug(o.value),o.label||title(o.value)]))]));
  const when=p=>describePredicate(p,picks);
  const optionsOf=set=>{
    if(set?.options)return {options:set.options.slice(0,MAX_OPTIONS).map(o=>({label:o.label||String(o.value),
      uuid:typeof o.value==='string'&&o.value.startsWith('Compendium.')?o.value:null})),more:Math.max(0,set.options.length-MAX_OPTIONS)};
    if(set?.query)return {options:[],more:0,query:title(set.query.itemType||'item')};
    return {options:[],more:0};
  };
  for(const e of effectsOf(item)){
    const condition=when(e.predicate);
    if(e.key==='grant'){
      const pick=/\{item\|flags\.(?:pf2e|system)\.rulesSelections\.([^}]+)\}/.exec(e.uuid);
      const actor=/\{actor\|flags\.pf2e\.([^}]+)\}/.exec(e.uuid);
      if(pick){
        const set=sets.find(s=>s.flag===pick[1]);
        used.add(pick[1]);
        out.grants.push({uuid:null,name:null,...optionsOf(set),prompt:set?.prompt??null,condition});
      }else if(actor){
        out.grants.push({uuid:null,name:title(actor[1].split('.').at(-1)),decidedBy:true,condition});
      }else out.grants.push({uuid:e.uuid,name:nameInUuid(e.uuid),condition});
    }else if(e.key==='rank'){
      const what=rankTarget(e.path);
      if(what)out.training.push({rank:RANKS[Number(e.value)]??String(e.value),what,condition});
    }else if(e.key==='flag'&&e.value&&typeof e.value==='object'){
      for(const [key,value] of Object.entries(e.value))
        if(typeof value==='string'&&value.startsWith('Compendium.'))out.sets.push({label:title(key),uuid:value,name:nameInUuid(value)});
    }else if(e.key==='flag'&&typeof e.value==='string'&&e.value.startsWith('Compendium.')){
      out.sets.push({label:title(e.path.split('.').at(-1)),uuid:e.value,name:nameInUuid(e.value)});
    }
  }
  for(const [key,rank] of Object.entries(m.proficiencies??{}))
    out.training.push({rank:RANKS[Number(rank)]??String(rank),what:LABELS[key]??title(SKILL_SHORT[key]??key),condition:null});
  for(const set of sets){
    if(used.has(set.flag))continue;
    out.choices.push({prompt:set.prompt,...optionsOf(set),condition:when(set.predicate)});
  }
  // Same rank and condition together: "Trained in Light armor, Medium armor".
  const grouped=new Map();
  for(const t of out.training){
    const key=t.rank+'|'+(t.condition??'');
    if(!grouped.has(key))grouped.set(key,{rank:t.rank,condition:t.condition,what:[]});
    grouped.get(key).what.push(t.what);
  }
  out.training=[...grouped.values()].map(g=>({...g,what:g.what.join(', ')}));
  return out;
}
export const hasRuleSummary=s=>!!(s.grants.length||s.choices.length||s.training.length||s.sets.length);
