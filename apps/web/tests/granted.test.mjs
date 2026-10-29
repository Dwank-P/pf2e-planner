import test from 'node:test';
import assert from 'node:assert/strict';
import {indexCatalog} from '../src/lib/builder/catalog.js';
import {grantsAt,grantedNewAt,predicateHolds} from '../src/lib/builder/granted.js';
import {buildState,checkFeat,skillRanks} from '../src/lib/builder/legality.js';
import {proficienciesAt} from '../src/lib/builder/rules.js';
import {choiceSetsFor} from '../src/lib/builder/choice-sets.js';

const U=id=>'Compendium.pf2e.classfeatures.Item.'+id;
const F=id=>'Compendium.pf2e.feats-srd.Item.'+id;
// The PF2e data as the Bridge exports it (ruleEffects), cleric/Warpriest per the system's packs.
const items=[
  {uuid:'Compendium.pf2e.classes.Item.cleric',name:'Cleric',type:'class',metadata:{slug:'cleric',
    grantedFeatures:[{name:'Doctrine',level:1,uuid:U('doctrine')},{name:'First Doctrine',level:1,uuid:U('first')},
      {name:'Third Doctrine',level:7,uuid:U('third')}],
    rules:{defenses:{unarmored:{rank:1},light:{rank:0},medium:{rank:0}},savingThrows:{fortitude:1,reflex:1,will:2},perception:1}}},
  {uuid:U('doctrine'),name:'Doctrine',type:'feat',metadata:{featType:'classfeature',slug:'doctrine',
    ruleEffects:[{key:'grant',uuid:'{item|flags.pf2e.rulesSelections.doctrine}'}]}},
  {uuid:U('first'),name:'First Doctrine',type:'feat',metadata:{featType:'classfeature',slug:'first-doctrine',
    ruleEffects:[{key:'grant',uuid:'{actor|flags.pf2e.cleric.firstDoctrine}'}]}},
  {uuid:U('third'),name:'Third Doctrine',type:'feat',metadata:{featType:'classfeature',slug:'third-doctrine',
    ruleEffects:[{key:'grant',uuid:'{actor|flags.pf2e.cleric.thirdDoctrine}'}]}},
  {uuid:U('warpriest'),name:'Warpriest',type:'feat',metadata:{featType:'classfeature',slug:'warpriest',
    ruleEffects:[{key:'flag',path:'flags.pf2e.cleric',mode:'override',value:{
      firstDoctrine:'Compendium.pf2e.classfeatures.Item.First Doctrine (Warpriest)',
      thirdDoctrine:'Compendium.pf2e.classfeatures.Item.Third Doctrine (Warpriest)'}}]}},
  {uuid:U('fdw'),name:'First Doctrine (Warpriest)',type:'feat',metadata:{featType:'classfeature',slug:'first-doctrine-warpriest',
    proficiencies:{fortitude:2,light:1},
    ruleEffects:[{key:'grant',uuid:'Compendium.pf2e.feats-srd.Item.Shield Block'},
      {key:'rank',path:'system.proficiencies.defenses.light.rank',mode:'upgrade',value:2,predicate:[{gte:['self:level',13]},'feature:divine-defense']},
      {key:'rank',path:'system.proficiencies.defenses.medium.rank',mode:'upgrade',value:1},
      {key:'grant',uuid:'Compendium.pf2e.feats-srd.Item.Deadly Simplicity'}]}},
  {uuid:U('tdw'),name:'Third Doctrine (Warpriest)',type:'feat',metadata:{featType:'classfeature',slug:'third-doctrine-warpriest'}},
  {uuid:U('divine-defense'),name:'Divine Defense',type:'feat',metadata:{featType:'classfeature',slug:'divine-defense'}},
  {uuid:F('sb'),name:'Shield Block',type:'feat',level:1,traits:['general'],metadata:{featType:'general',slug:'shield-block'}},
  {uuid:F('ds'),name:'Deadly Simplicity',type:'feat',level:1,metadata:{featType:'classfeature',slug:'deadly-simplicity'}},
  {uuid:F('ra'),name:'Reactive Strike',type:'feat',level:2,metadata:{featType:'general',slug:'reactive-strike',prerequisites:['Shield Block']}},
  {uuid:F('canny'),name:'Canny Acumen',type:'feat',level:3,metadata:{featType:'general',slug:'canny-acumen',
    ruleEffects:[{key:'rank',path:'system.skills.ste.rank',mode:'upgrade',value:2},{key:'grant',uuid:F('picked-later')}]}}
];
const catalog=indexCatalog({items});
const creation={class:{uuid:'Compendium.pf2e.classes.Item.cleric',name:'Cleric'},subclass:{uuid:U('warpriest'),name:'Warpriest'}};

test('Warpriest grants Shield Block through First Doctrine and the cleric flags', () => {
  const at1=grantsAt(creation,null,catalog.get,1);
  assert.deepEqual(at1.granted.map(g=>g.item.name).sort(),['Deadly Simplicity','First Doctrine (Warpriest)','Shield Block']);
  assert.equal(at1.granted.find(g=>g.item.name==='Shield Block').from,'First Doctrine (Warpriest)');
  assert.ok(!grantsAt(creation,null,catalog.get,6).granted.some(g=>g.item.name==='Third Doctrine (Warpriest)'));
  assert.deepEqual(grantedNewAt(creation,null,catalog.get,7).map(g=>g.item.name),['Third Doctrine (Warpriest)']);
  // Without a doctrine nothing is guessed.
  assert.equal(grantsAt({class:creation.class},null,catalog.get,1).granted.length,0);
});

test('granted feats meet prerequisites and are not offered again', () => {
  const state=buildState(creation,null,catalog.get,2);
  const shieldBlock=catalog.get(F('sb'));
  const verdict=checkFeat(shieldBlock,state,{kind:'general'});
  assert.equal(verdict.blocked,'Already granted by First Doctrine (Warpriest)');
  assert.equal(verdict.hard,true);
  assert.equal(checkFeat(catalog.get(F('ra')),state,{kind:'general'}).blocked,null,'Prerequisite Shield Block is met');
  // Picked earlier anyway: shown as a warning, not a hard block.
  const plan={levels:{2:{generalFeats:[{uuid:F('sb'),name:'Shield Block'}]}}};
  const own=checkFeat(shieldBlock,buildState(creation,plan,catalog.get,2),{kind:'general',currentUuid:F('sb')});
  assert.equal(own.hard,false);
});

test('rank upgrades follow predicates', () => {
  assert.equal(proficienciesAt(creation,catalog.get,1).medium,1,'Warpriest medium armor');
  assert.equal(proficienciesAt(creation,catalog.get,1).light,1,'subfeatures.proficiencies: trained in light armor');
  assert.equal(proficienciesAt(creation,catalog.get,1).fortitude,2,'and expert Fortitude');
  assert.equal(proficienciesAt(creation,catalog.get,13).light,1,'Expert needs Divine Defense too');
  assert.equal(predicateHolds([{gte:['self:level',13]},'feature:divine-defense'],{level:13,features:new Set(['divine-defense']),feats:new Set(),classes:new Set()}),true);
  assert.equal(predicateHolds('self:effect:raised-shield',{level:5,features:new Set(),feats:new Set(),classes:new Set()}),false);
  const plan={levels:{3:{generalFeats:[{uuid:F('canny'),name:'Canny Acumen'}]}}};
  assert.equal(skillRanks(creation,plan,catalog.get,3).get('stealth'),2,'Legacy skill keys map to names');
});

test('name references resolve and fixed grants show in feat choices', () => {
  assert.equal(catalog.get('Compendium.pf2e.feats-srd.Item.shield block')?.uuid,F('sb'));
  assert.equal(catalog.get('Compendium.pf2e.feats-srd.Item.Nope'),null);
  const result=choiceSetsFor(catalog.get(U('fdw')),{},catalog);
  assert.deepEqual(result.grants.map(g=>g.name),['Shield Block','Deadly Simplicity']);
});

test('picks on origins, granters and skill ranks drive grants', () => {
  const B=id=>'Compendium.pf2e.backgrounds.Item.'+id;
  const more=indexCatalog({items:[...items,
    {uuid:B('carter'),name:'Able Carter',type:'background',metadata:{slug:'able-carter',
      choiceSets:[{flag:'skill',rollOption:'able-carter',options:[{value:'deception'},{value:'diplomacy'}]}],
      ruleEffects:[{key:'grant',uuid:F('liar'),predicate:['able-carter:deception']},{key:'grant',uuid:F('hob'),predicate:['able-carter:diplomacy']}]}},
    {uuid:F('liar'),name:'Charming Liar',type:'feat',metadata:{featType:'skill',slug:'charming-liar'}},
    {uuid:F('hob'),name:'Hobnobber',type:'feat',metadata:{featType:'skill',slug:'hobnobber'}},
    {uuid:F('cross'),name:'Crossblooded Evolution',type:'feat',metadata:{featType:'class',slug:'crossblooded-evolution',
      ruleEffects:[{key:'grant',uuid:U('aberrant')}]}},
    {uuid:U('aberrant'),name:'Bloodline: Aberrant',type:'feat',metadata:{featType:'classfeature',slug:'bloodline-aberrant',
      ruleEffects:[{key:'grant',uuid:F('hob'),predicate:['parent:granter:slug:crossblooded-evolution']}]}},
    {uuid:F('eye'),name:"Stonemason's Eye",type:'feat',metadata:{featType:'ancestry',slug:'stonemasons-eye',
      ruleEffects:[{key:'grant',uuid:F('liar'),predicate:[{gte:['skill:crafting:rank',1]}]}]}}]});
  const base={class:creation.class,background:{uuid:B('carter'),name:'Able Carter'}};
  const names=c=>grantsAt(c,null,more.get,1).granted.map(g=>g.item.name);
  assert.deepEqual(names(base),[],'No pick, nothing guessed');
  assert.deepEqual(names({...base,grantedFeatChoices:{[B('carter')]:{skill:'diplomacy'}}}),['Hobnobber']);
  const plan={levels:{2:{classFeats:[{uuid:F('cross'),name:'Crossblooded Evolution'}]}}};
  assert.ok(grantsAt({class:creation.class},plan,more.get,2).granted.some(g=>g.item.name==='Hobnobber'),'granted by the right parent');
  const eye={class:creation.class,ancestryFeat:{uuid:F('eye'),name:"Stonemason's Eye"}};
  assert.deepEqual(names(eye),[],'not trained in Crafting');
  assert.deepEqual(names({...eye,skills:['crafting']}),['Charming Liar'],'trained in Crafting');
});

test('rule summary lists grants, picks as X or Y, training and passed-on choices', async () => {
  const {ruleSummary}=await import('../src/lib/builder/rule-summary.js');
  const s=ruleSummary(catalog.get(U('fdw')));
  assert.deepEqual(s.grants.map(g=>g.name),['Shield Block','Deadly Simplicity']);
  assert.deepEqual(s.training.map(t=>t.rank+' in '+t.what+(t.condition?' ('+t.condition+')':'')),
    ['Expert in Light armor (level 13+, with Divine Defense)','Trained in Medium armor, Light armor','Expert in Fortitude']);
  const w=ruleSummary(catalog.get(U('warpriest')));
  assert.deepEqual(w.sets.map(x=>x.label+': '+x.name),['First Doctrine: First Doctrine (Warpriest)','Third Doctrine: Third Doctrine (Warpriest)']);
  const doctrine=ruleSummary({...catalog.get(U('doctrine')),metadata:{...catalog.get(U('doctrine')).metadata,
    choiceSets:[{flag:'doctrine',options:[{value:U('warpriest'),label:'Warpriest'},{value:'x',label:'Cloistered Cleric'}]}]}});
  assert.deepEqual(doctrine.grants[0].options.map(o=>o.label),['Warpriest','Cloistered Cleric']);
  assert.equal(ruleSummary(catalog.get(F('sb'))).synced,false,'old syncs are flagged');
  const v14=ruleSummary({...catalog.get(U('first')),metadata:{featType:'classfeature',ruleEffects:[{key:'grant',uuid:'{actor|flags.system.cleric.firstDoctrine}'}]}});
  assert.equal(v14.grants[0].decidedBy,true,'flags.system placeholders are recognised');
});

test('PF2e 8 (Foundry v14) flags.system doctrines, and suppressed features', () => {
  // Same chain with the flags.system namespace and id references, as PF2e 8.6 ships it.
  const v8=indexCatalog({items:items.map(i=>{
    const effects=i.metadata?.ruleEffects?.map(e=>({...e,
      ...(e.uuid?{uuid:e.uuid.replace('flags.pf2e.','flags.system.')}:{}),
      ...(e.path?{path:e.path.replace('flags.pf2e.','flags.system.')}:{})}));
    return effects?{...i,metadata:{...i.metadata,ruleEffects:effects}}:i;
  })});
  assert.ok(grantsAt(creation,null,v8.get,1).granted.some(g=>g.item.name==='Shield Block'));
  // Battle Creed replaces the doctrine features.
  const creed=indexCatalog({items:[...items,{uuid:U('creed'),name:'Battle Creed',type:'feat',
    metadata:{featType:'classfeature',slug:'battle-creed',suppressedFeatures:[U('first'),U('third')],ruleEffects:[]}}]});
  const result=grantsAt({class:creation.class,subclass:{uuid:U('creed'),name:'Battle Creed'}},null,creed.get,7);
  assert.ok(result.suppressed.has(U('first')));
  assert.equal(result.granted.length,0);
});

test('class feats need their class: changing class flags the old picks', () => {
  const C='Compendium.pf2e.classes.Item.';
  const cat=indexCatalog({items:[...items,
    {uuid:C+'fighter',name:'Fighter',type:'class',metadata:{slug:'fighter'}},
    {uuid:F('power'),name:'Power Attack',type:'feat',level:1,traits:['fighter','flourish'],metadata:{featType:'class',slug:'power-attack'}},
    {uuid:F('domain'),name:'Domain Initiate',type:'feat',level:1,traits:['cleric'],metadata:{featType:'class',slug:'domain-initiate'}},
    {uuid:F('dedi'),name:'Fighter Dedication',type:'feat',level:2,traits:['archetype','dedication','multiclass'],metadata:{featType:'class',slug:'fighter-dedication'}}]});
  const plan={levels:{2:{classFeats:[{uuid:F('power'),name:'Power Attack'}]}}};
  const asFighter=buildState({class:{uuid:C+'fighter',name:'Fighter'}},plan,cat.get,2);
  const asCleric=buildState({class:{uuid:creation.class.uuid,name:'Cleric'}},plan,cat.get,2);
  assert.equal(checkFeat(cat.get(F('power')),asFighter,{kind:'class',currentUuid:F('power')}).blocked,null);
  assert.equal(checkFeat(cat.get(F('power')),asCleric,{kind:'class',currentUuid:F('power')}).blocked,'Fighter feat — this character is a Cleric');
  assert.equal(checkFeat(cat.get(F('domain')),asCleric,{kind:'class'}).blocked,null);
  assert.equal(checkFeat(cat.get(F('dedi')),asCleric,{kind:'class'}).blocked,null,'Archetype feats are open to every class');
  const dual=buildState({class:{uuid:creation.class.uuid,name:'Cleric'},dualClass:{uuid:C+'fighter',name:'Fighter'}},plan,cat.get,2);
  assert.match(checkFeat(cat.get(F('power')),dual,{kind:'class',currentUuid:F('power')}).blocked,/Fighter feat/,'the class slot needs the main class');
  assert.equal(checkFeat(cat.get(F('power')),dual,{kind:'dual-class',currentUuid:F('power')}).blocked,null,'the dual-class slot takes the second class');
});

test('formulas, picked skills, lores, replacement picks and speed', async () => {
  const {evaluateFormula}=await import('../src/lib/builder/formula.js');
  const {skillTraining}=await import('../src/lib/builder/rules.js');
  const lvl=n=>p=>p==='actor.level'?n:null;
  assert.equal(evaluateFormula('ternary(gte(@actor.level,15),4,ternary(gte(@actor.level,7),3,2))',lvl(8)),3);
  assert.equal(evaluateFormula('match(when(gte(@actor.level, 15), 4), when(gte(@actor.level, 7), 3),when(gte(@actor.level, 3), 2),1)',lvl(3)),2);
  assert.equal(evaluateFormula('min(3,@actor.flags.system.x)',lvl(1)),null,'unknown references give up');
  assert.equal(evaluateFormula('alert(1)'),null,'unknown functions give up');
  const S='Compendium.pf2e.feats-srd.Item.';
  const cat=indexCatalog({items:[...items,
    {uuid:S+'wa',name:"Warpriest's Armor",type:'feat',level:2,traits:['cleric'],metadata:{featType:'class',ruleEffects:[
      {key:'rank',path:'system.proficiencies.defenses.heavy.rank',mode:'upgrade',priority:41,value:'@actor.system.proficiencies.defenses.medium.rank'}]}},
    {uuid:S+'cl',name:'Catfolk Lore',type:'feat',level:1,metadata:{featType:'ancestry',skillFallback:true,ruleEffects:[
      {key:'rank',path:'system.skills.acrobatics.rank',mode:'upgrade',value:1},{key:'rank',path:'system.skills.survival.rank',mode:'upgrade',value:1},
      {key:'lore',path:'system.skills.catfolk-lore',label:'{item|name}',rank:'match(when(gte(@actor.level, 7), 3),when(gte(@actor.level, 3), 2),1)'}]}},
    {uuid:S+'st',name:'Skill Training',type:'feat',level:1,metadata:{featType:'general',
      choiceSets:[{flag:'skill',options:[{value:'arcana'},{value:'nature'}]}],
      ruleEffects:[{key:'rank',path:'system.skills.{item|flags.system.rulesSelections.skill}.rank',mode:'upgrade',value:1}]}},
    {uuid:S+'dandy',name:'Dandy Dedication',type:'feat',level:2,metadata:{featType:'class',
      ruleEffects:[{key:'rank',path:'system.skills.deception.rank',mode:'upgrade',value:'{item|flags.system.rulesSelections.deceptionRank}'}]}},
    {uuid:S+'fleet',name:'Fleet',type:'feat',level:1,metadata:{featType:'general',ruleEffects:[{key:'speed',value:5}]}}]});
  const plan={levels:{2:{classFeats:[{uuid:S+'wa',name:"Warpriest's Armor"}],archetypeFeats:[{uuid:S+'dandy',name:'Dandy',choices:{deceptionRank:'2'}}]},
    3:{ancestryFeats:[{uuid:S+'cl',name:'Catfolk Lore',choices:{levelerSkillFallback1:'nature'}}],generalFeats:[{uuid:S+'st',name:'Skill Training',choices:{skill:'arcana'}}]},
    7:{generalFeats:[{uuid:S+'fleet',name:'Fleet'}]}}};
  const c={...creation,skills:['survival']};
  assert.equal(proficienciesAt(c,cat.get,2,{plan}).heavy,1,"Warpriest's Armor: heavy = medium");
  const r=skillRanks(c,plan,cat.get,7);
  assert.equal(r.get('acrobatics'),1);
  assert.equal(r.get('nature'),1,'replacement pick for Survival');
  assert.equal(r.get('arcana'),1,'Skill Training’s picked skill');
  assert.equal(r.get('deception'),2,'Dandy’s picked rank');
  assert.equal(r.get('catfolk lore'),3);
  assert.equal(grantsAt(c,plan,cat.get,7).speed,5);
  const sets=choiceSetsFor(cat.get(S+'cl'),{},cat,{trainedBefore:new Set(['survival'])}).sets;
  assert.deepEqual(sets.map(s=>s.flag),['levelerSkillFallback1']);
  assert.ok(!sets[0].options.some(o=>['survival','acrobatics'].includes(o.value)));
  assert.equal(choiceSetsFor(cat.get(S+'cl'),{},cat,{trainedBefore:new Set(['arcana'])}).sets.length,0,'no overlap, no pick');
  // Level 1: class, deity and background each training Religion → two extra picks.
  const B='Compendium.pf2e.backgrounds.Item.';
  const cat2=indexCatalog({items:[...items,{uuid:B+'om',name:'Otherworldly Mission',type:'background',metadata:{rules:{trainedSkills:{value:['religion']}}}},
    {uuid:'Compendium.pf2e.classes.Item.cleric2',name:'Cleric',type:'class',metadata:{slug:'cleric',rules:{trainedSkills:{value:['religion'],additional:2}}}}]});
  const t=skillTraining({class:{uuid:'Compendium.pf2e.classes.Item.cleric2'},background:{uuid:B+'om'},deity:{name:'X',skill:['religion']}},cat2.get,0);
  assert.equal(t.duplicates,2);
  assert.equal(t.choices,4);
});

test('same-level training: skill increases and earlier feats count as already trained', async () => {
  const {trainedBefore}=await import('../src/lib/builder/legality.js');
  const S='Compendium.pf2e.feats-srd.Item.';
  const trains=(id,name,skill)=>({uuid:S+id,name,type:'feat',level:1,metadata:{featType:'general',skillFallback:true,
    ruleEffects:[{key:'rank',path:'system.skills.'+skill+'.rank',mode:'upgrade',value:1}]}});
  const cat=indexCatalog({items:[...items,trains('a1','Acro One','acrobatics'),trains('a2','Acro Two','acrobatics'),trains('sv','Survivor','survival')]});
  const plan={levels:{3:{skillIncreases:[{skill:'survival',toRank:1}],generalFeats:[{uuid:S+'sv',name:'Survivor'}],
    ancestryFeats:[{uuid:S+'a1',name:'Acro One'}],skillFeats:[{uuid:S+'a2',name:'Acro Two'}]}}};
  const c={class:creation.class};
  // The skill increase trains Survival at 3, so Survivor (also at 3) offers a replacement.
  const t1=trainedBefore(c,plan,cat.get,3);
  assert.ok(t1.has('survival'));
  assert.equal(choiceSetsFor(cat.get(S+'sv'),{},cat,{trainedBefore:t1}).sets.length,1);
  // Two feats at 3 both training Acrobatics: the first doesn't, the second (after it) does.
  assert.equal(choiceSetsFor(cat.get(S+'a1'),{},cat,{trainedBefore:trainedBefore(c,plan,cat.get,3)}).sets.length,0);
  const t2=trainedBefore(c,plan,cat.get,3,{before:[{uuid:S+'a1'}]});
  assert.equal(choiceSetsFor(cat.get(S+'a2'),{},cat,{trainedBefore:t2}).sets[0]?.prompt,'Already trained in Acrobatics: choose another skill');
  // A replacement picked on the first feat also counts for the second.
  const t3=trainedBefore(c,plan,cat.get,3,{before:[{uuid:S+'a1',choices:{levelerSkillFallback1:'arcana'}}]});
  assert.ok(t3.has('arcana'));
});

test('repeatable feats, archetype additional feats, Intelligence bonus skills', async () => {
  const {takeLimit,trainedBefore}=await import('../src/lib/builder/legality.js');
  const P=await import('../src/lib/builder/plan.js');
  const S='Compendium.pf2e.feats-srd.Item.';
  assert.equal(takeLimit({metadata:{rules:{maxTakable:null}}}),Infinity,'PF2e stores unlimited as null');
  assert.equal(takeLimit({metadata:{rules:{maxTakable:3}}}),3);
  assert.equal(takeLimit({metadata:{rules:{maxTakable:null,onlyLevel1:true}}}),1);
  assert.equal(takeLimit({metadata:{}}),1);
  const C='Compendium.pf2e.classes.Item.';
  const cat=indexCatalog({items:[...items,
    {uuid:C+'fighter',name:'Fighter',type:'class',metadata:{slug:'fighter'}},
    {uuid:S+'lore',name:'Additional Lore',type:'feat',level:1,traits:['general','skill'],metadata:{featType:'skill',rules:{maxTakable:null}}},
    {uuid:S+'bastion',name:'Bastion Dedication',type:'feat',level:2,traits:['archetype','dedication'],
      metadata:{featType:'class',additionalFeats:[{level:8,uuid:'Compendium.pf2e.feats-srd.Item.Reflexive Shield'}]}},
    {uuid:S+'rs',name:'Reflexive Shield',type:'feat',level:6,traits:['fighter'],metadata:{featType:'class'}},
    {uuid:S+'tp',name:'Twin Parry',type:'feat',level:4,traits:['fighter','ranger'],metadata:{featType:'class'}}]});
  const cleric={class:{uuid:creation.class.uuid,name:'Cleric'}};
  const plan={levels:{2:{archetypeFeats:[{uuid:S+'bastion',name:'Bastion Dedication'}],skillFeats:[{uuid:S+'lore',name:'Additional Lore'}]},
    4:{skillFeats:[{uuid:S+'lore',name:'Additional Lore'}]}}};
  assert.equal(checkFeat(cat.get(S+'lore'),buildState(cleric,plan,cat.get,4),{kind:'skill',currentUuid:'other'}).blocked,null,'Additional Lore twice is fine');
  assert.match(checkFeat(cat.get(S+'rs'),buildState(cleric,plan,cat.get,6),{kind:'archetype'}).blocked,/Available from level 8 through Bastion Dedication/);
  assert.equal(checkFeat(cat.get(S+'rs'),buildState(cleric,plan,cat.get,8),{kind:'archetype'}).blocked,null,'Bastion opens Reflexive Shield at 8');
  assert.match(checkFeat(cat.get(S+'rs'),buildState(cleric,{levels:{}},cat.get,8),{kind:'archetype'}).blocked,/Fighter feat/,'without the dedication it stays another class’s feat');
  const fighter={class:{uuid:C+'fighter',name:'Fighter'}};
  assert.equal(checkFeat(cat.get(S+'tp'),buildState(fighter,plan,cat.get,4),{kind:'class'}).blocked,null,'own class feat, whatever archetypes say');
  // Raising Intelligence's modifier: picks counted as trained, and as trained before a feat that level.
  const mods=l=>({int:l>=5?2:1});
  const p2={levels:{5:{abilityBoosts:['int','str','dex','con'],intBonusSkills:['arcana']}}};
  assert.equal(P.intBonusCount(p2,5,mods),1);
  assert.equal(P.intBonusCount({levels:{5:{abilityBoosts:['str']}}},5,mods),0);
  assert.equal(skillRanks(cleric,p2,cat.get,5).get('arcana'),1);
  assert.ok(trainedBefore(cleric,p2,cat.get,5).has('arcana'));
});

test('the deity’s skill is trained as setDeity stores it (a single string)', async () => {
  const {skillTraining}=await import('../src/lib/builder/rules.js');
  const {setDeity}=await import('../src/lib/builder/creation.js');
  const {emptyCreation}=await import('../src/lib/leveler-format.js');
  const torag={uuid:'Compendium.pf2e.deities.Item.torag',name:'Torag',type:'deity',metadata:{rules:{skill:['crafting'],font:['heal']}}};
  const cat=indexCatalog({items:[...items,torag,
    {uuid:'Compendium.pf2e.classes.Item.cleric3',name:'Cleric',type:'class',metadata:{slug:'cleric',rules:{trainedSkills:{value:['religion'],additional:2}}}}]});
  const c=setDeity({...emptyCreation(),class:{uuid:'Compendium.pf2e.classes.Item.cleric3',name:'Cleric'}},torag);
  assert.equal(c.classSelections.class.deity.skill,'crafting');
  const t=skillTraining(c,cat.get,0);
  assert.equal(t.granted.get('crafting'),'Torag');
  assert.equal(skillRanks(c,null,cat.get,1).get('crafting'),1);
});

test('deities can be searched by domain, favored skill and weapon', async () => {
  const {searchItems}=await import('../src/lib/builder/catalog.js');
  const deities=[{uuid:'a',name:'Torag',type:'deity',metadata:{rules:{domains:{primary:['creation','earth'],alternate:['metal']},skill:['crafting'],weapons:['warhammer']}}},
    {uuid:'b',name:'Sarenrae',type:'deity',metadata:{rules:{domains:{primary:['fire','healing']},skill:['medicine'],weapons:['scimitar']}}}];
  assert.deepEqual(searchItems(deities,'earth').map(d=>d.name),['Torag']);
  assert.deepEqual(searchItems(deities,'metal').map(d=>d.name),['Torag'],'alternate domains too');
  assert.deepEqual(searchItems(deities,'heal').map(d=>d.name),['Sarenrae']);
  assert.deepEqual(searchItems(deities,'warhammer').map(d=>d.name),['Torag']);
  assert.deepEqual(searchItems(deities,'tor').map(d=>d.name),['Torag']);
});
