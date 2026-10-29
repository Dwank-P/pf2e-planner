<script>
  import {tr} from '../i18n/index.js';
  import OptionGrid from './OptionGrid.svelte';
  import Icon from '../ui/Icon.svelte';
  import RankLadder from '../ui/RankLadder.svelte';
  import * as P from '../builder/plan.js';
  import {buildState,checkFeat,featNameIndex,skillRanks,maxSkillRank,trainedBefore} from '../builder/legality.js';
  import {ATTRIBUTES,ATTRIBUTE_NAMES,SKILLS,RANKS,titleCase,attributeModifiers,formatModifier} from '../builder/rules.js';
  import {featOptions,spellOptions,languageRarityMap} from './options.js';
  import {classFeaturesAt} from '../leveler-progression.js';
  import {grantedNewAt,grantsAt} from '../builder/granted.js';
  import {wishlist,formatPrice} from '../builder/equipment.js';
  import GrantsPanel from './GrantsPanel.svelte';
  import FeatChoices from './FeatChoices.svelte';
  import {choiceContext} from '../builder/choice-sets.js';
  import {levelGrantRequirements,toggleGrantSelection,takenFormulas} from '../builder/grants.js';
  /** One planned level (2–20): every slot Leveler's schedule gives, editable inline. */
  let {level,slots,creation,plan,planner={},catalog,variants,updatePlan,info,currentLevel=1,onEquipment=()=>{}}=$props();
  const lookup=$derived(catalog.get);
  const state=$derived(buildState(creation,plan,lookup,level,variants));
  const names=$derived(featNameIndex(catalog));
  const choiceCtx=$derived(choiceContext(creation,plan,lookup));
  // Skills trained before a slot's feat: earlier levels, this level's skill increases and the feats in
  // earlier slots here. A feat that would train one of them offers another skill instead.
  function slotCtx(slot){
    const index=slots.indexOf(slot);
    const before=slots.slice(0,index).filter(s=>s.type==='feat').map(s=>P.planFeat(plan,s)).filter(Boolean);
    return {...choiceCtx,trainedBefore:trainedBefore(creation,plan,lookup,level,{before})};
  }
  const suppressed=$derived(grantsAt(creation,plan,lookup,level,variants).suppressed);
  const features=$derived(classFeaturesAt([lookup(creation.class?.uuid),variants.dualClass===true?lookup(creation.dualClass?.uuid):null],level)
    .filter(f=>!f.uuid||!suppressed.has(lookup(f.uuid)?.uuid??f.uuid)));
  // Feats and features other items grant at this level (Second Doctrine's grants, a dedication's feat…).
  const grantedHere=$derived(grantedNewAt(creation,plan,lookup,level,variants).filter(g=>!features.some(f=>f.uuid===g.item.uuid||f.name===g.item.name)));
  const before=$derived(attributeModifiers(creation,lookup,plan?.levels??{},level-1));
  const ranksBefore=$derived(skillRanks(creation,plan,lookup,level-1));
  const lores=$derived([...ranksBefore.keys()].filter(k=>k.endsWith(' lore')));
  // Boosting Intelligence's modifier here trains a skill and teaches a language per point.
  const intBonus=$derived(P.intBonusCount(plan,level,l=>attributeModifiers(creation,lookup,plan?.levels??{},l).mods));
  const languageChoices=$derived([...languageRarityMap(variants?.languages,[]).entries()].filter(([,r])=>r==='common').map(([l])=>l).sort());
  const knownLanguages=$derived(new Set([...(creation.languages??[]),
    ...(lookup(creation.ancestry?.uuid)?.metadata?.rules?.languages?.value??[]),
    ...Array.from({length:Math.max(0,level-2)},(_,i)=>P.intBonusLanguages(plan,i+2)).flat()]));
  const tradition=$derived(lookup(creation.class?.uuid)?.metadata?.levelerProgression?.spellcasting?.tradition??'');
  let open=$state(null);

  function featDone(slot){return !!P.planFeat(plan,slot);}
  /** The slot's source as an icon: class feats show the class, dual-class the second class, ancestry the ancestry. */
  const entryImg=entry=>entry?.uuid?lookup(entry.uuid)?.img??entry.img??null:null;
  // With two classes, name them: "Bard feat" and "Barbarian feat" instead of "Class feat".
  // Leveler's slot names translate; automatic bonus progression lists its benefits.
  const slotLabel=slot=>creation.dualClass&&slot.kind==='class'?tr('{0} feat',creation.class.name)
    :slot.kind==='dual-class'&&creation.dualClass?tr('{0} feat',creation.dualClass.name)
    :slot.benefits?tr('Automatic bonus progression: {0}',slot.benefits.map(b=>tr(b)).join(', ')):tr(slot.label);
  function sourceIcon(kind){
    if(kind==='class')return entryImg(creation.class);
    if(kind==='dual-class')return entryImg(creation.dualClass);
    if(kind==='ancestry')return entryImg(creation.ancestry);
    if(kind==='skill')return entryImg(creation.background);
    return null;
  }
  function setFeat(slot,item){
    const current=P.planFeat(plan,slot);
    updatePlan(p=>P.setPlanFeat(p,slot,current?.uuid===item.uuid?null:item));
    if(current?.uuid!==item.uuid)open=null;
  }
  function spellRows(slot){
    const a=slot.allowance;
    const rows=[];
    if(a.cantrips)rows.push([0,'Cantrips',a.cantrips]);
    for(const [rank,count] of Object.entries(a.ranks))rows.push([Number(rank),'Rank '+rank,count]);
    if(a.any)for(let rank=1;rank<=a.maxRank;rank++)rows.push([rank,'Rank '+rank,null]);
    return rows;
  }
  function spellRoom(slot,rank){
    const a=slot.allowance;
    const picks=P.planSpells(plan,level,slot.entryType);
    const cantrips=picks.filter(s=>s.isCantrip).length;
    const ranked=picks.filter(s=>!s.isCantrip);
    if(rank===0)return a.cantrips-cantrips;
    if(a.any)return rank<=a.maxRank?a.any-ranked.length:0;
    return (a.ranks[rank]??0)-ranked.filter(s=>Number(s.rank)===rank).length;
  }
  const wishes=$derived(wishlist(planner).filter(w=>w.targetLevel===level));
  const grants=$derived(levelGrantRequirements(creation,plan,lookup,level));
  function toggleGrant(requirement,item){
    updatePlan(p=>{
      const next=JSON.parse(JSON.stringify(p));
      next.levels??={};
      next.levels[level]=toggleGrantSelection(next.levels[level]??{},requirement,item);
      return next;
    });
  }
</script>
<div class="level">
  {#if level>currentLevel}<p class="future muted">{tr("Planned. This becomes active when the character reaches level {0}.", level)}</p>{/if}
  {#if wishes.length}
    <div class="gained">
      <span class="eyebrow">{tr("Equipment planned for level {0} · {1}", level, formatPrice(wishes.reduce((n,w)=>n+(w.price??0)*(w.quantity||1),0)))}</span>
      <ul>{#each wishes as w (w.id)}<li class:bought={w.status==='bought'}><button class="link" onclick={()=>info(w.uuid)}>{w.quantity>1?w.quantity+'× ':''}{w.name}</button>
        <small class="muted">{formatPrice(w.price)}</small></li>{/each}
        <li><button class="link" onclick={onEquipment}>{tr("Edit plan →")}</button></li></ul>
    </div>
  {/if}
  {#if features.length||grantedHere.length}
    <div class="gained">
      <span class="eyebrow">{tr("Gained automatically")}</span>
      <ul>{#each features as f}<li>{#if f.uuid}<button class="link" onclick={()=>info(f.uuid)}>{f.name}</button>{:else}{f.name}{/if}</li>{/each}
        {#each grantedHere as g (g.item.uuid)}<li><button class="link" onclick={()=>info(g.item.uuid)}>{g.item.name}</button>
          <small class="muted">{tr("from {0}", g.from)}</small></li>{/each}</ul>
    </div>
  {/if}
  {#each slots as slot (slot.key)}
    {#if slot.type==='feat'}
      {@const chosen=P.planFeat(plan,slot)}
      {@const src=sourceIcon(slot.kind)??(chosen?lookup(chosen.uuid)?.img??chosen.img:null)}
      {@const verdict=chosen?checkFeat(lookup(chosen.uuid)??chosen,state,{kind:slot.kind,featNames:names,currentUuid:chosen.uuid}):null}
      <section class="slot" class:open={open===slot.key} class:done={!!chosen}>
        <button class="head" aria-expanded={open===slot.key} onclick={()=>open=open===slot.key?null:slot.key}>
          {#if src}<span class="icon pic" aria-hidden="true"><Icon {src} size={30}/></span>
          {:else}<span class="icon" aria-hidden="true">{slot.kind==='class'?'C':slot.kind==='skill'?'S':slot.kind==='general'?'G':slot.kind==='ancestry'?'A':slot.kind==='archetype'?'Ar':slot.kind==='mythic'?'M':'D'}</span>{/if}
          <span class="text"><span class="eyebrow">{slotLabel(slot)}</span>
            <span class="value" class:unset={!chosen}>{chosen?.name??tr('Choose a feat')}</span>
            {#if verdict?.blocked}<small class="warn">⚠ {verdict.blocked}</small>{/if}</span>
          <span class="action">{chosen?tr('Change'):tr('Choose')}</span>
        </button>
        {#if chosen}<FeatChoices entry={chosen} {catalog} context={slotCtx(slot)} {info}
          onChange={choices=>updatePlan(p=>P.setPlanFeatChoices(p,slot,choices))}/>{/if}
        {#if open===slot.key}
          <OptionGrid id={slot.key} items={featOptions(catalog,slot.kind,creation)} selected={chosen?[chosen.uuid]:[]}
            onToggle={item=>setFeat(slot,item)} onInfo={item=>info(item.uuid)}
            check={item=>checkFeat(item,state,{kind:slot.kind,featNames:names,currentUuid:chosen?.uuid})}
            detail={item=>item.metadata?.prerequisites?.length?tr('Requires {0}',item.metadata.prerequisites.join('; ')):''}
            placeholder={tr('Search {0}',slotLabel(slot).toLowerCase())}/>
        {/if}
      </section>
    {:else if slot.type==='ability'}
      {@const picks=P.planBoosts(plan,level)}
      {@const gradual=slot.count<4}
      {@const usedInSet=gradual?P.boostsUsedInSet(plan,level):new Map()}
      <section class="slot" class:done={picks.length>=slot.count}>
        <div class="head static"><span class="icon" aria-hidden="true">◈</span>
          <span class="text"><span class="eyebrow">{gradual?tr('Gradual attribute boost'):tr('Attribute boosts')} · {picks.length}/{slot.count}</span>
            <span class="muted small">{tr("{0} At +4 or higher a boost is partial: two make +1.", gradual?tr("One boost a level; levels {0} boost four different attributes.",P.gradualSet(level).join(', ')):tr('Four different attributes.'))}</span></span></div>
        <div class="boosts">
          {#each ATTRIBUTES as a}
            {@const on=picks.includes(a)}
            {@const from=before.mods[a]}
            {@const takenAt=usedInSet.get(a)}
            <button class="attr" class:on aria-pressed={on} disabled={!on&&(picks.length>=slot.count||!!takenAt)}
              title={takenAt?tr("Boosted at level {0} in this set",takenAt):''}
              onclick={()=>updatePlan(p=>P.toggleLevelBoost(p,level,a,slot.count,{gradual}))}>
              <b>{a.toUpperCase()}</b>
              <small class="num">{takenAt&&!on?tr('Level {0}',takenAt):formatModifier(from)+(on?(from>=4?(before.partial[a]?' → '+formatModifier(from+1):' → ½'):' → '+formatModifier(from+1)):'')}</small>
            </button>
          {/each}
        </div>
        {#if intBonus>0}
          {@const skillPicks=P.intBonusSkills(plan,level)}
          {@const languagePicks=P.intBonusLanguages(plan,level)}
          <div class="int-bonus">
            <span class="eyebrow">{tr(intBonus>1?'Higher Intelligence: train {0} skills · {1}/{2}':'Higher Intelligence: train {0} skill · {1}/{2}', intBonus, skillPicks.length, intBonus)}</span>
            <div class="chips">{#each SKILLS.filter(s=>!(ranksBefore.get(s)>0)||skillPicks.includes(s)) as s}
              <button class="chip" class:on={skillPicks.includes(s)} aria-pressed={skillPicks.includes(s)}
                disabled={!skillPicks.includes(s)&&skillPicks.length>=intBonus}
                onclick={()=>updatePlan(p=>P.toggleIntBonus(p,level,'intBonusSkills',s,intBonus))}>{titleCase(s)}</button>{/each}</div>
            <span class="eyebrow">{tr(intBonus>1?'…and learn {0} languages · {1}/{2}':'…and learn {0} language · {1}/{2}', intBonus, languagePicks.length, intBonus)}</span>
            <div class="chips">{#each languageChoices.filter(l=>!knownLanguages.has(l)||languagePicks.includes(l)) as l}
              <button class="chip" class:on={languagePicks.includes(l)} aria-pressed={languagePicks.includes(l)}
                disabled={!languagePicks.includes(l)&&languagePicks.length>=intBonus}
                onclick={()=>updatePlan(p=>P.toggleIntBonus(p,level,'intBonusLanguages',l,intBonus))}>{titleCase(l)}</button>{/each}</div>
          </div>
        {/if}
      </section>
    {:else if slot.type==='skill'}
      {@const chosen=P.planSkillIncrease(plan,slot)}
      {@const cap=maxSkillRank(level)}
      <section class="slot" class:open={open===slot.key} class:done={!!chosen}>
        <button class="head" aria-expanded={open===slot.key} onclick={()=>open=open===slot.key?null:slot.key}>
          <span class="icon" aria-hidden="true">↑</span>
          <span class="text"><span class="eyebrow">{slotLabel(slot)}</span>
            <span class="value" class:unset={!chosen}>{chosen?titleCase(chosen.skill)+' → '+(RANKS[chosen.toRank]??'+1'):tr('Choose a skill')}</span></span>
          <span class="action">{chosen?tr('Change'):tr('Choose')}</span>
        </button>
        {#if open===slot.key}
          <div class="skills">
            {#each [...SKILLS,...lores].filter(s=>!slot.allowedSkills?.length||slot.allowedSkills.includes(s)) as skill}
              {@const rank=ranksBefore.get(skill)??0}
              {@const on=chosen?.skill===P.levelerSkill(skill)}
              <button class="skill" class:on disabled={!on&&rank>=cap}
                onclick={()=>{updatePlan(p=>P.setSkillIncrease(p,slot,on?null:skill,rank+1));open=null;}}>
                <span>{titleCase(skill)}</span><RankLadder rank={on?rank+1:rank}/>
                <small>{rank>=cap&&!on?(rank>=4?tr('Legendary'):tr("Max {0} at level {1}",RANKS[cap],level)):RANKS[rank]+' → '+RANKS[rank+1]}</small>
              </button>
            {/each}
          </div>
        {/if}
      </section>
    {:else if slot.type==='spells'}
      {@const picks=P.planSpells(plan,level,slot.entryType)}
      {@const learned=P.learnedSpellLevels(creation,plan,slot.entryType)}
      {@const entry={entryType:slot.entryType}}
      <section class="slot">
        <div class="head static"><span class="icon" aria-hidden="true">✧</span>
          <span class="text"><span class="eyebrow">{slotLabel(slot)} · {picks.length}/{slot.allowance.total}</span>
            {#if slot.allowance.any}<span class="muted small">{tr("Add {0} spells of any rank you can cast to your spellbook.", slot.allowance.any)}</span>{/if}</span></div>
        {#each spellRows(slot) as [rank,label,allowed]}
          {@const here=picks.filter(s=>rank===0?s.isCantrip:!s.isCantrip&&Number(s.rank)===rank)}
          {#if allowed!==null||here.length||spellRoom(slot,rank)>0}
            {@const rowKey=slot.key+rank}
            <div class="spell-row">
              <button class="rank" aria-expanded={open===rowKey} onclick={()=>open=open===rowKey?null:rowKey}>
                <span aria-hidden="true">{open===rowKey?'▾':'▸'}</span> {tr(label)}{allowed!==null?` · ${here.length}/${allowed}`:''}</button>
              <span class="chips-row">
                {#each here as s}<span class="spell-chip"><button class="link" onclick={()=>info(s.uuid)}>{s.name}</button>
                  <button class="link x" aria-label={tr('Remove {0}',s.name)} onclick={()=>updatePlan(p=>P.togglePlanSpell(p,level,s,{rank,cantrip:rank===0,...entry}))}>×</button></span>{/each}
                {#if spellRoom(slot,rank)>0&&open!==rowKey}<button class="btn small" onclick={()=>open=rowKey}>{tr("+ Add")}</button>{/if}
              </span>
            </div>
            {#if open===rowKey}
              <OptionGrid id={slot.key+'-'+rank} items={spellOptions(catalog,{cantrip:rank===0,tradition:slot.tradition||tradition,rank})}
                selected={here.map(s=>s.uuid)} max={99}
                check={item=>{
                  // A spell already learned at another level can't be learned again.
                  const at=learned.get(item.uuid);
                  return at&&at!==level?{blocked:tr("Learned at level {0}",at),unknown:[],hard:true}:null;
                }}
                onToggle={item=>{if(here.some(s=>s.uuid===item.uuid)||spellRoom(slot,rank)>0)updatePlan(p=>P.togglePlanSpell(p,level,item,{rank,cantrip:rank===0,...entry}));}}
                onInfo={item=>info(item.uuid)} placeholder={tr('Search {0} spells',label.toLowerCase())}/>
            {/if}
          {/if}
        {/each}
      </section>
    {:else if slot.type==='signature'}
      <section class="slot">
        <div class="head static"><span class="icon" aria-hidden="true">★</span>
          <span class="text"><span class="eyebrow">{slotLabel(slot)}</span>
            <span class="muted small">{tr("One spell per rank from your repertoire; you can cast it at any higher rank you have slots for.")}</span></span></div>
        {#each slot.ranks as rank}
          {@const chosen=P.planSignature(plan,level,rank,slot.entryType)}
          {@const options=P.repertoire(creation,plan,level,slot.entryType).filter(s=>Number(s.rank)===rank)}
          <div class="spell-row">
            <span class="rank">{tr("Rank {0}", rank)}</span>
            <span class="chips-row">
              {#each options as s (s.uuid)}
                <button class="sig" class:on={chosen?.uuid===s.uuid} aria-pressed={chosen?.uuid===s.uuid}
                  onclick={()=>updatePlan(p=>P.setSignatureSpell(p,level,rank,chosen?.uuid===s.uuid?null:s,slot.entryType))}>{s.name}</button>
              {:else}<span class="muted small">{tr("Learn a rank-{0} spell first.", rank)}</span>{/each}
            </span>
          </div>
        {/each}
      </section>
    {:else}
      <section class="slot"><div class="head static"><span class="icon" aria-hidden="true">·</span>
        <span class="text"><span class="eyebrow">{slotLabel(slot)}</span><span class="muted small">{tr("Applied automatically.")}</span></span></div></section>
    {/if}
  {:else}
    {#if !grants.length}<p class="empty">{tr("Nothing to choose at level {0}.", level)}</p>{/if}
  {/each}
  <GrantsPanel requirements={grants} store={plan?.levels?.[level]??{}} {catalog} {level}
    taken={takenFormulas(creation,plan)} onToggle={toggleGrant} {info}/>

</div>
<style>
  .level{display:grid;gap:10px}
  .future{font-size:.88rem}
  .gained{border:1px solid var(--line);border-radius:var(--radius);padding:10px 12px;background:var(--panel);display:grid;gap:6px}
  .gained ul{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:6px}
  .gained li{padding:3px 8px;border-radius:6px;background:var(--panel-2);font-size:.88rem}
  .slot{border:1px solid var(--line);border-radius:var(--radius);background:var(--panel);overflow:hidden}
  .slot.open{border-color:var(--line-strong)}
  .slot.open :global(.options),.slot :global(.options){padding:0 12px 12px}
  .head{display:grid;grid-template-columns:32px minmax(0,1fr) auto;gap:12px;align-items:center;width:100%;text-align:left;
    background:none;border:0;padding:12px 14px;color:var(--text)}
  .head.static{grid-template-columns:32px minmax(0,1fr)}
  .icon{width:30px;height:30px;border-radius:8px;display:grid;place-items:center;background:var(--panel-2);font:700 .75rem var(--mono);color:var(--brass)}
  .icon.pic{background:none;overflow:hidden}
  .done .icon{background:var(--brass-soft)}
  .text{display:grid;gap:2px;min-width:0}
  .value{font:800 1rem var(--display)}
  .value.unset{font:400 .95rem var(--body);color:var(--muted)}
  .warn{color:var(--warn)}
  .small{font-size:.84rem}
  .action{font-weight:700;color:var(--brass);font-size:.88rem}
  .boosts{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:6px;padding:0 12px 12px}
  .attr{border:1px solid var(--line);background:var(--panel-2);border-radius:8px;padding:8px 4px;display:grid;gap:2px;text-align:center}
  .attr b{font:700 .85rem var(--mono)}
  .attr small{font-size:.72rem;color:var(--muted)}
  .attr.on{background:var(--brass);border-color:var(--brass);color:var(--on-brass)}
  .attr.on small{color:var(--on-brass)}
  .attr:disabled:not(.on){opacity:.35}
  .skills{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:6px;padding:0 12px 12px}
  .skill{display:grid;grid-template-columns:1fr auto;gap:4px 8px;align-items:center;border:1px solid var(--line);background:var(--panel-2);
    border-radius:8px;padding:8px 10px;text-align:left}
  .skill span{font-weight:700}
  .skill small{grid-column:1/-1;color:var(--muted);font-size:.75rem}
  .skill.on{border-color:var(--brass);background:var(--brass-soft)}
  .skill:disabled{opacity:.4}
  .spell-row{display:flex;gap:10px;align-items:baseline;flex-wrap:wrap;padding:6px 14px;border-top:1px solid var(--line)}
  .rank{min-width:7rem;font:600 .78rem var(--mono);color:var(--muted);background:none;border:0;padding:4px 0;text-align:left}
  .rank:hover{color:var(--text)}
  .gained li.bought{opacity:.55;text-decoration:line-through}
  .gained li small{margin-left:4px}
  .chips-row{display:flex;gap:6px;flex-wrap:wrap;align-items:center;flex:1;min-width:0}
  .spell-chip{display:inline-flex;gap:2px;align-items:center;border:1px solid var(--line);border-radius:999px;padding:2px 4px 2px 10px;background:var(--panel-2);font-size:.85rem}
  .x{padding:0 6px;color:var(--muted)}
  .sig{border:1px solid var(--line);background:var(--panel-2);border-radius:999px;padding:4px 12px;font-size:.85rem}
  .sig.on{background:var(--brass);border-color:var(--brass);color:var(--on-brass)}
  @media(max-width:520px){.boosts{grid-template-columns:repeat(3,minmax(0,1fr))}}
  .int-bonus{display:grid;gap:6px;padding:0 14px 14px}
  .int-bonus .chips{display:flex;flex-wrap:wrap;gap:5px}
  .int-bonus .chip{border:1px solid var(--line);background:var(--panel-2);border-radius:999px;padding:3px 10px;font-size:.8rem;color:var(--text)}
  .int-bonus .chip.on{background:var(--brass);border-color:var(--brass);color:var(--on-brass)}
  .int-bonus .chip:disabled:not(.on){opacity:.45}
</style>
