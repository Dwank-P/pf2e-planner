<script>
  import StepPanel from './StepPanel.svelte';
  import {stepSummary} from '../builder/summaries.js';
  /** Level 1 laid out like levels 2–20: one card per creation step, opened in place. */
  let {steps,open=null,creation,plan,catalog,variants,update,info,onOpen,onPlan}=$props();
  const cards=$derived(steps.filter(s=>s.id!=='review'));
  function go(target){
    const index=cards.findIndex(s=>s.id===open);
    if(target==='next'){
      // Move on to the next step that still needs a choice, else the next card.
      const after=cards.slice(index+1);
      onOpen((after.find(s=>!s.complete&&!s.optional)??after[0])?.id??null);
    }else if(target==='prev')onOpen(cards[Math.max(0,index-1)]?.id??null);
    else onOpen(target);
  }
</script>
<div class="level">
  {#each cards as step (step.id)}
    {@const summary=stepSummary(step,creation,catalog.get,variants)}
    <section class="slot" class:open={open===step.id} class:done={step.complete}>
      <button class="head" aria-expanded={open===step.id} onclick={()=>onOpen(open===step.id?null:step.id)}>
        <span class="icon" aria-hidden="true">{step.complete?'✓':'·'}</span>
        <span class="text"><span class="eyebrow">{step.label}</span>
          <span class="value" class:unset={!summary}>{summary||(step.optional?'Optional':'Choose')}</span></span>
        <span class="action">{open===step.id?'Close':summary?'Change':'Choose'}</span>
      </button>
      {#if open===step.id}
        <div class="body">
          <StepPanel {step} {steps} {creation} {plan} {catalog} {variants} {update} {info} {go} {onPlan}/>
        </div>
      {/if}
    </section>
  {/each}
</div>
<style>
  .level{display:grid;gap:10px}
  .slot{border:1px solid var(--line);border-radius:var(--radius);background:var(--panel);overflow:hidden}
  .slot.open{border-color:var(--line-strong)}
  .head{display:grid;grid-template-columns:32px minmax(0,1fr) auto;gap:12px;align-items:center;width:100%;text-align:left;
    background:none;border:0;padding:12px 14px;color:var(--text)}
  .icon{width:30px;height:30px;border-radius:8px;display:grid;place-items:center;background:var(--panel-2);font:700 .8rem var(--mono);color:var(--muted)}
  .done .icon{background:var(--good-soft);color:var(--good)}
  .text{display:grid;gap:2px;min-width:0}
  .value{font:800 1rem var(--display);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .value.unset{font:400 .95rem var(--body);color:var(--muted)}
  .action{font-weight:700;color:var(--brass);font-size:.88rem}
  .body{padding:0 14px 14px}
</style>
