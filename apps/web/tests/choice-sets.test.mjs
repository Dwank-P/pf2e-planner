import test from 'node:test';
import assert from 'node:assert/strict';
import {indexCatalog} from '../src/lib/builder/catalog.js';
import {choiceSetsFor,choicesComplete,setChoice,resolveGrantUuid,matchesFilter,predicateMet,storedChoiceSets}
  from '../src/lib/builder/choice-sets.js';

const U=(pack,id)=>'Compendium.pf2e.'+pack+'.Item.'+id;
const order=(id,name,extra={})=>({uuid:U('classfeatures',id),name,type:'feat',level:1,traits:['druid'],rarity:'common',
  metadata:{slug:id,featType:'classfeature',otherTags:['druid-order'],...extra}});
// Order Explorer, as the Bridge exports it: a tag-filtered ChoiceSet and a GrantItem of the pick.
const explorer={uuid:U('feats-srd','order-explorer'),name:'Order Explorer',type:'feat',level:2,traits:['druid'],
  metadata:{slug:'order-explorer',featType:'class',
    choiceSets:[{flag:'druidOrder',prompt:'Select a druid order.',
      query:{itemType:'feat',filter:['item:tag:druid-order',{not:'item:slug:{item|flags.pf2e.rulesSelections.ownOrder}'}],slugsAsValues:false}}],
    grantChoices:[{uuid:'{item|flags.pf2e.rulesSelections.druidOrder}'}]}};
const items=[explorer,
  order('animal-order','Animal Order'),
  order('storm-order','Storm Order',{choiceSets:[{flag:'stormSkill',prompt:'Choose a skill',
    options:[{value:'athletics',label:'Athletics'},{value:'nature',label:'Nature'},
      {value:'occultism',label:'Occultism',predicate:['feat:storm-born']}]}]}),
  {uuid:U('classfeatures','wild-shape'),name:'Wild Shape',type:'feat',level:1,traits:[],metadata:{slug:'wild-shape',featType:'classfeature'}},
  {uuid:U('feats-srd','skill-training'),name:'Skill Training',type:'feat',level:1,traits:['general'],
    metadata:{slug:'skill-training',featType:'general',choiceSets:[{flag:'skill',prompt:'Select a skill.',
      options:[{value:'acrobatics',label:'Acrobatics'},{value:'arcana',label:'Arcana'}]}]}}];
const catalog=indexCatalog({items});

test('Order Explorer offers druid orders by tag, grants the pick and offers its own choices',()=>{
  let r=choiceSetsFor(explorer,{},catalog);
  assert.equal(r.sets.length,1);
  assert.deepEqual(r.sets[0].options.map(o=>o.label),['Animal Order','Storm Order'],'Tagged class features only');
  assert.ok(r.sets[0].itemOptions);
  assert.equal(choicesComplete(r),false);
  let choices=setChoice(explorer,{},'druidOrder',U('classfeatures','storm-order'),catalog);
  const ctx={feats:new Set(['order-explorer']),class:'druid'};
  r=choiceSetsFor(explorer,choices,catalog,ctx);
  assert.deepEqual(r.grants.map(g=>g.name),['Storm Order']);
  assert.deepEqual(r.sets.map(s=>s.flag),['druidOrder','stormSkill'],'The granted order’s own choice follows');
  assert.deepEqual(r.sets[1].options.map(o=>o.value),['athletics','nature'],'Predicates the planner can check are applied');
  assert.deepEqual(choiceSetsFor(explorer,choices,catalog,{feats:new Set(['storm-born'])}).sets[1].options.length,3);
  choices=setChoice(explorer,choices,'stormSkill','nature',catalog);
  assert.ok(choicesComplete(choiceSetsFor(explorer,choices,catalog)));
  // Switching orders drops picks that only belonged to the old one.
  choices=setChoice(explorer,choices,'druidOrder',U('classfeatures','animal-order'),catalog);
  assert.deepEqual(choices,{druidOrder:U('classfeatures','animal-order')});
  const stored=storedChoiceSets(explorer,choices,catalog);
  assert.deepEqual(stored[0].options,[{value:U('classfeatures','animal-order'),label:'Animal Order',uuid:U('classfeatures','animal-order'),type:'feat'}]);
});

test('fixed-list choices, placeholders and filters',()=>{
  const training=catalog.get(U('feats-srd','skill-training'));
  assert.deepEqual(choiceSetsFor(training,{skill:'arcana'},catalog).sets[0].value,'arcana');
  assert.equal(resolveGrantUuid('{item|flags.pf2e.rulesSelections.x}',{}),null);
  assert.equal(resolveGrantUuid('{item|flags.system.rulesSelections.x}',{x:'Compendium.a.b.Item.c'}),'Compendium.a.b.Item.c');
  const storm=catalog.get(U('classfeatures','storm-order'));
  assert.ok(matchesFilter(storm,['item:tag','druid-order']));
  assert.ok(matchesFilter(storm,{or:['item:trait:wizard','item:trait:druid']}));
  assert.ok(!matchesFilter(storm,{not:'item:tag:druid-order'}));
  assert.ok(matchesFilter(storm,{gte:['item:level',1]}));
  assert.ok(predicateMet({not:'self:effect:raging'}),'Unknown roll options never hide a choice');
  assert.ok(!predicateMet('class:wizard',{class:'druid'}));
});
