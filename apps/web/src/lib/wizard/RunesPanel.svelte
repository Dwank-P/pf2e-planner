<script>
  import OptionGrid from './OptionGrid.svelte';
  import Icon from '../ui/Icon.svelte';
  import {effectiveRunes,toggleRune,setRuneCount,resetRunes,runeOptions} from '../builder/runes.js';
  /**
   * Runes known at a level. Each level follows the nearest earlier level until you change it;
   * planned on the website only (Leveler has no runes to apply).
   */
  let {level,planner,catalog,updatePlanner,info,readonly=false}=$props();
  let open=$state(false);
  const state=$derived(effectiveRunes(planner,level));
  const options=$derived(runeOptions(catalog));
  const picked=$derived(state.picks.map(uuid=>catalog.get(uuid)??{uuid,name:'Rune not in your compendiums'}));
  const following=$derived(state.pickLevel!==null&&state.pickLevel<level);
  const own=$derived(!!state.own);
</script>
<section class="runes" class:open>
  <button class="head" aria-expanded={open} onclick={()=>open=!open}>
    <span class="icon" aria-hidden="true">ᚱ</span>
    <span class="text"><span class="eyebrow">Runes known · {state.picks.length}/{state.count}</span>
      <span class="value" class:unset={!picked.length}>{picked.map(r=>r.name).join(', ')||'Choose runes'}</span>
      <small class="muted">{following?`Same as level ${state.pickLevel} until you change them here`:state.pickLevel===level?(level>1?'Changed at this level':'Your starting runes'):'Planned on the website only; add them in Foundry'}</small></span>
    <span class="action">{open?'Close':picked.length?'Change':'Choose'}</span>
  </button>
  {#if open}
    <div class="body">
      <div class="controls">
        <label>Runes known
          <span class="stepper">
            <button class="btn small" disabled={readonly||state.count<=0} aria-label="One fewer rune"
              onclick={()=>updatePlanner(p=>setRuneCount(p,level,state.count-1))}>−</button>
            <b class="num">{state.count}</b>
            <button class="btn small" disabled={readonly} aria-label="One more rune"
              onclick={()=>updatePlanner(p=>setRuneCount(p,level,state.count+1))}>+</button>
          </span></label>
        <small class="muted">{state.countLevel&&state.countLevel<level?`From level ${state.countLevel}.`:''} Raise it at the level you gain a rune.</small>
        {#if own&&level>1}<button class="link" disabled={readonly} onclick={()=>updatePlanner(p=>resetRunes(p,level))}>Use the earlier level's runes again</button>{/if}
      </div>
      {#if state.picks.length>state.count}<p class="notice warn small">More runes than you know at this level; remove {state.picks.length-state.count}.</p>{/if}
      <ul class="picked">{#each picked as rune (rune.uuid)}
        <li><Icon src={rune.img} size={22}/><button class="link" onclick={()=>info(rune.uuid)}>{rune.name}</button></li>{/each}</ul>
      <OptionGrid id={'runes-'+level} items={options} selected={state.picks} max={Math.max(state.count,state.picks.length)}
        onToggle={item=>{if(!readonly)updatePlanner(p=>toggleRune(p,level,item.uuid));}} onInfo={item=>info(item.uuid)}
        placeholder="Search runes" empty="No runes in the synced compendiums. Ask the GM to add the pack with Runesmith runes in Leveler's Compendium Manager."/>
    </div>
  {/if}
</section>
<style>
  .runes{border:1px solid var(--line);border-radius:var(--radius);background:var(--panel);overflow:hidden}
  .runes.open{border-color:var(--line-strong)}
  .head{display:grid;grid-template-columns:32px minmax(0,1fr) auto;gap:12px;align-items:center;width:100%;text-align:left;
    background:none;border:0;padding:12px 14px;color:var(--text)}
  .icon{width:30px;height:30px;border-radius:8px;display:grid;place-items:center;background:var(--panel-2);font:700 .95rem var(--mono);color:var(--brass)}
  .text{display:grid;gap:2px;min-width:0}
  .value{font:800 1rem var(--display);overflow-wrap:anywhere}
  .value.unset{font:400 .95rem var(--body);color:var(--muted)}
  .action{font-weight:700;color:var(--brass);font-size:.88rem}
  .body{padding:0 14px 14px;display:grid;gap:10px}
  .controls{display:flex;gap:12px;align-items:center;flex-wrap:wrap;font-size:.9rem}
  .controls label{display:flex;gap:8px;align-items:center;font-weight:700}
  .stepper{display:inline-flex;gap:6px;align-items:center}
  .picked{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:8px}
  .picked li{display:flex;gap:6px;align-items:center;background:var(--panel-2);border-radius:999px;padding:3px 10px 3px 4px}
  .small{font-size:.85rem}
</style>
