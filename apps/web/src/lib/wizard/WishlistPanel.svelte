<script>
  import {tr} from '../i18n/index.js';
  import Traits from '../ui/Traits.svelte';
  import Icon from '../ui/Icon.svelte';
  import {canEquip,takesRunes,takesMagicBonus,runesOf,runedName} from '../builder/gear.js';
  import {itemOptions,priceGp,formatPrice,isConsumable,TYPE_LABELS,wishlist,wishesByLevel,addWish,updateWish,removeWish,setEquipped,unitPrice,runeCost}
    from '../builder/equipment.js';
  import {itemKind,facetsFor,matchesFacets} from '../builder/item-filters.js';
  /** Equipment plan: browse synced items, then park them on the level you want them at. */
  // startLevel: open with items going to this level (level 1's Equipment card opens it at 1).
  let {planner,catalog,updatePlanner,currentLevel=1,info,startLevel=null}=$props();
  let query=$state('');
  let type=$state('');
  let use=$state('');
  let minLevel=$state(0);
  let maxLevel=$state(20);
  let sort=$state('level');
  let target=$state(startLevel);
  const forLevel=$derived(target??currentLevel);
  const items=$derived(itemOptions(catalog));
  const types=$derived(Object.keys(TYPE_LABELS).filter(t=>items.some(i=>itemKind(i)===t)));
  // Weapon, armor and shield filters (damage type, hands, AC bonus, Dex cap…) for the chosen type.
  let facet=$state({});
  const facets=$derived(type?facetsFor(type,items.filter(i=>itemKind(i)===type)):[]);
  $effect(()=>{type;facet={};});
  const hasPrices=$derived(items.some(i=>priceGp(i)!=null));
  const planned=$derived(new Set(wishlist(planner).map(w=>w.uuid)));
  const SORTS={level:(a,b)=>(a.level??0)-(b.level??0)||a.name.localeCompare(b.name),
    price:(a,b)=>(priceGp(a)??Infinity)-(priceGp(b)??Infinity)||a.name.localeCompare(b.name),
    name:(a,b)=>a.name.localeCompare(b.name)};
  const shown=$derived.by(()=>{
    const q=query.trim().toLowerCase();
    return items.filter(i=>(!type||itemKind(i)===type&&matchesFacets(type,i,facet))&&(!use||(use==='consumable')===isConsumable(i))
      &&(i.level??0)>=minLevel&&(i.level??0)<=maxLevel
      &&(!q||i.name.toLowerCase().includes(q)||(i.traits??[]).some(t=>t.includes(q))))
      .sort(SORTS[sort]);
  });
  const LIMIT=150;
  const groups=$derived(wishesByLevel(planner,catalog.get));
  const grand=$derived(groups.reduce((n,g)=>n+g.total,0));
  const set=(id,change)=>updatePlanner(p=>updateWish(p,id,change));
  // Runes (PF2e weapons and armor) or a magic bonus (D&D) planned on an item; one editor open at a time.
  let runesFor=$state(null);
  const STRIKING=['None','Striking','Greater striking','Major striking'];
  const RESILIENT=['None','Resilient','Greater resilient','Major resilient'];
  const propertyRunes=$derived.by(()=>{
    const usage=i=>String(i.metadata?.rules?.usage?.value??i.metadata?.rules?.usage??'');
    const runes=catalog.types().flatMap(t=>catalog.ofType(t)).filter(i=>/^etched-onto/.test(usage(i))&&!/potency|striking|resilient/i.test(i.name));
    return {weapon:runes.filter(i=>/weapon/.test(usage(i))),armor:runes.filter(i=>/armor/.test(usage(i)))};
  });
  function setRunes(w,change){
    const current=runesOf({entry:w,item:catalog.get(w.uuid)});
    const next={...current,...change};
    next.property=next.property.slice(0,Math.max(0,next.potency));
    set(w.id,{runes:next});
  }
</script>
<div class="wish">
  <section class="plan">
    <header><span class="eyebrow">{tr("Your plan")}</span>
      <span class="muted">{wishlist(planner).length} {wishlist(planner).length===1?'item':'items'} ·{formatPrice(grand)}</span></header>
    {#if !groups.length}<p class="muted">{tr("Nothing planned yet. Add items from the list below and pick the level you want them at.")}</p>{/if}
    {#each groups as group (group.level)}
      <div class="group" class:now={group.level===currentLevel} class:past={group.level<currentLevel}>
        <h3>{tr("Level {0}{1}", group.level, group.level===currentLevel?' · now':'')}<small class="num">{formatPrice(group.total)}</small></h3>
        <ul>
          {#each group.items as w (w.id)}
            {@const it=catalog.get(w.uuid)}
            <li class:bought={w.status==='bought'}>
              <input type="checkbox" checked={w.status==='bought'} aria-label={tr('Bought {0}',w.name)}
                onchange={e=>set(w.id,{status:e.currentTarget.checked?'bought':'wanted'})}/>
              <button class="link name" onclick={()=>info(w.uuid)}>{it&&w.runes?runedName({entry:w,item:it},catalog.get):w.bonus?'+'+w.bonus+' '+w.name:w.name}</button>
              <small class="muted">{TYPE_LABELS[w.type]??w.type}{w.level!=null?' · L'+w.level:''} · <span title={runeCost(w,catalog.get)?tr('Item {0}',formatPrice(w.price))+' + runes '+formatPrice(runeCost(w,catalog.get)):''}>{formatPrice(unitPrice(w,catalog.get))}</span></small>
              <span class="controls">
                {#if takesRunes(it)||takesMagicBonus(it)}
                  <button class="link" aria-expanded={runesFor===w.id} onclick={()=>runesFor=runesFor===w.id?null:w.id}>{takesRunes(it)?tr('Runes'):tr('Magic')}</button>
                {/if}
                {#if canEquip(catalog.get(w.uuid))}
                  <button class="equip" class:on={w.equipped} aria-pressed={!!w.equipped}
                    title={w.equipped?tr('Equipped from level {0}',w.targetLevel)+tr(' — counts in the summary (AC, item bonuses). Click to take off.'):tr('Equip: count it in the summary from level {0}',w.targetLevel)}
                    onclick={()=>updatePlanner(p=>setEquipped(p,w.id,!w.equipped,catalog.get))}>
                    <span aria-hidden="true">⛨</span><span class="sr">{w.equipped?tr('Unequip'):tr('Equip')} {w.name}</span></button>
                {/if}
                <label>{tr("Qty")} <input class="qty" type="number" min="1" max="999" value={w.quantity}
                  onchange={e=>set(w.id,{quantity:Math.max(1,Math.min(999,Number(e.currentTarget.value)||1))})}/></label>
                <label>{tr("At")} <select value={w.targetLevel} onchange={e=>set(w.id,{targetLevel:Number(e.currentTarget.value)})}>
                  {#each Array.from({length:20},(_,i)=>i+1) as l}<option value={l}>{l}</option>{/each}</select></label>
                <button class="link x" aria-label={tr('Remove {0}',w.name)} onclick={()=>updatePlanner(p=>removeWish(p,w.id))}>×</button>
              </span>
              {#if runesFor===w.id&&takesRunes(it)}
                {@const r=runesOf({entry:w,item:it})}
                {@const kind=it.type==='armor'?'armor':'weapon'}
                <div class="runes">
                  <label>{tr("Potency")} <select value={r.potency} onchange={e=>setRunes(w,{potency:Number(e.currentTarget.value)})}>
                    {#each [0,1,2,3] as n}<option value={n}>{n?'+'+n:tr('None')}</option>{/each}</select></label>
                  {#if kind==='weapon'}
                    <label>{tr("Striking")} <select value={r.striking} onchange={e=>setRunes(w,{striking:Number(e.currentTarget.value)})}>
                      {#each STRIKING as label,n}<option value={n}>{tr(label)}</option>{/each}</select></label>
                  {:else}
                    <label>{tr("Resilient")} <select value={r.resilient} onchange={e=>setRunes(w,{resilient:Number(e.currentTarget.value)})}>
                      {#each RESILIENT as label,n}<option value={n}>{tr(label)}</option>{/each}</select></label>
                  {/if}
                  {#if propertyRunes[kind].length}
                    <span class="props">{tr("Property runes ({0}/{1}):", r.property.length, r.potency)}
                      {#each propertyRunes[kind] as rune (rune.uuid)}
                        {@const on=r.property.includes(rune.uuid)}
                        <button class="chip" class:on disabled={!on&&r.property.length>=r.potency}
                          onclick={()=>setRunes(w,{property:on?r.property.filter(u=>u!==rune.uuid):[...r.property,rune.uuid]})}>{rune.name}</button>
                      {/each}</span>
                  {:else}<small class="muted">{tr("No property runes in the synced compendiums.")}</small>{/if}
                </div>
              {:else if runesFor===w.id&&takesMagicBonus(it)}
                <div class="runes"><label>{tr("Magic bonus")} <select value={w.bonus??it.metadata?.weapon?.magicalBonus??it.metadata?.armor?.magicalBonus??0}
                  onchange={e=>set(w.id,{bonus:Number(e.currentTarget.value)})}>
                  {#each [0,1,2,3] as n}<option value={n}>{n?'+'+n:tr('None')}</option>{/each}</select></label></div>
              {/if}
              <input class="notes" placeholder={tr("Notes")} value={w.notes} maxlength="500"
                onchange={e=>set(w.id,{notes:e.currentTarget.value})}/>
            </li>
          {/each}
        </ul>
      </div>
    {/each}
  </section>
  <section class="browse">
    <header><span class="eyebrow">{tr("Items")}</span>
      <label class="target">{tr("Add at level")} <select bind:value={target}>
        <option value={null}>{tr("Current ({0})", currentLevel)}</option>
        {#each Array.from({length:20},(_,i)=>i+1) as l}<option value={l}>{l}</option>{/each}</select></label></header>
    <div class="filters">
      <input type="search" bind:value={query} placeholder={tr("Search items or traits")} aria-label={tr("Search items")}/>
      <select bind:value={type} aria-label={tr("Item type")}><option value="">{tr("All types")}</option>
        {#each types as t}<option value={t}>{TYPE_LABELS[t]}</option>{/each}</select>
      <select bind:value={use} aria-label={tr("Consumable")}><option value="">{tr("Consumable & permanent")}</option>
        <option value="consumable">{tr("Consumable")}</option><option value="permanent">{tr("Permanent")}</option></select>
      <label class="range">{tr("Level")} <input type="number" min="0" max="30" bind:value={minLevel} aria-label={tr("Minimum level")}/>–<input
        type="number" min="0" max="30" bind:value={maxLevel} aria-label={tr("Maximum level")}/></label>
      <select bind:value={sort} aria-label={tr("Sort")}><option value="level">{tr("Sort: level")}</option>
        <option value="price">{tr("Sort: price")}</option><option value="name">{tr("Sort: name")}</option></select>
    </div>
    {#if facets.length}
      <div class="facets" role="group" aria-label={TYPE_LABELS[type]+' filters'}>
        {#each facets as f (f.key)}
          <label>{f.label} <select value={facet[f.key]??''} onchange={e=>facet={...facet,[f.key]:e.currentTarget.value}}>
            <option value="">{tr("Any")}</option>{#each f.options as [value,label]}<option {value}>{label}</option>{/each}</select></label>
        {/each}
        {#if Object.values(facet).some(Boolean)}<button class="link" onclick={()=>facet={}}>{tr("Clear")}</button>{/if}
      </div>
    {/if}
    {#if !hasPrices&&items.length}<p class="notice">{tr("Prices appear after the GM runs Sync Now with Bridge 0.11.")}</p>{/if}
    <div class="table" role="table">
      <div class="row head" role="row"><span>{tr("Item")}</span><span>{tr("Level")}</span><span>{tr("Price")}</span><span>{tr("Type")}</span><span></span></div>
      {#each shown.slice(0,LIMIT) as item (item.uuid)}
        <div class="row" role="row">
          <span class="item"><Icon src={item.img} size={24}/><button class="link name" onclick={()=>info(item.uuid)}>{item.name}</button>
            <Traits traits={item.traits??[]} rarity={item.rarity} max={3}/></span>
          <span class="num">{item.level??0}</span>
          <span class="num">{formatPrice(priceGp(item))}</span>
          <span class="muted">{TYPE_LABELS[itemKind(item)]??TYPE_LABELS[item.type]}{isConsumable(item)&&item.type!=='consumable'?' · consumable':''}</span>
          <span><button class="btn small" class:ghost={planned.has(item.uuid)}
            onclick={()=>updatePlanner(p=>addWish(p,item,forLevel))}>{planned.has(item.uuid)?'+ Again':'+ Level '+forLevel}</button></span>
        </div>
      {:else}<p class="muted">{tr("No items match.")}</p>{/each}
    </div>
    {#if shown.length>LIMIT}<p class="muted">{tr("Showing {0} of {1}. Narrow the filters to see more.", LIMIT, shown.length)}</p>{/if}
  </section>
</div>
<style>
  .wish{display:grid;gap:18px}
  section{display:grid;gap:10px}
  header{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}
  .group{border:1px solid var(--line);border-radius:var(--radius);background:var(--panel);padding:10px 14px}
  .group.now{border-color:var(--brass)}
  .group.past{opacity:.8}
  h3{font:800 1rem var(--display);display:flex;justify-content:space-between;margin:0 0 6px}
  h3 small{font-weight:600;color:var(--muted)}
  ul{list-style:none;margin:0;padding:0;display:grid;gap:8px}
  li{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:2px 10px;align-items:center}
  li small{grid-column:2}
  li .controls{grid-column:3;grid-row:1/3;display:flex;gap:8px;align-items:center;font-size:.82rem}
  li .notes{grid-column:2/4;font-size:.82rem;padding:4px 8px}
  li.bought .name{text-decoration:line-through;opacity:.6}
  .qty{width:4.2em}
  .name{font-weight:700;text-align:left}
  .x{font-size:1.1rem}
  .filters{display:flex;gap:8px;flex-wrap:wrap}
  .filters input[type=search]{flex:1 1 200px}
  .range{display:flex;gap:4px;align-items:center;font-size:.85rem}
  .facets{display:flex;gap:6px 12px;flex-wrap:wrap;align-items:center;font-size:.82rem;color:var(--text-2);
    background:var(--panel-2);border:1px solid var(--line);border-radius:var(--radius);padding:8px 10px}
  .facets label{display:flex;gap:5px;align-items:center}
  .facets select{font-size:.82rem;padding:3px 6px}
  .range input{width:4em}
  .table{display:grid;border:1px solid var(--line);border-radius:var(--radius);overflow:hidden}
  .row{display:grid;grid-template-columns:minmax(0,1fr) 3.5em 6em 9em 7.5em;gap:10px;align-items:center;padding:7px 12px;border-top:1px solid var(--line)}
  .row.head{border-top:0;background:var(--panel-2);font:600 .72rem var(--mono);color:var(--muted);text-transform:uppercase}
  .item{display:flex;gap:8px;align-items:center;flex-wrap:wrap;min-width:0}
  .table>p{padding:12px}
  @media (max-width:640px){
    .row{grid-template-columns:minmax(0,1fr) 3em 5.5em;}
    .row>span:nth-child(4){display:none}
    .row>span:nth-child(5){grid-column:1/-1}
    .row.head>span:nth-child(5){display:none}
    li{grid-template-columns:auto minmax(0,1fr)}
    li .controls{grid-column:2;grid-row:auto}
  }
  .equip{width:28px;height:28px;border-radius:6px;border:1px solid var(--line);background:var(--panel-2);color:var(--muted);font-size:.95rem;line-height:1}
  .equip.on{background:var(--good-soft);border-color:var(--good);color:var(--good)}
  .sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
  li .runes{grid-column:2/4;display:flex;flex-wrap:wrap;gap:8px 14px;align-items:center;font-size:.82rem;
    background:var(--panel-2);border-radius:8px;padding:8px 10px}
  .props{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
  .chip{border:1px solid var(--line);background:var(--panel);border-radius:999px;padding:3px 9px;font-size:.78rem;color:var(--text)}
  .chip.on{background:var(--brass);border-color:var(--brass);color:var(--on-brass)}
  .chip:disabled:not(.on){opacity:.45}
</style>
