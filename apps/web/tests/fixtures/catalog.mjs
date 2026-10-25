/**
 * Sample synced catalog in the stored shape ({uuid,name,type,level,rarity,traits,
 * description,pack,metadata}), as the Bridge exports and verifyEntry stores it.
 * Used by unit tests and the local dev seed (scripts/seed-dev.mjs). Descriptions
 * are short paraphrases written for testing, not rules text.
 */
const ALL=['str','dex','con','int','wis','cha'];
const slots=(...values)=>Object.fromEntries(values.map((v,i)=>[String(i),{value:v}]));
const U=(pack,id)=>`Compendium.pf2e.${pack}.Item.${id}`;
const item=(pack,id,type,name,level,metadata={},{traits=[],rarity='common',description=''}={})=>({
  uuid:U(pack,id),name,type,level,rarity,traits,pack:'pf2e.'+pack,
  description:description||`<p>${name}.</p>`,metadata:{slug:name.toLowerCase().replace(/[^a-z0-9]+/g,'-'),...metadata}});

// Leveler-style schedules (classes/progression.js) for levels 2–20.
function levels({classFeat=[2,4,6,8,10,12,14,16,18,20],skillFeat=[2,4,6,8,10,12,14,16,18,20],
  general=[3,7,11,15,19],ancestry=[5,9,13,17],boosts=[5,10,15,20],skill=[3,5,7,9,11,13,15,17,19],
  spells=false}={}){
  const out={};
  for(let l=2;l<=20;l++){
    const c=[];
    if(boosts.includes(l))c.push({type:'abilityBoosts',count:4});
    if(classFeat.includes(l))c.push({type:'classFeat'});
    if(skillFeat.includes(l))c.push({type:'skillFeat'});
    if(general.includes(l))c.push({type:'generalFeat'});
    if(ancestry.includes(l))c.push({type:'ancestryFeat'});
    if(skill.includes(l))c.push({type:'skillIncrease'});
    if(spells)c.push({type:'spells'});
    if(c.length)out[l]=c;
  }
  return out;
}
const preparedSlots={1:{cantrips:5,1:2},2:{cantrips:5,1:3},3:{cantrips:5,1:3,2:2},4:{cantrips:5,1:3,2:3},
  5:{cantrips:5,1:3,2:3,3:2},6:{cantrips:5,1:3,2:3,3:3},7:{cantrips:5,1:3,2:3,3:3,4:2}};
const spontaneousSlots={1:{cantrips:5,1:3},2:{cantrips:5,1:4},3:{cantrips:5,1:4,2:3},4:{cantrips:5,1:4,2:4},
  5:{cantrips:5,1:4,2:4,3:3},6:{cantrips:5,1:4,2:4,3:4},7:{cantrips:5,1:4,2:4,3:4,4:3}};
const features=(list)=>list.map(([level,name,id])=>({level,name,uuid:id?U('classfeatures',id):null}));

export const ancestries=[
  item('ancestries','Human','ancestry','Human',null,{rules:{hp:8,size:'med',speed:25,
    boosts:slots(ALL,ALL),flaws:slots(),languages:{value:['common']},additionalLanguages:{count:1,value:['elven','dwarven','draconic','goblin']}}},
    {traits:['human','humanoid'],description:'<p>Ambitious and adaptable, humans are found everywhere.</p>'}),
  item('ancestries','Elf','ancestry','Elf',null,{rules:{hp:6,size:'med',speed:30,
    boosts:slots(['dex'],['int'],ALL),flaws:slots(['con']),languages:{value:['common','elven']},additionalLanguages:{count:0,value:['draconic','sylvan']}}},
    {traits:['elf','humanoid'],description:'<p>Long-lived and patient, elves see the world over centuries.</p>'}),
  item('ancestries','Dwarf','ancestry','Dwarf',null,{rules:{hp:10,size:'med',speed:20,
    boosts:slots(['con'],['wis'],ALL),flaws:slots(['cha']),languages:{value:['common','dwarven']},additionalLanguages:{count:0,value:['petran','goblin']}}},
    {traits:['dwarf','humanoid'],description:'<p>Stout and steady, dwarves carve homes from stone.</p>'})
];
export const heritages=[
  item('heritages','VersatileHuman','heritage','Versatile Human',null,{ancestrySlug:'human',ancestryUuid:ancestries[0].uuid,versatile:false}),
  item('heritages','SkilledHuman','heritage','Skilled Human',null,{ancestrySlug:'human',ancestryUuid:ancestries[0].uuid,versatile:false}),
  item('heritages','AncientElf','heritage','Ancient Elf',null,{ancestrySlug:'elf',ancestryUuid:ancestries[1].uuid,versatile:false}),
  item('heritages','RockDwarf','heritage','Rock Dwarf',null,{ancestrySlug:'dwarf',ancestryUuid:ancestries[2].uuid,versatile:false}),
  item('heritages','Changeling','heritage','Changeling',null,{ancestrySlug:null,ancestryUuid:null,versatile:true},{rarity:'uncommon'})
];
export const backgrounds=[
  item('backgrounds','Scholar','background','Scholar',null,{boostChoices:[['int','wis'],ALL],trainedSkills:['arcana'],loreSkills:['Academia'],
    rules:{boosts:slots(['int','wis'],ALL),trainedSkills:{value:['arcana'],lore:['Academia']}}}),
  item('backgrounds','Guard','background','Guard',null,{boostChoices:[['str','cha'],ALL],trainedSkills:['intimidation'],loreSkills:['Legal'],
    rules:{boosts:slots(['str','cha'],ALL),trainedSkills:{value:['intimidation'],lore:['Legal']}}}),
  item('backgrounds','Acolyte','background','Acolyte',null,{boostChoices:[['int','wis'],ALL],trainedSkills:['religion'],loreSkills:['Scribing'],
    rules:{boosts:slots(['int','wis'],ALL),trainedSkills:{value:['religion'],lore:['Scribing']}}})
];
export const classes=[
  item('classes','Fighter','class','Fighter',1,{classFeatLevels:[1,2,4,6,8,10,12,14,16,18,20],skillFeatLevels:[2,4,6,8,10,12,14,16,18,20],
    keyAbility:['str','dex'],grantedFeatures:features([[1,'Reactive Strike','ReactiveStrike'],[1,'Shield Block','ShieldBlock'],
      [3,'Bravery','Bravery'],[5,'Fighter Weapon Mastery','FWM'],[7,'Battlefield Surveyor','BS'],[7,'Weapon Specialization','WS']]),
    rules:{hp:10,keyAbility:{value:['str','dex']},trainedSkills:{value:[],additional:3},perception:2,
      savingThrows:{fortitude:2,reflex:2,will:1},classDC:1},
    levelerProgression:{provider:'pf2e-leveler',version:'3.12.3',slug:'fighter',keyAbility:['str','dex'],
      levels:levels(),spellcasting:null,subclassTag:null,creationSteps:[],
      classFeatures:[{level:3,name:'Bravery'},{level:5,name:'Fighter Weapon Mastery'}]}},
    {description:'<p>A master of weapons and armour.</p>'}),
  item('classes','Wizard','class','Wizard',1,{classFeatLevels:[2,4,6,8,10,12,14,16,18,20],skillFeatLevels:[2,4,6,8,10,12,14,16,18,20],
    keyAbility:['int'],spellcasting:true,spellTradition:'arcane',
    grantedFeatures:features([[1,'Arcane Spellcasting','ArcaneSpellcasting'],[1,'Arcane School','ArcaneSchool'],
      [1,'Arcane Thesis','ArcaneThesis'],[5,'Reflex Expertise','ReflexExp'],[7,'Expert Spellcaster','ExpertSpellcaster']]),
    rules:{hp:6,keyAbility:{value:['int']},trainedSkills:{value:['arcana'],additional:2},perception:1,
      savingThrows:{fortitude:1,reflex:1,will:2},classDC:1},
    levelerProgression:{provider:'pf2e-leveler',version:'3.12.3',slug:'wizard',keyAbility:['int'],
      levels:levels({spells:true}),subclassTag:'wizard-arcane-school',creationSteps:['thesis'],
      spellcasting:{tradition:'arcane',type:'prepared',slots:preparedSlots,spellbook:true,level1Counts:{cantrips:10,rank1:5}},
      classFeatures:[{level:7,name:'Expert Spellcaster'}]}},
    {description:'<p>A scholar of arcane magic who prepares spells from a spellbook.</p>'}),
  item('classes','Cleric','class','Cleric',1,{classFeatLevels:[2,4,6,8,10,12,14,16,18,20],skillFeatLevels:[2,4,6,8,10,12,14,16,18,20],
    keyAbility:['wis'],spellcasting:true,spellTradition:'divine',
    grantedFeatures:features([[1,'Deity','Deity'],[1,'Divine Font','DivineFont'],[1,'Doctrine','Doctrine'],[5,'Alertness','Alertness']]),
    rules:{hp:8,keyAbility:{value:['wis']},trainedSkills:{value:['religion'],additional:2},perception:1,
      savingThrows:{fortitude:1,reflex:1,will:2},classDC:1},
    levelerProgression:{provider:'pf2e-leveler',version:'3.12.3',slug:'cleric',keyAbility:['wis'],
      levels:levels({spells:true}),subclassTag:'cleric-doctrine',creationSteps:['deity','sanctification','divineFont'],
      spellcasting:{tradition:'divine',type:'prepared',slots:preparedSlots,spellbook:false,level1Counts:{cantrips:5,rank1:2}}}},
    {description:'<p>A servant of a deity who channels divine power.</p>'}),
  item('classes','Sorcerer','class','Sorcerer',1,{classFeatLevels:[2,4,6,8,10,12,14,16,18,20],skillFeatLevels:[2,4,6,8,10,12,14,16,18,20],
    keyAbility:['cha'],spellcasting:true,
    grantedFeatures:features([[1,'Bloodline','Bloodline'],[1,'Sorcerous Potency','SorcerousPotency'],[3,'Signature Spells','SignatureSpells']]),
    rules:{hp:6,keyAbility:{value:['cha']},trainedSkills:{value:[],additional:2},perception:1,
      savingThrows:{fortitude:1,reflex:1,will:2},classDC:1},
    levelerProgression:{provider:'pf2e-leveler',version:'3.12.3',slug:'sorcerer',keyAbility:['cha'],
      levels:levels({spells:true}),subclassTag:'sorcerer-bloodline',creationSteps:[],
      spellcasting:{tradition:'bloodline',type:'spontaneous',slots:spontaneousSlots,spellbook:false,level1Counts:{cantrips:5,rank1:3}}}},
    {description:'<p>Magic flows from your blood; you cast spontaneously from a repertoire.</p>'})
];
const classFeature=(id,name,tags,extra={})=>item('classfeatures',id,'feat',name,1,
  {featType:'classfeature',category:'classfeature',otherTags:tags,...extra},{description:`<p>${name}.</p>`});
export const classFeatures=[
  classFeature('BattleMagic','School of Battle Magic',['wizard-arcane-school']),
  classFeature('CivicWizardry','School of Civic Wizardry',['wizard-arcane-school']),
  classFeature('SpellBlending','Spell Blending',['wizard-arcane-thesis']),
  classFeature('SpellSubstitution','Spell Substitution',['wizard-arcane-thesis']),
  classFeature('Cloistered','Cloistered Cleric',['cleric-doctrine']),
  classFeature('Warpriest','Warpriest',['cleric-doctrine']),
  classFeature('Imperial','Imperial',['sorcerer-bloodline']),
  classFeature('Draconic','Draconic',['sorcerer-bloodline'])
];
export const deities=[
  item('deities','Sarenrae','deity','Sarenrae',null,{rules:{font:['heal'],sanctification:{modal:'can',what:['holy']},skill:['medicine']}}),
  item('deities','Pharasma','deity','Pharasma',null,{rules:{font:['heal'],sanctification:{},skill:['medicine']}}),
  item('deities','Nethys','deity','Nethys',null,{rules:{font:['heal','harm'],sanctification:{},skill:['arcana']}}),
  item('deities','Asmodeus','deity','Asmodeus',null,{rules:{font:['harm'],sanctification:{modal:'must',what:['unholy']},skill:['deception']}})
];
const feat=(id,name,level,category,traits,extra={})=>item('feats-srd',id,'feat',name,level,
  {featType:category,category,actions:null,prerequisites:[],...extra},{traits});
export const feats=[
  feat('NaturalAmbition','Natural Ambition',1,'ancestry',['human'],{ancestryAccess:{restrictedTo:['human'],universal:false}}),
  feat('CooperativeNature','Cooperative Nature',1,'ancestry',['human'],{ancestryAccess:{restrictedTo:['human'],universal:false}}),
  feat('ElvenLore','Elven Lore',1,'ancestry',['elf'],{ancestryAccess:{restrictedTo:['elf'],universal:false}}),
  feat('RockRunner','Rock Runner',1,'ancestry',['dwarf'],{ancestryAccess:{restrictedTo:['dwarf'],universal:false}}),
  feat('SuddenCharge','Sudden Charge',1,'class',['fighter','flourish']),
  feat('ReactiveShield','Reactive Shield',1,'class',['fighter']),
  feat('PointBlankStance','Point-Blank Stance',1,'class',['fighter','stance']),
  feat('ReachSpell','Reach Spell',1,'class',['wizard','spellshape','sorcerer']),
  feat('Toughness','Toughness',1,'general',['general']),
  feat('Assurance','Assurance',1,'skill',['general','skill']),
  feat('BattleMedicine','Battle Medicine',1,'skill',['general','skill','healing'],{prerequisites:['trained in Medicine']})
];
const spell=(id,name,rank,traditions,traits=[])=>item('spells-srd',id,'spell',name,rank,
  {spellRank:rank,spellTraditions:traditions},{traits:rank===0?['cantrip',...traits]:traits});
export const spells=[
  spell('Shield','Shield',1,['arcane','divine','occult'],['concentrate','force']),
  spell('DetectMagic','Detect Magic',1,['arcane','divine','occult','primal'],['concentrate','detection']),
  spell('ElectricArc','Electric Arc',1,['arcane','primal'],['electricity']),
  spell('Light','Light',1,['arcane','divine','occult','primal'],['light']),
  spell('Prestidigitation','Prestidigitation',1,['arcane','divine','occult','primal']),
  spell('Frostbite','Frostbite',1,['arcane','primal'],['cold']),
  spell('Ignition','Ignition',1,['arcane','primal'],['fire']),
  spell('ReadAura','Read Aura',1,['arcane','divine','occult','primal'],['detection']),
  spell('Message','Message',1,['arcane','divine','occult'],['auditory']),
  spell('TelekineticProjectile','Telekinetic Projectile',1,['arcane','occult'],['force']),
  spell('Guidance','Guidance',1,['divine','occult','primal']),
  spell('DivineLance','Divine Lance',1,['divine'],['spirit']),
  spell('ForceBarrage','Force Barrage',1,['arcane','occult'],['force']),
  spell('MysticArmor','Mystic Armor',1,['arcane','divine','occult','primal']),
  spell('Grease','Grease',1,['arcane','primal']),
  spell('Fear','Fear',1,['arcane','divine','occult','primal'],['emotion','fear']),
  spell('Sleep','Sleep',1,['arcane','occult'],['sleep']),
  spell('Heal','Heal',1,['divine','primal'],['healing','vitality']),
  spell('Bless','Bless',1,['divine','occult'],['aura']),
  spell('Invisibility','Invisibility',2,['arcane','occult'],['illusion']),
  spell('Fireball','Fireball',3,['arcane','primal'],['fire'])
].map(s=>s.metadata.spellRank===1&&['Shield','DetectMagic','ElectricArc','Light','Prestidigitation','Frostbite','Ignition',
  'ReadAura','Message','TelekineticProjectile','Guidance','DivineLance'].includes(s.uuid.split('.').pop())
  ?{...s,traits:['cantrip',...s.traits]}:s);
export const equipment=[
  item('equipment-srd','Longsword','weapon','Longsword',0,{rules:{price:{value:{gp:1}}}}),
  item('equipment-srd','SteelShield','shield','Steel Shield',0,{rules:{price:{value:{gp:2}}}}),
  item('equipment-srd','LeatherArmor','armor','Leather Armor',0,{rules:{price:{value:{gp:2}}}}),
  item('equipment-srd','HealersToolkit','equipment',"Healer's Toolkit",0,{rules:{price:{value:{gp:5}}}})
];
export const actions=[];
export const all=[...ancestries,...heritages,...backgrounds,...classes,...classFeatures,...deities,
  ...feats,...spells,...equipment,...actions];
export const bundle={sha256:'fixture',snapshotId:'fixture',variants:{freeArchetype:true,dualClass:false},
  items:all.map(({description,...rest})=>rest)};
