/** One-line descriptions of what was picked, for the builder rail (Pathbuilder-style). */
import {tr} from '../i18n/index.js';
import {attributeModifiers,formatModifier,ATTRIBUTES,titleCase,RANKS} from './rules.js';
import {level1FeatSlots,featField,HANDLER_STEPS} from './schema.js';
import {planFeat,planBoosts,planSkillIncrease,planSpells,planSignature} from './plan.js';

const names=list=>(list??[]).map(e=>e?.name).filter(Boolean).join(', ');
// Words that name the kind of specialization rather than the specialization itself.
const SUBCLASS_WORDS=/\s+(instinct|muse|bloodline|doctrine|order|mystery|patron|racket|cause|methodology|way|research field|field|innovation|implement|conscious mind|subconscious mind|school|style|eidolon|element)$/i;
/** "Enigma Bard", "Bloodrager Barbarian": the specialization's short name before the class. */
export function classTitle(classEntry,subclassEntry){
  const className=classEntry?.name??'';
  let sub=String(subclassEntry?.name??'').trim();
  if(!sub)return className;
  if(sub.toLowerCase().includes(className.toLowerCase()))return sub;
  sub=sub.replace(/^(?:school|order|way|cause) of (?:the )?/i,'').replace(/^(?:muse|instinct|bloodline|mystery|patron|doctrine):\s*/i,'')
    .replace(SUBCLASS_WORDS,'').trim();
  return sub?sub+' '+className:className;
}
export function stepSummary(step,creation,lookup,variants={}){
  const c=creation??{};
  const target=step.target??'class';
  const bucket=c.classSelections?.[target]??c;
  switch(step.stepId??step.id){
    case 'ancestry':return c.ancestry?.name??'';
    case 'heritage':return c.heritage?.name??'';
    case 'background':return c.background?.name??'';
    case 'class':return c.class?.name??'';
    case 'dualClass':return c.dualClass?.name??'';
    case 'subclass':return (target==='dualClass'?c.dualSubclass:c.subclass)?.name??'';
    case 'sanctification':return bucket.sanctification?titleCase(bucket.sanctification):'';
    case 'divineFont':return bucket.divineFont==='harmful'?tr('Harm'):bucket.divineFont==='healing'?tr('Heal'):'';
    case 'kineticGate':return bucket.kineticGateMode
      ?[tr(bucket.kineticGateMode==='dual-gate'?'Dual gate':'Single gate'),bucket.secondElement?.name,names(bucket.kineticImpulses)].filter(Boolean).join(' · '):'';
    case 'boosts':{
      const {mods}=attributeModifiers(c,lookup);
      return ATTRIBUTES.filter(a=>mods[a]).map(a=>a.toUpperCase()+' '+formatModifier(mods[a])).join(' · ');
    }
    case 'skills':return [...(c.skills??[]).map(titleCase),...(c.selectedLoreSkills??[])].join(', ');
    case 'feats':return level1FeatSlots(c,lookup,variants).map(s=>c[featField(s.slot)]?.name).filter(Boolean).join(' · ');
    case 'languages':return (c.languages??[]).map(titleCase).join(', ');
    case 'spells':{
      const store=target==='dualClass'?c.dualSpells:c.spells;
      const cantrips=store?.cantrips?.length??0,rank1=store?.rank1?.length??0;
      return cantrips||rank1?`${cantrips} cantrips · ${rank1} rank 1`:'';
    }
    case 'grants':{
      const n=(c.featGrants??[]).reduce((sum,g)=>sum+(g.selections?.length??0),0);
      return n?n+' chosen':'';
    }
    case 'equipment':return c.equipment?.length?tr(c.equipment.length===1?'{0} item':'{0} items',c.equipment.length):'';
    default:{
      const def=HANDLER_STEPS[step.stepId];
      if(!def?.key)return '';
      const value=bucket[def.key];
      return Array.isArray(value)?names(value):value?.name??'';
    }
  }
}

/** Short lines describing one planned level's picks. */
export function levelSummary(level,slots,plan){
  const lines=[];
  for(const slot of slots){
    if(slot.type==='feat'){const f=planFeat(plan,slot);if(f?.name)lines.push(f.name);}
    else if(slot.type==='ability'){const b=planBoosts(plan,level);if(b.length)lines.push(tr('Boosts {0}',b.map(a=>a.toUpperCase()).join(' ')));}
    else if(slot.type==='skill'){const s=planSkillIncrease(plan,slot);if(s?.skill)lines.push(titleCase(s.skill)+' → '+(RANKS[s.toRank]??'+1'));}
    else if(slot.type==='spells'){const n=planSpells(plan,level,slot.entryType).length;if(n)lines.push(tr(n===1?'{0} spell':'{0} spells',n));}
    else if(slot.type==='signature'){const s=slot.ranks.map(r=>planSignature(plan,level,r,slot.entryType)?.name).filter(Boolean);if(s.length)lines.push('★ '+s.join(', '));}
  }
  for(const feat of plan?.levels?.[level]?.customFeats??[])if(feat?.name)lines.push('+ '+feat.name);
  return [...new Set(lines)];
}
