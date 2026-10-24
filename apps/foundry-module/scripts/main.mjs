import { getWorldMetadata, previewItemPack } from './snapshot.mjs';
import { openPairingDialog, pairWebsite, testWebsite, syncNow, status } from './sync.mjs';
import { PlannerConnectionMenu, PlannerSyncMenu, PlannerPackMenu } from './menu.mjs';

const MODULE_ID = 'pf2e-planner-bridge';

Hooks.once('init', () => {
  game.settings.register(MODULE_ID, 'websiteUrl', {
    name: 'Planner Website URL',
    hint: 'Non-secret connection address, managed through the pairing dialog.',
    scope: 'world', config: false, type: String, default: ''
  });
  game.settings.register(MODULE_ID, 'integrationId', {
    name: 'Planner Integration ID',
    hint: 'Non-secret campaign binding.',
    scope: 'world', config: false, type: String, default: ''
  });
  game.settings.register(MODULE_ID, 'syncedPacks', {
    name: 'Selected additional compendium packs',
    hint: 'Selected Item pack collections; managed under Select Compendium Collections.',
    scope:'world',config:false,type:String,default:'[]'
  });
  game.settings.registerMenu(MODULE_ID, 'connection', {
    name: 'Pair World',
    label: 'Pair World',
    hint: 'Enter a website URL and one-time pairing code; tests stay open.',
    icon: 'fa-solid fa-link',
    type: PlannerConnectionMenu,
    restricted: true
  });
  game.settings.registerMenu(MODULE_ID, 'sync', {
    name:'Sync Now', label:'Sync Now',
    hint:'Manually import saved selected compendium collections without pairing again.',
    icon:'fa-solid fa-arrows-rotate',
    type:PlannerSyncMenu, restricted:true
  });
  game.settings.registerMenu(MODULE_ID, 'packs', {
    name:'Select Compendiums',label:'Select Compendium Collections',
    hint:'Search and select whole Foundry content collections. Official PF2e is included.',
    icon:'fa-solid fa-book-open',type:PlannerPackMenu,restricted:true
  });
});

Hooks.once('ready', () => {
  if (!game.user?.isGM || !['pf2e','sf2e'].includes(game.system?.id)) return;
  globalThis.PF2ePlannerBridge = Object.freeze({
    getWorldMetadata, previewItemPack, openPairingDialog,
    pairWebsite, testWebsite, syncNow, status
  });
  console.info('[PF2e Planner Bridge] v' +
    game.modules.get(MODULE_ID)?.version +
    ' — Open Configure Settings → PF2e Planner Bridge → Pair World / Select Compendiums / Sync Now.');

  if (game.users.activeGM?.id === game.user.id) {
    setTimeout(() => syncNow({auto:true}).catch(error => {
      if (!/not authorized|Pair this Foundry world/.test(error.message)) {
        console.warn('[PF2e Planner Bridge] Automatic catalog sync not completed:', error.message);
        ui.notifications.warn('PF2e Planner: Automatic sync failed — ' + error.message);
      }
    }), 1200);
  }
});
