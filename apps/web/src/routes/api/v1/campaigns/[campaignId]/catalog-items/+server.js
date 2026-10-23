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
  if(!['feat','class'].includes(type))problem(400,'invalid_item_type');
  const clauses=['integration_id=?','snapshot_id=?','type=?'];
  const values=[pub.integration_id,pub.snapshot_id,type];
  if(q){clauses.push("LOWER(name) LIKE ? ESCAPE '\\'");values.push('%'+q.replace(/[\\%_]/g,v=>'\\'+v)+'%');}
  if(level!==null && level!==''){const n=Number(level);if(!Number.isInteger(n)||n<0||n>25)problem(400,'invalid_level');clauses.push('level=?');values.push(n);}
  if(rarity){clauses.push('rarity=?');values.push(rarity);}
  if(pack){clauses.push('pack=?');values.push(pack);}
  if(trait){clauses.push('EXISTS(SELECT 1 FROM json_each(traits_json) WHERE value=?)');values.push(trait);}
  const where=clauses.join(' AND ');
  const count=db().prepare('SELECT COUNT(*) AS n FROM catalog_entries WHERE '+where).get(...values).n;
  const rows=db().prepare(`SELECT uuid,name,level,rarity,traits_json,pack FROM catalog_entries
    WHERE ${where} ORDER BY level,name COLLATE NOCASE LIMIT 50 OFFSET ?`)
    .all(...values,(page-1)*50).map(row=>({...row,traits:JSON.parse(row.traits_json)}));
  return respond({items:rows,total:count,page,pageSize:50,pages:Math.ceil(count/50)});
}
