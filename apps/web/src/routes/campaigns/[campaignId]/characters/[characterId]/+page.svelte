<script>
  import {page} from '$app/state';
  import AppBar from '../../../../../lib/ui/AppBar.svelte';
  import StepPanel from '../../../../../lib/wizard/StepPanel.svelte';
  import SummaryPanel from '../../../../../lib/wizard/SummaryPanel.svelte';
  import ItemDrawer from '../../../../../lib/wizard/ItemDrawer.svelte';
  import {api,campaignPath} from '../../../../../lib/ui/api.js';
  import {loadCampaign} from '../../../../../lib/ui/session.js';
  import {loadCatalog} from '../../../../../lib/builder/catalog.js';
  import {creationSteps} from '../../../../../lib/builder/schema.js';
  import {emptyCreation} from '../../../../../lib/leveler-format.js';

  const campaignId=$derived(page.params.campaignId);
  const characterId=$derived(page.params.characterId);
  let ctx=$state(null);
  let catalog=$state(null);
  let character=$state(null);
  let creation=$state(null);
  let name=$state('');
  let error=$state('');
  let saveState=$state('saved');
  let conflict=$state(false);
  let current=$state(null);
  let detail=$state(null);
  let timer;

  $effect(()=>{
    const id=characterId,cid=campaignId;
    (async()=>{
      try{
        const [loaded,result,cat]=await Promise.all([loadCampaign(cid),
          api('/api/v1/campaigns/'+encodeURIComponent(cid)+'/characters/'+encodeURIComponent(id)),loadCatalog(cid)]);
        ctx=loaded;catalog=cat;character=result.character;name=character.name;
        creation={...emptyCreation(),...(character.leveler?.creation??{})};
      }catch(e){error=e.message;}
    })();
    return ()=>clearTimeout(timer);
  });
  const variants=$derived(catalog?.variants&&Object.keys(catalog.variants).length?catalog.variants:ctx?.sync?.variants??{});
  const steps=$derived(creation&&catalog?creationSteps(creation,catalog.get,variants):[]);
  $effect(()=>{
    if(!steps.length)return;
    if(!current||!steps.some(s=>s.id===current))current=(steps.find(s=>!s.complete&&!s.optional)??steps[0]).id;
  });
  const index=$derived(steps.findIndex(s=>s.id===current));
  const step=$derived(steps[index]??null);
  const planHref=$derived(campaignPath(campaignId,'/characters/'+characterId+'/plan'));

  function update(change){
    creation=change(creation);
    schedule();
  }
  function schedule(){
    saveState='unsaved';
    clearTimeout(timer);
    timer=setTimeout(save,700);
  }
  async function save(){
    if(saveState==='saving'||conflict){if(!conflict)schedule();return;}
    saveState='saving';
    const plan=character.leveler?.plan?{...character.leveler.plan,
      // Leveler ignores a plan whose class differs from the actor's.
      classSlug:creation.class?.slug??null,dualClassSlug:creation.dualClass?.slug??null}:null;
    try{
      const result=await api('/api/v1/campaigns/'+encodeURIComponent(campaignId)+'/characters/'+encodeURIComponent(characterId)+'/document',
        {method:'PUT',body:{name:name.trim()||character.name,level:character.level,revision:character.revision,
          document:{leveler:{creation,plan},planner:character.planner??{}}}});
      character={...character,revision:result.character.revision,leveler:result.character.leveler,name:result.character.name};
      saveState=saveState==='saving'?'saved':saveState;
      error='';
    }catch(e){
      saveState='error';error=e.message;
      if(e.code==='character_changed_elsewhere_refresh_first')conflict=true;
    }
  }
  function go(target){
    if(target==='next')current=steps[Math.min(steps.length-1,index+1)]?.id??current;
    else if(target==='prev')current=steps[Math.max(0,index-1)]?.id??current;
    else current=target;
    document.querySelector('.stage')?.scrollTo?.({top:0});
  }
  const saveLabel=$derived({saved:'Saved',saving:'Saving…',unsaved:'Unsaved',error:'Not saved'}[saveState]);
</script>
<svelte:head><title>{name||'Character'} · Character Wizard</title></svelte:head>
{#if ctx}
  <AppBar me={ctx.me} campaigns={ctx.campaigns} campaign={ctx.campaign} sync={ctx.sync} crumb={name}>
    {#snippet actions()}
      <nav class="modes" aria-label="Character mode">
        <span class="mode on" aria-current="page">Create</span>
        <a class="mode" href={planHref}>Plan levels 2–20</a>
      </nav>
      <span class="save {saveState}" role="status">{saveLabel}</span>
    {/snippet}
  </AppBar>
{/if}
{#if error}
  <div class="banner" role="alert"><p class="notice bad">{error}
    {#if conflict}<button class="link" onclick={()=>location.reload()}>Reload</button>{/if}</p></div>
{/if}
{#if creation&&catalog}
  <div class="wizard">
    <nav class="rail" aria-label="Wizard steps">
      <label class="name" for="character-name"><span class="eyebrow">Character</span>
        <input id="character-name" maxlength="80" bind:value={name} oninput={schedule}/></label>
      <ol>
        {#each steps as s,i (s.id)}
          <li><button class="step-link" class:on={s.id===current} class:done={s.complete} aria-current={s.id===current?'step':undefined}
            onclick={()=>go(s.id)}>
            <span class="dot" aria-hidden="true">{s.complete&&s.id!=='review'?'✓':i+1}</span>
            <span class="label">{s.label}</span>
          </button></li>
        {/each}
      </ol>
      {#if !catalog.count}<p class="notice warn small">No synced compendiums yet. The GM needs to run Sync Now in Foundry.</p>{/if}
    </nav>
    <main class="stage">
      {#if step}
        <header class="stage-head">
          <span class="eyebrow">Step {index+1} of {steps.length}</span>
          <h1>{step.id==='review'?'Review level 1':step.label}</h1>
        </header>
        {#key step.id}
          <StepPanel {step} {steps} {creation} {catalog} {variants} {update} info={uuid=>detail=uuid} {go} {planHref}/>
        {/key}
        <footer class="stage-foot">
          <button class="btn" disabled={index<=0} onclick={()=>go('prev')}>← {steps[index-1]?.label??'Back'}</button>
          {#if index<steps.length-1}
            <button class="btn primary" onclick={()=>go('next')}>{steps[index+1].label} →</button>
          {/if}
        </footer>
      {/if}
    </main>
    <div class="side"><SummaryPanel {name} {creation} lookup={catalog.get} {steps} onStep={go}/></div>
  </div>
  <ItemDrawer {campaignId} uuid={detail} onClose={()=>detail=null}/>
{:else if !error}
  <p class="loading muted">Loading the Character Wizard…</p>
{/if}
<style>
  .modes{display:flex;border:1px solid var(--line);border-radius:8px;overflow:hidden}
  .mode{padding:6px 12px;font-weight:700;font-size:.85rem;color:var(--text-2);text-decoration:none}
  .mode.on{background:var(--brass-soft);color:var(--brass)}
  .mode:hover:not(.on){background:var(--panel-2)}
  .save{font:500 12px var(--mono);color:var(--muted);min-width:64px}
  .save.unsaved,.save.saving{color:var(--warn)}.save.error{color:var(--bad)}
  .banner{padding:12px max(16px,env(safe-area-inset-right,0px)) 0 max(16px,env(safe-area-inset-left,0px))}
  .loading{padding:32px}
  .wizard{display:grid;grid-template-columns:230px minmax(0,1fr) 290px;min-height:calc(100vh - 57px)}
  .rail{border-right:1px solid var(--line);background:var(--panel);padding:16px 10px;display:grid;gap:14px;align-content:start;
    position:sticky;top:57px;max-height:calc(100vh - 57px);overflow-y:auto;overflow-x:hidden;padding-left:max(10px,env(safe-area-inset-left,0px))}
  .name{display:grid;gap:4px;padding:0 6px}
  .name input{font:800 1rem var(--display);padding:.45rem .6rem;width:100%;min-width:0}
  ol{list-style:none;margin:0;padding:0;display:grid;gap:2px}
  .step-link{display:flex;gap:10px;align-items:center;width:100%;background:none;border:0;border-radius:8px;padding:7px 8px;
    color:var(--muted);text-align:left;font-size:.9rem}
  .step-link:hover{background:var(--panel-2);color:var(--text)}
  .step-link.on{background:var(--panel-3);color:var(--text);font-weight:700}
  .dot{width:22px;height:22px;flex:none;border-radius:50%;border:1.5px solid var(--line-strong);display:grid;place-items:center;font:600 .68rem var(--mono)}
  .done .dot{background:var(--good-soft);border-color:var(--good);color:var(--good)}
  .on .dot{border-color:var(--brass);color:var(--brass)}
  .label{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .small{font-size:.8rem}
  .stage{padding:24px 28px 40px;display:grid;gap:18px;align-content:start;min-width:0}
  .stage-head{display:grid;gap:4px}
  h1{font-size:clamp(1.5rem,3vw,2rem);font-weight:800}
  .stage-foot{display:flex;justify-content:space-between;gap:8px;border-top:1px solid var(--line);padding-top:16px;flex-wrap:wrap}
  .side{border-left:1px solid var(--line);background:var(--panel);padding:20px 18px;position:sticky;top:57px;
    max-height:calc(100vh - 57px);overflow:auto;padding-right:max(18px,env(safe-area-inset-right,0px))}
  @media(max-width:1100px){
    .wizard{grid-template-columns:200px minmax(0,1fr)}
    .side{grid-column:1/-1;position:static;max-height:none;border-left:0;border-top:1px solid var(--line)}
  }
  @media(max-width:640px){
    .save{display:none}
    .mode{padding:5px 8px;font-size:.78rem}
  }
  @media(max-width:760px){
    .wizard{grid-template-columns:minmax(0,1fr)}
    .rail{position:static;max-height:none;border-right:0;border-bottom:1px solid var(--line)}
    ol{display:flex;overflow-x:auto;gap:4px;padding-bottom:4px}
    .step-link{white-space:nowrap}
    .stage{padding:18px max(16px,env(safe-area-inset-right,0px)) 32px max(16px,env(safe-area-inset-left,0px))}
  }
</style>
