<script>
  import {tr} from '../i18n/index.js';
  import StepPanel from './StepPanel.svelte';
  import {stepSummary} from '../builder/summaries.js';
  import Icon from '../ui/Icon.svelte';
  import {grantsAt} from '../builder/granted.js';
  import {classFeaturesAt} from '../leveler-progression.js';
  /** Level 1 laid out like levels 2–20: one card per creation step, opened in place. */
  // onEquipment: starting gear is planned in the equipment plan (level 1), not in a step of its own.
  let {steps,open=null,creation,plan,catalog,variants,update,info,onOpen,onPlan,onEquipment=null,planner={}}=$props();
  const startingGear=$derived([...(planner?.wishlist??[]).filter(w=>w.targetLevel===1),...(creation?.equipment??[])]);
  const cards=$derived(steps.filter(s=>s.id!=='review'));
  // Level-1 class features, then what choices grant (Warpriest's Shield Block, a heritage's feat…).
  const result=$derived(grantsAt(creation,plan,catalog.get,1,variants));
  // Minus features a specialization replaces (Battle Creed's doctrines).
  const features=$derived(classFeaturesAt([catalog.get(creation.class?.uuid),variants.dualClass===true?catalog.get(creation.dualClass?.uuid):null],1)
    .filter(f=>!f.uuid||!result.suppressed.has(catalog.get(f.uuid)?.uuid??f.uuid)));
  const granted=$derived(result.granted
    .filter(g=>!features.some(f=>f.uuid===g.item.uuid||f.name===g.item.name)));
  /** The chosen item for single-choice steps, for its icon. */
  function chosenEntry(step){
    const c=creation??{};
    const bucket=c.classSelections?.[step.target??'class']??c;
    switch(step.stepId??step.id){
      case 'ancestry':return c.ancestry;case 'heritage':return c.heritage;case 'background':return c.background;
      case 'class':return c.class;case 'dualClass':return c.dualClass;
      case 'subclass':return step.target==='dualClass'?c.dualSubclass:c.subclass;
      default:{const v=step.def?.key?bucket[step.def.key]:null;return v&&!Array.isArray(v)?v:null;}
    }
  }
  const iconOf=step=>{const e=chosenEntry(step);return e?.uuid?catalog.get(e.uuid)?.img??e.img??null:null;};
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
    {@const gear=step.id==='equipment'&&onEquipment}
    {@const summary=gear?(startingGear.length?tr(startingGear.length===1?'{0} item at level 1':'{0} items at level 1',startingGear.length):''):stepSummary(step,creation,catalog.get,variants)}
    {@const img=iconOf(step)}
    <section class="slot" class:open={open===step.id} class:done={step.complete}>
      <button class="head" aria-expanded={gear?undefined:open===step.id} onclick={()=>gear?onEquipment():onOpen(open===step.id?null:step.id)}>
        <span class="icon" class:pic={!!img} aria-hidden="true">{#if img}<Icon src={img} size={30}/>{:else}{step.complete?'✓':'·'}{/if}</span>
        <span class="text"><span class="eyebrow">{step.label}</span>
          <span class="value" class:unset={!summary}>{summary||(step.optional?tr('Optional'):tr('Choose'))}</span></span>
        <span class="action">{gear?tr('Equipment plan →'):open===step.id?tr('Close'):summary?tr('Change'):tr('Choose')}</span>
      </button>
      {#if open===step.id&&!gear}
        <div class="body">
          <StepPanel {step} {steps} {creation} {plan} {catalog} {variants} {update} {info} {go} {onPlan}/>
        </div>
      {/if}
    </section>
  {/each}
  {#if features.length||granted.length}
    <div class="granted"><span class="eyebrow">{tr("Gained automatically at level 1")}</span>
      <ul>{#each features as f}<li><Icon src={f.uuid?catalog.get(f.uuid)?.img:null} size={22}/>{#if f.uuid}<button class="link" onclick={()=>info(f.uuid)}>{f.name}</button>{:else}{f.name}{/if}</li>{/each}
        {#each granted as g (g.item.uuid)}<li><Icon src={g.item.img} size={22}/><button class="link" onclick={()=>info(g.item.uuid)}>{g.item.name}</button>
        <small class="muted">{tr("from {0}", g.from)}</small></li>{/each}</ul></div>
  {/if}
</div>
<style>
  .granted{display:grid;gap:6px;padding:10px 14px;border:1px dashed var(--line);border-radius:var(--radius)}
  .granted ul{list-style:none;margin:0;padding:0;display:grid;gap:4px}
  .granted li{display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-size:.9rem}
  .level{display:grid;gap:10px}
  .slot{border:1px solid var(--line);border-radius:var(--radius);background:var(--panel);overflow:hidden}
  .slot.open{border-color:var(--line-strong)}
  .head{display:grid;grid-template-columns:32px minmax(0,1fr) auto;gap:12px;align-items:center;width:100%;text-align:left;
    background:none;border:0;padding:12px 14px;color:var(--text)}
  .icon{width:30px;height:30px;border-radius:8px;display:grid;place-items:center;background:var(--panel-2);font:700 .8rem var(--mono);color:var(--muted)}
  .icon.pic{background:none;overflow:hidden}
  .done .icon{background:var(--good-soft);color:var(--good)}
  .text{display:grid;gap:2px;min-width:0}
  .value{font:800 1rem var(--display);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .value.unset{font:400 .95rem var(--body);color:var(--muted)}
  .action{font-weight:700;color:var(--brass);font-size:.88rem}
  .body{padding:0 14px 14px}
</style>
