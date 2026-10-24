import {importActorToPlanner,getSiteCharacterOwners} from './sync.mjs';
const escape=value=>String(value??'').replaceAll('&','&amp;')
  .replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');

export class PlannerCharacterImportMenu extends foundry.applications.api.DialogV2 {
  constructor(application=null,options={}){
    const actors=[...game.actors.values()]
      .filter(actor=>actor.type==='character'&&actor.testUserPermission(game.user,'OWNER'))
      .sort((a,b)=>a.name.localeCompare(b.name));
    const selected=application?.actor?.id||actors[0]?.id||'';
    const list=actors.map(actor=>
      '<option value="'+escape(actor.id)+'" '+(actor.id===selected?'selected':'')+'>'+
      escape(actor.name)+' (level '+(actor.system?.details?.level?.value||1)+')</option>'
    ).join('');
    super({...options,
      window:{...options.window,title:'Sync character to PF2e Planner'},
      content:`<div class="pf2e-planner-actor-picker">
        <p>Choose a character in this Foundry world to load into the website's
          character builder. Only supported character choices are exported;
          biography, private notes and other actor secrets are not sent.</p>
        <div class="form-group">
          <label>Find a character</label>
          <input type="search" class="planner-find" placeholder="Search character names…" style="width:100%"/>
        </div>
        <div class="form-group"><label>Character</label>
          <select name="actor" class="planner-actor" style="width:100%;">${list}</select>
        </div>
        <div class="form-group"><label>Website character owner</label>
          <select class="planner-site-owner" style="width:100%" disabled>
            <option>Loading campaign players…</option>
          </select>
          <p class="hint">Choose whose website account can open and edit the imported character.</p>
        </div>
        <label><input type="checkbox" class="planner-overwrite"/> Replace an existing imported
          website build with current Foundry choices</label>
        <p class="hint">Otherwise a previously imported build opens without overwriting website changes.
          Site ownership follows the authorized GM account.</p>
        <button type="button" class="planner-import"><i class="fa-solid fa-cloud-arrow-up"></i>
          Import & Open Character Builder</button>
        <p><a class="planner-open-link" href="#" target="_blank" rel="noopener noreferrer"
          hidden>Open imported character in PF2e Planner ↗</a></p>
        <p class="planner-status" role="status" aria-live="polite">
          ${actors.length} characters available in this world.</p>
      </div>`,
      rejectClose:false,
      buttons:[{action:'close',label:'Close'}]});
    this.actorIds=new Set(actors.map(x=>x.id));
    this.context=application;
  }
  async _onRender(context,options){
    await super._onRender(context,options);
    const form=this.element?.querySelector('.pf2e-planner-actor-picker');
    if(!form)return;
    const search=form.querySelector('.planner-find');
    const select=form.querySelector('.planner-actor');
    search?.addEventListener('input',()=>{
      const word=search.value.trim().toLowerCase();
      for(const option of select.options) option.hidden=!option.textContent.toLowerCase().includes(word);
      const next=[...select.options].find(o=>!o.hidden);
      if(next&&select.selectedOptions[0]?.hidden)select.value=next.value;
    });
    const button=form.querySelector('.planner-import');
    const status=form.querySelector('.planner-status');
    const membersSelect=form.querySelector('.planner-site-owner');
    button.disabled=true;
    try{
      const members=await getSiteCharacterOwners();
      membersSelect.replaceChildren();
      for(const member of members){
        const option=document.createElement('option');
        option.value=member.id;
        option.textContent=member.displayName+
          (member.role==='gm'?' (GM)':' (Player)');
        membersSelect.append(option);
      }
      membersSelect.disabled=members.length===0;
      button.disabled=members.length===0;
      if(!members.length)status.textContent='No active website accounts available for this campaign.';
    }catch(error){
      status.textContent='Cannot load website players: '+(error.message||String(error));
    }
    button?.addEventListener('click',async event=>{
      event.preventDefault();button.disabled=true;
      try{
        const id=select.value;
        if(!this.actorIds.has(id))throw Error('Select an available character.');
        const actor=game.actors.get(id);
        if(!actor?.testUserPermission(game.user,'OWNER'))throw Error('Character access denied.');
        status.textContent='Uploading selected character choices…';
        const relevant=this.context?.actor?.id===id?this.context:null;
        const result=await importActorToPlanner(actor,{
          plan:relevant?.plan??null,
          creation:relevant?.data??null,
          overwrite:form.querySelector('.planner-overwrite').checked,
          ownerUserId:membersSelect.value
        });
        const reason=result.existing&&!result.updated
          ? 'Existing website build preserved.': 'Character synchronized.';
        status.textContent=reason+(result.skipped?
          ' '+result.skipped+' choices could not be matched to synced compendiums.':'');
        ui.notifications.info('PF2e Planner: '+status.textContent);
        // Open in a separate browser tab so the Foundry Leveler window stays intact.
        const link=form.querySelector('.planner-open-link');
        link.href=result.url;link.hidden=false;
        window.open(result.url,'_blank','noopener,noreferrer');
      }catch(error){
        status.textContent='Import failed: '+(error?.message||String(error));
        ui.notifications.error('PF2e Planner: '+status.textContent);
      }finally{button.disabled=false;}
    });
  }
}

/** Non-invasive integration with Leveler's existing ApplicationV2 dialogs. */
export function registerLevelerButtons(){
  Hooks.on('renderApplicationV2',(app)=>{
    if(!game.user?.isGM)return;
    const id=String(app?.id||app?.options?.id||'');
    if(!['pf2e-leveler-wizard','pf2e-leveler-planner'].includes(id))return;
    const root=app.element;
    if(!root?.querySelector||root.querySelector('.pf2e-planner-sync-button'))return;
    const header=root.querySelector('.window-header')||root.querySelector('.window-content');
    if(!header)return;
    const button=document.createElement('button');
    button.type='button';
    button.className='pf2e-planner-sync-button';
    button.title='Send a Foundry character into the PF2e Planner website';
    button.setAttribute('aria-label','Sync character to PF2e Planner website');
    button.innerHTML='<i class="fa-solid fa-cloud-arrow-up"></i> PF2e Planner';
    button.style.cssText='margin:0 6px;flex:0 0 auto;font-size:.75rem;padding:.3rem .5rem;';
    button.addEventListener('click',event=>{
      event.preventDefault();event.stopPropagation();
      new PlannerCharacterImportMenu(app).render({force:true});
    });
    header.append(button);
  });
}
