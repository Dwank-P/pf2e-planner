<script>
  import {onMount} from 'svelte';
  import ItemInspector from '$lib/ItemInspector.svelte';
  import ThemePicker from '$lib/ThemePicker.svelte';

  let campaignId=$state('');
  let characterId=$state('');
  let character=$state(null);
  let facets=$state(null);
  let catalogue=$state(null);
  let loading=$state(true);
  let errorText=$state('');
  let notice=$state('');
  let saving=$state(false);
  let dirty=$state(false);
  let viewLevel=$state(1);
  let tab=$state('progression');
  let primary=$state(null);
  let second=$state(null);
  let itemNames=$state({});
  let inspector=$state(null);
  let history=$state([]);
  let picker=$state(null);
  let q=$state('');
  let kind=$state('feat');
  let rarity=$state('');
  let pack=$state('');
  let category=$state('');
  let trait=$state('');
  let onlyLevel=$state(true);
  let results=$state([]);
  let count=$state(0);
  let page=$state(1);
  let pages=$state(1);
  let searching=$state(false);
  let pickerError=$state('');
  let searchTimer;
  let saveTimer;
  let searchSeq=0;

  const build=$derived(character?.build||{feats:{},equipment:[],modifiers:{}});
  const level=$derived(character?.level||1);
  const variants=$derived(catalogue?.variants||{});
  const freeArchetype=$derived(variants.freeArchetype===true);
  const dualClass=$derived(variants.dualClass===true);
  const classSlots=$derived(schedules(primary?.metadata?.classFeatLevels,[2,4,6,8,10,12,14,16,18,20]));
  const skillSlots=$derived(schedules(primary?.metadata?.skillFeatLevels,[2,4,6,8,10,12,14,16,18,20]));
  const generalSlots=$derived(schedules(primary?.metadata?.generalFeatLevels,[3,7,11,15,19]));
  const ancestrySlots=[1,5,9,13,17];
  const slots=$derived.by(()=>{
    const groups=[];
    for(let n=1;n<=20;n++){
      if(ancestrySlots.includes(n))groups.push({key:'ancestry-'+n,kind:'ancestry',label:'Ancestry feat',level:n});
      if(classSlots.includes(n))groups.push({key:'class-'+n,kind:'class',label:'Class feat',level:n});
      if(skillSlots.includes(n))groups.push({key:'skill-'+n,kind:'skill',label:'Skill feat',level:n});
      if(generalSlots.includes(n))groups.push({key:'general-'+n,kind:'general',label:'General feat',level:n});
      if(freeArchetype && n>=2 && n%2===0)
        groups.push({key:'archetype-'+n,kind:'archetype',label:'Free Archetype feat',level:n});
    }
    return groups;
  });
  const visibleSlots=$derived(slots.filter(s=>s.level===viewLevel));
  const chosenCount=$derived(slots.filter(s=>build.feats?.[s.key]&&s.level<=level).length);
  const availableCount=$derived(slots.filter(s=>s.level<=level).length);
  const availablePacks=$derived((facets?.packs||[]).filter(p=>
    kind==='feat'?!!(catalogue?.sources?.feats||[]).find(f=>f.label===p.label):true));

  function schedules(value,fallback){
    if(!Array.isArray(value)||!value.length)return fallback;
    return [...new Set(value.map(Number).filter(n=>Number.isInteger(n)&&n>=1&&n<=20))];
  }
  const root=$derived('/api/v1/campaigns/'+encodeURIComponent(campaignId));
  function labelFor(uuid){return itemNames[uuid]||'Selected item';}
  async function api(url,body,method='GET'){
    const response=await fetch(url,{method,credentials:'same-origin',
      headers:body!==undefined?{'content-type':'application/json'}:undefined,
      body:body===undefined?undefined:JSON.stringify(body),cache:'no-store'});
    const result=await response.json().catch(()=>({}));
    if(!response.ok)throw Error(result.message||'Request failed (HTTP '+response.status+')');
    return result;
  }
  async function lookup(uuid){
    const result=await api(root+'/catalog-item?uuid='+encodeURIComponent(uuid));
    itemNames={...itemNames,[uuid]:result.item.name};
    return result.item;
  }
  async function loadClass(){
    primary=null;second=null;
    try{
      if(character?.build.classUuid)primary=await lookup(character.build.classUuid);
      if(character?.build.secondClassUuid)second=await lookup(character.build.secondClassUuid);
    }catch(e){notice='Some selected classes are no longer available in the synchronized catalogue.';}
  }
  async function load(){
    try{
      const paths=location.pathname.split('/');
      campaignId=decodeURIComponent(paths[2]||'');
      characterId=decodeURIComponent(paths[4]||'');
      const result=await api(root+'/characters/'+encodeURIComponent(characterId));
      character=result.character;
      viewLevel=level;
      const [summary,filters]=await Promise.all([
        api(root+'/catalog-summary').catch(()=>null),
        api(root+'/catalog-filters').catch(()=>null)
      ]);
      catalogue=summary;facets=filters;
      await loadClass();
      const uuids=[...new Set([
        ...Object.values(build.feats||{}),...(build.equipment||[]),
        build.ancestryUuid,build.heritageUuid,build.backgroundUuid].filter(Boolean))];
      for(const uuid of uuids.slice(0,110)){
        if(!itemNames[uuid])lookup(uuid).catch(()=>{itemNames={...itemNames,[uuid]:'Unavailable item'};});
      }
    }catch(e){errorText=e.message;}finally{loading=false;}
  }
  function mark(){
    dirty=true;notice='';
    clearTimeout(saveTimer);
    saveTimer=setTimeout(()=>save(),1200);
  }
  async function save(){
    if(saving||!dirty||!character)return;
    saving=true;
    dirty=false;
    const body={name:character.name,level:character.level,build:JSON.parse(JSON.stringify(build)),
      revision:character.revision};
    try{
      const response=await api(root+'/characters/'+encodeURIComponent(characterId),body,'PATCH');
      character.revision=response.character.revision;
      character.updatedAt=response.character.updatedAt;
      notice='Saved';
      errorText='';
    }catch(e){dirty=true;errorText='Save failed: '+e.message;}
    finally{
      saving=false;
      if(dirty&&!errorText){clearTimeout(saveTimer);saveTimer=setTimeout(()=>save(),450);}
    }
  }
  function changeLevel(value){
    const n=Math.max(1,Math.min(20,Number(value)||1));
    character.level=n;
    viewLevel=n;
    mark();
  }
  function setModifier(stat,value){
    character.build.modifiers[stat]=Math.max(-5,Math.min(10,Number(value)||0));
    mark();
  }
  function begin(target,slot=null){
    picker={target,slot};
    q='';rarity='';pack='';trait='';page=1;onlyLevel=true;
    kind=target==='equipment'?'equipment':target==='feat'?'feat':target;
    category=slot?.kind||'';
    if(category==='archetype')category='archetype';
    search();
  }
  async function search(){
    if(!picker)return;
    const request=++searchSeq;
    searching=true;pickerError='';
    try {
      const params=new URLSearchParams({type:kind,page:String(page)});
      if(q.trim())params.set('q',q.trim());
      if(rarity)params.set('rarity',rarity);
      if(pack)params.set('pack',pack);
      if(trait.trim())params.set('trait',trait.trim().toLowerCase());
      if(kind==='feat' && category)params.set('featType',category);
      if(onlyLevel && kind==='feat')params.set('maxLevel',String(picker.slot?.level||level));
      const data=await api(root+'/catalog-items?'+params);
      if(request===searchSeq){results=data.items;count=data.total;pages=data.pages||1;}
    }catch(e){if(request===searchSeq){pickerError=e.message;results=[];}}
    finally{if(request===searchSeq)searching=false;}
  }
  function searchChanged(){
    clearTimeout(searchTimer);
    searchTimer=setTimeout(()=>{page=1;search();},220);
  }
  function filterChanged(){page=1;search();}
  async function inspect(uuid){
    try{
      const detail=await lookup(uuid);
      if(inspector)history=[...history,inspector];
      inspector=detail;
    }catch(e){pickerError='Item details unavailable: '+e.message;}
  }
  function inspectorOpen(item){if(inspector)history=[...history,inspector];inspector=item;}
  function inspectorBack(){inspector=history.at(-1)||inspector;history=history.slice(0,-1);}
  async function choose(result){
    if(!picker||!character)return;
    const target=picker.target;
    if(target==='feat'){
      character.build.feats[picker.slot.key]=result.uuid;
    }else if(target==='equipment'){
      if(!character.build.equipment.includes(result.uuid))character.build.equipment.push(result.uuid);
    }else{
      const key=target==='class'?'classUuid':target==='secondClass'?'secondClassUuid':
        target==='ancestry'?'ancestryUuid':target==='heritage'?'heritageUuid':'backgroundUuid';
      character.build[key]=result.uuid;
      if(target==='class'||target==='secondClass')await loadClass();
    }
    itemNames={...itemNames,[result.uuid]:result.name};
    mark();
    picker=null;
    inspect(result.uuid);
  }
  function clearSlot(slot){delete character.build.feats[slot.key];mark();}
  function clearIdentity(key){
    character.build[key]=null;
    if(key==='classUuid'||key==='secondClassUuid')loadClass();
    mark();
  }
  function removeEquipment(uuid){character.build.equipment=character.build.equipment.filter(x=>x!==uuid);mark();}
  async function deleteCharacter(){
    if(!window.confirm('Permanently delete this character build?'))return;
    try{
      clearTimeout(saveTimer);
      await api(root+'/characters/'+encodeURIComponent(characterId),{},'DELETE');
      location.href=root.replace('/api/v1','')+'/characters';
    }catch(e){errorText=e.message;}
  }
  onMount(()=>{
    load();
    return ()=>{clearTimeout(saveTimer);clearTimeout(searchTimer);};
  });
  const abilities=[['str','Strength'],['dex','Dexterity'],['con','Constitution'],
    ['int','Intelligence'],['wis','Wisdom'],['cha','Charisma']];
  const identities=[
    {key:'ancestryUuid',label:'Ancestry',type:'ancestry'},
    {key:'heritageUuid',label:'Heritage',type:'heritage'},
    {key:'backgroundUuid',label:'Background',type:'background'},
    {key:'classUuid',label:'Class',type:'class'},
    {key:'secondClassUuid',label:'Second class',type:'secondClass'}
  ];
</script>
<svelte:head><title>{character?.name||'Character builder'} · PF2e Planner</title></svelte:head>
{#if loading}
  <div class="loading">Loading your character workshop…</div>
{:else if !character}
  <div class="loading" role="alert">{errorText||'Character unavailable.'} <a href="/">Back to campaigns</a></div>
{:else}
  <div class="builder-shell">
    <header class="builder-header">
      <div class="brand">
        <a href={'/campaigns/'+encodeURIComponent(campaignId)+'/characters'} class="back">← Characters</a>
        <div class="kicker">PF2e Planner / Character workshop</div>
      </div>
      <div class="character-title">
        <input aria-label="Character name" maxlength="80" bind:value={character.name}
          oninput={mark} class="name" />
        <div class="level-edit"><label for="char-level">Level</label>
          <select id="char-level" value={level} onchange={e=>changeLevel(e.currentTarget.value)}>
            {#each Array.from({length:20},(_,i)=>i+1) as l}<option value={l}>{l}</option>{/each}
          </select>
        </div>
      </div>
      <div class="header-actions">
        <span class:unsaved={dirty} class="save-state">{saving?'Saving…':dirty?'Unsaved changes':notice||'Up to date'}</span>
        <button class="primary-action" type="button" disabled={saving||!dirty} onclick={save}>Save</button>
        <ThemePicker/>
      </div>
    </header>
    {#if errorText}<div class="banner" role="alert">{errorText}</div>{/if}
    {#if !catalogue?.complete}<div class="banner">No full compendium import is published for this campaign yet. Ask the GM to select packs and synchronize in Foundry.</div>{/if}
    <div class="workspace">
      <aside class="sidebar">
        <div class="side-heading kicker">Build overview</div>
        <div class="completion">
          <strong>{chosenCount} <span>/ {availableCount} feat slots</span></strong>
          <div class="bar"><div style:width={(availableCount?Math.round(100*chosenCount/availableCount):0)+'%'}></div></div>
          <small>Choices through level {level}</small>
        </div>
        <div class="side-nav">
          <button class:active={tab==='progression'} onclick={()=>{tab='progression';picker=null;}}>◇ Progression</button>
          <button class:active={tab==='equipment'} onclick={()=>{tab='equipment';picker=null;}}>⚒ Equipment</button>
          <button class:active={tab==='abilities'} onclick={()=>{tab='abilities';picker=null;}}>◈ Attributes</button>
          <button class:active={tab==='notes'} onclick={()=>{tab='notes';picker=null;}}>✎ Notes</button>
        </div>
        {#if tab==='progression'}
          <div class="side-heading kicker">Level track</div>
          <div class="level-track">
            {#each Array.from({length:20},(_,i)=>i+1) as n}
              <button class:current={viewLevel===n} class:future={n>level}
                onclick={()=>{viewLevel=n;picker=null;}}>
                <span>{String(n).padStart(2,'0')}</span>
                <span class="dots">{#each slots.filter(s=>s.level===n) as s}
                  <i class:filled={!!build.feats?.[s.key]}></i>
                {/each}</span>
              </button>
            {/each}
          </div>
        {/if}
      </aside>
      <main class="content">
        {#if picker}
          <section class="picker">
            <div class="panel-title">
              <div><button class="text-button" type="button" onclick={()=>picker=null}>← Back to build</button>
                <div class="kicker">Browse synchronized choices</div>
                <h2>Choose {picker.slot?.label||picker.target}</h2>
                <p class="muted">Search by name or slug, filter by rarity, source, category and level. Open details without losing your place.</p></div>
            </div>
            <div class="filters">
              {#if picker.target==='equipment'}
                <label>Item type
                  <select bind:value={kind} onchange={filterChanged}>
                    {#each (facets?.types||[]).filter(x=>!['feat','class','ancestry','heritage','background'].includes(x.label)) as t}
                      <option value={t.label}>{t.label} ({t.count})</option>
                    {/each}
                  </select>
                </label>
              {/if}
              <label class="wide">Search <input placeholder="Name or slug…" type="search"
                bind:value={q} oninput={searchChanged}/></label>
              {#if picker.target==='feat'}
                <label>Feat category
                  <select bind:value={category} onchange={filterChanged}>
                    <option value="">All feat types</option>
                    {#each ['class','ancestry','skill','general','archetype'] as f}
                      <option value={f}>{f}</option>
                    {/each}
                  </select>
                </label>
              {/if}
              <label>Rarity
                <select bind:value={rarity} onchange={filterChanged}>
                  <option value="">Any rarity</option>
                  {#each ['common','uncommon','rare','unique'] as r}<option value={r}>{r}</option>{/each}
                </select>
              </label>
              <label>Source
                <select bind:value={pack} onchange={filterChanged}>
                  <option value="">All imported sources</option>
                  {#each availablePacks as p}<option value={p.label}>{p.label.split('.')[0]} · {p.label.split('.').at(-1)}</option>{/each}
                </select>
              </label>
              {#if picker.target==='feat'}
                <label>Trait
                  <input type="search" placeholder="e.g. fighter" bind:value={trait} oninput={searchChanged}/>
                </label>
                <label class="toggle"><input type="checkbox" bind:checked={onlyLevel} onchange={filterChanged}/>
                  Level {picker.slot?.level||level} or lower</label>
              {/if}
            </div>
            <div class="result-header"><strong>{searching?'Searching…':count+' results'}</strong>
              <button type="button" class="text-button" onclick={()=>{q='';pack='';rarity='';trait='';category='';filterChanged();}}>Clear filters</button></div>
            {#if pickerError}<p class="banner">{pickerError}</p>{/if}
            <div class="results">
              {#each results as result (result.uuid)}
                <div class="result-row">
                  <div class="result-copy">
                    <strong>{result.name}</strong>
                    <small>Level {result.level??'—'} · {result.rarity||'common'} · {result.traits?.slice(0,4).join(', ')||'—'}</small>
                  </div>
                  <div class="result-actions">
                    <button type="button" class="text-button" onclick={()=>inspect(result.uuid)}>Details</button>
                    <button type="button" class="choose" onclick={()=>choose(result)}>Select +</button>
                  </div>
                </div>
              {:else if !searching}
                <div class="empty-result">No options match these filters. Try another category or disable the level restriction.</div>
              {/each}
            </div>
            <div class="pagination">
              <button type="button" disabled={page<=1||searching} onclick={()=>{page--;search();}}>← Previous</button>
              <small>{page} / {pages}</small>
              <button type="button" disabled={page>=pages||searching} onclick={()=>{page++;search();}}>Next →</button>
            </div>
          </section>
        {:else if tab==='progression'}
          <section>
            <div class="panel-title"><div class="kicker">Character foundation</div><h2>Origin &amp; class</h2>
              <p class="muted">Start with the essentials. Select an option to inspect its full rules.</p></div>
            <div class="identity-grid">
              {#each identities.filter(x=>x.key!=='secondClassUuid'||dualClass) as identity}
                <div class="identity-card">
                  <span>{identity.label}</span>
                  <strong>{build[identity.key]?labelFor(build[identity.key]):'Not selected'}</strong>
                  <div class="card-controls">
                    <button type="button" onclick={()=>begin(identity.type)}> {build[identity.key]?'Change':'Choose'} </button>
                    {#if build[identity.key]}
                      <button type="button" class="text-button" onclick={()=>inspect(build[identity.key])}>Details</button>
                      <button type="button" class="text-button" aria-label={'Clear '+identity.label} onclick={()=>clearIdentity(identity.key)}>×</button>
                    {/if}
                  </div>
                </div>
              {/each}
            </div>
          </section>
          <section>
            <div class="level-header">
              <div><div class="kicker">Advancement</div><h2>Level {viewLevel} choices</h2></div>
              <div class="level-pager">
                <button disabled={viewLevel===1} onclick={()=>viewLevel--}>←</button>
                <button disabled={viewLevel===20} onclick={()=>viewLevel++}>→</button>
              </div>
            </div>
            {#if viewLevel>level}
              <p class="notice">Future planning: selections at level {viewLevel} won't be active until you reach that level.</p>
            {/if}
            {#if visibleSlots.length}
              <div class="slot-stack">
                {#each visibleSlots as slot (slot.key)}
                  <div class="slot-card" class:chosen={!!build.feats?.[slot.key]}>
                    <div class="slot-level">{String(slot.level).padStart(2,'0')}</div>
                    <div class="slot-label">
                      <span>{slot.label}</span>
                      <strong>{build.feats?.[slot.key]?labelFor(build.feats[slot.key]):'Choose a feat'}</strong>
                    </div>
                    <div class="slot-actions">
                      {#if build.feats?.[slot.key]}
                        <button class="text-button" onclick={()=>inspect(build.feats[slot.key])}>View</button>
                        <button class="text-button" onclick={()=>clearSlot(slot)}>Remove</button>
                      {/if}
                      <button class="choose" onclick={()=>begin('feat',slot)}> {build.feats?.[slot.key]?'Change':'Choose'} →</button>
                    </div>
                  </div>
                {/each}
              </div>
            {:else}
              <div class="empty-result">No feat-selection slots are scheduled at this level from the available progression data.</div>
            {/if}
            <div class="notice subtle">Slots are derived from imported class progression where available. Prerequisites, class-specific exceptions and dual-class interactions are not fully enforced yet.</div>
          </section>
        {:else if tab==='equipment'}
          <section>
            <div class="panel-title"><div class="kicker">Inventory</div><h2>Equipment &amp; items</h2>
              <p class="muted">Browse items from GM-selected packs. Equipment choices are saved but do not yet automatically adjust statistics.</p></div>
            <button class="primary-action" onclick={()=>begin('equipment')}>+ Add item</button>
            <div class="slot-stack equipment-list">
              {#each build.equipment||[] as uuid}
                <div class="slot-card">
                  <div class="slot-level">⚒</div><strong>{labelFor(uuid)}</strong>
                  <div class="slot-actions"><button class="text-button" onclick={()=>inspect(uuid)}>Details</button>
                    <button class="text-button" onclick={()=>removeEquipment(uuid)}>Remove</button></div>
                </div>
              {:else}
                <div class="empty-result">No equipment selected yet.</div>
              {/each}
            </div>
          </section>
        {:else if tab==='abilities'}
          <section>
            <div class="panel-title"><div class="kicker">Attributes</div><h2>Ability modifiers</h2>
              <p class="muted">Edit modifiers for planning. Automatic boost allocation, proficiencies and derived combat statistics will follow in a later rules-engine release.</p></div>
            <div class="ability-grid">
              {#each abilities as [key,label]}
                <label class="ability-card"><span>{label}</span>
                  <input type="number" min="-5" max="10" value={build.modifiers?.[key]??0}
                    onchange={e=>setModifier(key,e.currentTarget.value)}/>
                </label>
              {/each}
            </div>
          </section>
        {:else}
          <section>
            <div class="panel-title"><div class="kicker">Your character</div><h2>Build notes</h2>
              <p class="muted">Keep a concept, leveling plan or reminders with the character.</p></div>
            <textarea rows="14" maxlength="4000" bind:value={character.build.notes} oninput={mark}
              placeholder="Concept, tactics, retraining ideas…"></textarea>
            <button type="button" class="text-button danger" onclick={deleteCharacter}>Delete character</button>
          </section>
        {/if}
      </main>
      <aside class="right-panel">
        <ItemInspector item={inspector} {campaignId} {level}
          onOpen={inspectorOpen} onBack={inspectorBack}
          onClose={()=>{inspector=null;history=[];}} canBack={history.length>0}/>
      </aside>
    </div>
  </div>
{/if}
<style>
  .builder-shell{height:100vh;min-height:650px;display:flex;flex-direction:column;background:var(--page-bg)}
  .builder-header{padding:.9rem 1.3rem;display:flex;align-items:center;justify-content:space-between;
    gap:1.2rem;border-bottom:1px solid var(--line);background:var(--surface);flex-wrap:wrap}
  .brand{min-width:160px}.back{display:block;color:var(--muted);text-decoration:none;font-size:.83rem;margin-bottom:.1rem}
  .back:hover{color:var(--accent)}.kicker{font-size:.65rem}
  .character-title{display:flex;align-items:center;gap:1rem;min-width:280px;flex:1}
  .name{background:transparent;border:1px solid transparent;color:var(--text);font:800 1.55rem 'Manrope',sans-serif;
    letter-spacing:-.04em;padding:.3rem .5rem;min-width:120px;width:min(350px,50vw)}
  .name:focus{border-color:var(--line);background:var(--surface-hover)}
  .level-edit{display:flex;align-items:center;gap:.5rem}.level-edit label{font-size:.72rem;color:var(--muted)}
  .level-edit select{padding:.4rem;background:var(--surface-hover);font-weight:800}
  .header-actions{display:flex;align-items:center;gap:.7rem}.save-state{font-size:.75rem;color:var(--good)}
  .save-state.unsaved{color:var(--danger)}
  .workspace{display:grid;grid-template-columns:224px minmax(0,1fr) minmax(290px,355px);
    flex:1;min-height:0}
  .sidebar{padding:1.4rem .85rem;overflow-y:auto;border-right:1px solid var(--line);background:var(--surface)}
  .side-heading{padding:.7rem .55rem}
  .completion{padding:1rem .65rem;margin-bottom:1rem;border-radius:12px;background:var(--surface-hover)}
  .completion strong{font:800 1.7rem 'Manrope',sans-serif}.completion strong span{font-size:.85rem;color:var(--muted)}
  .completion small{color:var(--muted);font-size:.75rem}.bar{height:6px;border-radius:10px;background:var(--line);margin:.7rem 0}
  .bar div{background:var(--accent);height:100%;border-radius:inherit}
  .side-nav{display:grid;gap:.16rem;padding-bottom:1.4rem;border-bottom:1px solid var(--line)}
  .side-nav button{text-align:left;border:0;border-radius:9px;background:transparent;color:var(--muted);
    padding:.74rem .85rem;font-weight:700}
  .side-nav button.active{background:var(--accent-bg);color:var(--accent)}
  .side-nav button:hover{background:var(--surface-hover);color:var(--text)}
  .level-track{display:grid;gap:.12rem}
  .level-track button{padding:.45rem .65rem;display:flex;justify-content:space-between;align-items:center;
    color:var(--muted);border:0;border-radius:7px;background:transparent}
  .level-track button.current{background:var(--accent-bg);color:var(--accent);font-weight:800}
  .level-track button.future{opacity:.63}
  .dots{display:flex;gap:3px}.dots i{width:6px;height:6px;background:var(--line);border-radius:50%}
  .dots i.filled{background:var(--accent)}
  .content{overflow-y:auto;padding:1.55rem clamp(1rem,2.5vw,2.6rem) 3.5rem;min-width:0}
  .content section+section{margin-top:2rem}
  .panel-title{margin-bottom:1.2rem}.panel-title h2,.level-header h2{margin:.25rem 0;font-size:1.55rem}
  .panel-title p{margin:.3rem 0;max-width:670px;font-size:.87rem}
  .identity-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:.72rem}
  .identity-card{padding:1rem;border:1px solid var(--line);border-radius:12px;background:var(--surface);
    display:flex;flex-direction:column;gap:.35rem;min-height:125px}
  .identity-card span{font-size:.68rem;color:var(--muted);text-transform:uppercase;letter-spacing:.09em}
  .identity-card strong{font-size:1rem;overflow-wrap:anywhere}
  .card-controls{display:flex;gap:.5rem;align-items:center;margin-top:auto;padding-top:.35rem}
  .card-controls button{border:1px solid var(--line);border-radius:7px;padding:.34rem .5rem;background:var(--surface-hover);color:var(--text);font-size:.73rem}
  .level-header,.result-header,.pagination{display:flex;align-items:center;justify-content:space-between;gap:.7rem}
  .level-pager{display:flex;gap:.4rem}.level-pager button,.pagination button{padding:.47rem .75rem;border:1px solid var(--line);
    background:var(--surface-hover);color:var(--text);border-radius:8px}
  .slot-stack{display:grid;gap:.67rem;margin-top:1rem}
  .slot-card{display:flex;gap:.95rem;align-items:center;background:var(--surface);
    border:1px solid var(--line);border-radius:12px;padding:.8rem .95rem}
  .slot-card.chosen{border-left:3px solid var(--good)}
  .slot-level{width:34px;height:34px;border:1px solid var(--line);background:var(--surface-hover);
    border-radius:9px;display:grid;place-items:center;flex-shrink:0;color:var(--accent);font-weight:800}
  .slot-label{flex:1;min-width:0}.slot-label span{display:block;color:var(--muted);font-size:.75rem}
  .slot-label strong{display:block;font-size:.95rem;overflow-wrap:anywhere}
  .slot-actions,.result-actions{display:flex;align-items:center;gap:.5rem;flex-wrap:wrap}
  .choose{background:var(--accent);color:var(--button-text);font-size:.76rem;border:0;border-radius:8px;
    padding:.52rem .72rem;font-weight:800}
  .text-button{border:0;background:transparent;color:var(--accent);padding:.4rem;font-weight:700;font-size:.76rem}
  .notice{padding:.8rem 1rem;border:1px solid var(--line);background:var(--accent-bg);
    border-radius:9px;font-size:.8rem;margin-top:1rem}
  .notice.subtle{background:transparent;color:var(--muted)}
  .right-panel{min-height:0;overflow:hidden;background:var(--surface-strong);border-left:1px solid var(--line)}
  .picker .filters{display:grid;grid-template-columns:repeat(auto-fit,minmax(155px,1fr));gap:.7rem;
    padding:1rem;border:1px solid var(--line);border-radius:12px;background:var(--surface)}
  .filters label{display:grid;gap:.3rem;font-size:.75rem;color:var(--muted);font-weight:700}
  .filters input,.filters select{width:100%;min-width:0;background:var(--page-bg);padding:.6rem}
  .filters .wide{grid-column:span 2}.filters .toggle{display:flex;align-items:center;gap:.5rem}
  .toggle input{width:15px}.result-header{margin:1.2rem 0 .6rem}
  .result-row{border-bottom:1px solid var(--line);padding:.7rem 0;display:flex;
    align-items:center;justify-content:space-between;gap:1rem}
  .result-copy{min-width:0}.result-copy strong,.result-copy small{display:block}
  .result-copy small{color:var(--muted);font-size:.75rem;margin-top:.2rem;overflow-wrap:anywhere}
  .empty-result{padding:2rem;border:1px dashed var(--line);color:var(--muted);border-radius:12px;margin:1rem 0}
  .pagination{padding:1rem 0}.pagination small{color:var(--muted)}
  .ability-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(155px,1fr));gap:.7rem}
  .ability-card{padding:1rem;background:var(--surface);border:1px solid var(--line);border-radius:10px}
  .ability-card span{display:block;font-size:.8rem;color:var(--muted)}.ability-card input{width:100%;font-size:1.6rem;font-weight:800}
  textarea{width:100%;resize:vertical;background:var(--surface)}.danger{color:var(--danger);margin-top:1rem}
  .banner{padding:.8rem 1.1rem;background:var(--accent-bg);color:var(--text);border-bottom:1px solid var(--line)}
  .loading{display:grid;place-items:center;min-height:100vh;background:var(--page-bg);color:var(--muted)}
  @media(max-width:1170px){.workspace{grid-template-columns:190px minmax(0,1fr)}
    .right-panel{grid-column:1/-1;min-height:360px;max-height:620px;border-top:1px solid var(--line)}
    .content{min-height:650px;max-height:calc(100vh - 110px)}}
  @media(max-width:700px){
    .builder-shell{height:auto;min-height:100vh}.builder-header{padding:1rem;gap:.65rem}
    .character-title{order:3;width:100%}.name{width:60%;font-size:1.3rem}
    .header-actions{margin-left:auto}.save-state{display:none}
    .workspace{display:block}.sidebar{max-height:300px;overflow-y:auto;border-right:0;border-bottom:1px solid var(--line)}
    .level-track{grid-template-columns:repeat(10,minmax(0,1fr))}.level-track button{font-size:.7rem;padding:.4rem .2rem;justify-content:center}
    .dots{display:none}.side-heading{display:none}.completion{margin-bottom:.5rem}.side-nav{display:flex;overflow:auto;white-space:nowrap;padding-bottom:.2rem}
    .content{max-height:none;min-height:unset;padding:1.2rem}.right-panel{height:400px;max-height:none}
    .slot-card,.result-row{flex-wrap:wrap}.slot-actions,.result-actions{margin-left:auto}
    .filters .wide{grid-column:span 1}
  }
</style>
