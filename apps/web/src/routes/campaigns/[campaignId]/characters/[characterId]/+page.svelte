<script>
  import {page} from '$app/state';
  import AppBar from '../../../../../lib/ui/AppBar.svelte';
  import StepPanel from '../../../../../lib/wizard/StepPanel.svelte';
  import LevelPanel from '../../../../../lib/wizard/LevelPanel.svelte';
  import SummaryPanel from '../../../../../lib/wizard/SummaryPanel.svelte';
  import ItemDrawer from '../../../../../lib/wizard/ItemDrawer.svelte';
  import {api} from '../../../../../lib/ui/api.js';
  import {loadCampaign} from '../../../../../lib/ui/session.js';
  import {loadCatalog} from '../../../../../lib/builder/catalog.js';
  import {creationSteps} from '../../../../../lib/builder/schema.js';
  import {ensurePlan,planFeat,planBoosts,planSkillIncrease,planSpells} from '../../../../../lib/builder/plan.js';
  import {stepSummary,levelSummary} from '../../../../../lib/builder/summaries.js';
  import {levelerChoiceSlots} from '../../../../../lib/leveler-progression.js';
  import {emptyCreation} from '../../../../../lib/leveler-format.js';

  const campaignId=$derived(page.params.campaignId);
  const characterId=$derived(page.params.characterId);
  let ctx=$state(null);
  let catalog=$state(null);
  let character=$state(null);
  let creation=$state(null);
  let plan=$state(null);
  let name=$state('');
  let currentLevel=$state(1);
  let error=$state('');
  let saveState=$state('saved');
  let conflict=$state(false);
  let at=$state(null);
  let detail=$state(null);
  let timer;

  $effect(()=>{
    const id=characterId,cid=campaignId;
    (async()=>{
      try{
        const [loaded,result,cat]=await Promise.all([loadCampaign(cid),
          api('/api/v1/campaigns/'+encodeURIComponent(cid)+'/characters/'+encodeURIComponent(id)),loadCatalog(cid)]);
        ctx=loaded;catalog=cat;character=result.character;name=character.name;currentLevel=character.level;
        creation={...emptyCreation(),...(character.leveler?.creation??{})};
        plan=character.leveler?.plan??null;
        at=new URLSearchParams(location.search).get('at');
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
  // One sequence: level-1 steps, then levels 2–20.
  const sequence=$derived([...steps.map(s=>s.id),...(primary?Array.from({length:19},(_,i)=>'level-'+(i+2)):[])]);
  $effect(()=>{
    if(!steps.length)return;
    if(!at||!sequence.includes(at))at=(steps.find(s=>!s.complete&&!s.optional)??steps.at(-1)).id;
  });
  const atLevel=$derived(at?.startsWith('level-')?Number(at.slice(6)):null);
  const step=$derived(atLevel?null:steps.find(s=>s.id===at)??null);
  const index=$derived(sequence.indexOf(at));

  function slotDone(slot){
    if(slot.type==='feat')return !!planFeat(plan,slot);
    if(slot.type==='ability')return planBoosts(plan,slot.level).length>=slot.count;
    if(slot.type==='skill')return !!planSkillIncrease(plan,slot);
    if(slot.type==='spells')return planSpells(plan,slot.level).length>=(slot.allowance?.total??0);
    return true;
  }
  function levelStatus(level){
    const slots=slotsAt(level).filter(s=>['feat','ability','skill','spells'].includes(s.type));
    const done=slots.filter(slotDone).length;
    return !slots.length?'none':done===slots.length?'done':done?'part':'todo';
  }

  function update(change){creation=change(creation);schedule();}
  function updatePlan(change){plan=change(ensurePlan(plan,creation));schedule();}
  function schedule(){saveState='unsaved';clearTimeout(timer);timer=setTimeout(save,700);}
  async function save(){
    if(saveState==='saving'||conflict){if(!conflict)schedule();return;}
    saveState='saving';
    // Leveler ignores a plan whose class differs from the actor's, so keep it in step.
    const savedPlan=plan||creation.class?ensurePlan(plan,creation):null;
    try{
      const result=await api('/api/v1/campaigns/'+encodeURIComponent(campaignId)+'/characters/'+encodeURIComponent(characterId)+'/document',
        {method:'PUT',body:{name:name.trim()||character.name,level:currentLevel,revision:character.revision,
          document:{leveler:{creation,plan:savedPlan},planner:character.planner??{}}}});
      character={...character,revision:result.character.revision,name:result.character.name,level:result.character.level};
      if(saveState==='saving')saveState='saved';
      error='';
    }catch(e){
      saveState='error';error=e.message;
      if(e.code==='character_changed_elsewhere_refresh_first')conflict=true;
    }
  }
  function go(target){
    const next=target==='next'?sequence[Math.min(sequence.length-1,index+1)]
      :target==='prev'?sequence[Math.max(0,index-1)]:target;
    if(!next)return;
    at=next;
    try{history.replaceState(history.state,'','?at='+encodeURIComponent(next));}catch{}
    document.querySelector('.stage')?.scrollTo?.({top:0});
  }
  const labelOf=id=>id?.startsWith('level-')?'Level '+id.slice(6):steps.find(s=>s.id===id)?.label??'';
  const saveLabel=$derived({saved:'Saved',saving:'Saving…',unsaved:'Unsaved',error:'Not saved'}[saveState]);
</script>
<svelte:head><title>{name||'Character'} · PF2e Planner</title></svelte:head>
{#if ctx}
  <AppBar me={ctx.me} campaigns={ctx.campaigns} campaign={ctx.campaign} sync={ctx.sync} crumb={name}>
    {#snippet actions()}<span class="save {saveState}" role="status">{saveLabel}</span>{/snippet}
  </AppBar>
{/if}
{#if error}
  <div class="banner" role="alert"><p class="notice bad">{error}
    {#if conflict}<button class="link" onclick={()=>location.reload()}>Reload</button>{/if}</p></div>
{/if}
{#if creation&&catalog}
  <div class="builder">
    <nav class="rail" aria-label="Character steps and levels">
      <div class="identity">
        <label class="field" for="character-name"><span class="eyebrow">Character</span>
          <input id="character-name" maxlength="80" bind:value={name} oninput={schedule}/></label>
        <label class="field level-pick" for="current-level"><span class="eyebrow">Current level</span>
          <select id="current-level" bind:value={currentLevel} onchange={schedule}>
            {#each Array.from({length:20},(_,i)=>i+1) as n}<option value={n}>{n}</option>{/each}
          </select></label>
      </div>
      <span class="group eyebrow">Level 1</span>
      <ol>
        {#each steps as s (s.id)}
          {@const summary=stepSummary(s,creation,catalog.get,variants)}
          <li><button class="item" class:on={s.id===at} aria-current={s.id===at?'step':undefined} onclick={()=>go(s.id)}>
            <span class="dot {s.complete?'done':'todo'}" aria-hidden="true">{s.complete&&s.id!=='review'?'✓':''}</span>
            <span class="label"><span class="name">{s.label}</span>{#if summary}<span class="pick">{summary}</span>{/if}</span>
          </button></li>
        {/each}
      </ol>
      <span class="group eyebrow">Levels 2–20</span>
      {#if primary}
        <ol>
          {#each Array.from({length:19},(_,i)=>i+2) as level}
            {@const lines=levelSummary(level,slotsAt(level),plan)}
            {@const status=levelStatus(level)}
            <li><button class="item level" class:on={at==='level-'+level} class:future={level>currentLevel}
              aria-current={at==='level-'+level?'step':undefined} onclick={()=>go('level-'+level)}>
              <span class="lvl num">{level}</span>
              <span class="label">{#if lines.length}{#each lines as line}<span class="pick">{line}</span>{/each}{:else}<span class="pick faint">{status==='none'?'Class features only':'Nothing chosen yet'}</span>{/if}
                {#if level===currentLevel}<span class="now">Current</span>{/if}</span>
              <span class="status {status}" aria-label={status}></span>
            </button></li>
          {/each}
        </ol>
      {:else}
        <p class="muted small pad">Choose a class to plan levels 2–20.</p>
      {/if}
    </nav>
    <main class="stage">
      <header class="stage-head">
        <span class="eyebrow">{atLevel?`Level ${atLevel} of 20`:`Level 1 · step ${index+1} of ${steps.length}`}</span>
        <h1>{atLevel?'Level '+atLevel:step?.id==='review'?'Review level 1':step?.label}</h1>
      </header>
      {#if atLevel}
        {#key atLevel}
          <LevelPanel level={atLevel} slots={slotsAt(atLevel)} {creation} {plan} {catalog} {variants} {updatePlan}
            info={uuid=>detail=uuid} {currentLevel}/>
        {/key}
      {:else if step}
        {#key step.id}
          <StepPanel {step} {steps} {creation} {plan} {catalog} {variants} {update} info={uuid=>detail=uuid} {go}
            onPlan={()=>go('level-2')}/>
        {/key}
      {/if}
      <footer class="stage-foot">
        <button class="btn" disabled={index<=0} onclick={()=>go('prev')}>← {labelOf(sequence[index-1])||'Back'}</button>
        {#if index<sequence.length-1}<button class="btn primary" onclick={()=>go('next')}>{labelOf(sequence[index+1])} →</button>{/if}
      </footer>
    </main>
    <div class="side"><SummaryPanel {name} {creation} {plan} lookup={catalog.get} {steps} onStep={go} level={atLevel??1}/></div>
  </div>
  <ItemDrawer {campaignId} uuid={detail} level={atLevel??1} onClose={()=>detail=null}/>
{:else if !error}
  <p class="loading muted">Loading the character…</p>
{/if}
<style>
  .save{font:500 12px var(--mono);color:var(--muted);min-width:64px}
  .save.unsaved,.save.saving{color:var(--warn)}.save.error{color:var(--bad)}
  .banner{padding:12px max(16px,env(safe-area-inset-right,0px)) 0 max(16px,env(safe-area-inset-left,0px))}
  .loading{padding:32px}
  .builder{display:grid;grid-template-columns:270px minmax(0,1fr) 290px;min-height:calc(100vh - 57px)}
  .rail{border-right:1px solid var(--line);background:var(--panel);padding:14px 10px 24px;display:grid;gap:8px;align-content:start;
    position:sticky;top:57px;max-height:calc(100vh - 57px);overflow-y:auto;overflow-x:hidden;padding-left:max(10px,env(safe-area-inset-left,0px))}
  .identity{display:grid;grid-template-columns:minmax(0,1fr) 76px;gap:8px;padding:0 6px 6px}
  .identity input{font:800 1rem var(--display);padding:.45rem .6rem;width:100%;min-width:0}
  .identity select{padding:.45rem .4rem}
  .group{padding:10px 8px 2px}
  ol{list-style:none;margin:0;padding:0;display:grid;gap:1px}
  .item{display:grid;grid-template-columns:22px minmax(0,1fr) auto;gap:10px;align-items:start;width:100%;background:none;border:0;
    border-radius:8px;padding:7px 8px;color:var(--text-2);text-align:left}
  .item:hover{background:var(--panel-2)}
  .item.on{background:var(--panel-3);color:var(--text)}
  .dot{width:20px;height:20px;border-radius:50%;border:1.5px solid var(--line-strong);display:grid;place-items:center;font-size:.65rem;margin-top:1px}
  .dot.done{background:var(--good-soft);border-color:var(--good);color:var(--good)}
  .on .dot{border-color:var(--brass)}
  .label{display:grid;gap:1px;min-width:0}
  .name{font-weight:700;font-size:.9rem;color:var(--text)}
  .pick{font-size:.8rem;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .on .pick{color:var(--text-2)}
  .faint{color:var(--faint)}
  .lvl{font:700 .85rem var(--mono);color:var(--muted);text-align:center;padding-top:1px}
  .on .lvl{color:var(--brass)}
  .level .pick{color:var(--text-2)}
  .future .lvl{color:var(--faint)}
  .now{justify-self:start;margin-top:2px;font:600 .62rem var(--mono);text-transform:uppercase;background:var(--brass);color:var(--on-brass);border-radius:3px;padding:1px 4px}
  .status{width:9px;height:9px;border-radius:50%;margin-top:5px;background:var(--line-strong)}
  .status.done{background:var(--good)}.status.part{background:transparent;border:2px solid var(--brass)}
  .status.none{background:transparent}
  .small{font-size:.85rem}.pad{padding:0 8px}
  .stage{padding:24px 28px 40px;display:grid;gap:18px;align-content:start;min-width:0}
  .stage-head{display:grid;gap:4px}
  h1{font-size:clamp(1.5rem,3vw,2rem);font-weight:800}
  .stage-foot{display:flex;justify-content:space-between;gap:8px;border-top:1px solid var(--line);padding-top:16px;flex-wrap:wrap}
  .side{border-left:1px solid var(--line);background:var(--panel);padding:20px 18px;position:sticky;top:57px;
    max-height:calc(100vh - 57px);overflow:auto;padding-right:max(18px,env(safe-area-inset-right,0px))}
  @media(max-width:1180px){
    .builder{grid-template-columns:250px minmax(0,1fr)}
    .side{grid-column:1/-1;position:static;max-height:none;border-left:0;border-top:1px solid var(--line)}
  }
  @media(max-width:760px){
    .builder{grid-template-columns:minmax(0,1fr)}
    .rail{position:static;max-height:46vh;border-right:0;border-bottom:1px solid var(--line)}
    .stage{padding:18px max(16px,env(safe-area-inset-right,0px)) 32px max(16px,env(safe-area-inset-left,0px))}
  }
  @media(max-width:640px){.save{display:none}}
</style>
