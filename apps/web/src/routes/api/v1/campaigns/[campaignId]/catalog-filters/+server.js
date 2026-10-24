import {db} from '#lib/server/db.js';
import {readPublished} from '#lib/server/catalog-import.js';
import {respond,sessionUser,requireMembership,problem} from '#lib/server/api.js';

export function GET(event){
  const user=sessionUser(event);
  requireMembership(user,event.params.campaignId);
  const pub=readPublished(event.params.campaignId);
  if(!pub)problem(404,'catalog_not_published');
  const sql=db();
  const by=(column)=>sql.prepare(`SELECT ${column} label,COUNT(*) count
    FROM catalog_entries WHERE integration_id=? AND snapshot_id=?
    GROUP BY ${column} ORDER BY COUNT(*) DESC,label`)
    .all(pub.integration_id,pub.snapshot_id);
  const feats=sql.prepare(`SELECT pack label,COUNT(*) count FROM catalog_entries
    WHERE integration_id=? AND snapshot_id=? AND type='feat'
    GROUP BY pack ORDER BY count DESC`).all(pub.integration_id,pub.snapshot_id);
  return respond({
    types:by('type'),packs:by('pack'),featPacks:feats,
    rarities:by('rarity'),
    total:pub.entry_count
  });
}
