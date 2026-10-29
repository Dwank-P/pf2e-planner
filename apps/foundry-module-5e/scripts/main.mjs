import {MODULE_ID,syncNow,status,notify,pairWebsite,testWebsite} from './sync.mjs';
import {PairMenu,SyncMenu,PackMenu} from './menu.mjs';

Hooks.once('init',()=>{
  game.settings.register(MODULE_ID,'websiteUrl',{name:'Planner website',scope:'world',config:false,type:String,default:''});
  game.settings.register(MODULE_ID,'integrationId',{name:'Planner integration',scope:'world',config:false,type:String,default:''});
  game.settings.register(MODULE_ID,'excludedPacks',{name:'Compendiums not synced',scope:'world',config:false,type:String,default:'[]'});
  game.settings.registerMenu(MODULE_ID,'pair',{name:'Pair World',label:'Pair World',icon:'fa-solid fa-link',
    hint:'Connect this world to the planner website with a one-time pairing code.',type:PairMenu,restricted:true});
  game.settings.registerMenu(MODULE_ID,'sync',{name:'Sync Now',label:'Sync Now',icon:'fa-solid fa-arrows-rotate',
    hint:'Send every installed Item compendium (and the world\'s rules settings) to the website.',type:SyncMenu,restricted:true});
  game.settings.registerMenu(MODULE_ID,'packs',{name:'Choose compendiums',label:'Choose compendiums',icon:'fa-solid fa-list-check',
    hint:'All installed Item compendiums are synced; untick any to leave out.',type:PackMenu,restricted:true});
});

Hooks.once('ready',()=>{
  if(!game.user?.isGM||game.system?.id!=='dnd5e')return;
  globalThis.PlannerBridge5e=Object.freeze({syncNow,status,pairWebsite,testWebsite});
  console.info('[Planner Bridge 5e] v'+game.modules.get(MODULE_ID)?.version+' — Settings → Planner Bridge (D&D 5e) → Pair World / Sync Now.');
  // The active GM syncs on login once paired; failures only show for real errors.
  if(game.users.activeGM?.id===game.user.id&&game.settings.get(MODULE_ID,'integrationId')){
    setTimeout(()=>syncNow().catch(error=>{
      console.warn('[Planner Bridge 5e] Automatic sync not completed:',error.message);
      if(!/needs a fresh pairing code|Pair this world/.test(error.message))notify('error','Sync failed — '+error.message);
    }),1500);
  }
});
