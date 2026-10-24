import {db} from '#lib/server/db.js';
import {readPublished} from '#lib/server/catalog-import.js';
import {respond,sessionUser,requireMembership,problem} from '#lib/server/api.js';
export function GET(event){
  const user=sessionUser(event);
  requireMembership(user,event.params.campaignId);
  const pub=readPublished(event.params.campaignId);
  if(!pub)problem(404,'catalog_not_published');
  const q=(event.url.searchParams.get('q')||'').trim().toLowerCase().slice(0,100);
  const level=event.url.searchParams.get('level');
  const rarity=event.url.searchParams.get('rarity');
  const type=event.url.searchParams.get('type')||'feat';
  const pack=event.url.searchParams.get('pack')||'';
  const trait=(event.url.searchParams.get('trait')||'').trim().toLowerCase().slice(0,80);
  const page=Math.max(1,Math.min(10000,Number.parseInt(event.url.searchParams.get('page')||'1',10)||1));
  if(!/^[a-z][a-zA-Z0-9-]{0,39}$/.test(type))problem(400,'invalid_item_type');
  const clauses=['integration_id=?','snapshot_id=?','type=?'];
  const values=[pub.integration_id,pub.snapshot_id,type];
  if(q){clauses.push("(LOWER(name) LIKE ? ESCAPE '\\' OR LOWER(json_extract(item_json,'$.metadata.slug')) LIKE ? ESCAPE '\\')");const term='%'+q.replace(/[\\%_]/g,v=>'\\'+v)+'%';values.push(term,term);}
  if(level!==null && level!==''){const n=Number(level);if(!Number.isInteger(n)||n<0||n>25)problem(400,'invalid_level');clauses.push('level=?');values.push(n);}
  const maxLevel=event.url.searchParams.get('maxLevel');
  if(maxLevel!==null&&maxLevel!==''){
    const n=Number(maxLevel);
    if(!Number.isInteger(n)||n<1||n>20)problem(400,'invalid_max_level');
    clauses.push('(level IS NULL OR level<=?)');values.push(n);
  }
  if(rarity){clauses.push('rarity=?');values.push(rarity);}
  if(pack){clauses.push('pack=?');values.push(pack);}
  const featType=event.url.searchParams.get('featType')||'';
  if(featType){clauses.push("json_extract(item_json,'$.metadata.featType')=?");values.push(featType);}
  if(trait){clauses.push('EXISTS(SELECT 1 FROM json_each(traits_json) WHERE value=?)');values.push(trait);}

  const ancestryUuid=event.url.searchParams.get('ancestryUuid')||'';
  const ancestrySlug=event.url.searchParams.get('ancestrySlug')||'';
  if(type==='heritage'&&ancestryUuid){
    if(!/^Compendium\.[\w-]+\.[\w-]+\.Item\.[\w-]+$/.test(ancestryUuid))
      problem(400,'invalid_ancestry_reference');
    const showAll=event.url.searchParams.get('showAll')==='true';
    if(!showAll){
      clauses.push(`(json_extract(item_json,'$.metadata.ancestryUuid')=?
        OR json_extract(item_json,'$.metadata.ancestrySlug')=?
        OR json_extract(item_json,'$.metadata.versatile')=1
        OR (json_extract(item_json,'$.metadata.ancestryUuid') IS NULL
           AND json_extract(item_json,'$.metadata.ancestrySlug') IS NULL))`);
      values.push(ancestryUuid,ancestrySlug.slice(0,100));
    }
  }
  const bgBoosts=event.url.searchParams.get('bgBoosts')||'';
  if(type==='background'&&bgBoosts){
    const boosts=bgBoosts.split(',').filter(Boolean);
    if(!boosts.length||!boosts.every(x=>/^(str|dex|con|int|wis|cha)$/.test(x)))
      problem(400,'invalid_background_boosts');
    clauses.push(`EXISTS(
       SELECT 1 FROM json_each(item_json,'$.metadata.boostChoices') bg_group
       JOIN json_each(bg_group.value) boost ON 1=1
       WHERE json_array_length(bg_group.value)<6 AND boost.value IN (${boosts.map(()=>'?').join(',')})
    )`);
    values.push(...boosts);
  }
  const bgSkill=(event.url.searchParams.get('bgSkill')||'').trim().toLowerCase().slice(0,50);
  if(type==='background'&&bgSkill){
    clauses.push(`(EXISTS(SELECT 1 FROM json_each(item_json,'$.metadata.trainedSkills')
      WHERE LOWER(value) LIKE ?)
      OR EXISTS(SELECT 1 FROM json_each(item_json,'$.metadata.loreSkills')
      WHERE LOWER(value) LIKE ?))`);
    values.push('%'+bgSkill+'%','%'+bgSkill+'%');
  }
  const bgFeat=(event.url.searchParams.get('bgFeat')||'').trim().toLowerCase().slice(0,65);
  if(type==='background'&&bgFeat){
    clauses.push(`EXISTS(SELECT 1 FROM json_each(item_json,'$.metadata.grantedFeats')
      WHERE LOWER(value) LIKE ?)`);
    values.push('%'+bgFeat+'%');
  }
  const tradition=event.url.searchParams.get('tradition')||'';
  if(type==='spell'&&tradition){
    if(!/^(arcane|divine|primal|occult)$/.test(tradition))problem(400,'invalid_spell_tradition');
    clauses.push(`EXISTS(SELECT 1 FROM json_each(item_json,'$.metadata.spellTraditions')
      WHERE value=?)`);
    values.push(tradition);
  }
  const spellRank=event.url.searchParams.get('spellRank');
  if(type==='spell'&&spellRank!==null){
    const n=Number(spellRank);
    if(!Number.isInteger(n)||n<0||n>10)problem(400,'invalid_spell_rank');
    if(n===0)clauses.push("EXISTS(SELECT 1 FROM json_each(traits_json) WHERE value='cantrip')");
    else {clauses.push('level=?');values.push(n);
      clauses.push("NOT EXISTS(SELECT 1 FROM json_each(traits_json) WHERE value='cantrip')");}
  }
  const maxRank=event.url.searchParams.get('maxRank');
  if(type==='spell'&&maxRank!==null){
    const n=Number(maxRank);
    if(!Number.isInteger(n)||n<0||n>10)problem(400,'invalid_spell_rank');
    clauses.push('(level<=? OR EXISTS(SELECT 1 FROM json_each(traits_json) WHERE value=\'cantrip\'))');
    values.push(n);
  }
  const classTrait=event.url.searchParams.get('classTrait')||'';
  if(classTrait && !/^[a-z][a-z0-9-]{0,60}$/.test(classTrait))problem(400,'invalid_class_trait');

  const where=clauses.join(' AND ');
  const count=db().prepare('SELECT COUNT(*) AS n FROM catalog_entries WHERE '+where).get(...values).n;
  // Where possible, list relevant class/ancestry feats ahead of unrelated
  // options without hiding those others; they remain selectable with warnings.
  const sort=`ORDER BY ${classTrait&&type==='feat'?
    `CASE WHEN EXISTS(SELECT 1 FROM json_each(traits_json) WHERE value='${classTrait}') THEN 0 ELSE 1 END,`:
    ''} level,name COLLATE NOCASE`;
  const rows=db().prepare(`SELECT uuid,name,level,rarity,traits_json,pack,item_json
    FROM catalog_entries WHERE ${where} ${sort} LIMIT 50 OFFSET ?`)
    .all(...values,(page-1)*50).map(row=>{
      const item=JSON.parse(row.item_json);
      return {uuid:row.uuid,name:row.name,level:row.level,rarity:row.rarity,
        pack:row.pack,traits:JSON.parse(row.traits_json),metadata:item.metadata};
    });
  return respond({items:rows,total:count,page,pageSize:50,pages:Math.ceil(count/50)});
}
