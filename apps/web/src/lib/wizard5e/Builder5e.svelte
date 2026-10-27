<script>
  import Origin5e from './Origin5e.svelte';
  import Level5e from './Level5e.svelte';
  import Spells5e from './Spells5e.svelte';
  import Summary5e from './Summary5e.svelte';
  import WishlistPanel from '../wizard/WishlistPanel.svelte';
  import ItemDrawer from '../wizard/ItemDrawer.svelte';
  import SharePanel from '../ui/SharePanel.svelte';
  import AppBar from '../ui/AppBar.svelte';
  import {api} from '../ui/api.js';
  import {downloadJson} from '../ui/download.js';
  import {loadCatalogAt} from '../builder/catalog.js';
  import {setContext} from 'svelte';
  import {wishlist} from '../builder/equipment.js';
  import {derive,normalizeBuild,setChoice,addLevel,removeLevelAt,insertLevelAt,setLevelClass,setSubclass,toggleSpell,summaryLabels}
    from '../systems/dnd5e/build.js';
  import {isModern} from '../systems/dnd5e/rules.js';

  /**
   * D&D 5e character planner (2014 or 2024 rules, following the world's setting): origin,
   * ability scores, levels 1–20 with multiclassing, spells and an equipment wishlist.
   * Plans stay on the website; nothing is exported to Foundry. `scope` says where the character
   * lives (campaign, personal, public link); see BuilderPf2e.
   */
  let {ctx,scope,actions:extraActions=null,banner=null}=$props();
  setContext('catalogBase',scope.catalogBase);
  let catalog=$state(null);
  let character=$state(null);
  let build=$state(null);
  let planner=$state({notes:'',wishlist:[]});
  let name=$state('');
  let currentLevel=$state(1);
  let error=$state('');
  let saveState=$state('saved');
  let conflict=$state(false);
  let at=$state('origin');
  let detail=$state(null);
  let railOpen=$state(false);
  // Under 1180px the summary is a drawer, opened from the button at the top right.
  let summaryOpen=$state(false);
  let sharing=$state(false);
  let confirmDelete=$state(false);
  let deleting=$state(false);
  let timer;

  $effect(()=>{
    const url=scope.characterUrl;
    (async()=>{
      try{
        const [result,cat]=await Promise.all([api(url),loadCatalogAt(scope.catalogKey,scope.catalogBase)]);
        catalog=cat;character=result.character;name=character.name;currentLevel=character.level;
        build=normalizeBuild(character.dnd5e);
        planner={notes:'',wishlist:[],...(character.planner??{})};
        const requested=new URLSearchParams(location.search).get('at');
        at=requested&&/^(origin|level-\d+|spells|equipment|notes)$/.test(requested)?requested:'origin';
      }catch(e){error=e.message;}
    })();
    return ()=>clearTimeout(timer);
  });
  const variants=$derived(catalog?.variants&&Object.keys(catalog.variants).length?catalog.variants:ctx?.sync?.variants??{});
  const sheet=$derived(build&&catalog?derive(build,catalog,variants):null);
  const planned=$derived(build?.levels.length??0);
  const atLevel=$derived(at?.startsWith('level-')?Number(at.slice(6)):null);
  const sequence=$derived(['origin',...Array.from({length:Math.min(20,planned+1)},(_,i)=>'level-'+(i+1)),'spells','equipment','notes']);
  const index=$derived(sequence.indexOf(at));
  const canEdit=$derived(character?.access?.edit!==false);
  const canManage=$derived(character?.access?.manage===true);

  function update(change){if(!canEdit)return;build=change(build);schedule();}
  function updatePlanner(change){if(!canEdit)return;planner=change(planner);schedule();}
  function schedule(){if(!canEdit)return;saveState='unsaved';clearTimeout(timer);timer=setTimeout(save,700);}
  async function save(){
    if(saveState==='saving'||conflict){if(!conflict)schedule();return;}
    saveState='saving';
    try{
      const result=await api(scope.characterUrl+'/document',
        {method:'PUT',body:{name:name.trim()||character.name,level:currentLevel,revision:character.revision,
          document:{format:'dnd5e-plan',schemaVersion:1,build,summary:summaryLabels(sheet),planner}}});
      character={...character,revision:result.character.revision,name:result.character.name,level:result.character.level};
      if(saveState==='saving')saveState='saved';
      error='';
    }catch(e){
      saveState='error';error=e.message;
      if(e.code==='character_changed_elsewhere_refresh_first')conflict=true;
    }
  }
  async function deleteCharacter(){
    deleting=true;clearTimeout(timer);
    try{
      await api(scope.characterUrl,{method:'DELETE'});
      location.replace(scope.home);
    }catch(e){error=e.message;deleting=false;confirmDelete=false;}
  }
  function go(target){
    const next=target==='next'?sequence[Math.min(sequence.length-1,index+1)]:target==='prev'?sequence[Math.max(0,index-1)]:target;
    if(!next)return;
    at=next;railOpen=false;
    try{history.replaceState(history.state,'','?at='+encodeURIComponent(next));}catch{}
    document.querySelector('.stage')?.scrollTo?.({top:0});
  }
  function onClass(level,classUuid){
    update(b=>level>b.levels.length?addLevel(b,classUuid):setLevelClass(b,level-1,classUuid));
    if(level>currentLevel&&currentLevel===planned)currentLevel=Math.min(20,level);
  }
  function removeLevel(level){
    update(b=>removeLevelAt(b,level-1));
    if(currentLevel>planned)currentLevel=Math.max(1,planned);
    if(level>planned)go('level-'+Math.max(1,planned));
  }
  function insertLevel(level,classUuid){
    update(b=>insertLevelAt(b,level-1,classUuid));
  }
  const labelOf=id=>({origin:'Origin',spells:'Spells',equipment:'Equipment plan',notes:'Notes'})[id]??(id?.startsWith('level-')?'Level '+id.slice(6):'');
  function levelLine(level){
    const p=sheet?.pages[level-1];
    if(!build.levels[level-1])return level===planned+1?'Add a level':'';
    return (p?.className??'?')+' '+(p?.classLevel??'');
  }
  function levelStatus(level){
    const p=sheet?.pages[level-1];
    if(!p||!build.levels[level-1])return 'none';
    const total=p.choices.length,done=p.choices.filter(c=>c.done).length;
    return p.multiclassProblem?'part':!total||done===total?'done':done?'part':'todo';
  }
  const originDone=$derived(!!(build?.speciesUuid&&build?.backgroundUuid));
  const saveLabel=$derived({saved:'Saved',saving:'Saving…',unsaved:'Unsaved',error:'Not saved'}[saveState]);
  const editionLabel=$derived(isModern(variants)?'2024 rules':'2014 rules');
</script>
<svelte:head><title>{name||'Character'} · Planner</title></svelte:head>
<AppBar me={ctx.me} campaigns={ctx.campaigns} campaign={ctx.campaign} sync={ctx.sync} crumb={name} personal={!scope.campaignId&&!scope.publicView}>
  {#snippet actions()}
    {#if canEdit}<span class="save {saveState}" role="status">{saveLabel}</span>{:else}<span class="save">View only</span>{/if}
    {#if scope.exportUrl}<button class="btn small ghost" title="Download the build to import into another planner" onclick={()=>downloadJson(scope.exportUrl,name).catch(e=>error=e.message)}>Export</button>{/if}
    {@render extraActions?.()}
    {#if canManage}<button class="btn small ghost" onclick={()=>scope.onShare?scope.onShare():sharing=true}>Share</button>
      <button class="btn small ghost danger" onclick={()=>confirmDelete=true}>Delete</button>{/if}
  {/snippet}
</AppBar>
{#if sharing}
  <SharePanel url={scope.sharingUrl}
    onClose={()=>sharing=false} onSaved={s=>character={...character,visibility:s.visibility}}/>
{/if}
{#if confirmDelete}
  <div class="banner" role="alertdialog" aria-labelledby="delete-title">
    <div class="notice bad delete">
      <b id="delete-title">Delete {name||'this character'}?</b>
      <span>This removes the plan from the website for everyone. It can't be undone.</span>
      <span class="row"><button class="btn small" onclick={()=>confirmDelete=false}>Keep it</button>
        <button class="btn small danger" disabled={deleting} onclick={deleteCharacter}>{deleting?'Deleting…':'Delete character'}</button></span>
    </div>
  </div>
{/if}
{#if character&&!canEdit}
  <div class="banner"><p class="notice">{scope.publicView?`${character.ownerName??'A player'}’s character, from a shared link. It’s read-only.`
    :`${character.ownerName??'Its owner'} shared this character with you to view. Changes you make here aren’t saved.`}</p></div>
{/if}
{@render banner?.()}
{#if error}
  <div class="banner" role="alert"><p class="notice bad">{error}
    {#if conflict}<button class="link" onclick={()=>location.reload()}>Reload</button>{/if}</p></div>
{/if}
{#if build&&catalog&&sheet}
  {#if !catalog.count&&scope.campaignId}
    <div class="banner"><p class="notice">The GM hasn’t synced this world’s compendiums yet. Once the Planner Bridge (D&amp;D 5e) runs <i>Sync Now</i>, classes and spells appear here.</p></div>
  {/if}
  <div class="mobile-bar">
    <button class="menu-btn" aria-expanded={railOpen} aria-controls="builder-rail" onclick={()=>railOpen=!railOpen}>
      <span aria-hidden="true">☰</span><span class="sr">Levels</span></button>
    <span class="where"><b>{labelOf(at)}</b><small>{name} · level {currentLevel}</small></span>
    <button class="summary-btn" aria-expanded={summaryOpen} aria-controls="builder-summary" title="Character summary"
      onclick={()=>{summaryOpen=!summaryOpen;railOpen=false;}}><span aria-hidden="true">◧</span><span class="sr">Summary</span></button>
  </div>
  {#if railOpen}<div class="scrim" role="presentation" onclick={()=>railOpen=false}></div>{/if}
  {#if summaryOpen}<div class="sum-scrim" role="presentation" onclick={()=>summaryOpen=false}></div>{/if}
  <div class="builder">
    <nav class="rail" class:open={railOpen} id="builder-rail" aria-label="Levels">
      <div class="identity">
        <label class="field" for="character-name"><span class="eyebrow">Character</span>
          <input id="character-name" maxlength="80" bind:value={name} oninput={schedule} readonly={!canEdit}/></label>
        <label class="field" for="current-level"><span class="eyebrow">Level</span>
          <select id="current-level" bind:value={currentLevel} onchange={schedule} disabled={!canEdit}>
            {#each Array.from({length:20},(_,i)=>i+1) as n}<option value={n}>{n}</option>{/each}
          </select></label>
      </div>
      <p class="edition"><span class="badge">{editionLabel}</span> from the world’s settings</p>
      <ol>
        <li><button class="item" class:on={at==='origin'} onclick={()=>go('origin')}>
          <span class="lvl" aria-hidden="true">◇</span>
          <span class="label"><span class="name">Origin</span>
            <span class="pick">{[sheet.species?.name,sheet.background?.name].filter(Boolean).join(' · ')||'Species, background, scores'}</span></span>
          <span class="status {originDone?'done':'todo'}"></span></button></li>
        {#each Array.from({length:Math.min(20,planned+1)},(_,i)=>i+1) as level}
          <li><button class="item" class:on={at==='level-'+level} class:future={level>currentLevel} class:add={level>planned}
            aria-current={at==='level-'+level?'step':undefined} onclick={()=>go('level-'+level)}>
            <span class="lvl num">{level>planned?'+':level}</span>
            <span class="label"><span class="pick">{levelLine(level)}</span>
              {#if level===currentLevel}<span class="tags"><span class="now">Current</span></span>{/if}</span>
            <span class="status {levelStatus(level)}"></span>
          </button></li>
        {/each}
        <li><button class="item" class:on={at==='spells'} onclick={()=>go('spells')}>
          <span class="lvl" aria-hidden="true">✦</span>
          <span class="label"><span class="name">Spells</span>
            <span class="pick">{Object.values(build.spells).flat().length||'No'} spells chosen</span></span><span></span></button></li>
        <li><button class="item" class:on={at==='equipment'} onclick={()=>go('equipment')}>
          <span class="lvl" aria-hidden="true">⚒</span>
          <span class="label"><span class="name">Equipment plan</span>
            <span class="pick">{wishlist(planner).length?wishlist(planner).length+' items wanted':'Items to buy as you level'}</span></span><span></span></button></li>
        <li><button class="item" class:on={at==='notes'} onclick={()=>go('notes')}>
          <span class="lvl" aria-hidden="true">✎</span>
          <span class="label"><span class="name">Notes</span></span><span></span></button></li>
      </ol>
    </nav>
    <main class="stage">
      <header class="stage-head">
        <span class="eyebrow">{atLevel?(atLevel>planned?'Next level':`Level ${atLevel} of ${planned}`):'D&D 5e plan'}</span>
        <h1>{atLevel>planned?'Add level '+atLevel:labelOf(at)}</h1>
      </header>
      {#if at==='origin'}
        <Origin5e {build} {catalog} {variants} {sheet} {update} info={uuid=>detail=uuid} readonly={!canEdit}/>
      {:else if atLevel}
        {#key atLevel}
          <Level5e level={atLevel} {build} {catalog} {variants} {sheet} {onClass} onInsert={insertLevel} onRemove={removeLevel} readonly={!canEdit}
            onChoice={(key,value)=>update(b=>setChoice(b,key,value))}
            onSubclass={(cls,sub)=>update(b=>setSubclass(b,cls,sub))} info={uuid=>detail=uuid}/>
        {/key}
      {:else if at==='spells'}
        <Spells5e {build} {catalog} {variants} {sheet} onToggle={(cls,uuid)=>update(b=>toggleSpell(b,cls,uuid))} info={uuid=>detail=uuid} readonly={!canEdit}/>
      {:else if at==='equipment'}
        <WishlistPanel {planner} {catalog} {updatePlanner} {currentLevel} info={uuid=>detail=uuid}/>
      {:else if at==='notes'}
        <textarea class="notes" maxlength="4000" readonly={!canEdit} value={planner.notes??''} aria-label="Notes"
          oninput={e=>updatePlanner(p=>({...p,notes:e.currentTarget.value}))}></textarea>
      {/if}
      <footer class="stage-foot">
        <button class="btn" disabled={index<=0} onclick={()=>go('prev')}>← {labelOf(sequence[index-1])||'Back'}</button>
        {#if index<sequence.length-1}<button class="btn primary" onclick={()=>go('next')}>{labelOf(sequence[index+1])} →</button>{/if}
      </footer>
    </main>
    <div class="side" class:open={summaryOpen} id="builder-summary"><Summary5e {name} {sheet} {catalog} {variants} {planner}/></div>
  </div>
  <ItemDrawer campaignId={scope.campaignId} catalogBase={scope.campaignId?null:scope.catalogBase} linksDisabled={!!scope.publicView} uuid={detail} level={atLevel??currentLevel} onClose={()=>detail=null}/>
{:else if !error}
  <p class="loading muted">Loading the character…</p>
{/if}
<style>
  .save{font:500 12px var(--mono);color:var(--muted);min-width:64px}
  .save.unsaved,.save.saving{color:var(--warn)}.save.error{color:var(--bad)}
  .banner{padding:12px max(16px,env(safe-area-inset-right,0px)) 0 max(16px,env(safe-area-inset-left,0px))}
  .delete{display:grid;gap:8px}
  .delete .row{display:flex;gap:8px}
  .loading{padding:32px}
  .builder{display:grid;grid-template-columns:270px minmax(0,1fr) 300px;min-height:calc(100vh - 57px)}
  .rail{border-right:1px solid var(--line);background:var(--panel);padding:14px 10px 24px;display:grid;gap:8px;align-content:start;
    position:sticky;top:57px;max-height:calc(100vh - 57px);overflow-y:auto;overflow-x:hidden;padding-left:max(10px,env(safe-area-inset-left,0px))}
  .identity{display:grid;grid-template-columns:minmax(0,1fr) 64px;gap:8px;padding:0 6px 6px}
  .identity input{font:800 1rem var(--display);padding:.45rem .6rem;width:100%;min-width:0}
  .identity select{padding:.45rem .4rem}
  .edition{margin:0 6px;font-size:.78rem;color:var(--muted)}
  ol{list-style:none;margin:0;padding:0;display:grid;gap:1px}
  .item{display:grid;grid-template-columns:24px minmax(0,1fr) auto;gap:10px;align-items:start;width:100%;background:none;border:0;
    border-radius:8px;padding:7px 8px;color:var(--text-2);text-align:left}
  .item:hover{background:var(--panel-2)}
  .item.on{background:var(--panel-3);color:var(--text)}
  .item.add .pick{color:var(--brass)}
  .label{display:grid;gap:1px;min-width:0}
  .name{font-weight:700;font-size:.9rem;color:var(--text)}
  .pick{font-size:.8rem;color:var(--text-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .lvl{font:700 .85rem var(--mono);color:var(--muted);text-align:center;padding-top:1px}
  .on .lvl{color:var(--brass)}
  .future .lvl{color:var(--faint)}
  .tags{display:flex;gap:4px;margin-top:2px}
  .now{font:600 .62rem var(--mono);text-transform:uppercase;border-radius:3px;padding:1px 4px;background:var(--brass);color:var(--on-brass)}
  .status{width:9px;height:9px;border-radius:50%;margin-top:5px;background:var(--line-strong)}
  .status.done{background:var(--good)}.status.part{background:transparent;border:2px solid var(--brass)}
  .status.none{background:transparent}
  .stage{padding:24px 28px 40px;display:grid;gap:18px;align-content:start;min-width:0}
  .stage-head{display:grid;gap:4px}
  h1{font-size:clamp(1.5rem,3vw,2rem);font-weight:800}
  .notes{width:100%;min-height:320px;font:inherit;padding:12px;border-radius:var(--radius)}
  .stage-foot{display:flex;justify-content:space-between;gap:8px;border-top:1px solid var(--line);padding-top:16px;flex-wrap:wrap}
  .side{border-left:1px solid var(--line);background:var(--panel);padding:20px 18px;position:sticky;top:57px;
    max-height:calc(100vh - 57px);overflow:auto;padding-right:max(18px,env(safe-area-inset-right,0px))}
  .mobile-bar,.scrim,.sum-scrim{display:none}
  .sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
  @media(max-width:1180px){
    .builder{grid-template-columns:250px minmax(0,1fr)}
    .side{position:fixed;top:0;bottom:0;right:0;width:min(360px,92vw);max-height:none;z-index:50;
      transform:translateX(102%);transition:transform .18s ease-out;box-shadow:var(--shadow);
      padding-top:max(20px,env(safe-area-inset-top,0px));padding-bottom:max(20px,env(safe-area-inset-bottom,0px))}
    .side.open{transform:none}
    .sum-scrim{display:block;position:fixed;inset:0;background:var(--overlay);z-index:49}
    .mobile-bar{display:flex;align-items:center;gap:10px;position:sticky;top:57px;z-index:20;
      background:var(--panel);border-bottom:1px solid var(--line);
      padding:8px max(16px,env(safe-area-inset-right,0px)) 8px max(16px,env(safe-area-inset-left,0px))}
    .menu-btn{display:none}
    .where{display:grid;min-width:0}
    .where b{font:800 .95rem var(--display);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .where small{color:var(--muted);font-size:.78rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .summary-btn{margin-left:auto;width:38px;height:38px;border-radius:8px;border:1px solid var(--line);background:var(--panel-2);font-size:1.1rem}
  }
  @media(max-width:760px){
    .builder{grid-template-columns:minmax(0,1fr)}
    .menu-btn{display:block}
    .mobile-bar{display:flex;align-items:center;gap:10px;position:sticky;top:calc(env(safe-area-inset-top,0px) + 49px);z-index:20;
      background:var(--panel);border-bottom:1px solid var(--line);
      padding:8px max(16px,env(safe-area-inset-right,0px)) 8px max(16px,env(safe-area-inset-left,0px))}
    .menu-btn{width:38px;height:38px;border-radius:8px;border:1px solid var(--line);background:var(--panel-2);font-size:1.1rem}
    .where{display:grid;min-width:0}
    .where b{font:800 .95rem var(--display);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .where small{color:var(--muted);font-size:.78rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .scrim{display:block;position:fixed;inset:0;background:var(--overlay);z-index:49}
    .rail{position:fixed;top:0;bottom:0;left:0;width:min(330px,88vw);max-height:none;z-index:50;border-right:1px solid var(--line);
      transform:translateX(-102%);transition:transform .18s ease-out;box-shadow:var(--shadow);
      padding-top:max(14px,env(safe-area-inset-top,0px));padding-bottom:max(24px,env(safe-area-inset-bottom,0px))}
    .rail.open{transform:none}
    .stage{padding:18px max(16px,env(safe-area-inset-right,0px)) 32px max(16px,env(safe-area-inset-left,0px))}
  }
  @media(max-width:640px){.save{display:none}}
</style>
