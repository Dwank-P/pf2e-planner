/**
 * Extra item filters for the equipment browser once a type is chosen: weapons by category,
 * damage type, die, hands, melee/ranged, group and traits; armor by category, AC bonus, Dex cap,
 * group and Strength; shields by AC bonus and hardness. Works with PF2e (metadata.rules) and
 * D&D 5e (metadata.weapon / metadata.armor) items. Only filters with two or more values among
 * the items are offered.
 */
const title=s=>String(s??'').replace(/[-_]/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
const signed=n=>(Number(n)>=0?'+':'')+Number(n);
const DAMAGE={b:'bludgeoning',p:'piercing',s:'slashing'};
const DND_CLASS={simpleM:'Simple melee',simpleR:'Simple ranged',martialM:'Martial melee',martialR:'Martial ranged',natural:'Natural',improv:'Improvised'};
const DND_PROPERTY={amm:'Ammunition',fin:'Finesse',hvy:'Heavy',lgt:'Light',lod:'Loading',rch:'Reach',thr:'Thrown',two:'Two-handed',
  ver:'Versatile',ret:'Returning',spc:'Special',mgc:'Magical',sil:'Silvered',ada:'Adamantine',foc:'Focus',fir:'Firearm',rel:'Reload'};
// PF2e traits with a value ("deadly-d10", "thrown-20", "versatile-p") filter by their name.
const traitName=t=>String(t).replace(/-(d\d+|\d+|[bps])$/,'');
const usage=r=>String(r?.usage?.value??r?.usage??'');

/** 'armor' and 'shield' for D&D armor (an 'equipment' item there), the item's own type otherwise. */
export function itemKind(item){
  const a=item?.metadata?.armor;
  if(a&&!item.metadata?.rules){
    if(a.type==='shield')return 'shield';
    if(['light','medium','heavy','natural'].includes(a.type))return 'armor';
  }
  return item?.type;
}

// Each facet: key, label, values(item) → [[value, label], …], and an optional sort order.
const DIE=v=>Number(String(v).replace(/^d/,''))||0;
const FACETS={
  weapon:[
    {key:'category',label:'Category',values(i){
      const m=i.metadata??{};
      if(m.weapon)return m.weapon.classification?[[m.weapon.classification,DND_CLASS[m.weapon.classification]??title(m.weapon.classification)]]:[];
      return m.rules?.category?[[m.rules.category,title(m.rules.category)]]:[];
    }},
    {key:'damage',label:'Damage type',values(i){
      const m=i.metadata??{};
      if(m.weapon)return (m.weapon.types??[]).map(t=>[t,title(t)]);
      const main=m.rules?.damage?.damageType;
      // Versatile traits add a damage type.
      const versatile=(i.traits??[]).map(t=>/^versatile-([bps])$/.exec(t)?.[1]).filter(Boolean).map(x=>DAMAGE[x]);
      return [...new Set([main,...versatile].filter(Boolean))].map(t=>[t,title(t)]);
    }},
    {key:'die',label:'Damage die',sort:(a,b)=>DIE(a[0])-DIE(b[0]),values(i){
      const m=i.metadata??{};
      const die=m.weapon?.denomination?'d'+m.weapon.denomination:m.rules?.damage?.die;
      return die?[[die,die]]:[];
    }},
    {key:'hands',label:'Hands',values(i){
      const m=i.metadata??{};
      if(m.weapon){
        const p=new Set(i.traits??[]);
        return [p.has('two')?['2','Two hands']:p.has('ver')?['1+','One or two']:['1','One hand']];
      }
      const u=usage(m.rules);
      if(u==='held-in-two-hands')return [['2','Two hands']];
      if(u==='held-in-one-plus-hands'||(i.traits??[]).some(t=>/^two-hand-/.test(t)))return [['1+','One or two']];
      if(u==='held-in-one-hand')return [['1','One hand']];
      return [];
    }},
    {key:'reach',label:'Melee or ranged',values(i){
      const m=i.metadata??{};
      if(m.weapon)return /R$/.test(m.weapon.classification??'')?[['ranged','Ranged']]:[['melee','Melee']];
      return Number(m.rules?.range)>0?[['ranged','Ranged']]:[['melee','Melee']];
    }},
    {key:'group',label:'Group',values:i=>i.metadata?.rules?.group?[[i.metadata.rules.group,title(i.metadata.rules.group)]]:[]},
    {key:'trait',label:'Trait',values(i){
      if(i.metadata?.weapon)return (i.traits??[]).filter(t=>DND_PROPERTY[t]).map(t=>[t,DND_PROPERTY[t]]);
      return [...new Set((i.traits??[]).map(traitName))].map(t=>[t,title(t)]);
    }}
  ],
  armor:[
    {key:'category',label:'Category',values(i){
      const m=i.metadata??{};
      const c=m.armor&&!m.rules?m.armor.type:m.rules?.category;
      return c?[[c,title(c)]]:[];
    }},
    {key:'ac',label:'AC bonus',sort:(a,b)=>Number(a[0])-Number(b[0]),values(i){
      const m=i.metadata??{};
      if(m.armor&&!m.rules)return [[String(m.armor.value),'AC '+m.armor.value]];
      return m.rules?.acBonus!=null?[[String(m.rules.acBonus),signed(m.rules.acBonus)]]:[];
    }},
    {key:'dex',label:'Dex cap',sort:(a,b)=>(a[0]==='none'?99:Number(a[0]))-(b[0]==='none'?99:Number(b[0])),values(i){
      const m=i.metadata??{};
      if(m.armor&&!m.rules){
        const cap=m.armor.dex??(m.armor.type==='heavy'?0:m.armor.type==='medium'?2:null);
        return cap===null?[['none','No cap']]:[[String(cap),cap===0?'No Dex':signed(cap)]];
      }
      return m.rules?.dexCap!=null?[[String(m.rules.dexCap),signed(m.rules.dexCap)]]:[['none','No cap']];
    }},
    {key:'strength',label:'Strength',sort:(a,b)=>Number(a[0])-Number(b[0]),values(i){
      const r=i.metadata?.rules;
      return r?[[String(Number(r.strength)||0),Number(r.strength)?'Str '+signed(r.strength):'None']]:[];
    }},
    {key:'group',label:'Group',values:i=>i.metadata?.rules?.group?[[i.metadata.rules.group,title(i.metadata.rules.group)]]:[]}
  ],
  shield:[
    {key:'ac',label:'AC bonus',sort:(a,b)=>Number(a[0])-Number(b[0]),values(i){
      const m=i.metadata??{};
      const v=m.armor&&!m.rules?m.armor.value:m.rules?.acBonus;
      return v!=null?[[String(v),signed(v)]]:[];
    }},
    {key:'hardness',label:'Hardness',sort:(a,b)=>Number(a[0])-Number(b[0]),
      values:i=>i.metadata?.rules?.hardness!=null?[[String(i.metadata.rules.hardness),String(i.metadata.rules.hardness)]]:[]}
  ]
};

/** The filters for `kind` among `items` (already that kind): [{key, label, options: [[value, label]]}]. */
export function facetsFor(kind,items){
  return (FACETS[kind]??[]).map(f=>{
    const seen=new Map();
    for(const item of items)for(const [value,label] of f.values(item))if(!seen.has(value))seen.set(value,label);
    const options=[...seen.entries()].sort(f.sort??((a,b)=>a[1].localeCompare(b[1])));
    return {key:f.key,label:f.label,options};
  }).filter(f=>f.options.length>1);
}
/** Whether `item` matches every chosen value ({facetKey: value}); empty choices match everything. */
export function matchesFacets(kind,item,chosen){
  for(const f of FACETS[kind]??[]){
    const want=chosen[f.key];
    if(want===undefined||want==='')continue;
    if(!f.values(item).some(([value])=>value===want))return false;
  }
  return true;
}
