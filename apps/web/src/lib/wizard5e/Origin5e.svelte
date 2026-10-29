<script>
  import {tr} from '../i18n/index.js';
  import OptionGrid from '../wizard/OptionGrid.svelte';
  import Fold from './Fold.svelte';
  import {ABILITIES,ABILITY_NAMES,STANDARD_ARRAY,POINT_BUY_COST,POINT_BUY_BUDGET,pointBuyCost,defaultScores,
    scoresValid,modifier,signed,isModern} from '../systems/dnd5e/rules.js';
  import {editionMatches} from '../systems/dnd5e/build.js';
  /** Species (race), background and base ability scores. */
  let {build,catalog,variants,sheet,update,info,readonly=false}=$props();
  const otherEdition=item=>editionMatches(item,variants)?null:{blocked:'Made for the other rules edition',unknown:[]};
  const modern=$derived(isModern(variants));
  const method=$derived(build.abilities.method);
  const base=$derived(build.abilities.base??{});
  const spent=$derived(pointBuyCost(base));
  const origin=item=>item?.metadata?.publication??'';
  function setMethod(m){
    update(b=>({...b,abilities:{method:m,base:defaultScores(m)}}));
  }
  function setScore(a,value){
    update(b=>{
      const next={...b.abilities.base};
      // Standard array: picking a value already used elsewhere swaps the two.
      if(method==='standard'){
        const other=ABILITIES.find(x=>x!==a&&next[x]===value);
        if(other)next[other]=next[a];
      }
      if(value===undefined)delete next[a];else next[a]=value;
      return {...b,abilities:{...b.abilities,base:next}};
    });
  }
  // Each group is a box that closes once chosen; open ones start where something is missing.
  let open=$state({species:!build.speciesUuid,background:!build.backgroundUuid,scores:!scoresValid(build.abilities.method,build.abilities.base??{}),hp:false});
  function pick(field,item){
    const choosing=build[field]!==item.uuid;
    update(b=>({...b,[field]:b[field]===item.uuid?null:item.uuid}));
    if(choosing)open={...open,[field==='speciesUuid'?'species':'background']:false};
  }
  const species=$derived(catalog.get(build.speciesUuid));
  const background=$derived(catalog.get(build.backgroundUuid));
  const scoreLine=$derived(scoresValid(method,base)?ABILITIES.map(a=>a.toUpperCase()+' '+sheet.scores[a]).join(' · '):'');
</script>
<Fold title={modern?tr('Species'):tr('Race')} summary={species?.name} img={species?.img} done={!!species} bind:open={open.species}>
  <OptionGrid items={catalog.ofType('race')} selected={build.speciesUuid?[build.speciesUuid]:[]} max={1} check={otherEdition}
    onToggle={item=>!readonly&&pick('speciesUuid',item)} onInfo={item=>info(item.uuid)} detail={origin}
    placeholder={modern?tr('Search species…'):tr('Search races…')} id="species"/>
</Fold>
<Fold title={tr("Background")} summary={background?.name} img={background?.img} done={!!background} bind:open={open.background}>
  <OptionGrid items={catalog.ofType('background')} selected={build.backgroundUuid?[build.backgroundUuid]:[]} max={1} check={otherEdition}
    onToggle={item=>!readonly&&pick('backgroundUuid',item)} onInfo={item=>info(item.uuid)} detail={origin}
    placeholder={tr("Search backgrounds…")} id="background"/>
</Fold>
<Fold title={tr("Ability scores")} summary={scoreLine} done={!!scoreLine} bind:open={open.scores}>
  <div class="seg" role="group" aria-label={tr("Method")}>
    {#each [['standard',tr('Standard array')],['pointbuy',tr('Point buy')],['manual',tr('Manual / rolled')]] as [m,label]}
      <button class:on={method===m} aria-pressed={method===m} disabled={readonly} onclick={()=>setMethod(m)}>{tr(label)}</button>
    {/each}
  </div>
  <p class="hint">
    {#if method==='standard'}{tr("Assign 15, 14, 13, 12, 10 and 8.")}
    {:else if method==='pointbuy'}{tr("{0} / {1} points spent (scores 8–15).", spent, POINT_BUY_BUDGET)}
    {:else}{tr("Enter the scores you rolled or your GM allows.")}{/if}
    {modern?tr('Your background raises scores (on its level 1 card).'):tr('Racial increases are added on the level 1 cards.')}
  </p>
  <div class="scores">
    {#each ABILITIES as a}
      <div class="score">
        <label for={'base-'+a}>{ABILITY_NAMES[a]}</label>
        {#if method==='standard'}
          <select id={'base-'+a} value={base[a]??''} disabled={readonly} onchange={e=>setScore(a,e.currentTarget.value?Number(e.currentTarget.value):undefined)}>
            <option value="">—</option>
            {#each STANDARD_ARRAY as v}<option value={v}>{v}</option>{/each}
          </select>
        {:else if method==='pointbuy'}
          <select id={'base-'+a} value={base[a]??8} disabled={readonly} onchange={e=>setScore(a,Number(e.currentTarget.value))}>
            {#each Object.keys(POINT_BUY_COST).map(Number) as v}<option value={v}>{v} ({POINT_BUY_COST[v]})</option>{/each}
          </select>
        {:else}
          <input id={'base-'+a} type="number" min="1" max="30" value={base[a]??10} readonly={readonly}
            onchange={e=>setScore(a,Math.max(1,Math.min(30,Math.round(Number(e.currentTarget.value)||10))))}/>
        {/if}
        <span class="final">{tr("Final")} <b class="num">{sheet.scores[a]}</b> <span class="num">({signed(modifier(sheet.scores[a]))})</span></span>
      </div>
    {/each}
  </div>
  {#if !scoresValid(method,base)}<p class="notice">{method==='pointbuy'&&spent>POINT_BUY_BUDGET?tr('Over the point-buy budget.'):tr('Some scores still need a value.')}</p>{/if}
</Fold>
<Fold title={tr("Hit points")} summary={build.hp==='max'?tr('Maximum per level'):tr('Average per level')} done bind:open={open.hp}>
  <div class="seg" role="group" aria-label={tr("Hit points")}>
    <button class:on={build.hp!=='max'} disabled={readonly} onclick={()=>update(b=>({...b,hp:'average'}))}>{tr("Average per level")}</button>
    <button class:on={build.hp==='max'} disabled={readonly} onclick={()=>update(b=>({...b,hp:'max'}))}>{tr("Maximum per level")}</button>
  </div>
</Fold>
<style>
  .hint{color:var(--muted);font-size:.85rem;margin:0}
  .seg{display:inline-flex;border:1px solid var(--line);border-radius:8px;overflow:hidden;width:max-content;max-width:100%;flex-wrap:wrap}
  .seg button{background:none;border:0;padding:7px 12px;color:var(--text-2)}
  .seg button.on{background:var(--panel-3);color:var(--text);font-weight:700}
  .scores{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}
  .score{display:grid;gap:4px;border:1px solid var(--line);border-radius:var(--radius);padding:10px;background:var(--panel)}
  .score label{font-size:.8rem;color:var(--muted)}
  .score select,.score input{width:100%}
  .final{font-size:.8rem;color:var(--text-2)}
</style>
