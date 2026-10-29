<script>
  import {tr} from '../i18n/index.js';
  import Traits from '../ui/Traits.svelte';
  import Icon from '../ui/Icon.svelte';
  import {searchItems} from '../builder/catalog.js';
  import {spellDefense} from './options.js';
  /**
   * Searchable option cards.
   * selected: uuids; max: picks allowed (1 = replace).
   * check(item) → {blocked, unknown, hard}: blocked options are hidden until
   *   "Show unavailable" is ticked, then shown with the reason as a warning. They can
   *   still be picked (this is a planner; the GM decides) unless `hard` is set.
   * test(item) → bool: extra filter from the step's own filter controls (filters snippet).
   * detail(item) → one-line subtitle. badge(item) → short highlighted note (e.g. "level 3 in this class").
   * first: uuids listed before everything else, in that order (e.g. classes the character already has).
   */
  let {items=[],selected=[],max=1,onToggle,onInfo,check=()=>null,test=null,detail=()=>'',badge=()=>'',first=[],filters,
    placeholder=tr('Search…'),empty=tr('Nothing matches.'),id='options'}=$props();
  let query=$state('');
  let rarity=$state([]);
  let showBlocked=$state(false);
  // Spell lists can be narrowed by the defense they target.
  const DEFENSES=[['ac',tr('AC')],['fortitude',tr('Fort')],['reflex',tr('Reflex')],['will',tr('Will')],['none',tr('None')]];
  let defense=$state([]);
  const isSpells=$derived(items.some(i=>i.type==='spell')&&items.some(i=>spellDefense(i)!==null));
  const combinedTest=$derived(defense.length||test?item=>(!test||test(item))&&(!defense.length||defense.includes(spellDefense(item))):null);
  let limit=$state(60);
  const RARITIES=['common','uncommon','rare','unique'];
  const present=$derived(RARITIES.filter(r=>items.some(i=>(i.rarity??'common')===r)));
  const checked=$derived(searchItems(items,query,{rarity,test:combinedTest}).map(item=>({item,result:check(item)??{blocked:null,unknown:[]}})));
  const blockedCount=$derived(checked.filter(c=>c.result.blocked&&!selected.includes(c.item.uuid)).length);
  const visible=$derived(checked.filter(c=>showBlocked||!c.result.blocked||selected.includes(c.item.uuid)));
  // Picked options first so they stay visible while searching.
  const rank=uuid=>{const i=first.indexOf(uuid);return i<0?Infinity:i;};
  const pinned=$derived(first.length?[...visible].sort((a,b)=>rank(a.item.uuid)-rank(b.item.uuid)):visible);
  const ordered=$derived([...pinned.filter(c=>selected.includes(c.item.uuid)),...pinned.filter(c=>!selected.includes(c.item.uuid))]);
  const full=$derived(max>1&&selected.length>=max);
  function toggleRarity(r){rarity=rarity.includes(r)?rarity.filter(x=>x!==r):[...rarity,r];limit=60;}
</script>
<div class="options">
  <div class="tools">
    <input id={id+'-search'} type="search" bind:value={query} {placeholder} aria-label={placeholder} oninput={()=>limit=60}/>
    {#if present.length>1}
      <div class="rarities" role="group" aria-label={tr("Rarity")}>
        {#each present as r}<button class:on={rarity.includes(r)} aria-pressed={rarity.includes(r)} onclick={()=>toggleRarity(r)}>{r}</button>{/each}
      </div>
    {/if}
    {#if blockedCount||showBlocked}
      <label class="toggle"><input type="checkbox" bind:checked={showBlocked}/> {tr("Show unavailable ({0})", blockedCount)}</label>
    {/if}
    <span class="count num">{visible.length}</span>
  </div>
  {#if filters||isSpells}<div class="filters">{#if isSpells}<div class="defenses" role="group" aria-label={tr("Targets")}><span class="eyebrow">{tr("Targets")}</span>
    {#each DEFENSES as [key,label]}<button class:on={defense.includes(key)} aria-pressed={defense.includes(key)}
      onclick={()=>defense=defense.includes(key)?defense.filter(d=>d!==key):[...defense,key]}>{label}</button>{/each}</div>{/if}{#if filters}{@render filters()}{/if}</div>{/if}
  {#if ordered.length}
    <div class="grid">
      {#each ordered.slice(0,limit) as {item,result} (item.uuid)}
        {@const isOn=selected.includes(item.uuid)}
        {@const reason=result.blocked}
        <div class="opt" class:on={isOn} class:blocked={!!reason&&!isOn} class:warned={!!reason&&isOn}>
          <button class="pick" disabled={!isOn&&((!!reason&&result.hard)||(full&&max>1))} aria-pressed={isOn} onclick={()=>onToggle(item)}>
            <span class="top"><span class="name"><Icon src={item.img} size={28}/><b>{item.name}</b></span>{#if Number.isFinite(item.level)&&item.type!=='class'&&item.metadata?.category!=='classfeature'&&!(item.traits??[]).includes('cantrip')}<span class="lvl num">{item.level}</span>{/if}</span>
            {#if badge(item)}<span class="badge-good">{badge(item)}</span>{/if}
            {#if detail(item)}<span class="detail">{detail(item)}</span>{/if}
            <Traits traits={item.traits??[]} rarity={item.rarity} max={4}/>
            {#if reason}<span class="reason">⚠ {reason}{#if !isOn&&!result.hard} {tr("· you can still pick it")}{/if}</span>
            {:else if result.unknown?.length}<span class="unknown" title={tr("This planner can't verify these; your GM or Leveler will.")}>{tr("Check: {0}", result.unknown.join('; '))}</span>{/if}
            <span class="tick" aria-hidden="true">{isOn?'✓':''}</span>
          </button>
          <button class="info link" onclick={()=>onInfo(item)} aria-label={tr('Details for {0}',item.name)}>{tr("Details")}</button>
        </div>
      {/each}
    </div>
    {#if ordered.length>limit}<button class="btn more" onclick={()=>limit+=60}>{tr("Show more ({0} left)", ordered.length-limit)}</button>{/if}
  {:else}
    <p class="empty">{blockedCount&&!showBlocked?tr("{0} options don't fit this character yet. Tick “Show unavailable” to see why.",blockedCount):empty}</p>
  {/if}
</div>
<style>
  .options{display:grid;gap:12px}
  .tools{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
  .tools input[type=search]{flex:1;min-width:180px}
  .rarities{display:flex;gap:4px}
  .rarities button{border:1px solid var(--line);background:var(--panel-2);border-radius:999px;padding:4px 10px;font-size:.78rem;text-transform:capitalize}
  .rarities button.on{border-color:var(--brass);color:var(--brass)}
  .toggle{display:flex;gap:6px;align-items:center;font-size:.82rem;color:var(--text-2);white-space:nowrap}
  .count{color:var(--muted);font-size:.8rem}
  .filters{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
  .defenses{display:flex;gap:4px;align-items:center;flex-wrap:wrap}
  .defenses .eyebrow{margin-right:4px}
  .defenses button{border:1px solid var(--line);background:var(--panel-2);border-radius:999px;padding:4px 10px;font-size:.78rem}
  .defenses button.on{border-color:var(--brass);color:var(--brass)}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:8px}
  .opt{position:relative;background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);transition:border-color .12s}
  .opt:hover{border-color:var(--line-strong)}
  .opt.on{border-color:var(--brass);box-shadow:inset 0 0 0 1px var(--brass)}
  .opt.blocked{opacity:.72}
  .opt.warned{border-color:var(--warn);box-shadow:inset 0 0 0 1px var(--warn)}
  .pick{display:grid;gap:7px;width:100%;text-align:left;background:none;border:0;padding:12px 12px 30px;color:var(--text);border-radius:inherit}
  .pick:disabled{opacity:1;cursor:not-allowed}
  .top{display:flex;justify-content:space-between;gap:8px;align-items:baseline;padding-right:18px}
  .name{display:flex;gap:8px;align-items:center;min-width:0}
  .top b{font:800 .95rem var(--display)}
  .lvl{font-size:.75rem;color:var(--muted)}
  .detail{color:var(--text-2);font-size:.83rem}
  .reason{color:var(--warn);font-size:.8rem}
  .unknown{color:var(--muted);font-size:.78rem}
  .tick{position:absolute;top:10px;right:10px;width:18px;height:18px;border-radius:50%;display:grid;place-items:center;
    font-size:.7rem;color:var(--on-brass);background:transparent}
  .on .tick{background:var(--brass)}
  .info{position:absolute;left:12px;bottom:8px;font-size:.78rem}
  .more{justify-self:center}
  .badge-good{justify-self:start;font:700 .72rem var(--mono);color:var(--good);background:var(--good-soft);border:1px solid var(--good);border-radius:4px;padding:1px 6px}
</style>
