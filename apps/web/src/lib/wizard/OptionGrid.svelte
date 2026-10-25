<script>
  import Traits from '../ui/Traits.svelte';
  import {searchItems} from '../builder/catalog.js';
  /**
   * Searchable option cards. selected: uuids; max: picks allowed (1 = replace);
   * blocked(item) → reason string to disable a card; detail(item) → one-line subtitle.
   */
  let {items=[],selected=[],max=1,onToggle,onInfo,blocked=()=>null,detail=()=>'',
    placeholder='Search…',empty='Nothing matches.',id='options'}=$props();
  let query=$state('');
  let rarity=$state([]);
  let limit=$state(60);
  const RARITIES=['common','uncommon','rare','unique'];
  const present=$derived(RARITIES.filter(r=>items.some(i=>(i.rarity??'common')===r)));
  const results=$derived(searchItems(items,query,{rarity}));
  // Picked options first so they stay visible while searching.
  const ordered=$derived([...results.filter(i=>selected.includes(i.uuid)),...results.filter(i=>!selected.includes(i.uuid))]);
  const full=$derived(max>1&&selected.length>=max);
  function toggleRarity(r){rarity=rarity.includes(r)?rarity.filter(x=>x!==r):[...rarity,r];limit=60;}
</script>
<div class="options">
  <div class="tools">
    <input id={id+'-search'} type="search" bind:value={query} {placeholder} aria-label={placeholder} oninput={()=>limit=60}/>
    {#if present.length>1}
      <div class="rarities" role="group" aria-label="Rarity">
        {#each present as r}<button class:on={rarity.includes(r)} aria-pressed={rarity.includes(r)} onclick={()=>toggleRarity(r)}>{r}</button>{/each}
      </div>
    {/if}
    <span class="count num">{results.length}</span>
  </div>
  {#if ordered.length}
    <div class="grid">
      {#each ordered.slice(0,limit) as item (item.uuid)}
        {@const isOn=selected.includes(item.uuid)}
        {@const reason=isOn?null:blocked(item)}
        <div class="opt" class:on={isOn} class:blocked={!!reason}>
          <button class="pick" disabled={!isOn&&(!!reason||(full&&max>1))} aria-pressed={isOn} onclick={()=>onToggle(item)}>
            <span class="top"><b>{item.name}</b>{#if Number.isFinite(item.level)&&item.type!=='class'&&item.metadata?.category!=='classfeature'&&!(item.traits??[]).includes('cantrip')}<span class="lvl num">{item.level}</span>{/if}</span>
            {#if detail(item)}<span class="detail">{detail(item)}</span>{/if}
            <Traits traits={item.traits??[]} rarity={item.rarity} max={4}/>
            {#if reason}<span class="reason">{reason}</span>{/if}
            <span class="tick" aria-hidden="true">{isOn?'✓':''}</span>
          </button>
          <button class="info link" onclick={()=>onInfo(item)} aria-label={'Details for '+item.name}>Details</button>
        </div>
      {/each}
    </div>
    {#if ordered.length>limit}<button class="btn more" onclick={()=>limit+=60}>Show more ({ordered.length-limit} left)</button>{/if}
  {:else}
    <p class="empty">{empty}</p>
  {/if}
</div>
<style>
  .options{display:grid;gap:12px}
  .tools{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
  .tools input{flex:1;min-width:180px}
  .rarities{display:flex;gap:4px}
  .rarities button{border:1px solid var(--line);background:var(--panel-2);border-radius:999px;padding:4px 10px;font-size:.78rem;text-transform:capitalize}
  .rarities button.on{border-color:var(--brass);color:var(--brass)}
  .count{color:var(--muted);font-size:.8rem}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:8px}
  .opt{position:relative;background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);transition:border-color .12s}
  .opt:hover{border-color:var(--line-strong)}
  .opt.on{border-color:var(--brass);box-shadow:inset 0 0 0 1px var(--brass)}
  .opt.blocked{opacity:.62}
  .pick{display:grid;gap:7px;width:100%;text-align:left;background:none;border:0;padding:12px 12px 30px;color:var(--text);border-radius:inherit}
  .pick:disabled{opacity:1;cursor:not-allowed}
  .top{display:flex;justify-content:space-between;gap:8px;align-items:baseline;padding-right:18px}
  .top b{font:800 .95rem var(--display)}
  .lvl{font-size:.75rem;color:var(--muted)}
  .detail{color:var(--text-2);font-size:.83rem}
  .reason{color:var(--warn);font-size:.8rem}
  .tick{position:absolute;top:10px;right:10px;width:18px;height:18px;border-radius:50%;display:grid;place-items:center;
    font-size:.7rem;color:var(--on-brass);background:transparent}
  .on .tick{background:var(--brass)}
  .info{position:absolute;left:12px;bottom:8px;font-size:.78rem}
  .more{justify-self:center}
</style>
