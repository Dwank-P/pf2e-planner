import { db } from './db.js';

/**
 * The report is always derived from the exact JSON persisted in SQLite, never
 * from a bridge-reported count or from hardcoded defaults.
 */
export function readCatalogReport(campaignId, includeItems = false) {
  const row = db().prepare(`
    SELECT c.snapshot_id, c.sha256, c.data_json, c.updated_at,
      i.id AS integration_id, i.world_id AS integration_world_id,
      i.foundry_origin, camp.system_id AS campaign_system_id
    FROM integrations i
    JOIN campaigns camp ON camp.id=i.campaign_id
    LEFT JOIN catalog_previews c ON c.integration_id=i.id
    WHERE i.campaign_id=? AND i.revoked_at IS NULL
  `).get(campaignId);

  if (!row || !row.data_json) {
    return {
      synced: false,
      completeness: 'No catalog snapshot received',
      message: 'The website has not stored a ruleset preview for this campaign yet.'
    };
  }

  const stored = JSON.parse(row.data_json);
  const classes = Array.isArray(stored.classes) ? stored.classes : [];
  const feats = Array.isArray(stored.feats) ? stored.feats : [];
  const sources = stored.sourceVersions && typeof stored.sourceVersions === 'object'
    ? stored.sourceVersions : {};

  const countBy = (values, select) => {
    const map = new Map();
    for (const value of values) {
      const key = String(select(value) ?? 'Unknown');
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return [...map].sort((a,b) => a[0].localeCompare(b[0], undefined, { numeric:true }))
      .map(([label,count]) => ({label,count}));
  };

  const sourcePack = item => {
    const parts=String(item.uuid ?? '').split('.');
    return parts[0] === 'Compendium' && parts.length>=3
      ? parts[1]+'.'+parts[2] : 'Unknown';
  };

  const report={
    synced: true,
    completeness: 'Limited preview — not the full ruleset',
    schemaVersion: stored.schemaVersion,
    snapshotId: row.snapshot_id,
    sha256: row.sha256,
    updatedAt: row.updated_at,
    integrationId: row.integration_id,
    ruleset: {
      systemId: sources.systemId ?? row.campaign_system_id,
      systemVersion: sources.systemVersion ?? null,
      levelerVersion: sources.levelerVersion ?? null,
      worldId: sources.worldId ?? row.integration_world_id
    },
    totals: {
      classes: classes.length,
      feats: feats.length,
      savedItems: classes.length + feats.length,
      featLimit: 1000
    },
    sources: {
      classes: countBy(classes,sourcePack),
      feats: countBy(feats,sourcePack)
    },
    featLevels: countBy(feats,item=>item.level),
    featRarities: countBy(feats,item=>item.rarity),
    limits: [
      'This is a core PF2e preview, not the full content catalogue.',
      'The Foundry bridge sends all core class metadata and only the first 1,000 feats in its compendium index.',
      'Feat entries contain metadata (UUID, name, level, rarity and slug), not descriptions, prerequisites or rule elements.',
      'No spells, ancestries, heritages, equipment, third-party packs, complete world settings or actor data are included yet.'
    ],
    note: typeof sources.note === 'string' ? sources.note : null
  };
  if (includeItems) {
    report.classes=classes;
    report.feats=feats;
    // This is an authenticated GM dashboard, not a public endpoint.
  }
  return report;
}
