/**
 * Foundry-side compatibility adapter. Uses the installed PF2e Leveler's own
 * modules at runtime; no Leveler source is copied into the website.
 *
 * Progression does not require an actor. Full build-state/prerequisite
 * validation DOES require an actor, and is explicitly not claimed here.
 */
const LEVELER_ROOT='/modules/pf2e-leveler/scripts';
const KNOWN_CHOICES=new Set([
  'abilityBoosts','classFeat','skillFeat','generalFeat','ancestryFeat',
  'skillIncrease','archetypeFeat','dualClassFeat','mythicFeat',
  'abpPotency','spells'
]);
let levelerModules;
export async function loadLevelerProgression() {
  if(!game.modules.get('pf2e-leveler')?.active)
    throw Error('PF2e Leveler must be active to sync advancement logic.');
  if(!levelerModules) {
    levelerModules=(async()=>{
      const [registry,ensure,progression]=await Promise.all([
        import(LEVELER_ROOT+'/classes/registry.js'),
        import(LEVELER_ROOT+'/classes/ensure.js'),
        import(LEVELER_ROOT+'/classes/progression.js')
      ]);
      if(typeof progression.getChoicesForLevel!=='function'||
         !registry.ClassRegistry||typeof ensure.ensureClassItemRegistered!=='function')
        throw Error('Installed PF2e Leveler does not expose the expected progression API.');
      ensure.ensureClassRegistry();
      return {
        ClassRegistry:registry.ClassRegistry,
        ensureClassItemRegistered:ensure.ensureClassItemRegistered,
        getChoicesForLevel:progression.getChoicesForLevel
      };
    })().catch(error=>{levelerModules=null;throw error;});
  }
  return levelerModules;
}
function levelerOptions(variants){
  // Match the option keys consumed by Leveler's getChoicesForLevel.
  return {
    freeArchetype:variants.freeArchetype===true,
    dualClass:variants.dualClass===true,
    ancestralParagon:variants.ancestralParagon===true,
    mythic:variants.mythic===true,
    gradualBoosts:variants.gradualAbilityBoosts===true,
    abp:variants.automaticBonusProgression===true
  };
}
function cleanChoice(choice){
  if(!choice||!KNOWN_CHOICES.has(choice.type))return null;
  const cleaned={type:choice.type};
  if(Number.isInteger(choice.count))cleaned.count=choice.count;
  if(typeof choice.source==='string'&&choice.source.length<120)cleaned.source=choice.source;
  if(typeof choice.label==='string'&&choice.label.length<120)cleaned.label=choice.label;
  if(Array.isArray(choice.allowedSkills))
    cleaned.allowedSkills=choice.allowedSkills.filter(x=>typeof x==='string').slice(0,30);
  return cleaned;
}
export async function createLevelerProgressions(classDocs,variants){
  const {ClassRegistry,ensureClassItemRegistered,getChoicesForLevel}=
    await loadLevelerProgression();
  const schema=new Map(),resolved=new Map();
  const opts=levelerOptions(variants);
  for(const doc of classDocs){
    const slug=String(doc.system?.slug||doc.slug||doc.name||'')
      .trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
    if(!slug)continue;
    const classDef=ClassRegistry.get(slug,null,doc)||
      ensureClassItemRegistered(doc,slug);
    if(!classDef)continue;
    const levels={};
    for(let level=2;level<=20;level++){
      const choices=getChoicesForLevel(classDef,level,opts)
        .map(cleanChoice).filter(Boolean);
      if(choices.length)levels[level]=choices;
    }
    schema.set(doc.uuid,{
      provider:'pf2e-leveler',version:game.modules.get('pf2e-leveler')?.version??null,
      slug,levels,
      keyAbility:Array.isArray(classDef.keyAbility)?classDef.keyAbility.slice(0,6):[],
      spellcasting:classDef.spellcasting
        ? {tradition:classDef.spellcasting.tradition??null,
           type:classDef.spellcasting.type??null,
           slots:classDef.spellcasting.slots??{}}
        : null,
      // Leveler's normalized class definition is used to compose additional
      // secondary-class skill slots in the browser for Dual Class.
      classFeatures:(classDef.classFeatures||[])
        .filter(feature=>feature.additionalSkillIncrease)
        .map(feature=>({level:feature.level,key:feature.key,
          name:feature.name,additionalSkillIncrease:feature.additionalSkillIncrease}))
        .slice(0,30),
      skillIncreaseLevels:(classDef.skillIncreaseSchedule||[]).slice(0,20),
      skillFeatLevels:(classDef.featSchedule?.skill||[]).slice(0,20)
    });
    resolved.set(slug,classDef);
  }
  return schema;
}
