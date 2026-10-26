import {importActorToPlanner,getSiteCharacterOwners,listPlannerCharacters,
  fetchPlannerCharacter,pullCharacterFromPlanner} from './sync.mjs';
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
      window:{...options.window,title:'Export character to PF2e Planner'},
      content:`<div class="pf2e-planner-actor-picker">
        <p>Choose a character in this Foundry world to export to the website's
          character builder. Its ancestry, boosts, skills, feats, spells and gear are read from
          the character itself, plus your PF2e Leveler plan; biography, private notes and other
          actor secrets are not sent.</p>
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
        <label><input type="checkbox" class="planner-overwrite"/> Replace an existing exported
          website build with this character as it is now</label>
        <p class="hint">Otherwise a previously imported build opens without overwriting website changes.
          Site ownership follows the authorized GM account.</p>
        <button type="button" class="planner-import"><i class="fa-solid fa-cloud-arrow-up"></i>
          Export to Character Builder</button>
        <p><a class="planner-open-link" href="#" target="_blank" rel="noopener noreferrer"
          hidden>Open exported character in PF2e Planner ↗</a></p>
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
        status.textContent='Exporting character…';
        const relevant=this.context?.actor?.id===id?this.context:null;
        const result=await importActorToPlanner(actor,{
          plan:relevant?.plan??null,
          creation:relevant?.data??null,
          overwrite:form.querySelector('.planner-overwrite').checked,
          ownerUserId:membersSelect.value
        });
        const reason=result.existing&&!result.updated
          ? 'Existing website build kept (tick Replace to overwrite it).': 'Character exported.';
        const missing=(result.report?.missing??[]).map(m=>m.name);
        status.textContent=reason+(result.skipped?
          ' '+result.skipped+' choices could not be matched to synced compendiums'+
          (missing.length?': '+missing.slice(0,6).join(', ')+(missing.length>6?'…':''):'')+'.':'');
        ui.notifications.info('PF2e Planner: '+status.textContent);
        // Open in a separate browser tab so the Foundry Leveler window stays intact.
        const link=form.querySelector('.planner-open-link');
        link.href=result.url;link.hidden=false;
        window.open(result.url,'_blank','noopener,noreferrer');
      }catch(error){
        status.textContent='Export failed: '+(error?.message||String(error));
        ui.notifications.error('PF2e Planner: '+status.textContent);
      }finally{button.disabled=false;}
    });
  }
}

function ownedCharacters(){
  return [...game.actors.values()]
    .filter(actor=>actor.type==='character'&&actor.testUserPermission(game.user,'OWNER'))
    .sort((a,b)=>a.name.localeCompare(b.name));
}
function planSummary(plan){
  if(!plan)return 'No level plan';
  const levels=Object.values(plan.levels||{});
  const feats=levels.reduce((n,data)=>n+Object.entries(data||{})
    .filter(([key,value])=>/Feats$/.test(key)&&Array.isArray(value))
    .reduce((m,[,value])=>m+value.filter(x=>x?.uuid).length,0),0);
  const planned=levels.filter(data=>Object.values(data||{})
    .some(value=>Array.isArray(value)&&value.length)).length;
  return planned+' levels planned · '+feats+' feats · class '+(plan.classSlug||'none');
}

/** Pull a website build into Leveler: writes pf2e-leveler.plan on the chosen actor. */
export class PlannerPullMenu extends foundry.applications.api.DialogV2 {
  constructor(application=null,options={}){
    const actors=ownedCharacters();
    const selected=application?.actor?.id||actors[0]?.id||'';
    const list=actors.map(actor=>
      '<option value="'+escape(actor.id)+'" '+(actor.id===selected?'selected':'')+'>'+
      escape(actor.name)+' (level '+(actor.system?.details?.level?.value||1)+')</option>'
    ).join('');
    super({...options,
      window:{...options.window,title:'Pull character from PF2e Planner'},
      content:`<div class="pf2e-planner-pull">
        <p>Replace a Foundry character's PF2e Leveler plan with a build from the website.
          Leveler applies planned levels when the character levels up; nothing else on
          the actor changes now.</p>
        <div class="form-group"><label>Foundry character</label>
          <select class="planner-actor" style="width:100%">${list}</select></div>
        <div class="form-group"><label>Website build</label>
          <select class="planner-build" style="width:100%" disabled>
            <option>Loading website builds…</option></select></div>
        <p class="planner-preview hint">Choose a build to preview it.</p>
        <ul class="planner-warnings" style="color:var(--color-level-warning,#c97a00)"></ul>
        <label><input type="checkbox" class="planner-creation"/> Also replace Leveler
          Character Wizard choices (only for characters not yet created)</label>
        <label class="planner-relink-row" hidden><input type="checkbox" class="planner-relink"/>
          <span class="planner-relink-text">Move the link here</span></label>
        <button type="button" class="planner-pull" disabled><i class="fa-solid fa-cloud-arrow-down"></i>
          Pull into Leveler</button>
        <p class="planner-status" role="status" aria-live="polite"></p>
      </div>`,
      rejectClose:false,
      buttons:[{action:'close',label:'Close'}]});
    this.actorIds=new Set(actors.map(x=>x.id));
    this.context=application;
  }
  async _onRender(context,options){
    await super._onRender(context,options);
    const form=this.element?.querySelector('.pf2e-planner-pull');
    if(!form)return;
    const actorSelect=form.querySelector('.planner-actor');
    const buildSelect=form.querySelector('.planner-build');
    const preview=form.querySelector('.planner-preview');
    const warnings=form.querySelector('.planner-warnings');
    const creationBox=form.querySelector('.planner-creation');
    const relinkRow=form.querySelector('.planner-relink-row');
    const relinkBox=form.querySelector('.planner-relink');
    const button=form.querySelector('.planner-pull');
    const status=form.querySelector('.planner-status');
    let builds=[];
    const actor=()=>this.actorIds.has(actorSelect.value)?game.actors.get(actorSelect.value):null;
    const refresh=async()=>{
      const target=actor(),build=builds.find(b=>b.id===buildSelect.value);
      warnings.replaceChildren();
      button.disabled=true;
      if(!target||!build){preview.textContent='Choose a build to preview it.';return;}
      // Writing creation data onto an already-built actor could re-apply level 1.
      const created=target.items.some(item=>item.type==='class');
      creationBox.checked=!created;
      creationBox.disabled=created;
      // Either end may already be linked: this build to another actor, or this actor to another build.
      const buildElsewhere=build.linkedActorId&&build.linkedActorId!==target.id;
      const actorTaken=builds.find(b=>b.linkedActorId===target.id&&b.id!==build.id);
      relinkRow.hidden=!(buildElsewhere||actorTaken);
      relinkRow.querySelector('.planner-relink-text').textContent=[
        buildElsewhere?'This build is linked to another Foundry character.':'',
        actorTaken?target.name+' is linked to the build "'+actorTaken.name+'", which will be unlinked.':'',
        'Move the link here'].filter(Boolean).join(' ');
      relinkBox.checked=false;
      preview.textContent='Loading build…';
      try{
        const result=await fetchPlannerCharacter(target,build.id);
        if(buildSelect.value!==build.id)return;
        preview.textContent=result.character.name+' (website level '+result.character.level+') — '+
          planSummary(result.leveler.plan);
        for(const text of result.warnings){
          const item=document.createElement('li');item.textContent=text;warnings.append(item);
        }
        button.disabled=!result.leveler.plan&&!result.leveler.creation;
      }catch(error){preview.textContent='Cannot load build: '+(error.message||String(error));}
    };
    try{
      builds=await listPlannerCharacters();
      const linkedTo=id=>builds.find(b=>b.linkedActorId===id)?.id??'';
      buildSelect.replaceChildren();
      const blank=document.createElement('option');
      blank.value='';blank.textContent='Choose a website build…';
      buildSelect.append(blank);
      for(const build of builds){
        const option=document.createElement('option');
        option.value=build.id;
        option.textContent=build.name+' · level '+build.level+' · '+build.ownerName+
          (build.linkedActorId?' (linked)':'');
        buildSelect.append(option);
      }
      buildSelect.value=linkedTo(actorSelect.value);
      buildSelect.disabled=builds.length===0;
      if(!builds.length)status.textContent='No website builds exist in this campaign yet.';
      actorSelect.addEventListener('change',()=>{buildSelect.value=linkedTo(actorSelect.value);refresh();});
      buildSelect.addEventListener('change',refresh);
      await refresh();
    }catch(error){
      status.textContent='Cannot load website builds: '+(error.message||String(error));
    }
    button.addEventListener('click',async event=>{
      event.preventDefault();
      const target=actor(),build=builds.find(b=>b.id===buildSelect.value);
      if(!target||!build)return;
      if(!relinkRow.hidden&&!relinkBox.checked){
        status.textContent='Confirm moving the link before pulling this build.';return;
      }
      button.disabled=true;
      try{
        status.textContent='Writing Leveler data…';
        const result=await pullCharacterFromPlanner(target,build.id,{
          writeCreation:creationBox.checked,relink:relinkBox.checked});
        const wrote=[result.wrotePlan&&'level plan',result.wroteCreation&&'creation choices']
          .filter(Boolean).join(' and ')||'nothing (the build is empty)';
        status.textContent='Pulled "'+result.character.name+'" into '+target.name+': '+wrote+'.';
        ui.notifications.info('PF2e Planner: '+status.textContent);
        for(const build of builds)if(build.linkedActorId===target.id)build.linkedActorId=null;
        build.linkedActorId=target.id;
        relinkRow.hidden=true;
        // Reopen the Leveler window so it loads the new flags instead of its in-memory copy.
        const app=this.context;
        if(app?.actor?.id===target.id&&typeof app.close==='function'){
          const Window=app.constructor;
          await app.close();
          new Window(target).render(true);
        }
      }catch(error){
        status.textContent='Pull failed: '+(error?.message||String(error));
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
    const make=(label,icon,title,open)=>{
      const button=document.createElement('button');
      button.type='button';
      button.className='pf2e-planner-sync-button';
      button.title=title;
      button.setAttribute('aria-label',title);
      button.innerHTML='<i class="fa-solid '+icon+'"></i> '+label;
      button.style.cssText='margin:0 3px;flex:0 0 auto;font-size:.75rem;padding:.3rem .5rem;';
      button.addEventListener('click',event=>{
        event.preventDefault();event.stopPropagation();
        open().render({force:true});
      });
      return button;
    };
    const buttons=[
      make('Export to Planner','fa-cloud-arrow-up','Export this character to the PF2e Planner character builder',
        ()=>new PlannerCharacterImportMenu(app)),
      make('Pull from Planner','fa-cloud-arrow-down','Load a PF2e Planner website build into this Leveler plan',
        ()=>new PlannerPullMenu(app))];
    // ApplicationV2 header: title, then control toggle / close buttons. Sit before those.
    const anchor=header.querySelector(':scope > [data-action="toggleControls"], :scope > [data-action="close"]');
    for(const button of buttons)header.insertBefore(button,anchor);
  });
}
