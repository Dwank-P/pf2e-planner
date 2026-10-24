/**
 * The browser consumes choice schedules computed inside the Foundry world by
 * PF2e Leveler's real getChoicesForLevel(), rather than reproducing them.
 * Only UI composition and Leveler's documented secondary-class additions
 * are handled here; actor-dependent build-state checks remain pending.
 */
const FEAT={
  classFeat:['class','Class feat'],
  skillFeat:['skill','Skill feat'],
  generalFeat:['general','General feat'],
  ancestryFeat:['ancestry','Ancestry feat'],
  archetypeFeat:['archetype','Free Archetype feat'],
  dualClassFeat:['dual-class','Dual Class feat'],
  mythicFeat:['mythic','Mythic feat']
};
const ATTR=['str','dex','con','int','wis','cha'];
export const ABILITY_LABELS={
  str:'Strength',dex:'Dexterity',con:'Constitution',
  int:'Intelligence',wis:'Wisdom',cha:'Charisma'
};
export const SKILL_LABELS={
  acrobatics:'Acrobatics',arcana:'Arcana',athletics:'Athletics',
  crafting:'Crafting',deception:'Deception',diplomacy:'Diplomacy',
  intimidation:'Intimidation',medicine:'Medicine',nature:'Nature',
  occultism:'Occultism',performance:'Performance',religion:'Religion',
  society:'Society',stealth:'Stealth',survival:'Survival',thievery:'Thievery'
};
export function validAbility(value){return ATTR.includes(value);}
const extraKey=s=>String(s??'').trim().toLowerCase()
  .replace(/[^a-z0-9-]+/g,'-').slice(0,20);

export function levelerChoiceSlots(primary,secondary=null,variants={}) {
  const data=primary?.metadata?.levelerProgression;
  const creation=[
    // Level-one options remain available even before the class is selected.
    {key:'ancestry-1',type:'feat',kind:'ancestry',label:'Ancestry feat',level:1,source:'creation'},
    ...[
      ['ancestry','Ancestry boosts',2],
      ['background','Background boosts',2],
      ['class','Class key ability',1],
      ['free','Free boosts',4]
    ].map(([source,label,count])=>({
      key:source+'-1',type:'ability',kind:'abilityBoosts',label,level:1,count,source:'creation'
    })),
    ...(data?.spellcasting?[{key:'spells-1',type:'spells',kind:'spells',
      label:'Starting spells',level:1,source:'creation'}]:[])
  ];
  if(data?.provider!=='pf2e-leveler'||!data.levels) {
    return {ready:false,source:'creation-only',slots:creation,
      error:'Select a class, then synchronize Leveler progression from Foundry to unlock levels 2–20.'};
  }
  const secondData=secondary?.metadata?.levelerProgression;
  const dual=variants.dualClass===true&&secondData?.provider==='pf2e-leveler';
  const slots=[...creation];
  for(let level=2;level<=20;level++){
    const primaryChoices=data.levels[level]??data.levels[String(level)]??[];
    const secondaryChoices=dual?(secondData.levels[level]??[]):[];
    const choices=[...primaryChoices];
    if(dual){
      // Mirroring Leveler's getChoicesForLevel secondary-class rule:
      // extra skill feat/increase only if the primary class lacks it.
      for(const kind of ['skillFeat','skillIncrease']){
        if(secondaryChoices.some(c=>c.type===kind)&&!primaryChoices.some(c=>c.type===kind)){
          choices.push(...secondaryChoices.filter(c=>c.type===kind));
        }
      }
      for(const choice of secondaryChoices){
        if(choice.type==='skillIncrease'&&choice.source &&
          !choices.some(c=>c.type==='skillIncrease'&&c.source===choice.source)){
          choices.push(choice);
        }
      }
    }
    const duplicates={};
    for(const choice of choices){
      if(!choice||typeof choice.type!=='string')continue;
      const n=(duplicates[choice.type]=(duplicates[choice.type]??0)+1);
      const suffix=n>1?'-'+n:'';
      if(FEAT[choice.type]){
        const [kind,label]=FEAT[choice.type];
        slots.push({key:kind+'-'+level+suffix,type:'feat',kind,label,level,
          source:'leveler',levelerType:choice.type});
      }else if(choice.type==='abilityBoosts'){
        slots.push({key:'level-'+level+suffix,type:'ability',kind:'abilityBoosts',
          label:'Ability boosts',level,count:Number(choice.count)||4,
          source:'leveler',levelerType:choice.type});
      }else if(choice.type==='skillIncrease'){
        slots.push({key:'skill-increase-'+level+
          (choice.source?'-'+extraKey(choice.source):suffix),
          type:'skill',kind:'skillIncrease',label:choice.label||'Skill increase',level,
          allowedSkills:choice.allowedSkills||[],source:'leveler',levelerType:choice.type});
      }else if(choice.type==='spells'){
        slots.push({key:'spells-'+level,type:'spells',kind:'spells',
          label:'Spellcasting progression',level,source:'leveler'});
      }else if(choice.type==='abpPotency'){
        slots.push({key:'abp-'+level,type:'informational',kind:'abp',
          label:'Automatic bonus progression',level,source:'leveler'});
      }
    }
  }
  return {ready:true,source:'pf2e-leveler',version:data.version,slots};
}

export function selectedBoosts(build,key) {
  const current=build?.abilityBoosts?.[key];
  return Array.isArray(current)?current.filter(validAbility):[];
}
export function setBoost(build,key,ability,count) {
  if(!validAbility(ability)||!Number.isInteger(count)||count<1||count>6)return;
  build.abilityBoosts??={};
  const current=selectedBoosts(build,key);
  const next=current.includes(ability)
    ? current.filter(x=>x!==ability)
    : current.length<count?[...current,ability]:[...current.slice(1),ability];
  build.abilityBoosts[key]=next;
}
export function choiceComplete(slot,build) {
  if(slot.type==='feat')return !!build?.feats?.[slot.key];
  if(slot.type==='ability')return selectedBoosts(build,slot.key).length===slot.count;
  if(slot.type==='skill')return !!build?.skillIncreases?.[slot.key];
  return false;
}
export function isCompletionSlot(slot){return ['feat','ability','skill'].includes(slot.type);}
