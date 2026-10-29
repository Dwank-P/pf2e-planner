import {MODULE_ID,pairWebsite,testWebsite,syncNow} from './sync.mjs';
import {normalizeWebsiteUrl} from './url.mjs';

const escapeText=value=>String(value??'').replaceAll('&','&amp;').replaceAll('"','&quot;')
  .replaceAll('<','&lt;').replaceAll('>','&gt;');
function fail(scope,error){
  const message=error?.message??String(error);
  const status=scope?.querySelector('.planner-status');
  if(status)status.textContent=message;
  ui.notifications.error('Planner (5e): '+message);
}

/** Pair this world with the planner website (website URL + one-time GM code). */
export class PairMenu extends foundry.applications.api.DialogV2 {
  constructor(options={}){
    super({...options,window:{...options.window,title:'Planner (D&D 5e) — Pair World'},
      content:`<div class="planner-pair-form">
        <p>Enter your planner website and a pairing code from it (campaign menu → <i>+ Add a world</i>).</p>
        <div class="form-group"><label>Website domain or IP address</label>
          <input name="website" type="text" inputmode="url" placeholder="level-plan.mydomain.com"
            value="${escapeText(game.settings.get(MODULE_ID,'websiteUrl')||'')}"/></div>
        <div class="form-group"><label>One-time pairing code</label>
          <input name="code" type="text" autocomplete="off" spellcheck="false"/></div>
        <div style="display:flex;gap:8px"><button type="button" class="planner-test">Test website</button>
          <button type="button" class="planner-pair">Pair world</button></div>
        <p class="hint planner-status" role="status" aria-live="polite"></p></div>`,
      rejectClose:false,buttons:[{action:'close',label:'Close'}]});
  }
  async _onRender(context,options){
    await super._onRender(context,options);
    const scope=this.element?.querySelector('.planner-pair-form');
    if(!scope)return;
    const status=scope.querySelector('.planner-status');
    const url=()=>{const input=scope.querySelector('input[name="website"]');input.value=normalizeWebsiteUrl(input.value||'');return input.value;};
    scope.querySelector('.planner-test').addEventListener('click',async()=>{
      try{status.textContent='Checking…';const r=await testWebsite(url());status.textContent='Connected (v'+(r.version??'?')+').';}
      catch(e){fail(scope,e);}
    });
    scope.querySelector('.planner-pair').addEventListener('click',async()=>{
      try{
        const code=String(scope.querySelector('input[name="code"]').value||'').trim();
        if(!/^[A-Za-z0-9_-]{40,70}$/.test(code))throw Error('Enter a valid one-time code.');
        status.textContent='Pairing…';
        await pairWebsite(url(),code);
        await this.close();
      }catch(e){fail(scope,e);}
    });
  }
}

/**
 * Settings → Sync Now. Starts a sync without opening a window: progress, results and errors
 * arrive as notifications (and a second click while one runs says so).
 */
export class SyncMenu extends foundry.applications.api.ApplicationV2 {
  async render(){
    syncNow().catch(e=>ui.notifications.error('Planner (5e): '+(e?.message??e)));
    return this;
  }
}

/** Every installed Item compendium is synced; untick any you don't want on the website. */
export class PackMenu extends foundry.applications.api.DialogV2 {
  constructor(options={}){
    const excluded=new Set(JSON.parse(game.settings.get(MODULE_ID,'excludedPacks')||'[]'));
    const packs=[...game.packs.values()].filter(p=>p.documentName==='Item')
      .sort((a,b)=>(a.metadata?.label??'').localeCompare(b.metadata?.label??''));
    const rows=packs.map(p=>`<label style="display:flex;gap:6px;align-items:center">
      <input type="checkbox" value="${escapeText(p.collection)}" ${excluded.has(p.collection)?'':'checked'}/>
      ${escapeText(p.metadata?.label??p.collection)} <small style="opacity:.7">${escapeText(p.collection)}</small></label>`).join('');
    super({...options,window:{...options.window,title:'Planner (D&D 5e) — Choose compendiums'},
      content:`<div class="planner-packs" style="max-height:60vh;overflow:auto;display:grid;gap:4px">${rows}</div>`,
      rejectClose:false,buttons:[{action:'save',label:'Save',default:true,callback:async(event,button,dialog)=>{
        const boxes=[...dialog.element.querySelectorAll('.planner-packs input[type=checkbox]')];
        await game.settings.set(MODULE_ID,'excludedPacks',JSON.stringify(boxes.filter(b=>!b.checked).map(b=>b.value)));
        ui.notifications.info('Planner (5e): saved. Run Sync Now to update the website.');
      }},{action:'close',label:'Cancel'}]});
  }
}
