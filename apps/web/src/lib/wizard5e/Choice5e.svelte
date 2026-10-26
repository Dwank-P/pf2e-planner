<script>
  import OptionGrid from '../wizard/OptionGrid.svelte';
  import {ABILITIES,ABILITY_NAMES} from '../systems/dnd5e/rules.js';
  import {traitLabel,itemChoiceOptions,featOptions,editionMatches} from '../systems/dnd5e/build.js';
  /** One advancement card: an item choice, proficiencies, an ASI-or-feat, a subclass, optional grants or a size. */
  let {card,catalog,variants,sheet,build,onChoice,onSubclass,info,readonly=false}=$props();
  let open=$state(!card.done);
  const otherEdition=item=>editionMatches(item,variants)?null:{blocked:'Made for the other rules edition',unknown:[]};
  const sizeLabel={tiny:'Tiny',sm:'Small',med:'Medium',lg:'Large',huge:'Huge',grg:'Gargantuan'};
  const takenFeats=$derived(sheet.feats.map(f=>f.uuid));

  function toggleList(value){
    const list=card.value??[];
    if(list.includes(value))return onChoice(card.key,list.filter(x=>x!==value));
    if(card.count===1)return onChoice(card.key,[value]);
    if(list.length<card.count)onChoice(card.key,[...list,value]);
  }
  // ASI points: +1/+2 within the card's cap, never on locked abilities.
  const points=$derived(card.kind==='asi'&&card.value?.mode==='asi'?card.value.points??{}:{});
  const used=$derived(Object.values(points).reduce((n,v)=>n+(v||0),0));
  function bump(ability,delta){
    const next={...points,[ability]:Math.max(0,Math.min(card.cap,(points[ability]??0)+delta))};
    const total=Object.values(next).reduce((n,v)=>n+(v||0),0);
    if(total>card.points)return;
    onChoice(card.key,{mode:'asi',points:next});
  }
  const subclassItems=$derived(card.kind==='subclass'?catalog.ofType('subclass').filter(s=>
    !s.metadata?.classIdentifier||s.metadata.classIdentifier===card.classIdentifier):[]);
  const summary=$derived.by(()=>{
    if(card.kind==='subclass')return catalog.get(card.value)?.name??'Not chosen';
    if(card.kind==='asi'){
      if(card.value?.mode==='feat')return catalog.get(card.value.uuid)?.name??'Feat';
      const parts=ABILITIES.filter(a=>points[a]).map(a=>a.toUpperCase()+' +'+points[a]);
      return parts.join(', ')||'Not chosen';
    }
    if(card.kind==='trait')return (card.value??[]).map(k=>traitLabel(k,variants)).join(', ')||'Not chosen';
    if(card.kind==='grant')return (card.value?.length?card.value.length+' declined':'All taken');
    if(card.kind==='size')return sizeLabel[card.value?.[0]]??'Not chosen';
    return (card.value??[]).map(u=>catalog.get(u)?.name??'?').join(', ')||'Not chosen';
  });
  const need=$derived(card.kind==='trait'||card.kind==='itemChoice'?Math.max(0,card.count-(card.value?.length??0)):0);
</script>
<section class="card" class:done={card.done}>
  <button class="head" aria-expanded={open} onclick={()=>open=!open}>
    <span class="title"><b>{card.title}</b><small>{card.source?.name}{card.kind==='trait'&&card.mode!=='default'?' · '+card.mode:''}</small></span>
    <span class="value">{summary}{#if need}<em> · choose {need}</em>{/if}</span>
    <span class="status" class:ok={card.done} aria-label={card.done?'done':'to do'}></span>
  </button>
  {#if open}
    <div class="body">
      {#if card.kind==='subclass'}
        <OptionGrid items={subclassItems} selected={card.value?[card.value]:[]} max={1} check={otherEdition}
          onToggle={item=>!readonly&&onSubclass(card.classUuid,card.value===item.uuid?null:item.uuid)} onInfo={item=>info(item.uuid)}
          detail={item=>item.metadata?.publication??''} placeholder="Search subclasses…" id={card.key}/>
      {:else if card.kind==='itemChoice'}
        {#if card.replacement}<p class="hint">You may also replace one earlier choice here (change it at its own level).</p>{/if}
        <OptionGrid items={itemChoiceOptions(card,catalog,variants,{showAll:true})} selected={card.value} max={card.count}
          check={otherEdition} onToggle={item=>!readonly&&toggleList(item.uuid)} onInfo={item=>info(item.uuid)}
          detail={item=>[item.metadata?.featSubtype,item.metadata?.requirements,item.metadata?.publication].filter(Boolean).join(' · ')}
          placeholder="Search…" id={card.key}/>
      {:else if card.kind==='trait'}
        <div class="chips" role="group" aria-label={card.title}>
          {#each card.options as key}
            {@const on=(card.value??[]).includes(key)}
            <button class="chip" class:on aria-pressed={on} disabled={readonly||(!on&&card.count>1&&(card.value?.length??0)>=card.count)}
              onclick={()=>toggleList(key)}>{traitLabel(key,variants)}</button>
          {:else}<p class="hint">Nothing left to choose — the character already has every option.</p>{/each}
        </div>
      {:else if card.kind==='asi'}
        {#if card.featAllowed}
          <div class="seg" role="group" aria-label="Increase or feat">
            <button class:on={card.value?.mode!=='feat'} disabled={readonly} onclick={()=>onChoice(card.key,{mode:'asi',points:{}})}>Ability scores</button>
            <button class:on={card.value?.mode==='feat'} disabled={readonly} onclick={()=>onChoice(card.key,{mode:'feat',uuid:null})}>Feat</button>
          </div>
        {/if}
        {#if card.value?.mode==='feat'}
          <OptionGrid items={featOptions(catalog,variants,card.level,{showAll:true,taken:takenFeats.filter(u=>u!==card.value?.uuid)})}
            selected={card.value.uuid?[card.value.uuid]:[]} max={1}
            check={item=>otherEdition(item)??(featOptions(catalog,variants,card.level,{taken:takenFeats.filter(u=>u!==card.value?.uuid)}).includes(item)?null:{blocked:'Not normally available at this level',unknown:[]})}
            onToggle={item=>!readonly&&onChoice(card.key,{mode:'feat',uuid:card.value.uuid===item.uuid?null:item.uuid})}
            onInfo={item=>info(item.uuid)} detail={item=>[item.metadata?.featSubtype,item.metadata?.requirements,item.metadata?.publication].filter(Boolean).join(' · ')}
            placeholder="Search feats…" id={card.key}/>
        {:else}
          <p class="hint">{card.points} point{card.points===1?'':'s'} to spend, up to +{card.cap} per score{Object.keys(card.fixed??{}).some(a=>card.fixed[a])?'; fixed: '+ABILITIES.filter(a=>card.fixed[a]).map(a=>a.toUpperCase()+' +'+card.fixed[a]).join(', '):''}. {used}/{card.points} used.</p>
          <div class="abilities">
            {#each ABILITIES as a}
              {#if !card.locked.includes(a)}
                <div class="ab"><span>{ABILITY_NAMES[a]}</span><b class="num">{sheet.scoresAt(card.level-1)[a]}</b>
                  <span class="step"><button disabled={readonly||!points[a]} aria-label="Less {ABILITY_NAMES[a]}" onclick={()=>bump(a,-1)}>−</button>
                    <span class="num">+{points[a]??0}</span>
                    <button disabled={readonly||used>=card.points||(points[a]??0)>=card.cap} aria-label="More {ABILITY_NAMES[a]}" onclick={()=>bump(a,1)}>+</button></span></div>
              {/if}
            {/each}
          </div>
        {/if}
      {:else if card.kind==='grant'}
        <p class="hint">Optional features — untick any you don’t take.</p>
        {#each card.options as uuid}
          {@const item=catalog.get(uuid)}
          <label class="opt"><input type="checkbox" disabled={readonly} checked={!(card.value??[]).includes(uuid)}
            onchange={e=>onChoice(card.key,e.currentTarget.checked?(card.value??[]).filter(x=>x!==uuid):[...(card.value??[]),uuid])}/>
            <button class="link" onclick={()=>info(uuid)}>{item?.name??uuid}</button></label>
        {/each}
      {:else if card.kind==='size'}
        <div class="chips">
          {#each card.options as size}
            <button class="chip" class:on={card.value?.[0]===size} disabled={readonly} onclick={()=>onChoice(card.key,[size])}>{sizeLabel[size]??size}</button>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</section>
<style>
  .card{border:1px solid var(--line);border-radius:var(--radius);background:var(--panel);overflow:hidden}
  .head{display:grid;grid-template-columns:minmax(0,1fr) auto 12px;gap:12px;align-items:center;width:100%;background:none;border:0;
    padding:12px 14px;text-align:left;color:var(--text)}
  .head:hover{background:var(--panel-2)}
  .title{display:grid;min-width:0}.title small{color:var(--muted);font-size:.78rem}
  .value{font-size:.85rem;color:var(--text-2);text-align:right;max-width:46ch;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .value em{color:var(--warn);font-style:normal}
  .status{width:10px;height:10px;border-radius:50%;border:2px solid var(--brass)}
  .status.ok{background:var(--good);border-color:var(--good)}
  .body{padding:4px 14px 14px;display:grid;gap:10px;border-top:1px solid var(--line)}
  .hint{color:var(--muted);font-size:.85rem;margin:6px 0 0}
  .chips{display:flex;flex-wrap:wrap;gap:6px;padding-top:8px}
  .chip{border:1px solid var(--line);background:var(--panel-2);border-radius:999px;padding:5px 11px;font-size:.85rem;color:var(--text)}
  .chip.on{background:var(--brass);border-color:var(--brass);color:var(--on-brass)}
  .chip:disabled:not(.on){opacity:.45}
  .seg{display:inline-flex;border:1px solid var(--line);border-radius:8px;overflow:hidden;margin-top:8px;width:max-content}
  .seg button{background:none;border:0;padding:6px 12px;color:var(--text-2)}
  .seg button.on{background:var(--panel-3);color:var(--text);font-weight:700}
  .abilities{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}
  .ab{display:grid;gap:2px;border:1px solid var(--line);border-radius:8px;padding:8px 10px}
  .ab span:first-child{font-size:.78rem;color:var(--muted)}
  .step{display:flex;align-items:center;gap:8px}
  .step button{width:28px;height:28px;border-radius:6px;border:1px solid var(--line);background:var(--panel-2)}
  .opt{display:flex;gap:8px;align-items:center}
  .link{background:none;border:0;color:var(--link,var(--brass));text-decoration:underline;padding:0}
</style>
