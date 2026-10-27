import {db,transaction} from '#lib/server/db.js';
import {sessionUser,ownerOrGm,input,problem,respond} from '#lib/server/api.js';
import {readPublished} from '#lib/server/catalog-import.js';

/**
 * The synced packs and which the GM hid from the website. Hidden packs stay synced (unhiding
 * needs no sync) but their items leave option lists, searches and the feat browser, for this
 * campaign and for personal characters using this world. Characters keep what they already picked.
 */
function packs(campaignId){
  const pub=readPublished(campaignId);
  if(!pub)return {integrationId:null,packs:[]};
  const hidden=new Set(db().prepare('SELECT pack FROM hidden_packs WHERE integration_id=?').all(pub.integration_id).map(r=>r.pack));
  const byPack=new Map();
  for(const {pack,type,n} of db().prepare(`SELECT pack,type,COUNT(*) AS n FROM catalog_entries
    WHERE integration_id=? AND snapshot_id=? GROUP BY pack,type`).all(pub.integration_id,pub.snapshot_id)){
    const entry=byPack.get(pack)??{pack,items:0,types:{},hidden:hidden.has(pack)};
    entry.items+=n;entry.types[type]=n;
    byPack.set(pack,entry);
  }
  return {integrationId:pub.integration_id,packs:[...byPack.values()].sort((a,b)=>a.pack.localeCompare(b.pack))};
}
export function GET(event){
  ownerOrGm(sessionUser(event),event.params.campaignId);
  return respond({packs:packs(event.params.campaignId).packs});
}
/** {hidden: [pack, …]} replaces the hidden set. */
export async function PUT(event){
  ownerOrGm(sessionUser(event),event.params.campaignId);
  const body=await input(event.request,64000);
  if(!Array.isArray(body.hidden)||body.hidden.length>2000||!body.hidden.every(p=>typeof p==='string'&&p.length<=200))
    problem(400,'invalid_hidden_packs');
  const current=packs(event.params.campaignId);
  if(!current.integrationId)problem(404,'catalog_not_published');
  const known=new Set(current.packs.map(p=>p.pack));
  transaction(sql=>{
    // Packs missing from this sync (a module turned off for now) stay hidden for when they return.
    sql.prepare('DELETE FROM hidden_packs WHERE integration_id=? AND pack IN (SELECT value FROM json_each(?))')
      .run(current.integrationId,JSON.stringify([...known]));
    const add=sql.prepare('INSERT OR IGNORE INTO hidden_packs(integration_id,pack) VALUES(?,?)');
    for(const pack of body.hidden)if(known.has(pack))add.run(current.integrationId,pack);
  });
  return respond({packs:packs(event.params.campaignId).packs});
}
