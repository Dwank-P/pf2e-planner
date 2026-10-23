import { getWorldMetadata, previewItemPack } from './snapshot.mjs';

Hooks.once('ready', () => {
  const supported = ['pf2e', 'sf2e'].includes(game.system?.id);
  if (!game.user?.isGM || !supported) return;

  // GM-local read-only diagnostics; not network synchronization.
  globalThis.PF2ePlannerBridge = Object.freeze({
    getWorldMetadata,
    previewItemPack
  });
  console.info('[PF2e Planner Bridge] GM diagnostics: PF2ePlannerBridge');
});
