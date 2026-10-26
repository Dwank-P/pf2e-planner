<script>
  import {page} from '$app/state';
  import AppBar from '../../../../../lib/ui/AppBar.svelte';
  import Level1Panel from '../../../../../lib/wizard/Level1Panel.svelte';
  import LevelPanel from '../../../../../lib/wizard/LevelPanel.svelte';
  import SummaryPanel from '../../../../../lib/wizard/SummaryPanel.svelte';
  import WishlistPanel from '../../../../../lib/wizard/WishlistPanel.svelte';
  import ItemDrawer from '../../../../../lib/wizard/ItemDrawer.svelte';
  import SharePanel from '../../../../../lib/ui/SharePanel.svelte';
  import ExtrasPanel from '../../../../../lib/wizard/ExtrasPanel.svelte';
  import RunesPanel from '../../../../../lib/wizard/RunesPanel.svelte';
  import {isRunesmith} from '../../../../../lib/builder/runes.js';
  import {api,campaignPath} from '../../../../../lib/ui/api.js';
  import {loadCampaign} from '../../../../../lib/ui/session.js';
  import {loadCatalog} from '../../../../../lib/builder/catalog.js';
  import {creationSteps} from '../../../../../lib/builder/schema.js';
  import {ensurePlan,repairLevelOne,planFeat,planBoosts,planSkillIncrease,planSpells,planSignature} from '../../../../../lib/builder/plan.js';
  import {stepSummary,levelSummary} from '../../../../../lib/builder/summaries.js';
  import {wishlist} from '../../../../../lib/builder/equipment.js';
  import {levelerChoiceSlots} from '../../../../../lib/leveler-progression.js';
  import {emptyCreation} from '../../../../../lib/leveler-format.js';
  import {setSkillSet} from '../../../../../lib/builder/rules.js';

  const campaignId=$derived(page.params.campaignId);
  const characterId=$derived(page.params.characterId);
  let ctx=$state(null);
  let catalog=$state(null);
  let character=$state(null);
  let creation=$state(null);
  let plan=$state(null);
  let planner=$state({});
  let name=$state('');
  let currentLevel=$state(1);
  let error=$state('');
  let saveState=$state('saved');
  let conflict=$state(false);
  // Where the planner is: 'level-N' or 'equipment'; openStep is the open level-1 card.
  let at=$state(null);
  let openStep=$state(null);
  let detail=$state(null);
  let railOpen=$state(false);
  let timer;

  $effect(()=>{
    const id=characterId,cid=campaignId;
    (async()=>{
      try{
        const [loaded,result,cat]=await Promise.all([loadCampaign(cid),
          api('/api/v1/campaigns/'+encodeURIComponent(cid)+'/characters/'+encodeURIComponent(id)),loadCatalog(cid)]);
        // SF2e worlds add Computers and Piloting; the Bridge sends the world's skill list.
        setSkillSet(cat.variants?.skills);
        ctx=loaded;catalog=cat;character=result.character;name=character.name;currentLevel=character.level;
        creation={...emptyCreation(),...(character.leveler?.creation??{})};
        plan=character.leveler?.plan??null;
        planner=character.planner??{};
        // Older imports could hide level-1 feats in plan.levels[1]; move them where they belong.
        const repaired=repairLevelOne(creation,plan);
        if(repaired&&character.access?.edit!==false){creation=repaired.creation;plan=repaired.plan;queueMicrotask(schedule);}
        const requested=new URLSearchParams(location.search).get('at');
        // Older links name a level-1 step directly (e.g. ?at=feats).
        if(requested&&!/^level-\d+$|^equipment$/.test(requested)){at='level-1';openStep=requested;}
        else at=requested;
      }catch(e){error=e.message;}
    })();
    return ()=>clearTimeout(timer);
  });
  const variants=$derived(catalog?.variants&&Object.keys(catalog.variants).length?catalog.variants:ctx?.sync?.variants??{});
  const steps=$derived(creation&&catalog?creationSteps(creation,catalog.get,variants):[]);
  const primary=$derived(catalog?.get(creation?.class?.uuid)??null);
  const second=$derived(variants.dualClass===true?catalog?.get(creation?.dualClass?.uuid)??null:null);
  const levelSlots=$derived(primary?levelerChoiceSlots(primary,second,variants).slots.filter(s=>s.level>=2):[]);
  const slotsAt=level=>levelSlots.filter(s=>s.level===level);
  const sequence=[...Array.from({length:20},(_,i)=>'level-'+(i+1)),'equipment'];
  $effect(()=>{
    if(!steps.length||at)return;
    const incomplete=steps.find(s=>!s.complete&&!s.optional&&s.id!=='review');
    at=incomplete||!primary?'level-1':'level-'+Math.min(20,currentLevel);
    if(incomplete)openStep=incomplete.id;
  });
  const atLevel=$derived(at?.startsWith('level-')?Number(at.slice(6)):null);
  const index=$derived(sequence.indexOf(at));

  function slotDone(slot){
    if(slot.type==='feat')return !!planFeat(plan,slot);
    if(slot.type==='ability')return planBoosts(plan,slot.level).length>=slot.count;
    if(slot.type==='skill')return !!planSkillIncrease(plan,slot);
    if(slot.type==='spells')return planSpells(plan,slot.level).length>=(slot.allowance?.total??0);
    if(slot.type==='signature')return slot.ranks.every(r=>planSignature(plan,slot.level,r));
    return true;
  }
  function levelStatus(level){
    if(level===1){
      const required=steps.filter(s=>!s.optional&&s.id!=='review');
      const done=required.filter(s=>s.complete).length;
      return done===required.length?'done':done?'part':'todo';
    }
    const slots=slotsAt(level).filter(s=>['feat','ability','skill','spells','signature'].includes(s.type));
    const done=slots.filter(slotDone).length;
    return !slots.length?'none':done===slots.length?'done':done?'part':'todo';
  }
  function levelLines(level){
    if(level>1)return levelSummary(level,slotsAt(level),plan);
    const pick=id=>{const s=steps.find(x=>x.id===id);return s?stepSummary(s,creation,catalog.get,variants):'';};
    const lineage=creation.heritage?.name&&creation.ancestry?.name&&creation.heritage.name.includes(creation.ancestry.name)
      ?creation.heritage.name:[creation.heritage?.name,creation.ancestry?.name].filter(Boolean).join(' ');
    return [[lineage,creation.background?.name].filter(Boolean).join(' · '),
      [creation.class?.name,pick('subclass')].filter(Boolean).join(' · '),pick('feats')].filter(Boolean);
  }
  const wishCount=level=>wishlist(planner).filter(w=>w.targetLevel===level).length;

  // Characters shared for viewing open read-only: edits are ignored and nothing is saved.
  const canEdit=$derived(character?.access?.edit!==false);
  const canManage=$derived(character?.access?.manage===true);
  let sharing=$state(false);
  let confirmDelete=$state(false);
  // The discreet "+" beside the next-level button: extra feats / skill increases at this level.
  let addMenu=$state(false);
  let extraMode=$state(null);
  let deleting=$state(false);
  async function deleteCharacter(){
    deleting=true;clearTimeout(timer);
    try{
      await api('/api/v1/campaigns/'+encodeURIComponent(campaignId)+'/characters/'+encodeURIComponent(characterId),{method:'DELETE'});
      location.replace(campaignPath(campaignId));
    }catch(e){error=e.message;deleting=false;confirmDelete=false;}
  }
  function update(change){if(!canEdit)return;creation=change(creation);schedule();}
  function updatePlan(change){if(!canEdit)return;plan=change(ensurePlan(plan,creation));schedule();}
  function updatePlanner(change){if(!canEdit)return;planner=change(planner);schedule();}
  function schedule(){if(!canEdit)return;saveState='unsaved';clearTimeout(timer);timer=setTimeout(save,700);}
  async function save(){
    if(saveState==='saving'||conflict){if(!conflict)schedule();return;}
    saveState='saving';
    // Leveler ignores a plan whose class differs from the actor's, so keep it in step.
    const savedPlan=plan||creation.class?ensurePlan(plan,creation):null;
    try{
      const result=await api('/api/v1/campaigns/'+encodeURIComponent(campaignId)+'/characters/'+encodeURIComponent(characterId)+'/document',
        {method:'PUT',body:{name:name.trim()||character.name,level:currentLevel,revision:character.revision,
          document:{leveler:{creation,plan:savedPlan},planner}}});
      character={...character,revision:result.character.revision,name:result.character.name,level:result.character.level};
      if(saveState==='saving')saveState='saved';
      error='';
    }catch(e){
      saveState='error';error=e.message;
      if(e.code==='character_changed_elsewhere_refresh_first')conflict=true;
    }
  }
  function go(target){
    let next=target==='next'?sequence[Math.min(sequence.length-1,index+1)]
      :target==='prev'?sequence[Math.max(0,index-1)]:target;
    if(!next)return;
    // A level-1 step id opens level 1 at that card.
    if(!sequence.includes(next)){openStep=next;next='level-1';}
    at=next;
    railOpen=false;extraMode=null;addMenu=false;
    try{history.replaceState(history.state,'','?at='+encodeURIComponent(next));}catch{}
    document.querySelector('.stage')?.scrollTo?.({top:0});
  }
  const labelOf=id=>id==='equipment'?'Equipment plan':id?.startsWith('level-')?'Level '+id.slice(6):'';
  const saveLabel=$derived({saved:'Saved',saving:'Saving…',unsaved:'Unsaved',error:'Not saved'}[saveState]);
</script>
<svelte:head><title>{name||'Character'} · PF2e Planner</title></svelte:head>
{#if ctx}
  <AppBar me={ctx.me} campaigns={ctx.campaigns} campaign={ctx.campaign} sync={ctx.sync} crumb={name}>
    {#snippet actions()}
      {#if canEdit}<span class="save {saveState}" role="status">{saveLabel}</span>{:else}<span class="save">View only</span>{/if}
      {#if canManage}<button class="btn small ghost" onclick={()=>sharing=true}>Share</button>
        <button class="btn small ghost danger" onclick={()=>confirmDelete=true}>Delete</button>{/if}
    {/snippet}
  </AppBar>
{/if}
{#if sharing}
  <SharePanel url={'/api/v1/campaigns/'+encodeURIComponent(campaignId)+'/characters/'+encodeURIComponent(characterId)+'/sharing'}
    onClose={()=>sharing=false} onSaved={s=>character={...character,visibility:s.visibility}}/>
{/if}
{#if confirmDelete}
  <div class="banner" role="alertdialog" aria-labelledby="delete-title">
    <div class="notice bad delete">
      <b id="delete-title">Delete {name||'this character'}?</b>
      <span>This removes the build from the website for everyone{character?.linked?' and unlinks its Foundry actor (the actor itself stays)':''}. It can't be undone.</span>
      <span class="row"><button class="btn small" onclick={()=>confirmDelete=false}>Keep it</button>
        <button class="btn small danger" disabled={deleting} onclick={deleteCharacter}>{deleting?'Deleting…':'Delete character'}</button></span>
    </div>
  </div>
{/if}
{#if character&&!canEdit}
  <div class="banner"><p class="notice">{character.ownerName??'Its owner'} shared this character with you to view. Changes you make here aren’t saved.</p></div>
{/if}
{#if error}
  <div class="banner" role="alert"><p class="notice bad">{error}
    {#if conflict}<button class="link" onclick={()=>location.reload()}>Reload</button>{/if}</p></div>
{/if}
{#if creation&&catalog}
  <div class="mobile-bar">
    <button class="menu-btn" aria-expanded={railOpen} aria-controls="builder-rail" onclick={()=>railOpen=!railOpen}>
      <span aria-hidden="true">☰</span><span class="sr">Levels</span></button>
    <span class="where"><b>{labelOf(at)}</b><small>{name} · level {currentLevel}</small></span>
  </div>
  {#if railOpen}<div class="scrim" role="presentation" onclick={()=>railOpen=false}></div>{/if}
  <div class="builder">
    <nav class="rail" class:open={railOpen} id="builder-rail" aria-label="Levels">
      <div class="identity">
        <label class="field" for="character-name"><span class="eyebrow">Character</span>
          <input id="character-name" maxlength="80" bind:value={name} oninput={schedule} readonly={!canEdit}/></label>
        <label class="field level-pick" for="current-level"><span class="eyebrow">Level</span>
          <select id="current-level" bind:value={currentLevel} onchange={schedule} disabled={!canEdit}>
            {#each Array.from({length:20},(_,i)=>i+1) as n}<option value={n}>{n}</option>{/each}
          </select></label>
      </div>
      <ol>
        {#each Array.from({length:20},(_,i)=>i+1) as level}
          {@const lines=primary||level===1?levelLines(level):[]}
          {@const status=primary||level===1?levelStatus(level):'none'}
          {@const wishes=wishCount(level)}
          <li><button class="item" class:on={at==='level-'+level} class:future={level>currentLevel}
            aria-current={at==='level-'+level?'step':undefined} onclick={()=>go('level-'+level)}>
            <span class="lvl num">{level}</span>
            <span class="label">
              {#if lines.length}{#each lines as line}<span class="pick">{line}</span>{/each}{:else}<span class="pick faint">—</span>{/if}
              {#if level===currentLevel||wishes}<span class="tags">
                {#if level===currentLevel}<span class="now">Current</span>{/if}
                {#if wishes}<span class="wish">{wishes} item{wishes===1?'':'s'}</span>{/if}</span>{/if}
            </span>
            <span class="status {status}" aria-label={status}></span>
          </button></li>
        {/each}
        <li><button class="item" class:on={at==='equipment'} onclick={()=>go('equipment')}>
          <span class="lvl" aria-hidden="true">⚒</span>
          <span class="label"><span class="name">Equipment plan</span>
            <span class="pick">{wishlist(planner).length?wishlist(planner).length+' items wanted':'Items to buy as you level'}</span></span>
          <span></span>
        </button></li>
      </ol>
    </nav>
    <main class="stage">
      <header class="stage-head">
        <span class="eyebrow">{atLevel?`Level ${atLevel} of 20`:'Wishlist'}</span>
        <h1>{labelOf(at)}</h1>
      </header>
      {#if at==='level-1'}
        <Level1Panel {steps} open={openStep} {creation} {plan} {catalog} {variants} {update} info={uuid=>detail=uuid}
          onOpen={id=>openStep=id} onPlan={()=>go('level-2')}/>
      {:else if atLevel&&!primary}
        <p class="empty">Choose a class at level 1 to plan levels 2–20.</p>
      {:else if atLevel}
        {#key atLevel}
          <LevelPanel level={atLevel} slots={slotsAt(atLevel)} {creation} {plan} {planner} {catalog} {variants} {updatePlan}
            info={uuid=>detail=uuid} {currentLevel} onEquipment={()=>go('equipment')}/>
        {/key}
      {:else if at==='equipment'}
        <WishlistPanel {planner} {catalog} {updatePlanner} {currentLevel} info={uuid=>detail=uuid}/>
      {/if}
      {#if atLevel&&isRunesmith(creation)}
        {#key atLevel}<RunesPanel level={atLevel} {planner} {catalog} {updatePlanner} info={uuid=>detail=uuid} readonly={!canEdit}/>{/key}
      {/if}
      {#if atLevel&&(atLevel===1||primary)}
        {#key atLevel}
          <ExtrasPanel level={atLevel} {creation} {plan} {catalog} {variants} {updatePlan} info={uuid=>detail=uuid} bind:mode={extraMode}/>
        {/key}
      {/if}
      <footer class="stage-foot">
        <button class="btn" disabled={index<=0} onclick={()=>go('prev')}>← {labelOf(sequence[index-1])||'Back'}</button>
        <span class="next">
          {#if atLevel&&canEdit&&(atLevel===1||primary)}
            <span class="add-wrap">
              <button class="btn add" aria-haspopup="menu" aria-expanded={addMenu} title="Add an extra feat or skill increase at this level"
                aria-label="Add an extra at level {atLevel}" onclick={()=>addMenu=!addMenu}>+</button>
              {#if addMenu}
                <span class="add-menu" role="menu">
                  <button role="menuitem" onclick={()=>{extraMode='feat';addMenu=false;}}>Extra feat</button>
                  <button role="menuitem" onclick={()=>{extraMode='skill';addMenu=false;}}>Extra skill increase</button>
                </span>
              {/if}
            </span>
          {/if}
          {#if index<sequence.length-1}<button class="btn primary" onclick={()=>{extraMode=null;addMenu=false;go('next');}}>{labelOf(sequence[index+1])} →</button>{/if}
        </span>
      </footer>
    </main>
    <div class="side"><SummaryPanel {name} {creation} {plan} lookup={catalog.get} {steps} onStep={go} level={currentLevel}/></div>
  </div>
  <ItemDrawer {campaignId} uuid={detail} level={atLevel??currentLevel} onClose={()=>detail=null}/>
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
  ol{list-style:none;margin:0;padding:0;display:grid;gap:1px}
  .item{display:grid;grid-template-columns:24px minmax(0,1fr) auto;gap:10px;align-items:start;width:100%;background:none;border:0;
    border-radius:8px;padding:7px 8px;color:var(--text-2);text-align:left}
  .item:hover{background:var(--panel-2)}
  .item.on{background:var(--panel-3);color:var(--text)}
  .label{display:grid;gap:1px;min-width:0}
  .name{font-weight:700;font-size:.9rem;color:var(--text)}
  .pick{font-size:.8rem;color:var(--text-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .faint{color:var(--faint)}
  .lvl{font:700 .85rem var(--mono);color:var(--muted);text-align:center;padding-top:1px}
  .on .lvl{color:var(--brass)}
  .future .lvl{color:var(--faint)}
  .tags{display:flex;gap:4px;margin-top:2px}
  .now,.wish{font:600 .62rem var(--mono);text-transform:uppercase;border-radius:3px;padding:1px 4px}
  .now{background:var(--brass);color:var(--on-brass)}
  .wish{background:var(--panel-3);color:var(--text-2)}
  .status{width:9px;height:9px;border-radius:50%;margin-top:5px;background:var(--line-strong)}
  .status.done{background:var(--good)}.status.part{background:transparent;border:2px solid var(--brass)}
  .status.none{background:transparent}
  .empty{border:1px dashed var(--line-strong);border-radius:var(--radius);padding:1.4rem;color:var(--muted)}
  .stage{padding:24px 28px 40px;display:grid;gap:18px;align-content:start;min-width:0}
  .stage-head{display:grid;gap:4px}
  h1{font-size:clamp(1.5rem,3vw,2rem);font-weight:800}
  .stage-foot{display:flex;justify-content:space-between;gap:8px;border-top:1px solid var(--line);padding-top:16px;flex-wrap:wrap}
  .next{display:flex;gap:8px;align-items:center;margin-left:auto}
  .add-wrap{position:relative}
  .btn.add{width:38px;padding-inline:0;font:700 1.1rem var(--mono);color:var(--muted)}
  .add-menu{position:absolute;bottom:calc(100% + 6px);right:0;display:grid;min-width:190px;background:var(--panel);
    border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow);padding:6px;z-index:20}
  .add-menu button{background:none;border:0;text-align:left;padding:8px;border-radius:6px;font-weight:700;color:var(--text)}
  .add-menu button:hover{background:var(--panel-2)}
  .side{border-left:1px solid var(--line);background:var(--panel);padding:20px 18px;position:sticky;top:57px;
    max-height:calc(100vh - 57px);overflow:auto;padding-right:max(18px,env(safe-area-inset-right,0px))}
  .mobile-bar,.scrim{display:none}
  .sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
  @media(max-width:1180px){
    .builder{grid-template-columns:250px minmax(0,1fr)}
    .side{grid-column:1/-1;position:static;max-height:none;border-left:0;border-top:1px solid var(--line)}
  }
  @media(max-width:760px){
    .builder{grid-template-columns:minmax(0,1fr)}
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
