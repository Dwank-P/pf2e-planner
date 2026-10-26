<script>
  import OptionGrid from './OptionGrid.svelte';
  import {choiceSetsFor,setChoice} from '../builder/choice-sets.js';
  /**
   * The choices a chosen feat (or feature) offers — its ChoiceSets, and those of anything a pick
   * grants. entry: the feat entry {uuid, choices}; onChange(choices) stores the new picks.
   */
  let {entry,catalog,context={},onChange,info=()=>{},readonly=false}=$props();
  const item=$derived(catalog.get(entry?.uuid));
  const result=$derived(item?choiceSetsFor(item,entry.choices??{},catalog,context):{sets:[],grants:[]});
  let open=$state(null);
  function pick(flag,value){
    if(readonly)return;
    onChange(setChoice(item,entry.choices??{},flag,value,catalog,context));
    open=null;
  }
  const labelOf=set=>set.options.find(o=>String(o.value)===String(set.value))?.label??null;
</script>
{#if result.sets.length||result.grants.length}
  <div class="choices">
    {#each result.sets as set (set.flag)}
      {@const chosen=labelOf(set)}
      <div class="choice" class:nested={set.depth>0}>
        <span class="text"><span class="eyebrow">{set.prompt}{set.depth>0?' · '+set.source.name:''}</span>
          <b class:unset={!chosen}>{chosen??'Not chosen'}</b></span>
        {#if !readonly}
          {#if set.itemOptions&&set.options.length>8}
            <button class="btn small ghost" onclick={()=>open=open===set.flag?null:set.flag}>{open===set.flag?'Close':chosen?'Change':'Choose'}</button>
          {:else}
            <select aria-label={set.prompt} value={set.value??''} onchange={e=>pick(set.flag,e.currentTarget.value||null)}>
              <option value="">—</option>
              {#each set.options as o}<option value={o.value}>{o.label}</option>{/each}
            </select>
          {/if}
        {/if}
        {#if chosen&&set.itemOptions}{@const o=set.options.find(o=>String(o.value)===String(set.value))}
          {#if o?.uuid}<button class="link" onclick={()=>info(o.uuid)}>Details</button>{/if}{/if}
      </div>
      {#if open===set.flag}
        <OptionGrid id={'choice-'+set.flag} items={set.options.map(o=>catalog.get(o.uuid)).filter(Boolean)}
          selected={set.value?[set.options.find(o=>String(o.value)===String(set.value))?.uuid].filter(Boolean):[]}
          onToggle={it=>{const o=set.options.find(x=>x.uuid===it.uuid);pick(set.flag,String(o?.value)===String(set.value)?null:o?.value);}}
          onInfo={it=>info(it.uuid)} placeholder={'Search: '+set.prompt}/>
      {/if}
    {/each}
    {#if result.grants.length}
      <p class="grants">Grants {#each result.grants as g,i}{i?', ':''}<button class="link" onclick={()=>info(g.uuid)}>{g.name}</button>{/each}</p>
    {/if}
  </div>
{/if}
<style>
  .choices{display:grid;gap:6px;padding:8px 14px 12px;border-top:1px dashed var(--line)}
  .choice{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
  .choice.nested{padding-left:14px;border-left:2px solid var(--line)}
  .text{display:grid;min-width:0;flex:1}
  .text b{font-size:.9rem}
  .text b.unset{color:var(--warn)}
  select{max-width:260px}
  .grants{margin:0;font-size:.85rem;color:var(--text-2)}
  .link{background:none;border:0;padding:0;color:var(--brass);text-decoration:underline;font:inherit}
</style>
