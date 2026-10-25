<script>
  let {steps,creation,go,planHref}=$props();
  const required=$derived(steps.filter(s=>s.id!=='review'&&!s.optional));
  const missing=$derived(required.filter(s=>!s.complete));
</script>
<div class="review">
  {#if missing.length}
    <p class="notice warn">{missing.length===1?'One step still needs a choice.':missing.length+' steps still need choices.'}
      You can plan ahead anyway; Leveler checks everything when you apply it in Foundry.</p>
  {:else}
    <p class="notice good">Level 1 is complete. Plan levels 2–20 next, or pull this build into Foundry.</p>
  {/if}
  <ol class="list">
    {#each required as step}
      <li><button class="row" onclick={()=>go(step.id)}>
        <span class="mark" class:done={step.complete} aria-hidden="true">{step.complete?'✓':'!'}</span>
        <span class="label">{step.label}</span>
        <span class="state">{step.complete?'Done':'Needs a choice'}</span></button></li>
    {/each}
  </ol>
  <div class="next panel">
    <div><b>In Foundry</b><p class="muted">Open the character's Level Planner or Character Wizard, click <i>Pull from Planner</i> and pick this build.
      {creation.class?'':'Choose a class first: Leveler plans are tied to it.'}</p></div>
    <a class="btn primary" href={planHref}>Plan levels 2–20 →</a>
  </div>
</div>
<style>
  .review{display:grid;gap:14px}
  .list{list-style:none;margin:0;padding:0;display:grid;gap:4px}
  .row{display:grid;grid-template-columns:24px 1fr auto;gap:10px;align-items:center;width:100%;text-align:left;
    border:1px solid var(--line);background:var(--panel);border-radius:8px;padding:9px 12px}
  .row:hover{border-color:var(--line-strong)}
  .mark{width:22px;height:22px;border-radius:50%;display:grid;place-items:center;font-size:.75rem;background:var(--warn-soft);color:var(--warn)}
  .mark.done{background:var(--good-soft);color:var(--good)}
  .label{font-weight:700}
  .state{font-size:.82rem;color:var(--muted)}
  .next{display:flex;justify-content:space-between;align-items:center;gap:16px;padding:16px;flex-wrap:wrap}
  .next div{display:grid;gap:4px;flex:1;min-width:220px}
</style>
