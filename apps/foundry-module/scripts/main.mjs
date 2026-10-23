import { getWorldMetadata, previewItemPack } from './snapshot.mjs';
import { openPairingDialog, pairWebsite, syncNow, status } from './sync.mjs';

const MODULE_ID='pf2e-planner-bridge';
Hooks.once('init',()=>{
  game.settings.register(MODULE_ID,'websiteUrl',{
    name:'Planner Website URL',hint:'Non-secret website origin. Pair using the button in Game Settings.',
    scope:'world',config:true,type:String,default:''
  });
  game.settings.register(MODULE_ID,'integrationId',{
    name:'Planner Integration ID',hint:'Non-secret site campaign binding.',
    scope:'world',config:false,type:String,default:''
  });
});
Hooks.once('ready',()=>{
  if (!game.user?.isGM || !['pf2e','sf2e'].includes(game.system?.id)) return;
  globalThis.PF2ePlannerBridge=Object.freeze({
    getWorldMetadata,previewItemPack,openPairingDialog,pairWebsite,syncNow,status
  });
  console.info('[PF2e Planner Bridge] Ready. Use PF2ePlannerBridge.openPairingDialog() or Sync Now.');
  // Existing authorized, elected GM browser performs a bounded preview sync.
  if (game.users.activeGM?.id===game.user.id) {
    setTimeout(()=>syncNow().catch((e)=>{
      // Not paired yet is expected. Keep errors out of player clients and redact secrets.
      if (!/not authorized|Pair this Foundry world/.test(e.message)) {
        console.warn('[PF2e Planner Bridge] Auto sync not completed:',e.message);
      }
    }),1200);
  }
});
Hooks.on('renderSettings',(app,html)=>{
  if (!game.user?.isGM) return;
  const root=html instanceof HTMLElement ? html : html?.[0];
  const target=root?.querySelector?.('#settings-game') ?? root?.querySelector?.('#settings');
  if (!target || target.querySelector('#pf2e-planner-connect')) return;
  const button=document.createElement('button');
  button.id='pf2e-planner-connect';
  button.type='button';
  button.textContent='PF2e Planner — Pair / Sync';
  button.addEventListener('click',async()=>{
    try {
      if (!game.settings.get(MODULE_ID,'integrationId')) await openPairingDialog();
      else await syncNow();
    } catch(e){ui.notifications.error('PF2e Planner: '+e.message);}
  });
  target.append(button);
});
