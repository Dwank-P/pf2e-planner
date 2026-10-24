import test from 'node:test';
import assert from 'node:assert/strict';
import {checkHeritage,checkFeat,rankChoices,backgroundMatches,isSpellAvailable}
  from '../src/lib/eligibility.js';
const ancestry={uuid:'Compendium.pf2e.ancestries.Item.Anadi',name:'Anadi',metadata:{slug:'anadi'}};
const heritage={name:'Abyssal Merfolk',metadata:{ancestrySlug:'merfolk',ancestryUuid:'Compendium.pf2e.ancestries.Item.Merfolk'}};
test('heritages must match selected ancestry, but versatile heritage is allowed',()=>{
  assert.equal(checkHeritage(heritage,ancestry).severity,2);
  assert.equal(checkHeritage({name:'Adaptive Anadi',metadata:{ancestryUuid:ancestry.uuid}},ancestry).severity,0);
  assert.equal(checkHeritage({name:'Aiuvarin',metadata:{ancestrySlug:null,versatile:true}},ancestry).severity,0);
});
test('Bard class feat is preferred, fighter feat flagged, unknown prerequisites warned',()=>{
  const bard={name:'Bard',metadata:{slug:'bard'}};
  const feats=[
    {name:'Power Attack',type:'feat',level:1,traits:['fighter'],
      metadata:{featType:'class',prerequisites:[]}},
    {name:'Versatile Performance',type:'feat',level:1,traits:['bard'],
      metadata:{featType:'class',prerequisites:[]}},
    {name:'Bardic Lore',type:'feat',level:1,traits:['bard'],
      metadata:{featType:'class',prerequisites:['enigma muse']}}
  ];
  const ctx={classItem:bard,slotKind:'class',slotLevel:2};
  assert.equal(checkFeat(feats[0],ctx).severity,2);
  assert.equal(checkFeat(feats[2],ctx).severity,1);
  const ranked=rankChoices(feats,ctx);
  assert.deepEqual(ranked.map(x=>x.name),['Versatile Performance','Bardic Lore','Power Attack']);
});
test('background boost selection is OR across constrained choices, excluding free boosts',()=>{
  const bg={metadata:{boostChoices:[['str','con'],['str','dex','con','int','wis','cha']],
    trainedSkills:['athletics'],grantedFeats:['Hefty Hauler']}};
  assert.equal(backgroundMatches(bg,{abilities:['str']}),true);
  assert.equal(backgroundMatches(bg,{abilities:['con']}),true);
  assert.equal(backgroundMatches(bg,{abilities:['str','wis']}),true);
  assert.equal(backgroundMatches(bg,{abilities:['wis']}),false);
  assert.equal(backgroundMatches(bg,{skill:'athletics',feat:'Hefty'}),true);
  assert.equal(backgroundMatches(bg,{skill:'occultism'}),false);
});
test('Bard occult repertoire excludes spells of other traditions or excessive rank',()=>{
  const occult={name:'Soothe',level:1,traits:[],metadata:{spellTraditions:['occult'],spellRank:1}};
  const arcane={name:'Magic Missile',level:1,traits:[],metadata:{spellTraditions:['arcane'],spellRank:1}};
  assert.equal(isSpellAvailable(occult,'occult',1).severity,0);
  assert.equal(isSpellAvailable(arcane,'occult',1).severity,2);
  assert.equal(isSpellAvailable(occult,'occult',0).severity,2);
});
