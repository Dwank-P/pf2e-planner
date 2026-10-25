<script>
  import {onMount} from 'svelte';
  import ItemInspector from '../../../../../../lib/ItemInspector.svelte';
  import ThemePicker from '../../../../../../lib/ThemePicker.svelte';
  import {
    levelerChoiceSlots, selectedBoosts, setBoost, choiceComplete,
    isCompletionSlot, SKILL_LABELS, spellsAtLevel, classFeaturesAt
  } from '../../../../../../lib/leveler-progression.js';
  import {checkFeat,checkHeritage,isSpellAvailable,rankChoices,slugOf,abilities as ABILITY_LABELS}
    from '../../../../../../lib/eligibility.js';
  import {levelerPlanExport,levelerCreationExport} from '../../../../../../lib/leveler-format.js';

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
  let ancestryItem=$state(null);
  let heritageItem=$state(null);
  let backgroundItem=$state(null);
  let detailCache=$state({});
  let showIncompatible=$state(false);
  let bgBoosts=$state([]);
  let bgSkill=$state('');
  let bgFeat=$state('');
  let spellRank=$state(0);
  let pickerWarning=$state('');
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
  const spellModel=$derived(primary?.metadata?.levelerProgression?.spellcasting??null);
  const caster=$derived(Boolean(spellModel||primary?.metadata?.spellcasting));
  const spellTradition=$derived(spellModel?.tradition||primary?.metadata?.spellTradition||'');
  const spellSlots=$derived(spellModel?.slots?.[level]??null);
  const maxSpellRank=$derived(spellSlots
    ? Math.max(0,...Object.entries(spellSlots)
      .filter(([rank,count])=>rank!=='cantrips'&&Number(count)>0)
      .map(([rank])=>Number(rank)).filter(Number.isFinite))
    : Math.min(10,Math.ceil(level/2)));
  // Every chosen spell with the level it is learned at, for the Spells overview.
  const learnedSpells=$derived(Object.entries(build.spells||{}).flatMap(([key,uuids])=>{
    const match=/^(\d{1,2}):(cantrip|rank-(\d{1,2}))$/.exec(key);
    return match?(uuids||[]).map(uuid=>({key,uuid,level:Number(match[1]),
      rank:match[2]==='cantrip'?0:Number(match[3])})):[];
  }).sort((a,b)=>a.rank-b.rank||a.level-b.level));
  const pickerContext=$derived({
    classItem:primary,secondClass:second,ancestry:ancestryItem,heritage:heritageItem,
    slotLevel:picker?.slot?.level||level,slotKind:picker?.slot?.kind||''
  });
  const rankedResults=$derived.by(()=>{
    if(picker?.target==='feat')return rankChoices(results,pickerContext);
    if(picker?.target==='heritage')return results.map(item=>({...item,eligibility:checkHeritage(item,ancestryItem)}))
      .sort((a,b)=>a.eligibility.severity-b.eligibility.severity||a.name.localeCompare(b.name));
    if(picker?.target==='spell')return results.map(item=>({...item,eligibility:isSpellAvailable(item,
      ['arcane','divine','occult','primal'].includes(spellTradition)?spellTradition:'',
      picker.slot?.allowance?.maxRank??maxSpellRank)}))
      .sort((a,b)=>a.eligibility.severity-b.eligibility.severity||a.name.localeCompare(b.name));
    return results.map(item=>({...item,eligibility:{severity:0,reasons:[]}}));
  });
  // The choice schedule is produced by PF2e Leveler's live code inside
  // Foundry and synchronized as part of each class document.
  const progression=$derived(levelerChoiceSlots(primary,second,variants));
  const slots=$derived(progression.slots);
  const visibleSlots=$derived(slots.filter(s=>s.level===viewLevel));
  const autoFeatures=$derived(viewLevel>0?classFeaturesAt([primary,dualClass?second:null],viewLevel):[]);
  const completionSlots=$derived(slots.filter(s=>s.level<=level&&isCompletionSlot(s)));
  const chosenCount=$derived(completionSlots.filter(s=>choiceComplete(s,build)).length);
  const availableCount=$derived(completionSlots.length);
  const availablePacks=$derived((facets?.packs||[]).filter(p=>
    kind==='feat'?!!(catalogue?.sources?.feats||[]).find(f=>f.label===p.label):true));

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
    detailCache={...detailCache,[uuid]:result.item};
    return result.item;
  }
  async function loadIdentity(){
    ancestryItem=null;heritageItem=null;backgroundItem=null;
    try{
      if(character?.build.ancestryUuid)ancestryItem=await lookup(character.build.ancestryUuid);
      if(character?.build.heritageUuid)heritageItem=await lookup(character.build.heritageUuid);
      if(character?.build.backgroundUuid)backgroundItem=await lookup(character.build.backgroundUuid);
    }catch{notice='Some ancestry or heritage details are not in the current catalog.';}
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
      // Start on Origins until ancestry, background and class are chosen.
      const b=character.build||{};
      viewLevel=b.ancestryUuid&&b.backgroundUuid&&b.classUuid?level:0;
      const [summary,filters]=await Promise.all([
        api(root+'/catalog-summary').catch(()=>null),
        api(root+'/catalog-filters').catch(()=>null)
      ]);
      catalogue=summary;facets=filters;
      await Promise.all([loadClass(),loadIdentity()]);
      const uuids=[...new Set([
        ...Object.values(build.feats||{}),...(build.equipment||[]),
        build.ancestryUuid,build.heritageUuid,build.backgroundUuid,
        build.subclassUuid,build.dualSubclassUuid,
        ...Object.values(build.spells||{}).flat()].filter(Boolean))];
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
    // creationChoices are display-only (stored in Leveler's creation document).
    const {creationChoices,...edited}=build;
    const body={name:character.name,level:character.level,build:JSON.parse(JSON.stringify(edited)),
      revision:character.revision};
    try{
      const response=await api(root+'/characters/'+encodeURIComponent(characterId),body,'PATCH');
      character.revision=response.character.revision;
      character.updatedAt=response.character.updatedAt;
      character.leveler=response.character.leveler;
      character.format=response.character.format;
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
  function allowedBoost(slot,ability){
    if(selectedBoosts(build,slot.key).includes(ability))return true;
    // Full slot: deselect a boost before choosing another.
    if(selectedBoosts(build,slot.key).length>=slot.count)return false;
    if(slot.key==='class-1'){
      const allowed=primary?.metadata?.levelerProgression?.keyAbility||
        primary?.metadata?.keyAbility||[];
      return Array.isArray(allowed)&&allowed.includes(ability);
    }
    if(slot.key==='background-1'&&backgroundItem){
      const choices=backgroundItem.metadata?.boostChoices||[];
      const restricted=choices.filter(x=>Array.isArray(x)&&x.length&&x.length<6);
      if(restricted.length){
        const selections=[...selectedBoosts(build,slot.key),ability];
        return selections.length<2||selections.some(x=>restricted.some(group=>group.includes(x)));
      }
    }
    return true;
  }
  function chooseAbility(slot,ability){
    if(!allowedBoost(slot,ability))return;
    setBoost(character.build,slot.key,ability,slot.count);
    mark();
  }
  function chooseSkill(slot,skill){
    character.build.skillIncreases??={};
    if(skill)character.build.skillIncreases[slot.key]=skill;
    else delete character.build.skillIncreases[slot.key];
    mark();
  }
  function begin(target,slot=null,rank=null){
    picker={target,slot};
    q='';rarity='';pack='';trait='';page=1;onlyLevel=true;
    showIncompatible=false;bgBoosts=[];bgSkill='';bgFeat='';pickerWarning='';
    if(target==='spell'&&rank!==null)spellRank=rank;
    kind=target==='equipment'?'equipment':target==='feat'||target==='subclass'?'feat'
      :target==='secondClass'?'class':target;
    category=target==='subclass'?'':slot?.kind||'';
    // Free Archetype feats commonly use the PF2e "class" category, but have
    // the "archetype" trait. Filter by that trait instead of category.
    if(category==='archetype'){category='';trait='archetype';}
    if(category==='dual-class')category='class';
    if(category==='mythic'){category='';trait='mythic';}
    if(target==='heritage'&&!ancestryItem)
      pickerWarning='Choose an ancestry first to see compatible heritages.';
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
      if(picker.target==='subclass')params.set('otherTag',picker.slot.tag);
      else{
        if(kind==='feat' && category)params.set('featType',category);
        if(onlyLevel && kind==='feat')params.set('maxLevel',String(picker.slot?.level||level));
      }
      if(kind==='feat'&&picker.slot?.kind==='class'&&primary)
        params.set('classTrait',slugOf(primary));
      if(kind==='heritage'&&ancestryItem){
        params.set('ancestryUuid',ancestryItem.uuid);
        params.set('ancestrySlug',slugOf(ancestryItem));
        if(showIncompatible)params.set('showAll','true');
      }
      if(kind==='background'){
        if(bgBoosts.length)params.set('bgBoosts',bgBoosts.join(','));
        if(bgSkill)params.set('bgSkill',bgSkill);
        if(bgFeat)params.set('bgFeat',bgFeat);
      }
      if(kind==='spell'){
        // Leveler reports e.g. "bloodline" when the subclass decides the tradition.
        if(['arcane','divine','occult','primal'].includes(spellTradition))params.set('tradition',spellTradition);
        // Cantrips are recognized by their cantrip trait, regardless of rank.
        params.set('spellRank',String(spellRank));
      }
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
    }else if(target==='subclass'){
      character.build[picker.slot.target==='dualClass'?'dualSubclassUuid':'subclassUuid']=result.uuid;
    }else if(target==='equipment'){
      if(!character.build.equipment.includes(result.uuid))character.build.equipment.push(result.uuid);
    }else if(target==='spell'){
      if(spellRoom(picker.slot,spellRank)<=0){
        pickerError='No spells of this rank left to learn at level '+picker.slot.level+'. Remove one first.';
        return;
      }
      character.build.spells||={};
      const key=picker.slot.level+':'+(spellRank===0?'cantrip':'rank-'+spellRank);
      character.build.spells[key]||=[];
      if(!character.build.spells[key].includes(result.uuid))
        character.build.spells[key].push(result.uuid);
    }else{
      const key=target==='class'?'classUuid':target==='secondClass'?'secondClassUuid':
        target==='ancestry'?'ancestryUuid':target==='heritage'?'heritageUuid':'backgroundUuid';
      // A different class means its specialization no longer applies.
      if(key==='classUuid'&&character.build.classUuid!==result.uuid)character.build.subclassUuid=null;
      if(key==='secondClassUuid'&&character.build.secondClassUuid!==result.uuid)character.build.dualSubclassUuid=null;
      character.build[key]=result.uuid;
      if(target==='class'||target==='secondClass')await loadClass();
      if(target==='ancestry'||target==='heritage'||target==='background')await loadIdentity();
    }
    itemNames={...itemNames,[result.uuid]:result.name};
    mark();
    picker=null;
    inspect(result.uuid);
  }
  /** Spells of `rank` (0 = cantrip) still learnable at this level's spell slot. */
  function spellRoom(slot,rank){
    const allowance=slot?.allowance;
    if(!allowance)return 0;
    const chosen=spellsAtLevel(build,slot.level);
    if(rank===0)return allowance.cantrips-chosen.cantrip.length;
    const rankedCount=Object.values(chosen.ranked).reduce((n,x)=>n+x.length,0);
    if(allowance.any)return rank<=allowance.maxRank?allowance.any-rankedCount:0;
    return (allowance.ranks[rank]??0)-(chosen.ranked[rank]?.length??0);
  }
  /** Rank rows shown on a level's spell card: [rank, label, allowed]. */
  function spellRows(slot){
    const a=slot.allowance;
    const rows=[];
    if(a.cantrips)rows.push([0,'Cantrips',a.cantrips]);
    for(const [rank,count] of Object.entries(a.ranks))rows.push([Number(rank),'Rank '+rank,count]);
    if(a.any)for(let rank=1;rank<=a.maxRank;rank++)rows.push([rank,'Rank '+rank,null]);
    return rows;
  }
  function removeSpell(key,uuid){
    character.build.spells[key]=(character.build.spells[key]||[]).filter(x=>x!==uuid);
    if(!character.build.spells[key].length)delete character.build.spells[key];
    mark();
  }
  function toggleBoost(key){
    bgBoosts=bgBoosts.includes(key)?bgBoosts.filter(x=>x!==key):[...bgBoosts,key];
    filterChanged();
  }
  function selectedIssue(uuid,slot){
    const item=detailCache[uuid];
    return item?checkFeat(item,{
      classItem:primary,secondClass:second,ancestry:ancestryItem,heritage:heritageItem,
      slotKind:slot.kind,slotLevel:slot.level
    }):{severity:1,reasons:['Eligibility is not yet confirmed.']};
  }
  const levelerCreationLabels={
    subclass:'Subclass',dualSubclass:'Second-class specialization',
    deity:'Deity',sanctification:'Sanctification',divineFont:'Divine font',
    subconsciousMind:'Subconscious mind',thesis:'Arcane thesis',
    implement:'Implement',tactics:'Tactics',ikons:'Ikons',
    innovationItem:'Innovation',innovationModification:'Innovation modification',
    kineticGateMode:'Kinetic gate',secondElement:'Additional element',
    apparitions:'Apparitions',primaryApparition:'Primary apparition',
    mythicCalling:'Mythic calling',skills:'Starting skills',
    languages:'Languages',dualClassBoosts:'Second-class boosts'
  };
  function readableCreationChoice(value){
    if(value===null||value===undefined)return 'Not selected';
    if(typeof value==='string'||typeof value==='number')return String(value);
    if(Array.isArray(value))return value.map(readableCreationChoice).join(', ')||'None';
    if(typeof value==='object'){
      return String(value.name||value.label||value.slug||value.value||'Selected');
    }
    return 'Selected';
  }
  function classProgression(item){
    if(!item)return [];
    const m=item.metadata||{};
    const text=levels=>{
      if(!Array.isArray(levels)||!levels.length)return 'Not provided';
      if(levels.length>=4 && levels.slice(1).every((v,i)=>v-levels[i]===2))
        return 'Level '+levels[0]+' and every 2 levels';
      return levels.join(', ');
    };
    return [
      ['Key attribute',(m.keyAbility||[]).map(x=>ABILITY_LABELS[x]||x.toUpperCase()).join(' or ')||'Not provided'],
      ['Class feats',text(m.classFeatLevels)],
      ['Skill feats',text(m.skillFeatLevels)],
      ['General feats',text(m.generalFeatLevels)],
      ['Starting saves',Object.entries(m.savingThrows||{})
        .map(([k,v])=>k+': '+(['Untrained','Trained','Expert','Master','Legendary'][v]||v)).join(' · ')||'Not provided'],
      ['Perception',(['Untrained','Trained','Expert','Master','Legendary'][m.perception] ?? m.perception ?? 'Not provided')]
    ];
  }
  function clearSlot(slot){delete character.build.feats[slot.key];mark();}
  function clearIdentity(key){
    character.build[key]=null;
    if(key==='classUuid')character.build.subclassUuid=null;
    if(key==='secondClassUuid')character.build.dualSubclassUuid=null;
    if(key==='classUuid'||key==='secondClassUuid')loadClass();
    if(key==='ancestryUuid'||key==='heritageUuid'||key==='backgroundUuid')loadIdentity();
    mark();
  }
  // Files match PF2e Leveler's own Import buttons (Level Planner / Character Wizard).
  function downloadLeveler(kind){
    const doc={leveler:character?.leveler};
    const text=kind==='plan'?levelerPlanExport(doc):levelerCreationExport(doc);
    if(!text){errorText='Save the build with a class selected before exporting a Leveler plan.';return;}
    const name=(character.name||'character').replace(/[^a-z0-9-]+/gi,'-').toLowerCase();
    const link=document.createElement('a');
    link.href=URL.createObjectURL(new Blob([text],{type:'application/json'}));
    link.download=name+'-leveler-'+kind+'.json';
    link.click();
    setTimeout(()=>URL.revokeObjectURL(link.href),1000);
  }
  function removeEquipment(uuid){character.build.equipment=character.build.equipment.filter(x=>x!==uuid);mark();}
  async function deleteCharacter(){
    if(!window.confirm('Permanently delete this character build?'))return;
    try{
      clearTimeout(saveTimer);
      await api(root+'/characters/'+encodeURIComponent(characterId),{},'DELETE');
      location.href='/campaigns/'+encodeURIComponent(campaignId)+'/characters';
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
        <a href={'/campaigns/'+encodeURIComponent(campaignId)+'/characters/'+encodeURIComponent(characterId)} class="back">← Character Wizard</a>
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
        <details class="leveler-export">
          <summary title="Stored as PF2e Leveler creation and plan data">Leveler ▾</summary>
          <div class="leveler-menu">
            {#if character.format==='legacy'}
              <small class="muted">Saving converts this build to Leveler's format.</small>
            {/if}
            <button type="button" class="text-button" disabled={dirty||!character.leveler?.plan}
              onclick={()=>downloadLeveler('plan')}>Download level plan</button>
            <button type="button" class="text-button" disabled={dirty||!character.leveler?.creation}
              onclick={()=>downloadLeveler('creation')}>Download creation</button>
            <small class="muted">In Foundry, a GM can also use <strong>Pull from Planner</strong>
              in Leveler's planner window.</small>
          </div>
        </details>
        <ThemePicker/>
      </div>
    </header>
    {#if errorText}<div class="banner" role="alert">{errorText}</div>{/if}
    {#if !catalogue?.complete}<div class="banner">No full compendium import is published for this campaign yet. Ask the GM to select packs and synchronize in Foundry.</div>{/if}
    <div class="workspace">
      <aside class="sidebar">
        <div class="side-heading kicker">Build overview</div>
        <div class="completion">
          <strong>{chosenCount} <span>/ {availableCount} choices</span></strong>
          <div class="bar"><div style:width={(availableCount?Math.round(100*chosenCount/availableCount):0)+'%'}></div></div>
          <small>Choices through level {level}</small>
        </div>
        <div class="side-nav">
          <button class:active={tab==='progression'} onclick={()=>{tab='progression';picker=null;}}>◇ Progression</button>
          <button class:active={tab==='equipment'} onclick={()=>{tab='equipment';picker=null;}}>⚒ Equipment</button>
          {#if caster}<button class:active={tab==='spells'} onclick={()=>{tab='spells';picker=null;}}>✧ Spells</button>{/if}
          <!-- Attribute boosts are now included at their advancement levels alongside feats. -->
          <button class:active={tab==='notes'} onclick={()=>{tab='notes';picker=null;}}>✎ Notes</button>
        </div>
        {#if tab==='progression'}
          <div class="side-heading kicker">Level track</div>
          <div class="level-track">
            <button class:current={viewLevel===0} onclick={()=>{viewLevel=0;picker=null;}}>
              <span>Origin</span>
              <span class="dots">{#each ['ancestryUuid','backgroundUuid','classUuid'] as key}
                <i class:filled={!!build[key]}></i>
              {/each}</span>
            </button>
            {#each Array.from({length:20},(_,i)=>i+1) as n}
              <button class:current={viewLevel===n} class:future={n>level}
                onclick={()=>{viewLevel=n;picker=null;}}>
                <span>{String(n).padStart(2,'0')}</span>
                <span class="dots">{#each slots.filter(s=>s.level===n) as s}
                  <i class:filled={choiceComplete(s,build)}></i>
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
              {#if picker.target==='heritage'&&ancestryItem}
                <label class="toggle"><input type="checkbox" bind:checked={showIncompatible}
                    onchange={filterChanged}/> Show incompatible heritages</label>
              {/if}
              {#if picker.target==='background'}
                <fieldset class="boost-filter"><legend>Background attribute boost (any selected)</legend>
                  {#each Object.entries(ABILITY_LABELS) as [key,label]}
                    <button type="button" class:active={bgBoosts.includes(key)}
                      onclick={()=>toggleBoost(key)}>{label}</button>
                  {/each}
                </fieldset>
                <label>Trained skill<input placeholder="e.g. Society" bind:value={bgSkill}
                  oninput={searchChanged}/></label>
                <label>Granted feat<input placeholder="e.g. Battle Medicine" bind:value={bgFeat}
                  oninput={searchChanged}/></label>
              {/if}
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
            {#if pickerWarning}<p class="banner">{pickerWarning}</p>{/if}
            {#if picker.target==='feat'}
              <p class="muted">Initial compatibility hints appear first; full Leveler actor-based prerequisite
                 verification is not active on the website yet. Other choices remain selectable
                and are highlighted when prerequisites or class restrictions need review.</p>
            {/if}
            <div class="results">
              {#each rankedResults as result (result.uuid)}
                <div class="result-row" class:incompatible={result.eligibility.severity===2}
                  class:review={result.eligibility.severity===1}>
                  <div class="result-copy">
                    <strong>{result.name}</strong>
                    <small>Level {result.level??'—'} · {result.rarity||'common'} · {result.traits?.slice(0,4).join(', ')||'—'}</small>
                    {#if result.eligibility.reasons?.length}
                      <small class="eligibility" title={result.eligibility.reasons.join('; ')}>
                        ⚠ {result.eligibility.reasons.join(' · ')}
                      </small>
                    {:else if picker.target==='feat'}<small class="recommended">✓ No basic-filter conflict detected (not Leveler-validated)</small>{/if}
                  </div>
                  <div class="result-actions">
                    <button type="button" class="text-button" onclick={()=>inspect(result.uuid)}>Details</button>
                    <button type="button" class="choose" onclick={()=>choose(result)}>Select +</button>
                  </div>
                </div>
              {:else}
                {#if !searching}
                  <div class="empty-result">No options match these filters. Try another category or disable the level restriction.</div>
                {/if}
              {/each}
            </div>
            <div class="pagination">
              <button type="button" disabled={page<=1||searching} onclick={()=>{page--;search();}}>← Previous</button>
              <small>{page} / {pages}</small>
              <button type="button" disabled={page>=pages||searching} onclick={()=>{page++;search();}}>Next →</button>
            </div>
          </section>
        {:else if tab==='progression'&&viewLevel===0}
          <section>
            <div class="panel-title"><div class="kicker">Origin</div><h2>Ancestry, background &amp; class</h2>
              <p class="muted">Start with the essentials. Select an option to inspect its full rules.
                Level 1 then asks for your boosts, specialization and first feats.</p></div>
            <div class="identity-grid">
              {#each identities.filter(x=>x.key!=='secondClassUuid'||dualClass) as identity}
                <div class="identity-card" class:incompatible={identity.key==='heritageUuid'&&
                  !!heritageItem&&checkHeritage(heritageItem,ancestryItem).severity===2}>
                  <span>{identity.label}</span>
                  <strong>{build[identity.key]?labelFor(build[identity.key]):'Not selected'}</strong>
                  {#if identity.key==='heritageUuid'&&heritageItem&&
                      checkHeritage(heritageItem,ancestryItem).severity>0}
                    <small class="eligibility">⚠ {checkHeritage(heritageItem,ancestryItem).reasons.join(' ')}</small>
                  {/if}
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
            {#if Object.keys(build.creationChoices||{}).length}
              <details class="class-details">
                <summary>Imported Leveler creation choices</summary>
                <p class="muted">These selections came from the open Foundry
                  character wizard. More advanced class-specific choices need
                  Leveler actor-backed editing before they can be changed here.</p>
                <dl>
                  {#each Object.entries(build.creationChoices||{})
                    .filter(([key,value])=>key!=='classSelections'&&value!==null&&value!==undefined) as [key,value]}
                    <dt>{levelerCreationLabels[key]||key}</dt>
                    <dd>{readableCreationChoice(value)}</dd>
                  {/each}
                </dl>
              </details>
            {/if}
            {#if primary}
              <details class="class-details"><summary>Class advancement & starting proficiencies</summary>
                <dl>
                  {#each classProgression(primary) as [label,value]}
                    <dt>{label}</dt><dd>{value}</dd>
                  {/each}
                </dl>
              </details>
            {/if}
            <div class="origin-next">
              <button class="primary-action" type="button" onclick={()=>viewLevel=1}>Continue to level 1 →</button>
            </div>
          </section>
        {:else if tab==='progression'}
          <section>
            {#if primary}
              {#if progression.ready}
                <p class="leveler-source">✦ Advancement schedule from PF2e Leveler
                  {progression.version||'installed version'}.
                  Attributes, skill increases and feats share one level track.</p>
              {:else}
                <div class="banner" role="status">{progression.error} The older
                  compendium snapshot doesn't contain Leveler's progression decisions.</div>
              {/if}
            {:else}
              <p class="notice">Select a class to load Leveler's level-by-level advancement choices.</p>
            {/if}
            <div class="level-header">
              <div><div class="kicker">Advancement</div><h2>Level {viewLevel} choices</h2></div>
              <div class="level-pager">
                <button aria-label="Previous level" onclick={()=>viewLevel--}>←</button>
                <button aria-label="Next level" disabled={viewLevel===20} onclick={()=>viewLevel++}>→</button>
              </div>
            </div>
            {#if viewLevel>level}
              <p class="notice">Future planning: selections at level {viewLevel} won't be active until you reach that level.</p>
            {/if}
            {#if autoFeatures.length}
              <div class="auto-features">
                <span class="kicker">Gained automatically at level {viewLevel}</span>
                <ul>
                  {#each autoFeatures as feature}
                    <li>
                      {#if feature.uuid}
                        <button type="button" class="text-button" onclick={()=>inspect(feature.uuid)}>{feature.name}</button>
                      {:else}<span>{feature.name}</span>{/if}
                      {#if dualClass&&second}<small class="muted">{feature.className}</small>{/if}
                    </li>
                  {/each}
                </ul>
              </div>
            {/if}
            {#if visibleSlots.length}
              <div class="slot-stack">
                {#each visibleSlots as slot (slot.key)}
                  {#if slot.type==='ability'}
                    <div class="slot-card boost-card" class:chosen={choiceComplete(slot,build)}>
                      <div class="slot-level">◈</div>
                      <div class="boost-content">
                        <div class="boost-heading">
                          <div class="slot-label">
                            <span>{slot.label}</span>
                            <strong>{selectedBoosts(build,slot.key).length} / {slot.count} selected</strong>
                          </div>
                          <small class="muted">Choose {slot.count} different {slot.count===1?'attribute':'attributes'}</small>
                        </div>
                        <div class="ability-options" role="group" aria-label={slot.label}>
                          {#each abilities as [key,label]}
                            <button type="button" class:active={selectedBoosts(build,slot.key).includes(key)}
                              disabled={!allowedBoost(slot,key)}
                              aria-pressed={selectedBoosts(build,slot.key).includes(key)}
                              onclick={()=>chooseAbility(slot,key)}>
                              <span>{key.toUpperCase()}</span><small>{label}</small>
                            </button>
                          {/each}
                        </div>
                        {#if slot.level===1}
                          <small class="muted">{slot.key==='class-1'
                            ? 'Choose your class first: only its key ability options can be selected.'
                            :slot.key==='background-1'
                            ? 'Background boosts include one from its restricted list and one free boost.'
                            :'Level 1 uses creation boost sources. Special ancestry and background rules still require actor-backed validation.'}</small>
                        {:else}
                          <small class="muted">This {slot.count}-boost choice and its level come from PF2e Leveler.</small>
                        {/if}
                      </div>
                    </div>
                  {:else if slot.type==='skill'}
                    <div class="slot-card" class:chosen={choiceComplete(slot,build)}>
                      <div class="slot-level">◆</div>
                      <div class="slot-label"><span>{slot.label}</span>
                        <strong>{SKILL_LABELS[build.skillIncreases?.[slot.key]]||'Choose skill to increase'}</strong>
                      </div>
                      <label class="skill-choice">Skill
                        <select value={build.skillIncreases?.[slot.key]||''}
                          onchange={e=>chooseSkill(slot,e.currentTarget.value)}>
                          <option value="">Choose a skill…</option>
                          {#each Object.entries(SKILL_LABELS).filter(([key])=>!slot.allowedSkills?.length||slot.allowedSkills.includes(key)) as [key,label]}
                            <option value={key}>{label}</option>
                          {/each}
                        </select>
                      </label>
                    </div>
                  {:else if slot.type==='feat'}
                    <div class="slot-card" class:chosen={!!build.feats?.[slot.key]}
                      class:incompatible={!!build.feats?.[slot.key]&&selectedIssue(build.feats[slot.key],slot).severity>0}>
                      <div class="slot-level">{String(slot.level).padStart(2,'0')}</div>
                      <div class="slot-label">
                        <span>{slot.label}</span>
                        <strong>{build.feats?.[slot.key]?labelFor(build.feats[slot.key]):'Choose a feat'}</strong>
                        {#if build.feats?.[slot.key]&&selectedIssue(build.feats[slot.key],slot).reasons.length}
                          <small class="eligibility">⚠ {selectedIssue(build.feats[slot.key],slot).reasons.join(' · ')}</small>
                        {/if}
                      </div>
                      <div class="slot-actions">
                        {#if build.feats?.[slot.key]}
                          <button class="text-button" onclick={()=>inspect(build.feats[slot.key])}>View</button>
                          <button class="text-button" onclick={()=>clearSlot(slot)}>Remove</button>
                        {/if}
                        <button class="choose" onclick={()=>begin('feat',slot)}> {build.feats?.[slot.key]?'Change':'Choose'} →</button>
                      </div>
                    </div>
                  {:else if slot.type==='subclass'}
                    {@const subKey=slot.target==='dualClass'?'dualSubclassUuid':'subclassUuid'}
                    <div class="slot-card" class:chosen={!!build[subKey]}>
                      <div class="slot-level">✦</div>
                      <div class="slot-label">
                        <span>{slot.label}</span>
                        <strong>{build[subKey]?labelFor(build[subKey]):'Choose a specialization'}</strong>
                      </div>
                      <div class="slot-actions">
                        {#if build[subKey]}
                          <button class="text-button" onclick={()=>inspect(build[subKey])}>View</button>
                        {/if}
                        <button class="choose" onclick={()=>begin('subclass',slot)}>{build[subKey]?'Change':'Choose'} →</button>
                      </div>
                    </div>
                  {:else if slot.type==='spells'}
                    {@const chosen=spellsAtLevel(build,slot.level)}
                    <div class="slot-card spell-card" class:chosen={choiceComplete(slot,build)}>
                      <div class="slot-level">✧</div>
                      <div class="spell-content">
                        <div class="slot-label">
                          <span>{slot.label}</span>
                          <strong>{chosen.count} / {slot.allowance.total} learned</strong>
                          {#if slot.allowance.any}
                            <small class="muted">Add {slot.allowance.any} spells of any rank you can cast to your spellbook.</small>
                          {/if}
                        </div>
                        {#each spellRows(slot) as [rank,label,allowed]}
                          {@const picks=rank===0?chosen.cantrip:(chosen.ranked[rank]||[])}
                          {#if allowed!==null||picks.length||spellRoom(slot,rank)>0}
                            <div class="spell-row">
                              <span class="spell-rank">{label}{#if allowed!==null} · {picks.length}/{allowed}{/if}</span>
                              <div class="spell-picks">
                                {#each picks as uuid}
                                  <span class="spell-chip">
                                    <button type="button" class="text-button" onclick={()=>inspect(uuid)}>{labelFor(uuid)}</button>
                                    <button type="button" class="text-button" aria-label={'Remove '+labelFor(uuid)}
                                      onclick={()=>removeSpell(slot.level+':'+(rank===0?'cantrip':'rank-'+rank),uuid)}>×</button>
                                  </span>
                                {/each}
                                {#if spellRoom(slot,rank)>0}
                                  <button type="button" class="choose" onclick={()=>begin('spell',slot,rank)}>+ Add</button>
                                {/if}
                              </div>
                            </div>
                          {/if}
                        {/each}
                      </div>
                    </div>
                  {:else}
                    <div class="slot-card">
                      <div class="slot-level">✧</div>
                      <div class="slot-label"><span>{slot.label}</span>
                        <strong>Requires a Foundry actor to calculate</strong>
                      </div>
                    </div>
                  {/if}
                {/each}
              </div>
            {:else}
              <div class="empty-result">No progression choices at this level in the synchronized Leveler plan.</div>
            {/if}
            <div class="notice subtle">The advancement slots are exported from Leveler's actual progression logic.
              Complete prerequisite evaluation, proficiency ranks and boost legality still require a Leveler
              build-state calculation with a Foundry actor. Invalid choices remain visible for planning.</div>
          </section>
        {:else if tab==='spells'}
          <section>
            <div class="panel-title">
              <div class="kicker">{spellTradition?spellTradition+' tradition':'Spellcasting tradition pending'}</div>
              <h2>Spells known</h2>
              <p class="muted">Spells are learned on the level track, within the number
                Leveler allows at each level. This is everything chosen so far.</p>
            </div>
            <div class="slot-stack">
              {#each learnedSpells as spell (spell.key+spell.uuid)}
                <div class="slot-card">
                  <div class="slot-level">{spell.rank===0?'C':spell.rank}</div>
                  <div class="slot-label"><strong>{labelFor(spell.uuid)}</strong>
                    <small class="muted">{spell.rank===0?'Cantrip':'Rank '+spell.rank} · learned at level {spell.level}</small></div>
                  <div class="slot-actions">
                    <button class="text-button" onclick={()=>inspect(spell.uuid)}>Details</button>
                    <button class="text-button" onclick={()=>{tab='progression';viewLevel=spell.level;}}>Level {spell.level} →</button>
                  </div>
                </div>
              {:else}
                <div class="empty-result">No spells learned yet. Choose them on the level track.</div>
              {/each}
            </div>
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
      <aside class="right-panel" class:mobile-open={!!inspector} aria-label="Item details panel">
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
  .leveler-export{position:relative;font-size:.78rem}
  .leveler-export summary{cursor:pointer;list-style:none;color:var(--accent);font-weight:700;padding:.4rem}
  .leveler-menu{position:absolute;right:0;top:110%;z-index:20;display:flex;flex-direction:column;
    align-items:flex-start;gap:.25rem;min-width:15rem;padding:.6rem;border-radius:.5rem;
    background:var(--surface-strong);border:1px solid var(--line);
    box-shadow:0 8px 24px rgb(0 0 0 / .25)}
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
  .incompatible{border-color:#d78989!important;background:color-mix(in srgb,var(--danger) 11%,var(--surface))!important}
  .review{border-color:#b99a67!important;background:color-mix(in srgb,#f3c77b 9%,var(--surface))!important}
  .eligibility{display:block;color:var(--danger);font-size:.73rem;margin-top:.32rem;line-height:1.4}
  .recommended{color:var(--good);font-size:.72rem}
  .boost-filter{display:flex;gap:.35rem;flex-wrap:wrap;grid-column:1/-1;border:1px solid var(--line);
    border-radius:9px;padding:.75rem}
  .boost-filter legend{color:var(--muted);font-size:.78rem;font-weight:750}
  .boost-filter button{border:1px solid var(--line);background:var(--surface-hover);
    color:var(--text);border-radius:8px;padding:.43rem .65rem;font-size:.75rem}
  .boost-filter button.active{background:var(--accent-bg);border-color:var(--accent);
    color:var(--accent)}
  .class-details{margin-top:1rem;background:var(--surface);border:1px solid var(--line);border-radius:11px;padding:.8rem 1rem}
  .class-details summary{cursor:pointer;font-weight:750}
  .class-details dl{display:grid;grid-template-columns:minmax(110px,.5fr) minmax(0,1fr);gap:.45rem 1rem;font-size:.82rem}
  .class-details dt{color:var(--muted)}.class-details dd{margin:0}
  @media(max-width:700px){
    .builder-shell{height:auto;min-height:100vh}.builder-header{padding:1rem;gap:.65rem}
    .character-title{order:3;width:100%}.name{width:60%;font-size:1.3rem}
    .header-actions{margin-left:auto}.save-state{display:none}
    .workspace{display:block}.sidebar{max-height:300px;overflow-y:auto;border-right:0;border-bottom:1px solid var(--line)}
    .level-track{grid-template-columns:repeat(10,minmax(0,1fr))}.level-track button{font-size:.7rem;padding:.4rem .2rem;justify-content:center}
    .dots{display:none}.side-heading{display:none}.completion{margin-bottom:.5rem}.side-nav{display:flex;overflow:auto;white-space:nowrap;padding-bottom:.2rem}
    .content{max-height:none;min-height:unset;padding:1.2rem}
    .right-panel{display:none}
    .right-panel.mobile-open{display:block;position:fixed;inset:0;z-index:1400;
      width:100vw;height:100dvh;max-height:none;overflow:hidden;background:var(--surface-strong);
      border:0;box-shadow:0 0 0 999px #0009}
    .right-panel.mobile-open :global(.inspector){height:100dvh}
    .slot-card,.result-row{flex-wrap:wrap}.slot-actions,.result-actions{margin-left:auto}
    .filters .wide{grid-column:span 1}
  }
  .leveler-source{padding:.7rem 1rem;border-left:3px solid var(--accent);
    background:var(--accent-bg);color:var(--text);font-size:.79rem;border-radius:8px;margin:0 0 1.2rem}
  .boost-card{align-items:flex-start}
  .boost-content{flex:1;min-width:0}
  .origin-next{display:flex;justify-content:flex-end;margin-top:1.2rem}
  .auto-features{border:1px solid var(--line);border-radius:10px;padding:.7rem .9rem;margin:0 0 1rem;
    background:var(--surface)}
  .auto-features ul{list-style:none;margin:.4rem 0 0;padding:0;display:flex;flex-wrap:wrap;gap:.3rem .9rem}
  .auto-features li{display:flex;align-items:baseline;gap:.3rem}
  .auto-features .text-button{padding:0;font-size:.85rem}
  .spell-card{align-items:flex-start}
  .spell-content{flex:1;min-width:0;display:flex;flex-direction:column;gap:.55rem}
  .spell-row{display:flex;gap:.7rem;align-items:baseline;flex-wrap:wrap;border-top:1px solid var(--line);padding-top:.5rem}
  .spell-rank{min-width:7.5rem;font-size:.78rem;font-weight:700;color:var(--muted)}
  .spell-picks{display:flex;flex-wrap:wrap;gap:.35rem;align-items:center;flex:1;min-width:0}
  .spell-chip{display:inline-flex;align-items:center;border:1px solid var(--line);border-radius:999px;
    background:var(--surface-hover);padding:0 .2rem 0 .5rem}
  .spell-chip .text-button{padding:.2rem .25rem;font-size:.78rem}
  .boost-heading{display:flex;justify-content:space-between;align-items:center;gap:.7rem;flex-wrap:wrap}
  .ability-options{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));
    gap:.38rem;margin:.85rem 0 .55rem}
  .ability-options button{background:var(--surface-hover);border:1px solid var(--line);
    border-radius:9px;color:var(--text);display:grid;justify-items:center;
    gap:1px;padding:.5rem .3rem;min-width:0}
  .ability-options button:disabled{opacity:.33;cursor:not-allowed}
  .ability-options button.active{background:var(--accent-bg);border-color:var(--accent);
    color:var(--accent);box-shadow:inset 0 0 0 1px var(--accent)}
  .ability-options button span{font-weight:800;font-size:.85rem}
  .ability-options button small{font-size:.65rem;opacity:.8;overflow:hidden;text-overflow:ellipsis}
  .skill-choice{font-size:.72rem;color:var(--muted);min-width:180px}
  .skill-choice select{display:block;width:100%;margin-top:.25rem;background:var(--surface-hover)}
  @media(max-width:620px){.ability-options{grid-template-columns:repeat(3,minmax(0,1fr))}}
</style>
