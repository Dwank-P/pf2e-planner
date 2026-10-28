<script>
  import { renderLevelDescription } from './level-formulas.js';
  import Traits from './ui/Traits.svelte';
  import {itemStats} from './builder/item-stats.js';
  import {originSummary} from './builder/origin-summary.js';
  import {ruleSummary,hasRuleSummary,nameInUuid} from './builder/rule-summary.js';
  import Icon from './ui/Icon.svelte';

  // catalogBase: where catalog-item lives (a campaign, personal character or public link);
  // popout: open items in the campaign's item window; linksDisabled: public links can't follow references.
  let {item=null, level=1, campaignId='', catalogBase=null, popout=true, linksDisabled=false,
    variants={}, onOpen=()=>{}, onBack=()=>{}, onClose=()=>{}, canBack=false, compact=false} = $props();

  let hoverItem=$state(null);
  let hoverState=$state('');
  let hoverPos=$state({x:30,y:100});
  let timer;
  let request=0;
  const cache=new Map();
  const html=$derived(renderLevelDescription(item?.description||'',level));
  const stats=$derived(itemStats(item));
  // Ancestries, classes and other origins: HP, size, key attribute, skills, features…
  const origin=$derived(originSummary(item,variants));
  const ORIGINS=['ancestry','heritage','background','class','race','subclass'];
  // What the website detected from the item's rules: grants, choices, training (PF2e).
  const rules=$derived(item&&!item.metadata?.advancement?ruleSummary(item):null);
  const RULE_TYPES=['ancestry','heritage','background','class','feat','deity'];
  const rulesMissing=$derived(!!item&&!!rules&&!rules.synced&&RULE_TYPES.includes(item.type)&&!item.metadata?.advancement);
  // A deity's domains (with their domain spells, from the Bridge) and cleric spells by rank.
  const deity=$derived.by(()=>{
    if(item?.type!=='deity')return null;
    const r=item.metadata?.rules??{},spells=item.metadata?.domainSpells??{};
    const domain=slug=>({slug,label:spells[slug]?.label??titleCase(slug),spell:spells[slug]?.spell??null,advanced:spells[slug]?.advanced??null});
    return {primary:(r.domains?.primary??[]).map(domain),alternate:(r.domains?.alternate??[]).map(domain),
      spells:Object.entries(r.spells??{}).map(([rank,uuid])=>({rank:Number(rank),uuid})).filter(s=>s.uuid).sort((a,b)=>a.rank-b.rank)};
  });
  const titleCase=s=>String(s??'').replace(/[-_]/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
  // Names for items referenced by id (fetched once; named references show their own name).
  let names=$state({});
  $effect(()=>{
    const wanted=[...(rules?[...rules.grants,...rules.sets].filter(g=>g.uuid&&!g.name).map(g=>g.uuid):[]),
      ...(deity?[...deity.primary,...deity.alternate].flatMap(d=>[d.spell,d.advanced]).concat(deity.spells.map(s=>s.uuid)).filter(Boolean):[])];
    for(const uuid of wanted)if(!(uuid in names)){
      names={...names,[uuid]:null};
      lookup({kind:'uuid',value:uuid}).then(found=>names={...names,[uuid]:found?.name??false}).catch(()=>names={...names,[uuid]:false});
    }
  });
  const nameFor=g=>g.name??(names[g.uuid]===false?'(not synced)':names[g.uuid]??'…');
  async function openUuid(uuid){
    if(linksDisabled||!uuid)return;
    try{await onOpen(await lookup({kind:'uuid',value:uuid}));}catch{hoverState='unavailable';}
  }
  const base=$derived((catalogBase??'/api/v1/campaigns/'+encodeURIComponent(campaignId))+'/catalog-item');
  const canPop=$derived(popout&&!!campaignId&&!catalogBase);
  function getRef(target) {
    const element=target?.closest?.('[data-pf2e-uuid], [data-uuid], [data-pf2e-action]');
    if(!element)return null;
    const uuid=element.getAttribute('data-pf2e-uuid')||element.getAttribute('data-uuid');
    const action=element.getAttribute('data-pf2e-action');
    return uuid?.startsWith('Compendium.')
      ? {kind:'uuid',value:uuid}
      : action ? {kind:'slug',value:action} : null;
  }
  function itemUrl(ref) {
    return base+'?'+(ref.kind==='uuid'?'uuid':'slug')+'='+encodeURIComponent(ref.value);
  }
  function popupUrl(ref){
    return '/campaigns/'+encodeURIComponent(campaignId)+'/items?'+
      (ref.kind==='uuid'?'uuid':'slug')+'='+encodeURIComponent(ref.value)+
      '&level='+encodeURIComponent(level);
  }
  async function lookup(ref) {
    const key=ref.kind+':'+ref.value;
    if(cache.has(key))return cache.get(key);
    const response=await fetch(itemUrl(ref),{credentials:'same-origin'});
    if(!response.ok)throw Error('Reference not in synchronized packs');
    const result=await response.json();
    cache.set(key,result.item);
    return result.item;
  }
  function hoverLink(event) {
    if(linksDisabled)return;
    const ref=getRef(event.target);
    if(!ref)return;
    clearTimeout(timer);
    const sequence=++request;
    hoverPos={
      x:Math.max(12,Math.min((event.clientX||220)+12,(window.innerWidth||800)-350)),
      y:Math.max(12,Math.min((event.clientY||180)+12,(window.innerHeight||800)-230))
    };
    hoverItem=null;
    hoverState='';
    timer=setTimeout(async()=>{
      try {
        const preview=await lookup(ref);
        if(sequence===request){hoverItem=preview;hoverState='ready';}
      }catch{
        if(sequence===request)hoverState='unavailable';
      }
    },220);
  }
  function clearHover(){
    clearTimeout(timer);
    ++request;
    hoverItem=null;
    hoverState='';
  }
  async function follow(event) {
    const ref=getRef(event.target);
    if(!ref)return;
    event.preventDefault();event.stopPropagation();
    if(linksDisabled)return;
    clearHover();
    if(event.ctrlKey||event.metaKey){
      window.open(popupUrl(ref),'_blank','popup=yes,width=760,height=880,noopener');
      return;
    }
    try {await onOpen(await lookup(ref));}
    catch {hoverState='unavailable';}
  }
  function popThis(){
    if(!item)return;
    window.open('/campaigns/'+encodeURIComponent(campaignId)+'/items?uuid='+
      encodeURIComponent(item.uuid)+'&level='+level,'_blank',
      'popup=yes,width=760,height=880,noopener');
  }
</script>

{#if item}
  <div class:compact class:links-off={linksDisabled} class="inspector">
    <div class="inspector-bar">
      <div class="inspector-nav">
        <button type="button" class="ghost" disabled={!canBack} onclick={onBack}>← Back</button>
        {#if canPop}<button type="button" class="ghost" onclick={popThis} title="Open separate item window">↗ Pop out</button>{/if}
      </div>
      <button type="button" class="ghost" onclick={onClose} aria-label="Close details">✕</button>
    </div>
    <div class="inspector-main">
      <div class="eyebrow">{item.type==='race'?'species':item.type||'Item'}{#if item.level!=null&&!ORIGINS.includes(item.type)} <span>·</span> Level {item.level}{/if}</div>
      <div class="heading"><Icon src={item.img} size={56}/><h2>{item.name}</h2></div>
      <div class="inspector-tags"><Traits traits={item.traits||[]} rarity={item.rarity||'common'} max={20}/></div>
      {#if stats.length}
        <dl class="stats">{#each stats as [label,value]}<div><dt>{label}</dt><dd>{value}</dd></div>{/each}</dl>
      {/if}
      {#if origin.facts.length}
        <dl class="stats">{#each origin.facts as [label,value]}<div><dt>{label}</dt><dd>{value}</dd></div>{/each}</dl>
      {/if}
      {#if origin.notes.length}
        <dl class="notes">{#each origin.notes as [label,value]}<div><dt>{label}</dt><dd>{value}</dd></div>{/each}</dl>
      {/if}
      {#if item.metadata?.prerequisites?.length}
        <p class="prereq"><strong>Prerequisites</strong> {item.metadata.prerequisites.join(', ')}</p>
      {/if}
      <div class="description" role="presentation" onclick={follow}
        onpointerover={hoverLink} onpointerout={clearHover} onfocusin={hoverLink} onfocusout={clearHover}>
        {@html html||'<p>No description was imported for this item.</p>'}
      </div>
      {#if deity&&(deity.primary.length||deity.spells.length)}
        <dl class="rules" aria-label="Domains and cleric spells">
          {#snippet spellRef(uuid)}{#if uuid}<button type="button" class="ref" onclick={()=>openUuid(uuid)}>{nameFor({uuid,name:nameInUuid(uuid)})}</button>{/if}{/snippet}
          {#snippet domains(list)}<ul>{#each list as d (d.slug)}<li><b>{d.label}</b>{#if d.spell}{' — '}{@render spellRef(d.spell)}{/if}{#if d.advanced}{' · advanced: '}{@render spellRef(d.advanced)}{/if}</li>{/each}</ul>{/snippet}
          {#if deity.primary.length}<div><dt>Domains</dt><dd>{@render domains(deity.primary)}</dd></div>{/if}
          {#if deity.alternate.length}<div><dt>Alternate</dt><dd>{@render domains(deity.alternate)}</dd></div>{/if}
          {#if deity.spells.length}<div><dt>Cleric spells</dt><dd><ul>{#each deity.spells as s (s.rank)}<li>Rank {s.rank}:{' '}{@render spellRef(s.uuid)}</li>{/each}</ul></dd></div>{/if}
        </dl>
      {/if}
      {#if rules&&hasRuleSummary(rules)}
        <dl class="rules" aria-label="Rules summary">
          {#snippet ref(uuid,label)}{#if uuid}<button type="button" class="ref" onclick={()=>openUuid(uuid)}>{label}</button>{:else}{label}{/if}{/snippet}
          {#snippet either(options,more)}{#each options as o,j}{#if j}{' or '}{/if}{@render ref(o.uuid,o.label)}{/each}{#if more}{' '}<small class="muted">or {more} more</small>{/if}{/snippet}
          {#snippet when(condition)}{#if condition}{' '}<small class="cond">({condition})</small>{/if}{/snippet}
          {#if rules.grants.length}<div><dt>Grants</dt><dd><ul>
            {#each rules.grants as g}<li>
              {#if g.decidedBy}<em>{g.name}</em>{' '}<small class="muted">(decided by your other choices)</small>
              {:else if g.uuid}{@render ref(g.uuid,nameFor(g))}
              {:else if g.options?.length}{@render either(g.options,g.more)}{' '}<small class="muted">(your choice)</small>
              {:else}<em>a {g.query?.toLowerCase()??'item'} you choose</em>{/if}{@render when(g.condition)}</li>{/each}</ul></dd></div>{/if}
          {#if rules.choices.length}<div><dt>Choose</dt><dd><ul>
            {#each rules.choices as c}<li>{#if c.prompt}<span class="muted">{c.prompt}:</span>{' '}{/if}
              {#if c.options.length}{@render either(c.options,c.more)}{:else}<em>a {c.query?.toLowerCase()??'option'}</em>{/if}{@render when(c.condition)}</li>{/each}</ul></dd></div>{/if}
          {#if rules.training.length}<div><dt>Training</dt><dd><ul>
            {#each rules.training as t}<li>{t.rank} in {t.what}{@render when(t.condition)}</li>{/each}</ul></dd></div>{/if}
          {#if rules.sets.length}<div><dt>Passes on</dt><dd><ul>
            {#each rules.sets as s}<li>{s.label}:{' '}{@render ref(s.uuid,nameFor(s))}</li>{/each}</ul></dd></div>{/if}
        </dl>
      {:else if rulesMissing}
        <p class="rules-missing">No rule data was synced for this item, so the website can't see what it grants. Update the
          PF2e Bridge in Foundry and run Sync Now.</p>
      {/if}
      <div class="inspector-footer">
        <span>Displayed at character level <strong>{level}</strong>.</span>
        <span>Level-based damage is estimated; no roll or Rule Elements are executed.</span>
      </div>
    </div>
  </div>
  {#if hoverItem && hoverState==='ready'}
    <div class="hover-preview" role="tooltip" style:left={hoverPos.x+'px'} style:top={hoverPos.y+'px'}>
      <div class="eyebrow">{hoverItem.type} · Level {hoverItem.level??'—'}</div>
      <strong>{hoverItem.name}</strong>
      <p>{hoverItem.metadata?.prerequisites?.length?'Prerequisites: '+hoverItem.metadata.prerequisites.join(', '):''}</p>
      <small>Click to open · Ctrl+click for a separate window</small>
    </div>
  {:else if hoverState==='unavailable'}
    <div class="hover-preview" role="tooltip" style:left={hoverPos.x+'px'} style:top={hoverPos.y+'px'}>
      This reference is not in the selected compendium import.
    </div>
  {/if}
{:else}
  <div class="inspector-empty">
    <span class="spark">✧</span>
    <h3>Explore an option</h3>
    <p>Select a feat, feature, item or link to see its rules here. Hover linked references for a quick preview.</p>
  </div>
{/if}
<style>
  .inspector{height:100%;display:flex;flex-direction:column;min-width:0;color:var(--text)}
  .inspector-bar{display:flex;align-items:center;justify-content:space-between;gap:.75rem;
    padding:.8rem 1.1rem;border-bottom:1px solid var(--line);background:var(--surface)}
  .inspector-nav{display:flex;gap:.3rem}.ghost{background:transparent;color:var(--muted);
    border:1px solid transparent;border-radius:8px;padding:.5rem .6rem;cursor:pointer}
  .ghost:hover{background:var(--surface-hover);color:var(--text)}.ghost:disabled{opacity:.3;cursor:not-allowed}
  .inspector-main{overflow-y:auto;padding:1.25rem 1.5rem 3rem}.inspector-main h2{font-size:1.65rem;
    line-height:1.2;margin:.4rem 0 1rem;letter-spacing:-.03em}.eyebrow{text-transform:uppercase;
    font-weight:750;font-size:.7rem;letter-spacing:.12em;color:var(--accent)}
  .eyebrow span{padding:0 .4rem;color:var(--muted)}
  .inspector-tags{margin:1rem 0}
  .prereq{font-size:.85rem;color:var(--muted);border-left:2px solid var(--accent);padding-left:.85rem}
  .prereq strong{color:var(--text);display:block}
  .stats+.description,.stats+.notes{margin-top:1rem}
  .description{color:var(--text);line-height:1.65;font:1.02rem/1.65 var(--prose);overflow-wrap:anywhere;max-width:62ch}
  .description :global(a[data-uuid]),.description :global(a[data-pf2e-uuid]),
  .description :global(a[data-pf2e-action]){color:var(--accent);text-decoration:underline;
    text-decoration-style:dotted;text-underline-offset:3px;cursor:pointer}
  .description :global(table){border-collapse:collapse;display:block;overflow:auto}
  /* Paragraph spacing, and a coloured label for "Title …", "Edicts …", "Trigger …" lines. */
  .description :global(p){margin:0 0 .7em}
  .description :global(p > strong:first-child){color:var(--accent);font-family:var(--display);font-weight:800;margin-right:.15em}
  .description :global(td),.description :global(th){border:1px solid var(--line);padding:.4rem}
  .description :global(.pf2e-inline){display:inline;padding:.14rem .37rem;border:1px solid var(--line);
    border-radius:5px;background:var(--surface-hover);font-size:.92em}
  .description :global(.pf2e-damage){color:var(--danger);border-color:var(--danger-border)}
  .description :global(.pf2e-template){color:var(--good)}
  .description :global(.pf2e-check){color:var(--accent)}
  .description :global(.pf2e-roll){color:var(--text-2)}
  .inspector-footer{display:grid;gap:.3rem;margin-top:2rem;padding-top:1rem;
    border-top:1px solid var(--line);font-size:.75rem;color:var(--muted)}
  .hover-preview{position:fixed;width:min(320px,80vw);max-height:200px;overflow:hidden;z-index:2000;
    padding:.9rem 1rem;border:1px solid var(--accent);border-radius:11px;
    background:var(--surface-strong);box-shadow:0 15px 60px #0005;color:var(--text);
    pointer-events:none;font-size:.82rem}
  .hover-preview strong{display:block;font-size:1rem;margin:.4rem 0}.hover-preview p{color:var(--muted)}
  .hover-preview small{color:var(--muted)}
  .inspector-empty{text-align:center;margin:auto;padding:3rem 1.6rem;color:var(--muted)}
  .inspector-empty h3{color:var(--text)}.spark{font-size:3.1rem;color:var(--accent)}
  /* Public links show references as plain text. */
  .links-off :global([data-pf2e-uuid]),.links-off :global([data-uuid]),.links-off :global([data-pf2e-action]){pointer-events:none;cursor:text;text-decoration:none;color:inherit}
  .stats{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:6px;margin:.6rem 0 0}
  .stats div{background:var(--panel-2);border:1px solid var(--line);border-radius:8px;padding:6px 9px}
  .stats dt{font:600 .68rem var(--mono);text-transform:uppercase;color:var(--muted)}
  .stats dd{margin:2px 0 0;font-weight:700}
  .heading{display:flex;align-items:center;gap:12px;margin:.4rem 0 1rem}
  .rules{display:grid;gap:6px;margin:1.4rem 0 0;padding:.8rem 1rem;border:1px solid var(--line);border-radius:10px;
    background:var(--panel-2);font-size:.9rem;max-width:62ch}
  .rules div{display:grid;grid-template-columns:6.5em minmax(0,1fr);gap:8px}
  .rules dt{font:700 .7rem var(--mono);text-transform:uppercase;letter-spacing:.06em;color:var(--accent);padding-top:.2em}
  .rules dd{margin:0}
  .rules ul{list-style:none;margin:0;padding:0;display:grid;gap:2px}
  .ref{background:none;border:0;padding:0;color:var(--accent);font:inherit;text-decoration:underline;
    text-decoration-style:dotted;text-underline-offset:3px;cursor:pointer}
  .links-off .ref{color:inherit;text-decoration:none;pointer-events:none}
  .cond{color:var(--muted)}
  .rules-missing{margin:1.4rem 0 0;font-size:.85rem;color:var(--warn);max-width:62ch}
  .heading h2{margin:0}
  .notes{display:grid;gap:4px;margin:.6rem 0 1rem;font-size:.88rem}
  .notes div{display:grid;grid-template-columns:8.5em minmax(0,1fr);gap:8px}
  .notes dt{font:600 .7rem var(--mono);text-transform:uppercase;color:var(--muted);padding-top:.2em}
  .notes dd{margin:0;color:var(--text)}
</style>
