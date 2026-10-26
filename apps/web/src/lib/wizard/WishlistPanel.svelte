<script>
  import Traits from '../ui/Traits.svelte';
  import Icon from '../ui/Icon.svelte';
  import {canEquip} from '../builder/gear.js';
  import {itemOptions,priceGp,formatPrice,isConsumable,TYPE_LABELS,wishlist,wishesByLevel,addWish,updateWish,removeWish,setEquipped}
    from '../builder/equipment.js';
  /** Equipment plan: browse synced items, then park them on the level you want them at. */
  let {planner,catalog,updatePlanner,currentLevel=1,info}=$props();
  let query=$state('');
  let type=$state('');
  let use=$state('');
  let minLevel=$state(0);
  let maxLevel=$state(20);
  let sort=$state('level');
  let target=$state(null);
  const forLevel=$derived(target??currentLevel);
  const items=$derived(itemOptions(catalog));
  const types=$derived(Object.keys(TYPE_LABELS).filter(t=>items.some(i=>i.type===t)));
  const hasPrices=$derived(items.some(i=>priceGp(i)!=null));
  const planned=$derived(new Set(wishlist(planner).map(w=>w.uuid)));
  const SORTS={level:(a,b)=>(a.level??0)-(b.level??0)||a.name.localeCompare(b.name),
    price:(a,b)=>(priceGp(a)??Infinity)-(priceGp(b)??Infinity)||a.name.localeCompare(b.name),
    name:(a,b)=>a.name.localeCompare(b.name)};
  const shown=$derived.by(()=>{
    const q=query.trim().toLowerCase();
    return items.filter(i=>(!type||i.type===type)&&(!use||(use==='consumable')===isConsumable(i))
      &&(i.level??0)>=minLevel&&(i.level??0)<=maxLevel
      &&(!q||i.name.toLowerCase().includes(q)||(i.traits??[]).some(t=>t.includes(q))))
      .sort(SORTS[sort]);
  });
  const LIMIT=150;
  const groups=$derived(wishesByLevel(planner));
  const grand=$derived(groups.reduce((n,g)=>n+g.total,0));
  const set=(id,change)=>updatePlanner(p=>updateWish(p,id,change));
</script>
<div class="wish">
  <section class="plan">
    <header><span class="eyebrow">Your plan</span>
      <span class="muted">{wishlist(planner).length} {wishlist(planner).length===1?'item':'items'} ·{formatPrice(grand)}</span></header>
    {#if !groups.length}<p class="muted">Nothing planned yet. Add items from the list below and pick the level you want them at.</p>{/if}
    {#each groups as group (group.level)}
      <div class="group" class:now={group.level===currentLevel} class:past={group.level<currentLevel}>
        <h3>Level {group.level}{group.level===currentLevel?' · now':''}<small class="num">{formatPrice(group.total)}</small></h3>
        <ul>
          {#each group.items as w (w.id)}
            <li class:bought={w.status==='bought'}>
              <input type="checkbox" checked={w.status==='bought'} aria-label={'Bought '+w.name}
                onchange={e=>set(w.id,{status:e.currentTarget.checked?'bought':'wanted'})}/>
              <button class="link name" onclick={()=>info(w.uuid)}>{w.name}</button>
              <small class="muted">{TYPE_LABELS[w.type]??w.type}{w.level!=null?' · L'+w.level:''} · {formatPrice(w.price)}</small>
              <span class="controls">
                {#if canEquip(catalog.get(w.uuid))}
                  <button class="equip" class:on={w.equipped} aria-pressed={!!w.equipped}
                    title={w.equipped?'Equipped from level '+w.targetLevel+' — counts in the summary (AC, item bonuses). Click to take off.':'Equip: count it in the summary from level '+w.targetLevel}
                    onclick={()=>updatePlanner(p=>setEquipped(p,w.id,!w.equipped,catalog.get))}>
                    <span aria-hidden="true">⛨</span><span class="sr">{w.equipped?'Unequip':'Equip'} {w.name}</span></button>
                {/if}
                <label>Qty <input class="qty" type="number" min="1" max="999" value={w.quantity}
                  onchange={e=>set(w.id,{quantity:Math.max(1,Math.min(999,Number(e.currentTarget.value)||1))})}/></label>
                <label>At <select value={w.targetLevel} onchange={e=>set(w.id,{targetLevel:Number(e.currentTarget.value)})}>
                  {#each Array.from({length:20},(_,i)=>i+1) as l}<option value={l}>{l}</option>{/each}</select></label>
                <button class="link x" aria-label={'Remove '+w.name} onclick={()=>updatePlanner(p=>removeWish(p,w.id))}>×</button>
              </span>
              <input class="notes" placeholder="Notes" value={w.notes} maxlength="500"
                onchange={e=>set(w.id,{notes:e.currentTarget.value})}/>
            </li>
          {/each}
        </ul>
      </div>
    {/each}
  </section>
  <section class="browse">
    <header><span class="eyebrow">Items</span>
      <label class="target">Add at level <select bind:value={target}>
        <option value={null}>Current ({currentLevel})</option>
        {#each Array.from({length:20},(_,i)=>i+1) as l}<option value={l}>{l}</option>{/each}</select></label></header>
    <div class="filters">
      <input type="search" bind:value={query} placeholder="Search items or traits" aria-label="Search items"/>
      <select bind:value={type} aria-label="Item type"><option value="">All types</option>
        {#each types as t}<option value={t}>{TYPE_LABELS[t]}</option>{/each}</select>
      <select bind:value={use} aria-label="Consumable"><option value="">Consumable & permanent</option>
        <option value="consumable">Consumable</option><option value="permanent">Permanent</option></select>
      <label class="range">Level <input type="number" min="0" max="30" bind:value={minLevel} aria-label="Minimum level"/>–<input
        type="number" min="0" max="30" bind:value={maxLevel} aria-label="Maximum level"/></label>
      <select bind:value={sort} aria-label="Sort"><option value="level">Sort: level</option>
        <option value="price">Sort: price</option><option value="name">Sort: name</option></select>
    </div>
    {#if !hasPrices&&items.length}<p class="notice">Prices appear after the GM runs Sync Now with Bridge 0.11.</p>{/if}
    <div class="table" role="table">
      <div class="row head" role="row"><span>Item</span><span>Level</span><span>Price</span><span>Type</span><span></span></div>
      {#each shown.slice(0,LIMIT) as item (item.uuid)}
        <div class="row" role="row">
          <span class="item"><Icon src={item.img} size={24}/><button class="link name" onclick={()=>info(item.uuid)}>{item.name}</button>
            <Traits traits={item.traits??[]} rarity={item.rarity} max={3}/></span>
          <span class="num">{item.level??0}</span>
          <span class="num">{formatPrice(priceGp(item))}</span>
          <span class="muted">{TYPE_LABELS[item.type]}{isConsumable(item)&&item.type!=='consumable'?' · consumable':''}</span>
          <span><button class="btn small" class:ghost={planned.has(item.uuid)}
            onclick={()=>updatePlanner(p=>addWish(p,item,forLevel))}>{planned.has(item.uuid)?'+ Again':'+ Level '+forLevel}</button></span>
        </div>
      {:else}<p class="muted">No items match.</p>{/each}
    </div>
    {#if shown.length>LIMIT}<p class="muted">Showing {LIMIT} of {shown.length}. Narrow the filters to see more.</p>{/if}
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
</style>
