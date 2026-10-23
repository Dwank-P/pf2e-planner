/** Phase 0: local read-only diagnostics; no network calls or secrets. */
function requireGM() {
  if (!globalThis.game?.user?.isGM) {
    throw new Error('PF2e Planner Bridge requires an authorized GM.');
  }
}

const LEVELER_KEYS = [
  'customCompendiums',
  'playerCompendiumAccess',
  'gmContentGuidance',
  'playerDisallowedContentMode',
  'enableDualClassSupport',
  'ancestralParagon'
];

function readLevelerSettings() {
  const result = {};
  for (const key of LEVELER_KEYS) {
    if (!game.settings?.settings?.has?.('pf2e-leveler.' + key)) continue;
    try {
      result[key] = game.settings.get('pf2e-leveler', key);
    } catch (error) {
      console.warn('[PF2e Planner Bridge] Setting read failed:', key, error);
    }
  }
  return result;
}

export function getWorldMetadata() {
  requireGM();
  const packs = [...(game.packs?.values?.() ?? [])]
    .filter((pack) => pack.documentName === 'Item')
    .map((pack) => ({
      collection: pack.collection,
      label: pack.metadata?.label ?? pack.collection,
      packageName: pack.metadata?.packageName ?? null,
      documentName: pack.documentName
    }))
    .sort((a, b) => a.collection.localeCompare(b.collection));
  const leveler = game.modules?.get('pf2e-leveler');

  return {
    format: 'pf2e-planner-world-metadata',
    version: 1,
    generatedAt: new Date().toISOString(),
    world: { id: game.world?.id ?? null, title: game.world?.title ?? null },
    system: { id: game.system?.id ?? null, version: game.system?.version ?? null },
    leveler: {
      installed: Boolean(leveler),
      active: Boolean(leveler?.active),
      version: leveler?.version ?? null,
      settings: leveler?.active ? readLevelerSettings() : {}
    },
    itemPacks: packs
  };
}

export async function previewItemPack(collection, limit = 5) {
  requireGM();
  if (typeof collection !== 'string' || !collection.trim()) {
    throw new TypeError('A compendium collection name is required.');
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new RangeError('limit must be an integer from 1 to 100.');
  }
  const pack = game.packs?.get(collection);
  if (!pack || pack.documentName !== 'Item') {
    throw new Error('Item compendium unavailable: ' + collection);
  }
  const index = await pack.getIndex({
    fields: ['type', 'system.slug', 'system.level.value', 'system.traits.rarity']
  });
  return [...index.values()].slice(0, limit).map((item) => ({
    uuid: item.uuid,
    name: item.name,
    type: item.type ?? null,
    slug: item.system?.slug ?? null,
    level: item.system?.level?.value ?? null,
    rarity: item.system?.traits?.rarity ?? null
  }));
}
