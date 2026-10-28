<script>
  import OptionGrid from './OptionGrid.svelte';
  import BoostsStep from './BoostsStep.svelte';
  import SkillsStep from './SkillsStep.svelte';
  import FeatsStep from './FeatsStep.svelte';
  import LanguagesStep from './LanguagesStep.svelte';
  import SpellsStep from './SpellsStep.svelte';
  import ReviewStep from './ReviewStep.svelte';
  import GrantsPanel from './GrantsPanel.svelte';
  import FeatChoices from './FeatChoices.svelte';
  import {choiceContext} from '../builder/choice-sets.js';
  import {creationGrantRequirements,toggleGrantSelection,takenFormulas} from '../builder/grants.js';
  import * as C from '../builder/creation.js';
  import {taggedItems,heritagesFor,equipmentOptions} from './options.js';
  import {titleCase,ATTRIBUTES,SKILLS} from '../builder/rules.js';
  let {step,steps,creation,plan,catalog,variants,update,info,go,onPlan}=$props();

  // Background filters: a boost it can give (from its two listed attributes), a trained skill, a granted feat.
  let bgBoosts=$state([]);
  let bgSkill=$state('');
  let bgFeat=$state('');
  const lower=s=>String(s??'').toLowerCase();
  function backgroundTest(item){
    const m=item.metadata??{};
    if(bgBoosts.length){
      const listed=(m.boostChoices??[]).filter(g=>Array.isArray(g)&&g.length<6).flat();
      if(!bgBoosts.some(a=>listed.includes(a)))return false;
    }
    if(bgSkill&&![...(m.trainedSkills??[]),...(m.loreSkills??[]).map(l=>lower(l)+' lore')].map(lower).some(s=>s===bgSkill||s.includes(bgSkill)))return false;
    if(bgFeat.trim()&&!(m.grantedFeats??[]).some(f=>lower(f).includes(lower(bgFeat.trim()))))return false;
    return true;
  }

  const id=$derived(step.stepId??step.id);
  // Where an origin's own picks are stored (see originChoices).
  const originKey=$derived(['ancestry','heritage','background'].includes(id)?id
    :id==='subclass'?(step.target==='dualClass'?'dualSubclass':'subclass'):null);
  const target=$derived(step.target??'class');
  const bucket=$derived(creation.classSelections?.[target]??{});
  const subclass=$derived(target==='dualClass'?creation.dualSubclass:creation.subclass);
  const classDetail=item=>{
    const r=item.metadata?.rules??{};
    const keys=item.metadata?.levelerProgression?.keyAbility??r.keyAbility?.value??[];
    return [r.hp?'HP '+r.hp:'',keys.length?keys.map(k=>k.toUpperCase()).join(' or '):''].filter(Boolean).join(' · ');
  };
  const ancestryDetail=item=>{
    const r=item.metadata?.rules??{};
    return [r.hp?'HP '+r.hp:'',r.speed?r.speed+' ft':'',titleCase(r.size??'')].filter(Boolean).join(' · ');
  };
  const deityDetail=item=>{
    const r=item.metadata?.rules??{};
    const font=(r.font??[]).map(f=>/harm/.test(f)?'harm':/heal/.test(f)?'heal':f);
    return [font.length?'Font: '+font.join('/'):'',r.skill?titleCase([].concat(r.skill)[0]):''].filter(Boolean).join(' · ');
  };
  // Item-choice steps: options, current picks and how to apply a pick.
  const choice=$derived.by(()=>{
    switch(id){
      case 'ancestry':return {items:catalog.ofType('ancestry'),picked:creation.ancestry,detail:ancestryDetail,
        set:item=>C.setAncestry(creation,item),hint:'Your ancestry sets your Hit Points, size, speed and starting languages.'};
      case 'heritage':return {items:heritagesFor(catalog,creation),picked:creation.heritage,
        set:item=>C.setHeritage(creation,item),hint:creation.ancestry?`Heritages for ${creation.ancestry.name}, plus versatile heritages anyone can take.`:'Choose an ancestry first.'};
      case 'background':return {items:catalog.ofType('background'),picked:creation.background,
        detail:item=>(item.metadata?.trainedSkills??[]).map(titleCase).join(', '),
        set:item=>C.setBackground(creation,item),hint:'Your background adds two attribute boosts, a trained skill, a Lore skill and a skill feat.'};
      case 'class':return {items:catalog.ofType('class'),picked:creation.class,detail:classDetail,
        set:item=>C.setClass(creation,item),hint:'Your class decides your key attribute, proficiencies and how you level up.'};
      case 'dualClass':return {items:catalog.ofType('class').filter(c=>c.uuid!==creation.class?.uuid),picked:creation.dualClass,
        detail:classDetail,set:item=>C.setDualClass(creation,item),hint:'Dual Class is on in this campaign: choose a second class.'};
      case 'subclass':return {items:taggedItems(catalog,[step.tag]),picked:subclass,
        set:item=>C.setSubclass(creation,item,target),hint:'Your specialization shapes your class features from level 1.'};
      case 'deity':return {items:catalog.ofType('deity'),picked:bucket.deity,detail:deityDetail,
        set:item=>C.setDeity(creation,item,target),hint:'Your deity sets your divine font options, favoured skill and sanctification.'};
      default:{
        const def=step.def;
        if(!def?.source)return null;
        const items=def.source.type==='deity'?catalog.ofType('deity')
          :taggedItems(catalog,def.source.tags??[],def.source.type??null);
        if(def.pick>1)return {items,multi:def.pick,picked:bucket[def.key]??[],
          set:item=>C.toggleHandlerItem(creation,def.key,item,def.pick,target),hint:`Choose ${def.pick}.`};
        return {items,picked:bucket[def.key],set:item=>C.setHandlerItem(creation,def.key,item,target)};
      }
    }
  });
  const selected=$derived(choice?(choice.multi?choice.picked.map(p=>p.uuid):choice.picked?[choice.picked.uuid]:[]):[]);
  const fontOptions=$derived((bucket.deity?.font??[]).map(f=>/harm/.test(f)?'harmful':/heal/.test(f)?'healing':f));
  const sanctOptions=$derived(bucket.deity?.sanctification?.what??[]);
  const elements=$derived(taggedItems(catalog,[step.tag??'kineticist-kinetic-gate']).filter(i=>i.uuid!==subclass?.uuid));
  const element=entry=>String(entry?.slug??'').replace(/-gate$/,'');
  const impulses=$derived.by(()=>{
    if(id!=='kineticGate')return [];
    const wanted=[element(subclass),bucket.kineticGateMode==='dual-gate'?element(bucket.secondElement):null].filter(Boolean);
    return catalog.ofType('feat').filter(f=>(f.traits??[]).includes('impulse')&&(f.level??1)<=1&&
      wanted.some(e=>(f.traits??[]).includes(e)));
  });
  function pick(item){
    if(choice.multi){update(()=>choice.set(item));return;}
    const same=choice.picked?.uuid===item.uuid;
    update(()=>same?choice.set(null):choice.set(item));
    if(!same)go('next');
  }
</script>
{#snippet backgroundFilters()}
  <div class="bg-boosts" role="group" aria-label="Attribute boost">
    {#each ATTRIBUTES as a}<button class:on={bgBoosts.includes(a)} aria-pressed={bgBoosts.includes(a)}
      onclick={()=>bgBoosts=bgBoosts.includes(a)?bgBoosts.filter(x=>x!==a):[...bgBoosts,a]}>{a.toUpperCase()}</button>{/each}
  </div>
  <select aria-label="Trained skill" bind:value={bgSkill}>
    <option value="">Any trained skill</option>
    {#each SKILLS as s}<option value={s}>{titleCase(s)}</option>{/each}
  </select>
  <input type="search" aria-label="Granted feat" placeholder="Granted feat…" bind:value={bgFeat}/>
  {#if bgBoosts.length||bgSkill||bgFeat}<button class="link" onclick={()=>{bgBoosts=[];bgSkill='';bgFeat='';}}>Clear filters</button>{/if}
{/snippet}
<div class="step">
  {#if choice}
    {#if choice.hint}<p class="muted">{choice.hint}</p>{/if}
    <OptionGrid id={step.id} items={choice.items} {selected} max={choice.multi??1}
      onToggle={pick} onInfo={item=>info(item.uuid)} detail={choice.detail??(()=> '')}
      test={id==='background'?backgroundTest:null} filters={id==='background'?backgroundFilters:undefined}
      placeholder={'Search '+choice.items.length+' options'}
      empty={'No options for this step are in the synced compendiums. Ask the GM to include the right packs in Leveler’s Compendium Manager, and to check none are hidden in campaign settings.'}/>
    {#if originKey&&choice.picked?.uuid}
      <!-- Choices the picked origin or specialization asks for, and those of what it grants. -->
      <FeatChoices entry={{uuid:choice.picked.uuid,choices:C.originChoices(creation,originKey,choice.picked.uuid)}} {catalog}
        context={choiceContext(creation,plan,catalog.get)} {info}
        onChange={choices=>update(c=>C.setOriginChoices(c,originKey,choice.picked.uuid,choices))}/>
    {/if}
  {:else if id==='sanctification'}
    <p class="muted">{bucket.deity?.name} allows {sanctOptions.join(' or ')} sanctification{bucket.deity?.sanctification?.modal==='must'?'':' (or none)'}.</p>
    <div class="choices">
      {#if bucket.deity?.sanctification?.modal!=='must'}
        <button class:on={bucket.sanctification==='none'} onclick={()=>update(c=>C.setSanctification(c,'none',target))}>None</button>
      {/if}
      {#each sanctOptions as value}
        <button class:on={bucket.sanctification===value} onclick={()=>update(c=>C.setSanctification(c,value,target))}>{titleCase(value)}</button>
      {/each}
    </div>
  {:else if id==='divineFont'}
    <p class="muted">{bucket.deity?.name} grants either font. Choose the one you'll prepare.</p>
    <div class="choices">
      {#each fontOptions as value}
        <button class:on={bucket.divineFont===value} onclick={()=>update(c=>C.setDivineFont(c,value,target))}>{value==='healing'?'Heal (healing font)':'Harm (harmful font)'}</button>
      {/each}
    </div>
  {:else if id==='kineticGate'}
    <p class="muted">Channel one element deeply, or open a second gate.</p>
    <div class="choices">
      <button class:on={bucket.kineticGateMode==='single-gate'} onclick={()=>update(c=>C.setKineticGateMode(c,'single-gate',target))}>Single gate</button>
      <button class:on={bucket.kineticGateMode==='dual-gate'} onclick={()=>update(c=>C.setKineticGateMode(c,'dual-gate',target))}>Dual gate</button>
    </div>
    {#if bucket.kineticGateMode==='dual-gate'}
      <h3>Second element</h3>
      <OptionGrid id="second-element" items={elements} selected={bucket.secondElement?[bucket.secondElement.uuid]:[]}
        onToggle={item=>update(c=>C.setHandlerItem(c,'secondElement',bucket.secondElement?.uuid===item.uuid?null:item,target))}
        onInfo={item=>info(item.uuid)}/>
    {/if}
    {#if bucket.kineticGateMode}
      <h3>Two impulses</h3>
      <OptionGrid id="impulses" items={impulses} selected={(bucket.kineticImpulses??[]).map(i=>i.uuid)} max={2}
        onToggle={item=>update(c=>C.toggleHandlerItem(c,'kineticImpulses',item,2,target,
          {element:(item.traits??[]).find(t=>[element(subclass),element(bucket.secondElement)].includes(t))??null}))}
        onInfo={item=>info(item.uuid)} empty="No level-1 impulses for your elements are synced."/>
    {/if}
  {:else if step.def?.kind==='foundryOnly'}
    <p class="notice">Innovation details (base item and modification) are chosen in Leveler’s Character Wizard in Foundry. Pull this build into Foundry and finish there.</p>
  {:else if id==='boosts'}
    <BoostsStep {creation} lookup={catalog.get} {update}/>
  {:else if id==='skills'}
    <SkillsStep {creation} lookup={catalog.get} {update}/>
  {:else if id==='feats'}
    <FeatsStep {creation} {plan} {catalog} {variants} {update} {info}/>
  {:else if id==='grants'}
    <p class="muted">Choices your class and feats grant. Leveler adds them to the character when you apply the wizard in Foundry.</p>
    <div class="grants"><GrantsPanel requirements={creationGrantRequirements(creation,catalog.get)} store={creation} {catalog} level={1}
      maxLevelCap={1} taken={takenFormulas(creation,plan)} {info}
      onToggle={(requirement,item)=>update(c=>toggleGrantSelection(c,requirement,item))}/></div>
  {:else if id==='languages'}
    <LanguagesStep {creation} lookup={catalog.get} {variants} {update}/>
  {:else if id==='spells'}
    <SpellsStep {creation} {plan} {catalog} {update} {info} {target}/>
  {:else if id==='equipment'}
    <p class="muted">Optional: note starting gear. Leveler adds it to the actor when you apply the wizard in Foundry.</p>
    <OptionGrid id="equipment" items={equipmentOptions(catalog)} selected={(creation.equipment??[]).map(e=>e.uuid)} max={60}
      onToggle={item=>update(c=>C.toggleEquipment(c,item))} onInfo={item=>info(item.uuid)} placeholder="Search level 0–1 gear"/>
  {:else if id==='review'}
    <ReviewStep {steps} {creation} {go} {onPlan}/>
  {/if}
</div>
<style>
  .step{display:grid;gap:14px}
  .choices{display:flex;flex-wrap:wrap;gap:8px}
  .bg-boosts{display:flex;gap:4px}
  .bg-boosts button{border:1px solid var(--line);background:var(--panel-2);border-radius:6px;padding:5px 8px;font:600 .78rem var(--mono)}
  .bg-boosts button.on{background:var(--brass);border-color:var(--brass);color:var(--on-brass)}
  .choices button{border:1px solid var(--line);background:var(--panel);border-radius:10px;padding:12px 18px;font-weight:700}
  .choices button.on{border-color:var(--brass);background:var(--brass-soft);color:var(--text)}
  h3{font-size:1rem;margin-top:6px}
  .grants{display:grid;gap:10px}
</style>
