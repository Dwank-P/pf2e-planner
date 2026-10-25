<script>
  import OptionGrid from './OptionGrid.svelte';
  import {level1Spells} from '../builder/schema.js';
  import {toggleSpell} from '../builder/creation.js';
  import {spellOptions} from './options.js';
  import {learnedSpellLevels} from '../builder/plan.js';
  let {creation,plan=null,catalog,update,info,target='class'}=$props();
  // A dual class has its own spellcasting entry (creation.dualSpells, plan entry 'class:<slug>').
  const dual=$derived(target==='dualClass');
  const classEntry=$derived(dual?creation.dualClass:creation.class);
  const subclassEntry=$derived(dual?creation.dualSubclass:creation.subclass);
  const progression=$derived(catalog.get(classEntry?.uuid)?.metadata?.levelerProgression);
  const entryType=$derived(dual?'class:'+String(progression?.slug??classEntry?.slug??'').toLowerCase():'primary');
  const learned=$derived(learnedSpellLevels(creation,plan,entryType));
  const counts=$derived(level1Spells(creation,catalog.get,target));
  const store=$derived((dual?creation.dualSpells:creation.spells)??{cantrips:[],rank1:[]});
  const tradition=$derived(progression?.spellcasting?.tradition??'');
  const known=$derived(['arcane','divine','occult','primal'].includes(tradition));
  const spellbook=$derived(!!progression?.spellcasting?.spellbook);
  let tab=$state('cantrips');
  const picks=$derived(tab==='cantrips'?store.cantrips??[]:store.rank1??[]);
  const max=$derived(tab==='cantrips'?counts?.cantrips??0:counts?.rank1??0);
</script>
{#if counts}
  <div class="spells">
    <p class="muted">{spellbook?'Your spellbook starts with':'Your repertoire starts with'}
      <b class="num">{counts.cantrips}</b> cantrips and <b class="num">{counts.rank1}</b> 1st-rank spells{counts.granted?', plus '+(counts.granted===1?'the spell':counts.granted+' spells')+' your '+(subclassEntry?.name??'specialization')+' grants':''}.
      {#if known}Showing the {tradition} list.{:else if tradition}Your {subclassEntry?.name??'specialization'} sets your tradition, so all lists are shown. Pick from the right one.{/if}</p>
    <div class="tabs" role="tablist">
      <button role="tab" aria-selected={tab==='cantrips'} class:on={tab==='cantrips'} onclick={()=>tab='cantrips'}>
        Cantrips <span class="num">{store.cantrips?.length??0}/{counts.cantrips}</span></button>
      <button role="tab" aria-selected={tab==='rank1'} class:on={tab==='rank1'} onclick={()=>tab='rank1'}>
        Rank 1 <span class="num">{store.rank1?.length??0}/{counts.rank1}</span></button>
    </div>
    {#key tab+target}
      <OptionGrid id={'spells-'+tab} items={spellOptions(catalog,{cantrip:tab==='cantrips',tradition})}
        selected={picks.map(p=>p.uuid)} {max}
        check={item=>{const at=learned.get(item.uuid);return at&&at>1?{blocked:`Planned at level ${at}`,unknown:[]}:null;}}
        onToggle={item=>update(c=>toggleSpell(c,item,{cantrip:tab==='cantrips',max,target:dual?'secondary':'primary'}))} onInfo={item=>info(item.uuid)}
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
