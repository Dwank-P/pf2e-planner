<script>
  import OptionGrid from './OptionGrid.svelte';
  import {level1FeatSlots,featField} from '../builder/schema.js';
  import {setFeat} from '../builder/creation.js';
  import {buildState,checkFeat,featNameIndex} from '../builder/legality.js';
  import {featOptions} from './options.js';
  let {creation,plan,catalog,variants,update,info}=$props();
  const slots=$derived(level1FeatSlots(creation,catalog.get,variants));
  const state=$derived(buildState(creation,plan,catalog.get,1,variants));
  const names=$derived(featNameIndex(catalog));
  const kindOf=slot=>slot.slot==='dualClass'?'dual-class':slot.slot==='paragon'?'ancestry':slot.category;
  let open=$state(null);
  $effect(()=>{if(open===null){const first=slots.find(s=>!creation[featField(s.slot)]);open=first?.slot??null;}});
  function pick(slot,item){
    const current=creation[featField(slot.slot)];
    update(c=>setFeat(c,slot.slot,current?.uuid===item.uuid?null:item));
    if(current?.uuid!==item.uuid){
      const next=slots.find(s=>s.slot!==slot.slot&&!creation[featField(s.slot)]);
      open=next?.slot??slot.slot;
    }
  }
</script>
<div class="feats">
  <p class="muted">Level 1 grants {slots.length===1?'one feat':slots.length+' feats'} for this build.
    {#if !slots.some(s=>s.slot==='class')&&creation.class} {creation.class.name}s take their first class feat at level 2.{/if}</p>
  {#each slots as slot (slot.slot)}
    {@const chosen=creation[featField(slot.slot)]}
    <section class="slot" class:open={open===slot.slot}>
      <button class="head" aria-expanded={open===slot.slot} onclick={()=>open=open===slot.slot?'':slot.slot}>
        <span class="kind eyebrow">{slot.label}</span>
        <span class="value" class:unset={!chosen}>{chosen?.name??'Choose a feat'}</span>
        <span class="state" aria-hidden="true">{chosen?'✓':'○'}</span>
      </button>
      {#if open===slot.slot}
        <OptionGrid id={'feat-'+slot.slot} items={featOptions(catalog,kindOf(slot),creation)} selected={chosen?[chosen.uuid]:[]}
          onToggle={item=>pick(slot,item)} onInfo={item=>info(item.uuid)}
          check={item=>checkFeat(item,state,{kind:kindOf(slot),featNames:names,currentUuid:chosen?.uuid})}
          detail={item=>item.metadata?.prerequisites?.length?'Requires '+item.metadata.prerequisites.join('; '):''}
          placeholder={'Search '+slot.label.toLowerCase()+'s'} empty="No feats of this kind are in the synced compendiums."/>
      {/if}
    </section>
  {/each}
</div>
<style>
  .feats{display:grid;gap:10px}
  .slot{border:1px solid var(--line);border-radius:var(--radius);background:var(--panel);overflow:hidden}
  .slot.open{border-color:var(--line-strong)}
  .slot.open :global(.options){padding:0 12px 12px}
  .head{display:grid;grid-template-columns:minmax(0,1fr) auto;grid-template-areas:"kind state" "value state";gap:2px 12px;
    width:100%;text-align:left;background:none;border:0;padding:12px 14px;color:var(--text)}
  .kind{grid-area:kind}
  .value{grid-area:value;font:800 1rem var(--display)}
  .value.unset{font:400 .95rem var(--body);color:var(--muted)}
  .state{grid-area:state;align-self:center;color:var(--brass);font-size:1.1rem}
</style>
