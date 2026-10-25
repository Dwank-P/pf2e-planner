/**
 * Local development seed: a paired campaign with the sample catalog, a GM and a
 * player, and a few characters. Never run against a real database.
 *
 *   DB_PATH=./data/dev.sqlite node scripts/seed-dev.mjs
 *
 * Dev accounts (local only): gm / planner-dev-pass, mira / planner-dev-pass
 */
import {randomUUID} from 'node:crypto';
import {rmSync} from 'node:fs';
import {all} from '../tests/fixtures/catalog.mjs';

const DEV_PASSWORD='planner-dev-pass';
process.env.DB_PATH??='./data/dev.sqlite';
if(!/dev|test|tmp/i.test(process.env.DB_PATH))throw Error('Refusing to seed a non-development DB_PATH');
for(const suffix of ['','-wal','-shm'])rmSync(process.env.DB_PATH+suffix,{force:true});

const {db,unix}=await import('../src/lib/server/db.js');
const {passwordHash}=await import('../src/lib/server/security.js');
const {emptyDocument}=await import('../src/lib/leveler-format.js');
const C=await import('../src/lib/builder/creation.js');
const sql=db(),now=unix();
const hash=await passwordHash(DEV_PASSWORD);
const gm=randomUUID(),mira=randomUUID(),campaign=randomUUID(),integration=randomUUID(),snapshot=randomUUID();

sql.prepare(`INSERT INTO users(id,display_name,username,password_hash,status,site_role,created_at)
  VALUES(?,?,?,?,'active','owner',?)`).run(gm,'Morgan (GM)','gm',hash,now);
sql.prepare(`INSERT INTO users(id,display_name,username,password_hash,status,site_role,created_at)
  VALUES(?,?,?,?,'active','user',?)`).run(mira,'Mira','mira',hash,now);
sql.prepare('INSERT INTO campaigns VALUES(?,?,?,?,?,?)').run(campaign,'Abomination Vaults',gm,'abomination-vaults','pf2e',now);
sql.prepare("INSERT INTO memberships VALUES(?,?,'gm')").run(campaign,gm);
sql.prepare("INSERT INTO memberships VALUES(?,?,'player')").run(campaign,mira);
sql.prepare('INSERT INTO integrations VALUES(?,?,?,?,?,NULL)').run(integration,campaign,'https://foundry.test','abomination-vaults',now);
const variants={freeArchetype:true,dualClass:false,ancestralParagon:false,mythic:false};
const sources={worldId:'abomination-vaults',systemId:'pf2e',systemVersion:'8.6.1',levelerVersion:'3.12.3'};
const packs=[...new Set(all.map(i=>i.pack))];
sql.prepare(`INSERT INTO catalog_publications VALUES(?,?,?,?,?,?,?,?)`)
  .run(integration,snapshot,'dev-'+snapshot,all.length,JSON.stringify(variants),JSON.stringify(packs),JSON.stringify(sources),now);
const insert=sql.prepare(`INSERT INTO catalog_entries VALUES(?,?,?,?,?,?,?,?,?,?)`);
for(const item of all)insert.run(integration,snapshot,item.uuid,item.type,item.pack,item.level,item.rarity,
  item.name,JSON.stringify(item.traits),JSON.stringify(item));

const find=(type,name)=>all.find(i=>i.type===type&&i.name===name);
function character(owner,name,level,creation,plan=null){
  const doc=emptyDocument();
  doc.leveler.creation=creation;doc.leveler.plan=plan;
  sql.prepare(`INSERT INTO character_builds VALUES(?,?,?,?,?,?,1,?,?)`)
    .run(randomUUID(),campaign,owner,name,level,JSON.stringify(doc),now,now);
}
let valeros=C.setAncestry(doc0(),find('ancestry','Human'));
valeros=C.setHeritage(valeros,find('heritage','Versatile Human'));
valeros=C.setBackground(valeros,find('background','Guard'));
valeros=C.setClass(valeros,find('class','Fighter'));
for(const [s,a,n] of [['ancestry','str',2],['ancestry','con',2],['background','str',2],['background','dex',2],
  ['class','str',1],['free','str',4],['free','dex',4],['free','con',4],['free','wis',4]])valeros=C.toggleBoost(valeros,s,a,n);
valeros=C.setFeat(valeros,'ancestry',find('feat','Natural Ambition'));
valeros=C.setFeat(valeros,'class',find('feat','Sudden Charge'));
valeros.skills=['athletics','acrobatics','survival'];
character(mira,'Valeros',4,valeros,{version:1,classSlug:'fighter',dualClassSlug:null,levels:{
  2:{classFeats:[{uuid:find('feat','Reactive Shield').uuid,name:'Reactive Shield'}]},
  3:{generalFeats:[{uuid:find('feat','Toughness').uuid,name:'Toughness'}],skillIncreases:[{skill:'athletics',toRank:2}]}}});

let ezren=C.setAncestry(doc0(),find('ancestry','Human'));
ezren=C.setHeritage(ezren,find('heritage','Skilled Human'));
ezren=C.setBackground(ezren,find('background','Scholar'));
character(mira,'Ezren',1,ezren);
character(gm,'Kyra',1,doc0());
console.log(`Seeded ${process.env.DB_PATH}: campaign ${campaign}, ${all.length} catalog items. Sign in as gm or mira.`);

function doc0(){return emptyDocument().leveler.creation;}
