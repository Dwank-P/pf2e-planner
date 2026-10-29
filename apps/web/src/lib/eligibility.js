/**
 * Conservative PF2e recommendation helpers; do not claim complete legality.
 * Decisions use ONLY the metadata actually synchronized from Foundry.
 */
export const abilities={str:'Strength',dex:'Dexterity',con:'Constitution',int:'Intelligence',
  wis:'Wisdom',cha:'Charisma'};
const traits=v=>Array.isArray(v?.traits)?v.traits.map(x=>String(x).toLowerCase()):[];
const metadata=v=>v?.metadata||{};
export function slugOf(item){
  const m=metadata(item);
  return String(m.slug||item?.name||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'');
}
function featCategory(item){return metadata(item).featType||metadata(item).category||'';}
export function checkHeritage(heritage,ancestry){
  if(!heritage)return {severity:0,reasons:[]};
  const data=metadata(heritage),a=metadata(ancestry);
  if(!ancestry)return {severity:1,reasons:['Choose an ancestry before a heritage.']};
  if(data.versatile===true || (data.ancestrySlug==null&&data.ancestryUuid==null))
    return {severity:0,reasons:[]};
  if(data.ancestryUuid && data.ancestryUuid===ancestry.uuid)return {severity:0,reasons:[]};
  if(data.ancestrySlug && data.ancestrySlug===slugOf(ancestry))return {severity:0,reasons:[]};
  return {severity:2,reasons:['This heritage belongs to '+(data.ancestrySlug||'another ancestry')+'.']};
}
export function backgroundMatches(item,{abilities:selected=[],skill='',feat=''}={}){
  const m=metadata(item);
  if(selected.length){
    const choices=Array.isArray(m.boostChoices)?m.boostChoices:[];
    const constrained=choices.filter(group=>Array.isArray(group) && group.length && group.length<6);
    // OR: a single constrained boost choice matching ANY selected ability.
    if(!constrained.some(group=>group.some(boost=>selected.includes(String(boost).toLowerCase()))))
      return false;
  }
  if(skill && !(m.trainedSkills||[]).some(s=>s.toLowerCase().includes(skill.toLowerCase())) &&
    !(m.loreSkills||[]).some(s=>s.toLowerCase().includes(skill.toLowerCase())))return false;
  if(feat && !(m.grantedFeats||[]).some(s=>s.toLowerCase().includes(feat.toLowerCase())))return false;
  return true;
}
export function checkFeat(feat,context={}){
  const m=metadata(feat),t=traits(feat);
  const reasons=[];
  let severity=0;
  const type=context.slotKind||'';
  const preferredClasses=[context.classItem,context.secondClass].filter(Boolean)
    .map(slugOf);
  const ancestry=context.ancestry;
  if(Number.isInteger(context.slotLevel) && Number.isInteger(feat.level) &&
     feat.level>context.slotLevel){
    severity=2;reasons.push('Requires level '+feat.level+'; this slot is level '+context.slotLevel+'.');
  }
  const group=featCategory(feat);
  if(type && type!=='archetype' && group && group!==type){
    severity=2;reasons.push('This is a '+group+' feat, not a '+type+' feat.');
  }
  if(type==='archetype' && !t.includes('archetype')){
    severity=2;reasons.push('Not marked as an archetype feat.');
  }
  if(type==='class' && preferredClasses.length){
    // Class feats normally carry their class trait, archetype feats may be legal
    // via dedication paths; absence of a matching trait is only a warning.
    const classList=['alchemist','animist','barbarian','bard','champion','cleric',
      'commander','druid','exemplar','fighter','guardian','gunslinger','inventor',
      'investigator','kineticist','magus','monk','oracle','psychic','ranger','rogue',
      'sorcerer','summoner','swashbuckler','thaumaturge','witch','wizard'];
    const tagged=t.filter(x=>classList.includes(x));
    if(tagged.length && !tagged.some(x=>preferredClasses.includes(x))){
      severity=2;reasons.push('Requires '+tagged.join(' or ')+' class; current class is '+
        preferredClasses.join(' / ')+'.');
    }
    else if(!tagged.length && !t.includes('archetype')){
      severity=Math.max(severity,1);
      reasons.push('No class trait was supplied; verify eligibility.');
    }
  }
  if(type==='ancestry') {
    const access=m.ancestryAccess;
    if(!ancestry){
      severity=Math.max(severity,1);
      reasons.push('Select an ancestry to evaluate ancestry feat access.');
    }else if(access && typeof access==='object'){
      const allowed=new Set([slugOf(ancestry),slugOf(context.heritage)]
        .filter(Boolean));
      const required=Array.isArray(access.restrictedTo)
        ? access.restrictedTo.map(x=>String(x).toLowerCase()) : [];
      const valid=access.universal===true||required.some(tag=>allowed.has(tag));
      if(!valid&&required.length){
        severity=2;
        reasons.push('Ancestry locked: requires '+required.join(' or ')+
          ', but your ancestry is '+ancestry.name+'.');
      }else if(!valid){
        severity=Math.max(severity,1);
        reasons.push('Ancestry access needs Leveler actor validation.');
      }
    }else{
      const selected=slugOf(ancestry);
      const allowed=new Set([selected,slugOf(context.heritage)].filter(Boolean));
      // Legacy imports without Leveler trait classification only provide
      // a conservative warning, never mislabel an unclassified feat as legal.
      if(!t.some(tag=>allowed.has(tag))){
        severity=Math.max(severity,1);
        reasons.push('Ancestry traits not verified for '+ancestry.name+
          '; re-sync Leveler metadata.');
      }
    }
  }
  if(m.guidance==='not-recommended'){
    severity=Math.max(severity,1);
    reasons.push('Not recommended by the GM in PF2e Leveler.');
  }else if(m.guidance==='disallowed'){
    severity=2;
    reasons.push('This option is disallowed by PF2e Leveler.');
  }
  const prerequisites=Array.isArray(m.prerequisites)?m.prerequisites:[];
  if(prerequisites.length){
    // Some prerequisites are complex actors' choices/skills/other feats, which
    // we don't have enough rules data to confirm. Flag them transparently.
    severity=Math.max(severity,1);
    reasons.push('Verify prerequisites: '+prerequisites.join('; '));
  }
  if(!context.classItem&&type==='class'){
    severity=Math.max(severity,1);
    reasons.push('Choose a class to verify class feat requirements.');
  }
  return {severity,reasons,preferred:severity===0};
}
export function rankChoices(results,context){
  return results.map(entry=>({...entry,eligibility:checkFeat(entry,context)}))
    .sort((a,b)=>a.eligibility.severity-b.eligibility.severity||
      Number(b.metadata?.guidance==='recommended')-Number(a.metadata?.guidance==='recommended')||
      (a.level??0)-(b.level??0)||a.name.localeCompare(b.name));
}
export function isSpellAvailable(spell,tradition,maxRank){
  const m=metadata(spell);
  const rank=Number(m.spellRank??spell.level);
  const cantrip=traits(spell).includes('cantrip');
  const max=cantrip?0:maxRank;
  if(!cantrip && rank>max)return {severity:2,reasons:['Spell rank '+rank+' exceeds available rank '+maxRank+'.']};
  if(tradition&&Array.isArray(m.spellTraditions)&&
      !m.spellTraditions.includes(tradition)){
    return {severity:2,reasons:['Not on the '+tradition+' spell list.']};
  }
  return {severity:0,reasons:[]};
}
