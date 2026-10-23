import { getWorldMetadata, previewItemPack } from './snapshot.mjs';
import { openPairingDialog, pairWebsite, testWebsite, syncNow, status } from './sync.mjs';
import { PlannerConnectionMenu } from './menu.mjs';

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
  game.settings.registerMenu(MODULE_ID, 'connection', {
    name: 'Website Connection & Pairing',
    label: 'Open Pairing Dialog',
    hint: 'The only connection control: enter a URL or IP, test reachability, and pair the world.',
    icon: 'fa-solid fa-link',
    type: PlannerConnectionMenu,
    restricted: true
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
    ' — Open Configure Settings → PF2e Planner Bridge → Open Pairing Dialog.');

  if (game.users.activeGM?.id === game.user.id) {
    setTimeout(() => syncNow().catch(error => {
      if (!/not authorized|Pair this Foundry world/.test(error.message)) {
        console.warn('[PF2e Planner Bridge] Automatic preview sync not completed:', error.message);
        ui.notifications.warn('PF2e Planner: Automatic sync failed — ' + error.message);
      }
    }), 1200);
  }
});
