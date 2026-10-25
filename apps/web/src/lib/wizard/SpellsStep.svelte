<script>
  import OptionGrid from './OptionGrid.svelte';
  import {level1Spells} from '../builder/schema.js';
  import {toggleSpell} from '../builder/creation.js';
  import {spellOptions} from './options.js';
  let {creation,catalog,update,info}=$props();
  const counts=$derived(level1Spells(creation,catalog.get));
  const progression=$derived(catalog.get(creation.class?.uuid)?.metadata?.levelerProgression);
  const tradition=$derived(progression?.spellcasting?.tradition??'');
  const known=$derived(['arcane','divine','occult','primal'].includes(tradition));
  const spellbook=$derived(!!progression?.spellcasting?.spellbook);
  let tab=$state('cantrips');
  const picks=$derived(tab==='cantrips'?creation.spells?.cantrips??[]:creation.spells?.rank1??[]);
  const max=$derived(tab==='cantrips'?counts?.cantrips??0:counts?.rank1??0);
</script>
{#if counts}
  <div class="spells">
    <p class="muted">{spellbook?'Your spellbook starts with':'Your repertoire starts with'}
      <b class="num">{counts.cantrips}</b> cantrips and <b class="num">{counts.rank1}</b> 1st-rank spells.
      {#if known}Showing the {tradition} list.{:else if tradition}Your {creation.subclass?.name??'specialization'} sets your tradition, so all lists are shown. Pick from the right one.{/if}</p>
    <div class="tabs" role="tablist">
      <button role="tab" aria-selected={tab==='cantrips'} class:on={tab==='cantrips'} onclick={()=>tab='cantrips'}>
        Cantrips <span class="num">{creation.spells?.cantrips?.length??0}/{counts.cantrips}</span></button>
      <button role="tab" aria-selected={tab==='rank1'} class:on={tab==='rank1'} onclick={()=>tab='rank1'}>
        Rank 1 <span class="num">{creation.spells?.rank1?.length??0}/{counts.rank1}</span></button>
    </div>
    {#key tab}
      <OptionGrid id={'spells-'+tab} items={spellOptions(catalog,{cantrip:tab==='cantrips',tradition})}
        selected={picks.map(p=>p.uuid)} {max}
        onToggle={item=>update(c=>toggleSpell(c,item,{cantrip:tab==='cantrips',max}))} onInfo={item=>info(item.uuid)}
        detail={item=>known?'':(item.metadata?.spellTraditions??[]).join(', ')}
        placeholder={tab==='cantrips'?'Search cantrips':'Search 1st-rank spells'} empty="No spells of this kind are in the synced compendiums."/>
    {/key}
  </div>
{/if}
<style>
  .spells{display:grid;gap:12px}
  .tabs{display:flex;gap:6px}
  .tabs button{border:1px solid var(--line);background:var(--panel);border-radius:8px;padding:8px 14px;font-weight:700;display:flex;gap:8px}
  .tabs button.on{border-color:var(--brass);color:var(--brass)}
  .tabs .num{color:var(--muted);font-weight:500}
</style>
