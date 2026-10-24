import {
  pairWebsite, testWebsite, syncNow, getPackOptions, getSelectedPacks,
  getRequiredPacks, savePackSelection
} from './sync.mjs';
import {normalizeWebsiteUrl} from './url.mjs';

const MODULE_ID='pf2e-planner-bridge';
const escapeText=value=>String(value??'').replaceAll('&','&amp;')
  .replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');
function notifyError(error){
  const message=error?.message??String(error);
  ui.notifications.error('PF2e Planner: '+message);
  console.error('[PF2e Planner Bridge]',message);
}
function noticeStatus(scope,id,value){
  const status=scope?.querySelector(id);
  if(status)status.textContent=value;
}

/** Pairing only: website URL + single-use authorization code. */
export class PlannerConnectionMenu extends foundry.applications.api.DialogV2 {
  constructor(options={}){
    const url=escapeText(game.settings.get(MODULE_ID,'websiteUrl')||'');
    super({
      ...options,
      window:{...options.window,title:'PF2e Planner — Pair World'},
      content:`
      <div class="planner-pair-form">
        <p>Enter your Planner website and its one-time pairing code.</p>
        <div class="form-group">
          <label>Website domain or IP address</label>
          <input name="website" type="text" inputmode="url" required
            placeholder="level.dwank.uk" value="${url}"/>
          <p class="hint">HTTPS will be added automatically if omitted.</p>
        </div>
        <div class="form-group">
          <label>One-time pairing code</label>
          <input name="code" type="text" autocomplete="off" spellcheck="false"
            placeholder="Paste the code generated on the website"/>
        </div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <button type="button" id="planner-test"><i class="fa-solid fa-wifi"></i> Test Website</button>
          <button type="button" id="planner-pair"><i class="fa-solid fa-link"></i> Pair World</button>
        </div>
        <p id="planner-pair-status" class="hint" role="status" aria-live="polite">
          Testing doesn't consume the code or close this dialog.
        </p>
      </div>`,
      rejectClose:false,
      buttons:[{action:'close',label:'Close',icon:'fa-solid fa-xmark'}]
    });
  }
  async _onRender(context,options){
    await super._onRender(context,options);
    const scope=this.element?.querySelector('.planner-pair-form');
    if(!scope)return;
    const test=scope.querySelector('#planner-test'),pair=scope.querySelector('#planner-pair');
    const fields=()=>{
      const input=scope.querySelector('input[name="website"]');
      const url=normalizeWebsiteUrl(input?.value||'');
      if(input)input.value=url;
      return {url,code:String(scope.querySelector('input[name="code"]')?.value||'').trim()};
    };
    test?.addEventListener('click',async event=>{
      event.preventDefault();test.disabled=true;
      noticeStatus(scope,'#planner-pair-status','Checking website connectivity…');
      try{
        const result=await testWebsite(fields().url);
        noticeStatus(scope,'#planner-pair-status','Connected to PF2e Planner '+(result.version||'')+
          '. Enter a pairing code to continue.');
      }catch(e){noticeStatus(scope,'#planner-pair-status',e.message);notifyError(e);}
      finally{test.disabled=false;}
    });
    pair?.addEventListener('click',async event=>{
      event.preventDefault();
      pair.disabled=true;
      noticeStatus(scope,'#planner-pair-status','Pairing world…');
      try{
        const {url,code}=fields();
        if(!/^[A-Za-z0-9_-]{40,70}$/.test(code))throw Error('Enter a valid one-time code.');
        await pairWebsite(url,code);
        noticeStatus(scope,'#planner-pair-status','World paired. You can now use Sync Now.');
        await this.close();
      }catch(e){noticeStatus(scope,'#planner-pair-status','Pairing failed: '+e.message);notifyError(e);}
      finally{pair.disabled=false;}
    });
  }
}

/** Launches a manual catalog synchronization from Foundry module settings. */
export class PlannerSyncMenu extends foundry.applications.api.DialogV2 {
  constructor(options={}){
    super({...options,
      window:{...options.window,title:'PF2e Planner — Sync Now'},
      content:`<div class="planner-sync-status"><p id="planner-sync-status" role="status"
        aria-live="polite">Preparing compendium synchronization…</p>
        <p class="hint">The previously saved compendium collections are used.
        No new pairing code is needed on an already authorized GM browser.</p></div>`,
      rejectClose:false,
      buttons:[{action:'close',label:'Close',icon:'fa-solid fa-xmark'}]});
  }
  async _onRender(context,options){
    await super._onRender(context,options);
    const status=this.element?.querySelector('#planner-sync-status');
    if(!status||this._syncLaunched)return;
    this._syncLaunched=true;
    try{
      const result=await syncNow();
      status.textContent=result.skipped
        ? 'Already synchronizing, or no changes detected: '+result.skipped
        : 'Synchronized '+result.accepted+' items successfully. Refresh the website to view them.';
      ui.notifications.info('PF2e Planner: '+status.textContent);
    }catch(e){status.textContent='Sync failed: '+e.message;notifyError(e);}
  }
}

/** Group compendiums by Foundry package so a whole product is selected at once. */
export class PlannerPackMenu extends foundry.applications.api.DialogV2 {
  constructor(options={}){
    const approved=new Set(getSelectedPacks());
    const packs=getPackOptions();
    const groups=new Map();
    for(const pack of packs){
      const packageName=pack.packageName||pack.collection.split('.')[0];
      if(!groups.has(packageName))groups.set(packageName,[]);
      groups.get(packageName).push(pack);
    }
    const required=new Set(getRequiredPacks());
    const cards=[...groups].sort((a,b)=>a[0]==='pf2e'?-1:b[0]==='pf2e'?1:a[0].localeCompare(b[0]))
      .map(([key,items])=>{
        const core=key==='pf2e';
        const title=core?'Pathfinder 2e System':game.modules.get(key)?.title||key;
        const count=items.length;
        const checked=core||items.every(p=>approved.has(p.collection));
        return `<div class="planner-pack-group" data-search="${escapeText((title+' '+
          items.map(p=>p.label).join(' ')).toLowerCase())}"
          style="border:1px solid var(--color-border-light-primary,#9995);padding:9px;
          border-radius:7px;margin:6px 0">
          <label style="display:flex;align-items:center;gap:9px;cursor:pointer">
            <input class="planner-collection" type="checkbox" data-key="${escapeText(key)}"
              ${checked?'checked':''} ${core?'disabled':''}/>
            <span style="flex:1"><strong>${escapeText(title)}</strong><br/>
              <small>${count} Item ${count===1?'compendium':'compendiums'}</small></span>
            ${core?'<small>Included by default</small>':''}
          </label>
          <details style="margin:4px 0 0 26px"><summary class="hint">View included packs</summary>
            <small>${items.map(p=>escapeText(p.label)).join(' · ')}</small>
          </details>
        </div>`;
      }).join('');
    super({...options,
      window:{...options.window,title:'PF2e Planner — Select Compendium Collections'},
      content:`<div class="planner-collection-selector">
        <p>Choose content collections to synchronize. Official PF2e content is included by default.
        Third-party products require explicit selection and should only be shared with authorized players.</p>
        <input id="planner-collection-search" type="search" placeholder="Search collections or pack names…"
          style="width:100%;padding:9px" autocomplete="off"/>
        <div id="planner-collection-list" style="max-height:55vh;overflow-y:auto;padding:5px">
          ${cards}
        </div>
        <button id="planner-save-collections" type="button" style="margin:10px 0">
          <i class="fa-solid fa-floppy-disk"></i> Save Compendium Selection
        </button>
        <p id="planner-selection-result" class="hint" role="status">
          Selection changes are saved; they do not trigger a sync. Use Sync Now separately.
        </p>
      </div>`,
      rejectClose:false,
      buttons:[{action:'close',label:'Close',icon:'fa-solid fa-xmark'}]});
    this.groups=groups;
  }
  async _onRender(context,options){
    await super._onRender(context,options);
    const root=this.element?.querySelector('.planner-collection-selector');
    if(!root)return;
    const search=root.querySelector('#planner-collection-search');
    search?.addEventListener('input',()=>{
      const filter=search.value.toLowerCase().trim();
      root.querySelectorAll('.planner-pack-group').forEach(row=>{
        row.hidden=!row.dataset.search.includes(filter);
      });
    });
    root.querySelector('#planner-save-collections')?.addEventListener('click',async event=>{
      event.preventDefault();
      const selected=new Set(getRequiredPacks());
      for(const checkbox of root.querySelectorAll('.planner-collection')){
        if(checkbox.checked){
          for(const pack of this.groups.get(checkbox.dataset.key)||[])selected.add(pack.collection);
        }
      }
      const status=root.querySelector('#planner-selection-result');
      try{
        const selectedPacks=await savePackSelection([...selected]);
        status.textContent='Saved '+selectedPacks.length+
          ' Item packs across your selected collections. Click Sync Now to import.';
        ui.notifications.info('PF2e Planner: Compendium collection selections saved.');
      }catch(e){status.textContent='Save failed: '+e.message;notifyError(e);}
    });
  }
}
