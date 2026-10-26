<script>
  import OptionGrid from '../wizard/OptionGrid.svelte';
  import Choice5e from './Choice5e.svelte';
  import {multiclassRequirement,meetsRequirement,requirementText} from '../systems/dnd5e/rules.js';
  import {editionMatches} from '../systems/dnd5e/build.js';
  /** One character level: which class it goes into, then that level's features and choices. */
  let {level,build,catalog,variants,sheet,onClass,onChoice,onSubclass,info,readonly=false}=$props();
  const page=$derived(sheet.pages[level-1]??null);
  const classUuid=$derived(build.levels[level-1]??null);
  const earlier=$derived([...new Set(build.levels.slice(0,level-1))]);
  let changing=$state(false);
  // Multiclassing into a new class needs the prerequisites of the new class and every class so far.
  function check(item){
    if(!editionMatches(item,variants))return {blocked:'Made for the other rules edition',unknown:[]};
    if(level===1||earlier.includes(item.uuid))return null;
    const scores=sheet.scoresAt(level-1);
    for(const cls of [...earlier.map(u=>catalog.get(u)).filter(Boolean),item]){
      const need=multiclassRequirement(cls,variants);
      if(!meetsRequirement(need,scores))return {blocked:'Multiclassing needs '+requirementText(need)+' ('+cls.name+')',unknown:[]};
    }
    return null;
  }
  const classDetail=item=>{
    const m=item.metadata??{};
    const taken=build.levels.slice(0,level-1).filter(u=>u===item.uuid).length;
    return [m.hitDie?'Hit die '+m.hitDie:null,m.spellcasting?.progression&&m.spellcasting.progression!=='none'?m.spellcasting.progression+' caster':null,
      taken?'level '+(taken+1)+' in this class':null,m.publication].filter(Boolean).join(' · ');
  };
  const classes=$derived([...catalog.ofType('class')].sort((a,b)=>Number(earlier.includes(b.uuid))-Number(earlier.includes(a.uuid))));
  const cls=$derived(catalog.get(classUuid));
</script>
{#if !classUuid||changing}
  <section class="block">
    <h2>{level===1?'Starting class':'Class for level '+level}</h2>
    {#if level>1}<p class="hint">Continue a class you have, or multiclass into a new one (prerequisites are checked; the GM has the final say).</p>{/if}
    <OptionGrid items={classes} selected={classUuid?[classUuid]:[]} max={1} {check}
      onToggle={item=>{if(readonly)return;onClass(level,item.uuid);changing=false;}} onInfo={item=>info(item.uuid)}
      detail={classDetail} placeholder="Search classes…" id={'class-'+level}/>
    {#if changing}<button class="btn small" onclick={()=>changing=false}>Keep {cls?.name}</button>{/if}
  </section>
{:else}
  <div class="classline">
    <span><b>{cls?.name??'Unknown class'}</b> level {page?.classLevel}{page?.isOriginal&&level>1?'':level>1&&page?.classLevel===1?' · multiclass':''}</span>
    {#if !readonly}<button class="btn small ghost" onclick={()=>changing=true}>Change class</button>{/if}
  </div>
  {#if page?.multiclassProblem}<p class="notice">This multiclass doesn’t meet the ability score prerequisites at this level.</p>{/if}
{/if}
{#if page&&classUuid}
  {#if page.features.length}
    <section class="block">
      <h2>Features</h2>
      <ul class="features">
        {#each page.features as f}
          <li><button class="link" onclick={()=>info(f.uuid)} disabled={f.missing}>{f.name}</button>{#if f.from}<small> · {f.from}</small>{/if}</li>
        {/each}
      </ul>
    </section>
  {/if}
  {#if page.choices.length}
    <section class="block">
      <h2>Choices</h2>
      {#each page.choices as card (card.key)}
        <Choice5e {card} {catalog} {variants} {sheet} {build} {onChoice} {onSubclass} {info} {readonly}/>
      {/each}
    </section>
  {:else if !page.features.length}
    <p class="hint">Nothing new to choose at this level (hit points and scaling features still increase).</p>
  {/if}
{/if}
<style>
  .block{display:grid;gap:10px}
  h2{font:800 1.1rem var(--display);margin:0}
  .hint{color:var(--muted);font-size:.85rem;margin:0}
  .classline{display:flex;justify-content:space-between;align-items:center;gap:10px;border:1px solid var(--line);
    border-radius:var(--radius);padding:10px 14px;background:var(--panel)}
  .features{margin:0;padding-left:1.1rem;display:grid;gap:4px}
  .features small{color:var(--muted)}
  .link{background:none;border:0;color:var(--brass-strong,var(--brass));text-decoration:underline;padding:0;font:inherit;text-align:left}
</style>
