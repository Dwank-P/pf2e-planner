/**
 * A small SRD-like D&D 5e (2014 + 2024) catalog in the published-entry shape, for the dev seed
 * and tests: advancement data as the 5e Bridge exports it.
 */
const pack={class:'dnd5e.classes',subclass:'dnd5e.subclasses',race:'dnd5e.races',background:'dnd5e.backgrounds',
  feat:'dnd5e.feats',spell:'dnd5e.spells',weapon:'dnd5e.items',equipment:'dnd5e.items',consumable:'dnd5e.items'};
export const uuid=(type,id)=>'Compendium.'+pack[type]+'.Item.'+id.padEnd(16,'0').slice(0,16);
function entry(type,id,name,metadata={},extra={}){
  return {uuid:uuid(type,id),name,type,level:metadata.level??null,rarity:'common',traits:metadata.properties??[],img:null,
    description:'<p>'+name+' (development sample).</p>',pack:pack[type],metadata:{identifier:id,publication:'SRD 5.1',...metadata},...extra};
}
const feature=(id,name,extra={})=>entry('feat',id,name,{featType:'class',...extra});
const skillPool=keys=>keys.map(k=>'skills:'+k);
export const dnd5eVariants={system:'dnd5e',rulesVersion:'legacy',allowFeats:true,honorScore:false,sanityScore:false,
  abilities:{str:{label:'Strength'},dex:{label:'Dexterity'},con:{label:'Constitution'},int:{label:'Intelligence'},wis:{label:'Wisdom'},cha:{label:'Charisma'}},
  skills:Object.fromEntries([['acr','Acrobatics','dex'],['ani','Animal Handling','wis'],['arc','Arcana','int'],['ath','Athletics','str'],
    ['dec','Deception','cha'],['his','History','int'],['ins','Insight','wis'],['itm','Intimidation','cha'],['inv','Investigation','int'],
    ['med','Medicine','wis'],['nat','Nature','int'],['prc','Perception','wis'],['prf','Performance','cha'],['per','Persuasion','cha'],
    ['rel','Religion','int'],['slt','Sleight of Hand','dex'],['ste','Stealth','dex'],['sur','Survival','wis']].map(([k,label,ability])=>[k,{label,ability}])),
  traits:{
    languages:{'languages:standard':{label:'Standard',group:true},'languages:standard:common':{label:'Common'},'languages:standard:dwarvish':{label:'Dwarvish'},
      'languages:standard:elvish':{label:'Elvish'},'languages:standard:giant':{label:'Giant'},'languages:standard:gnomish':{label:'Gnomish'},
      'languages:standard:halfling':{label:'Halfling'},'languages:standard:orc':{label:'Orc'},'languages:exotic':{label:'Exotic',group:true},
      'languages:exotic:draconic':{label:'Draconic'},'languages:exotic:infernal':{label:'Infernal'}},
    tool:{'tool:thief':{label:'Thieves’ Tools'},'tool:art':{label:'Artisan’s Tools',group:true},'tool:art:smith':{label:'Smith’s Tools'},'tool:art:alchemist':{label:'Alchemist’s Supplies'}},
    armor:{'armor:lgt':{label:'Light Armor'},'armor:med':{label:'Medium Armor'},'armor:hvy':{label:'Heavy Armor'},'armor:shl':{label:'Shields'}},
    weapon:{'weapon:sim':{label:'Simple Weapons'},'weapon:mar':{label:'Martial Weapons'}},
    saves:{'saves:str':{label:'Strength'},'saves:dex':{label:'Dexterity'},'saves:con':{label:'Constitution'},'saves:int':{label:'Intelligence'},'saves:wis':{label:'Wisdom'},'saves:cha':{label:'Charisma'}}}};
const asi=levels=>levels.map(l=>({_id:'asi'+l,type:'AbilityScoreImprovement',level:l,title:'Ability Score Improvement',configuration:{points:2,cap:2}}));

export const dnd5eCatalog=[
  entry('class','fighter','Fighter',{hitDie:'d10',spellcasting:{progression:'none'},primaryAbility:{value:['str','dex'],all:false},advancement:[
    {_id:'hp',type:'HitPoints',configuration:{}},
    {_id:'saves',type:'Trait',level:1,title:'Saving Throws',classRestriction:'primary',configuration:{grants:['saves:str','saves:con']}},
    {_id:'skills',type:'Trait',level:1,title:'Skills',classRestriction:'primary',configuration:{choices:[{count:2,pool:skillPool(['acr','ani','ath','his','ins','itm','prc','sur'])}]}},
    {_id:'armor',type:'Trait',level:1,title:'Armor & Weapons',classRestriction:'primary',configuration:{grants:['armor:lgt','armor:med','armor:hvy','armor:shl','weapon:sim','weapon:mar']}},
    {_id:'mc',type:'Trait',level:1,title:'Multiclass proficiencies',classRestriction:'secondary',configuration:{grants:['armor:lgt','armor:med','armor:shl','weapon:sim','weapon:mar']}},
    {_id:'f1',type:'ItemGrant',level:1,title:'Features',configuration:{items:[{uuid:uuid('feat','second-wind')}]}},
    {_id:'style',type:'ItemChoice',title:'Fighting Style',configuration:{choices:{1:{count:1}},pool:[{uuid:uuid('feat','style-defense')},{uuid:uuid('feat','style-dueling')},{uuid:uuid('feat','style-archery')}]}},
    {_id:'f2',type:'ItemGrant',level:2,title:'Features',configuration:{items:[{uuid:uuid('feat','action-surge')}]}},
    {_id:'sub',type:'Subclass',level:3,title:'Martial Archetype',configuration:{}},
    {_id:'f5',type:'ItemGrant',level:5,title:'Features',configuration:{items:[{uuid:uuid('feat','extra-attack')}]}},
    ...asi([4,6,8,12,14,16,19]),
    {_id:'surge',type:'ScaleValue',title:'Action Surge',configuration:{identifier:'action-surge',type:'number',scale:{2:{value:1},17:{value:2}}}}]}),
  entry('class','wizard','Wizard',{hitDie:'d6',spellcasting:{progression:'full',ability:'int'},primaryAbility:{value:['int'],all:true},advancement:[
    {_id:'hp',type:'HitPoints',configuration:{}},
    {_id:'saves',type:'Trait',level:1,title:'Saving Throws',classRestriction:'primary',configuration:{grants:['saves:int','saves:wis']}},
    {_id:'skills',type:'Trait',level:1,title:'Skills',classRestriction:'primary',configuration:{choices:[{count:2,pool:skillPool(['arc','his','ins','inv','med','rel'])}]}},
    {_id:'f1',type:'ItemGrant',level:1,title:'Features',configuration:{items:[{uuid:uuid('feat','arcane-recovery')}]}},
    {_id:'sub',type:'Subclass',level:2,title:'Arcane Tradition',configuration:{}},
    ...asi([4,8,12,16,19]),
    {_id:'cantrips',type:'ScaleValue',title:'Cantrips Known',configuration:{identifier:'cantrips-known',type:'number',scale:{1:{value:3},4:{value:4},10:{value:5}}}}]}),
  entry('class','rogue','Rogue',{hitDie:'d8',spellcasting:{progression:'none'},primaryAbility:{value:['dex'],all:true},advancement:[
    {_id:'hp',type:'HitPoints',configuration:{}},
    {_id:'saves',type:'Trait',level:1,title:'Saving Throws',classRestriction:'primary',configuration:{grants:['saves:dex','saves:int']}},
    {_id:'skills',type:'Trait',level:1,title:'Skills',classRestriction:'primary',configuration:{choices:[{count:4,pool:skillPool(['acr','ath','dec','ins','itm','inv','prc','prf','per','slt','ste'])}]}},
    {_id:'mcskill',type:'Trait',level:1,title:'Multiclass skill',classRestriction:'secondary',configuration:{grants:['armor:lgt','tool:thief'],choices:[{count:1,pool:skillPool(['acr','ath','dec','ins','itm','inv','prc','prf','per','slt','ste'])}]}},
    {_id:'tools',type:'Trait',level:1,title:'Tools',classRestriction:'primary',configuration:{grants:['tool:thief','armor:lgt','weapon:sim']}},
    {_id:'exp1',type:'Trait',level:1,title:'Expertise',configuration:{mode:'expertise',choices:[{count:2,pool:['skills:*','tool:thief']}]}},
    {_id:'f1',type:'ItemGrant',level:1,title:'Features',configuration:{items:[{uuid:uuid('feat','sneak-attack')}]}},
    {_id:'sub',type:'Subclass',level:3,title:'Roguish Archetype',configuration:{}},
    ...asi([4,8,10,12,16,19]),
    {_id:'sneak',type:'ScaleValue',title:'Sneak Attack',configuration:{identifier:'sneak-attack',type:'dice',scale:{1:{number:1,faces:6},3:{number:2,faces:6},5:{number:3,faces:6},7:{number:4,faces:6}}}}]}),
  entry('subclass','champion','Champion',{classIdentifier:'fighter',advancement:[
    {_id:'crit',type:'ItemGrant',level:3,title:'Features',configuration:{items:[{uuid:uuid('feat','improved-critical')}]}}]}),
  entry('subclass','eldritch-knight','Eldritch Knight',{classIdentifier:'fighter',spellcasting:{progression:'third',ability:'int'}}),
  entry('subclass','evocation','School of Evocation',{classIdentifier:'wizard'}),
  entry('subclass','thief','Thief',{classIdentifier:'rogue'}),
  entry('race','human','Human',{advancement:[{_id:'asi',type:'AbilityScoreImprovement',level:0,title:'Ability Score Increase',configuration:{fixed:{str:1,dex:1,con:1,int:1,wis:1,cha:1},points:0}},
    {_id:'lang',type:'Trait',level:0,title:'Languages',configuration:{grants:['languages:standard:common'],choices:[{count:1,pool:['languages:standard:*','languages:exotic:*']}]}}]}),
  entry('race','high-elf','High Elf',{advancement:[{_id:'asi',type:'AbilityScoreImprovement',level:0,title:'Ability Score Increase',configuration:{fixed:{dex:2,int:1},points:0}},
    {_id:'skill',type:'Trait',level:0,title:'Keen Senses',configuration:{grants:['skills:prc']}},
    {_id:'lang',type:'Trait',level:0,title:'Languages',configuration:{grants:['languages:standard:common','languages:standard:elvish'],choices:[{count:1,pool:['languages:standard:*']}]}},
    {_id:'cantrip',type:'ItemChoice',title:'Cantrip',configuration:{type:'spell',choices:{0:{count:1}},pool:[],restriction:{type:'spell',level:'0',list:['class:wizard']}}}]}),
  entry('race','half-elf','Half-Elf',{advancement:[{_id:'asi',type:'AbilityScoreImprovement',level:0,title:'Ability Score Increase',configuration:{fixed:{cha:2},points:2,cap:1,locked:['cha']}},
    {_id:'skills',type:'Trait',level:0,title:'Skill Versatility',configuration:{choices:[{count:2,pool:['skills:*']}]}}]}),
  entry('background','acolyte','Acolyte',{advancement:[{_id:'sk',type:'Trait',level:0,title:'Skills',configuration:{grants:['skills:ins','skills:rel']}},
    {_id:'lang',type:'Trait',level:0,title:'Languages',configuration:{choices:[{count:2,pool:['languages:*']}]}}]}),
  entry('background','sage','Sage',{advancement:[{_id:'sk',type:'Trait',level:0,title:'Skills',configuration:{grants:['skills:arc','skills:his']}}]}),
  entry('background','soldier','Soldier (2024)',{edition:'2024',advancement:[
    {_id:'asi',type:'AbilityScoreImprovement',level:0,title:'Ability Scores',configuration:{points:3,cap:2,locked:['dex','int','wis','cha']}},
    {_id:'feat',type:'ItemGrant',level:0,title:'Origin Feat',configuration:{items:[{uuid:uuid('feat','savage-attacker')}]}}]}),
  feature('second-wind','Second Wind'),feature('action-surge','Action Surge'),feature('extra-attack','Extra Attack'),
  feature('improved-critical','Improved Critical'),feature('arcane-recovery','Arcane Recovery'),feature('sneak-attack','Sneak Attack'),
  feature('style-defense','Fighting Style: Defense'),feature('style-dueling','Fighting Style: Dueling'),feature('style-archery','Fighting Style: Archery'),
  entry('feat','alert','Alert',{featType:'feat'}),entry('feat','grappler','Grappler',{featType:'feat',requirements:'Strength 13'}),
  entry('feat','tough','Tough',{featType:'feat'}),entry('feat','war-caster','War Caster',{featType:'feat',requirements:'Spellcasting'}),
  entry('feat','skilled','Skilled',{featType:'feat',advancement:[{_id:'sk',type:'Trait',level:0,title:'Skilled',configuration:{choices:[{count:3,pool:['skills:*']}]}}]}),
  entry('feat','savage-attacker','Savage Attacker',{featType:'feat',featSubtype:'origin',edition:'2024'}),
  entry('feat','resilient','Resilient',{featType:'feat',advancement:[{_id:'asi',type:'AbilityScoreImprovement',level:0,title:'Ability Score Increase',configuration:{points:1,cap:1}}]}),
  ...[['fire-bolt','Fire Bolt',0,'evo',['wizard','sorcerer']],['mage-hand','Mage Hand',0,'con',['wizard','sorcerer','bard','warlock']],
    ['light','Light',0,'evo',['wizard','cleric','bard','sorcerer']],['magic-missile','Magic Missile',1,'evo',['wizard','sorcerer']],
    ['shield','Shield',1,'abj',['wizard','sorcerer']],['cure-wounds','Cure Wounds',1,'evo',['cleric','druid','bard']],
    ['misty-step','Misty Step',2,'con',['wizard','sorcerer','warlock']],['fireball','Fireball',3,'evo',['wizard','sorcerer']],
    ['counterspell','Counterspell',3,'abj',['wizard','sorcerer','warlock']]]
    .map(([id,name,level,school,lists])=>entry('spell',id,name,{level,school,spellLists:lists.map(l=>'class:'+l)},{level})),
  entry('weapon','longsword','Longsword',{price:{value:15,denomination:'gp'},itemType:'martialM'}),
  entry('equipment','chain-mail','Chain Mail',{price:{value:75,denomination:'gp'},itemType:'heavy',armor:{value:16,dex:0,type:'heavy',magicalBonus:0}}),
  entry('equipment','studded-leather','Studded Leather',{price:{value:45,denomination:'gp'},itemType:'light',armor:{value:12,dex:null,type:'light',magicalBonus:0}}),
  entry('equipment','shield','Shield',{price:{value:10,denomination:'gp'},itemType:'shield',armor:{value:2,dex:null,type:'shield',magicalBonus:0}}),
  entry('consumable','healing-potion','Potion of Healing',{price:{value:50,denomination:'gp'},itemType:'potion'})
];
