<script>
  import {tr} from '../i18n/index.js';
  import OptionGrid from '../wizard/OptionGrid.svelte';
  import {spellOptions,editionMatches} from '../systems/dnd5e/build.js';
  import {ABILITY_NAMES} from '../systems/dnd5e/rules.js';
  /** Spells known or prepared, per spellcasting class, from that class's spell list. */
  let {build,catalog,variants,sheet,onToggle,info,readonly=false}=$props();
  const casters=$derived(sheet.classes.filter(c=>c.spellcasting));
  let tab=$state(null);
  const current=$derived(casters.find(c=>c.uuid===tab)??casters[0]??null);
  let maxLevel=$state('');
  const SCHOOLS={abj:'Abjuration',con:'Conjuration',div:'Divination',enc:'Enchantment',evo:'Evocation',ill:'Illusion',nec:'Necromancy',trs:'Transmutation'};
  const levelName=n=>n?['','1st','2nd','3rd'][n]??n+'th':'Cantrip';
  const allowed=$derived(current?new Set(spellOptions(catalog,current,variants).map(s=>s.uuid)):new Set());
  const items=$derived(current?spellOptions(catalog,current,variants,{showAll:true})
    .filter(s=>maxLevel===''||(Number(s.metadata?.level??s.level)||0)===Number(maxLevel)):[]);
  const chosen=$derived(current?build.spells[current.uuid]??[]:[]);
  const guidance=$derived(current?sheet.scales.filter(s=>s.classUuid===current.uuid&&/cantrip|spell|prepar|known/i.test(s.id+' '+s.title)):[]);
  const counts=$derived.by(()=>{
    const by={};
    for(const uuid of chosen){const l=Number(catalog.get(uuid)?.metadata?.level??0)||0;by[l]=(by[l]??0)+1;}
    return by;
  });
  function check(item){
    if(!editionMatches(item,variants))return {blocked:'Made for the other rules edition',unknown:[]};
    if(!allowed.has(item.uuid))return {blocked:'Not on this class’s spell list',unknown:[]};
    return null;
  }
</script>
{#if !casters.length}
  <p class="hint">{tr("No spellcasting classes in this plan yet. Spells granted by features and feats are listed in the summary.")}</p>
{:else}
  {#if casters.length>1}
    <div class="seg" role="tablist">
      {#each casters as c}<button role="tab" aria-selected={current?.uuid===c.uuid} class:on={current?.uuid===c.uuid} onclick={()=>tab=c.uuid}>{c.item?.name}</button>{/each}
    </div>
  {/if}
  {#if current}
    <div class="facts">
      <span><b>{current.item?.name} {current.levels}</b>{current.subclass?' · '+current.subclass.name:''}</span>
      <span>{tr("{0} · up to {1} level", current.spellcasting.progression==='pact'?tr('Pact magic'):tr('{0} caster',current.spellcasting.progression), levelName(current.spellcasting.maxLevel))}</span>
      {#if current.spellcasting.ability}<span>{tr("Ability: {0}", ABILITY_NAMES[current.spellcasting.ability]??current.spellcasting.ability)}</span>{/if}
      {#each guidance as g}<span>{g.title}: <b>{g.value}</b></span>{/each}
      <span>{tr("Chosen: {0}", Object.entries(counts).map(([l,n])=>levelName(Number(l))+' '+n).join(', ')||'none')}</span>
    </div>
    <label class="filter">{tr("Spell level")}
      <select bind:value={maxLevel}>
        <option value="">{tr("All")}</option>
        {#each Array.from({length:current.spellcasting.maxLevel+1},(_,i)=>i) as l}<option value={String(l)}>{levelName(l)}</option>{/each}
      </select></label>
    <OptionGrid {items} selected={chosen} max={999} {check} onToggle={item=>!readonly&&onToggle(current.uuid,item.uuid)}
      onInfo={item=>info(item.uuid)} detail={item=>[levelName(Number(item.metadata?.level)||0),SCHOOLS[item.metadata?.school]??item.metadata?.school,item.metadata?.publication].filter(Boolean).join(' · ')}
      placeholder={tr("Search spells…")} id={'spells-'+current.uuid}/>
  {/if}
{/if}
{#if sheet.grantedSpells.length}
  <section class="granted">
    <h2>{tr("Granted spells")}</h2>
    <ul>{#each sheet.grantedSpells as s}<li><button class="link" onclick={()=>info(s.uuid)}>{catalog.get(s.uuid)?.name??s.uuid}</button> <small>· {s.source}</small></li>{/each}</ul>
  </section>
{/if}
<style>
  .hint{color:var(--muted)}
  .seg{display:inline-flex;border:1px solid var(--line);border-radius:8px;overflow:hidden;width:max-content;max-width:100%;flex-wrap:wrap}
  .seg button{background:none;border:0;padding:7px 12px;color:var(--text-2)}
  .seg button.on{background:var(--panel-3);color:var(--text);font-weight:700}
  .facts{display:flex;flex-wrap:wrap;gap:6px 16px;font-size:.88rem;color:var(--text-2);border:1px solid var(--line);border-radius:var(--radius);padding:10px 14px;background:var(--panel)}
  .filter{display:flex;gap:8px;align-items:center;font-size:.85rem;color:var(--muted)}
  h2{font:800 1.1rem var(--display);margin:0}
  .granted ul{margin:6px 0 0;padding-left:1.1rem}
  .granted small{color:var(--muted)}
  .link{background:none;border:0;color:var(--brass-strong,var(--brass));text-decoration:underline;padding:0;font:inherit}
</style>
