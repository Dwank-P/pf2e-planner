<script>
  import {tr} from '../../../../lib/i18n/index.js';
  import {page} from '$app/state';
  import AppBar from '../../../../lib/ui/AppBar.svelte';
  import PairingCode from '../../../../lib/ui/PairingCode.svelte';
  import PeoplePicker from '../../../../lib/ui/PeoplePicker.svelte';
  import {api,campaignPath,timeAgo} from '../../../../lib/ui/api.js';
  import {loadCampaign} from '../../../../lib/ui/session.js';

  const campaignId=$derived(page.params.campaignId);
  const base=$derived('/api/v1/campaigns/'+encodeURIComponent(campaignId));
  let ctx=$state(null);
  let members=$state([]);
  let error=$state('');
  let invite=$state(null);
  let copied=$state('');
  let confirmDisconnect=$state(false);
  let busy=$state(false);
  let notice=$state('');
  // Members' personal characters may use this world's compendiums (off by default).
  let sharing=$state(null);
  async function setSharing(enabled){
    busy=true;
    try{sharing={...sharing,...await api(base+'/compendium-sharing',{method:'PUT',body:{enabled}})};}
    catch(e){error=e.message;}finally{busy=false;}
  }

  $effect(()=>{
    const id=campaignId;
    (async()=>{
      try{
        const loaded=await loadCampaign(id);
        if(!loaded.isGm){location.replace(campaignPath(id));return;}
        ctx=loaded;
        members=(await api(base+'/members')).members;
        sharing=await api(base+'/compendium-sharing');
        if(loaded.sync)packList=(await api(base+'/compendium-packs')).packs;
      }catch(e){error=e.message;}
    })();
  });
  const sync=$derived(ctx?.sync);
  // Packs offered on the website: the GM can hide some that Leveler offers (e.g. animal companion ancestries).
  let packList=$state(null);
  let hidden=$state(null);
  const shownHidden=$derived(hidden??new Set((packList??[]).filter(p=>p.hidden).map(p=>p.pack)));
  const packGroups=$derived.by(()=>{
    const groups=new Map();
    for(const p of packList??[]){
      const name=p.pack.split('.')[0];
      if(!groups.has(name))groups.set(name,[]);
      groups.get(name).push(p);
    }
    return [...groups.entries()];
  });
  const packsChanged=$derived(!!hidden&&!!packList&&(hidden.size!==packList.filter(p=>p.hidden).length||packList.some(p=>p.hidden!==hidden.has(p.pack))));
  const TYPE_NAMES={ancestry:'ancestries',heritage:'heritages',background:'backgrounds',class:'classes',feat:'feats',spell:'spells',
    action:'actions',deity:'deities',equipment:'equipment',weapon:'weapons',armor:'armor',shield:'shields',consumable:'consumables'};
  const contents=p=>Object.entries(p.types).sort((a,b)=>b[1]-a[1]).slice(0,4).map(([t,n])=>n+' '+(TYPE_NAMES[t]??t)).join(', ')
    +(Object.keys(p.types).length>4?'…':'');
  function togglePack(pack,on){const next=new Set(shownHidden);on?next.delete(pack):next.add(pack);hidden=next;}
  function toggleGroup(list,on){const next=new Set(shownHidden);for(const p of list)on?next.delete(p.pack):next.add(p.pack);hidden=next;}
  const savePacks=()=>run(async()=>{
    packList=(await api(base+'/compendium-packs',{method:'PUT',body:{hidden:[...shownHidden]}})).packs;
    hidden=null;notice=tr('Compendium choices saved. Players see the change when they next open a character.');
  });
  const rules=$derived(Object.entries(sync?.variants??{}).filter(([,v])=>typeof v==='boolean'));
  const variantNames={freeArchetype:'Free Archetype',dualClass:'Dual Class',ancestralParagon:'Ancestral Paragon',
    gradualAbilityBoosts:'Gradual Ability Boosts',automaticBonusProgression:'Automatic Bonus Progression',
    proficiencyWithoutLevel:'Proficiency Without Level',mythic:'Mythic',stamina:'Stamina',
    ignoreArchetypeDedicationLock:'Ignore dedication lock',enforcePrerequisites:'Enforce prerequisites'};
  const inviteText=$derived(invite?tr('You\'re invited to plan characters for {0} in PF2e Planner.\n\nOpen this link to create your account:\n{1}\n\nIt works once and expires in 24 hours.',ctx?.campaign.title,invite.joinUrl):'');

  async function run(work){busy=true;error='';notice='';try{await work();}catch(e){error=e.message;}finally{busy=false;}}
  const invitePlayer=()=>run(async()=>{invite=await api(base+'/members',{method:'POST',body:{}});members=(await api(base+'/members')).members;});
  const findPeople=async q=>(await api('/api/v1/users?q='+encodeURIComponent(q))).users;
  const addExisting=user=>run(async()=>{
    const result=await api(base+'/members',{method:'POST',body:{existingUserId:user.id}});
    notice=tr(result.alreadyMember?'{0} is already in this campaign.':'{0} added. They sign in with their existing account.',user.displayName);
    members=(await api(base+'/members')).members;
  });
  let confirming=$state(null);
  const removeMember=m=>run(async()=>{
    const result=await api(base+'/members/'+encodeURIComponent(m.id),{method:'DELETE'});
    notice=result.deletedInvitation?tr('Invitation cancelled.'):tr('{0} removed from {1}.',m.displayName,ctx.campaign.title);
    confirming=null;members=(await api(base+'/members')).members;
  });
  // Reusable invite links (default 24 hours; days, months, years or never).
  let links=$state([]);
  let linkUnit=$state('hours');
  let linkAmount=$state(24);
  $effect(()=>{if(ctx)api(base+'/invite-links').then(r=>links=r.links).catch(()=>{});});
  const createLink=event=>{event.preventDefault();run(async()=>{
    const r=await api(base+'/invite-links',{method:'POST',body:{duration:{unit:linkUnit,amount:Number(linkAmount)}}});
    links=[r.link,...links];await copy(r.link.url,r.link.id);notice=tr('Invite link created and copied. Share it with your group.');
  });};
  const revokeLink=l=>run(async()=>{
    await api(base+'/invite-links/'+encodeURIComponent(l.id),{method:'DELETE'});
    links=links.filter(x=>x.id!==l.id);notice=tr('Invite link turned off. People who already joined keep access.');
  });
  // Foundry addresses (domains) this world is opened from; pairing from a new one adds it.
  let origins=$state([]);
  const originsUrl=$derived(sync?.integrationId?'/api/v1/integrations/'+encodeURIComponent(sync.integrationId)+'/origins':null);
  $effect(()=>{const url=originsUrl;if(url)api(url).then(r=>origins=r.origins).catch(()=>origins=[]);});
  const removeOrigin=origin=>run(async()=>{
    origins=(await api(originsUrl,{method:'DELETE',body:{origin}})).origins;
    notice=tr('{0} removed. GM browsers there need a new pairing code.',origin);
  });
  const disconnect=()=>run(async()=>{
    await api('/api/v1/integrations/'+encodeURIComponent(sync.integrationId)+'/revoke',{method:'POST',body:{}});
    location.reload();
  });
  async function copy(text,label){
    try{await navigator.clipboard.writeText(text);copied=label;}catch{copied='';error=tr('Copy failed. Select the text and copy it yourself.');}
  }
</script>
<svelte:head><title>{tr("Settings · {0}", ctx?.campaign.title??tr('Campaign'))}</title></svelte:head>
{#if ctx}<AppBar me={ctx.me} campaigns={ctx.campaigns} campaign={ctx.campaign} sync={ctx.sync} crumb={tr("Settings")}/>{/if}
<main class="page settings">
  <a class="back" href={campaignPath(campaignId)}>{tr("← Party")}</a>
  <h1>{tr("Campaign settings")}</h1>
  {#if error}<p class="notice bad" role="alert">{error}</p>{/if}
  {#if notice}<p class="notice good" role="status">{notice}</p>{/if}
  {#if ctx}
    <section class="panel block">
      <div class="block-head"><h2>{tr("Foundry world")}</h2>
        <span class="state"><span class="status-dot {sync?.synced?'good':'bad'}"></span>{sync?.synced?tr('Connected'):tr('Not synced')}</span></div>
      {#if sync?.synced}
        <dl class="facts">
          <div><dt>{tr("Last sync")}</dt><dd>{timeAgo(sync.updatedAt)}</dd></div>
          <div><dt>{tr("PF2e system")}</dt><dd class="num">{sync.ruleset?.systemVersion??'—'}</dd></div>
          <div><dt>{tr("PF2e Leveler")}</dt><dd class="num">{sync.ruleset?.levelerVersion??'—'}</dd></div>
          <div><dt>{tr("Items")}</dt><dd class="num">{sync.totals?.savedItems?.toLocaleString()??'—'}</dd></div>
        </dl>
        <div class="sub"><span class="eyebrow">{tr("Variant rules")}</span>
          <div class="chips">
            {#each rules.filter(([,on])=>on) as [key]}<span class="chip">{tr(variantNames[key]??key)}</span>{:else}<span class="muted">{tr("None enabled")}</span>{/each}
          </div>
          {#if rules.some(([,on])=>!on)}
            <p class="muted small">{tr("Off: {0}", rules.filter(([,on])=>!on).map(([key])=>tr(variantNames[key]??key)).join(', '))}</p>
          {/if}
        </div>
        {#if origins.length}
          <div class="sub"><span class="eyebrow">{tr("Foundry addresses")}</span>
            <ul class="origins">{#each origins as o (o.origin)}
              <li><span class="num">{o.origin}</span><small class="muted">{tr(o.browsers===1?'{0} GM browser':'{0} GM browsers', o.browsers)}</small>
                {#if origins.length>1}<button class="link danger" disabled={busy} onclick={()=>removeOrigin(o.origin)}>{tr("Remove")}</button>{/if}</li>
            {/each}</ul>
            <p class="muted small">{tr("Opening the world from another address? Generate a pairing code below and enter it in the Bridge there.")}</p>
          </div>
        {/if}
        <details class="sub"><summary>{tr("Synced compendiums ({0})", sync.packs?.length??0)}</summary>
          <ul class="packs">{#each sync.packs??[] as pack}<li class="num">{pack}</li>{/each}</ul>
        </details>
        <p class="muted">{tr("Sync runs when a GM logs in to Foundry. Use Settings → PF2e Planner Bridge → Sync Now after changing compendiums or variant rules.")}</p>
      {:else}
        <p class="muted">{tr("Pair a world from Foundry, then run Sync Now. Players can build characters once the first sync arrives.")}</p>
      {/if}
      <div class="sub"><span class="eyebrow">{tr("Connect another GM browser or address to this world")}</span>
        <p class="muted small">{tr("For a different Foundry world, use")} <a href="/worlds/new">{tr("+ Add a world")}</a> {tr("in the campaign menu instead.")}</p>
        <PairingCode/></div>
      {#if sync?.integrationId}
        <div class="danger-zone">
          {#if confirmDisconnect}
            <p>{tr("Disconnect this world? Its GM browsers stop syncing immediately. Characters and the last synced compendiums stay.")}</p>
            <div class="row"><button class="btn ghost" onclick={()=>confirmDisconnect=false}>{tr("Keep connected")}</button>
              <button class="btn danger" disabled={busy} onclick={disconnect}>{tr("Disconnect world")}</button></div>
          {:else}
            <button class="btn ghost danger" onclick={()=>confirmDisconnect=true}>{tr("Disconnect world…")}</button>
          {/if}
        </div>
      {/if}
    </section>

    <section class="panel block">
      <div class="block-head"><h2>{tr("Invite links")}</h2></div>
      <p class="muted">{tr("One link for the whole group: anyone with it can create an account, or add the one they have, and join as a player.")}</p>
      <form class="link-form" onsubmit={createLink}>
        <label class="field" for="link-length">{tr("Works for")}
          <span class="row">
            {#if linkUnit!=='never'}<input id="link-length" type="number" min="1" max="8760" bind:value={linkAmount} aria-label={tr("How long")}/>{/if}
            <select bind:value={linkUnit} aria-label={tr("Unit")} onchange={()=>linkAmount=linkUnit==='hours'?24:1}>
              <option value="hours">{tr("hours")}</option><option value="days">{tr("days")}</option><option value="months">{tr("months")}</option>
              <option value="years">{tr("years")}</option><option value="never">{tr("Never expires")}</option></select>
            <button class="btn primary" disabled={busy}>{tr("Create link")}</button></span></label>
        {#if linkUnit==='never'}<p class="notice warn small">{tr("A link that never expires lets anyone who ever sees it join this campaign. Turn it off once your group has joined.")}</p>{/if}
      </form>
      {#if links.length}
        <ul class="links">
          {#each links as l (l.id)}
            <li><code>{l.url}</code>
              <small class="muted">{tr("{0} · {1} joined", l.expiresAt?tr('Until {0}',new Date(l.expiresAt*1000).toLocaleString()):tr('Never expires'), l.uses)}</small>
              <span class="row"><button class="btn small" onclick={()=>copy(l.url,l.id)}>{copied===l.id?tr('Copied'):tr('Copy link')}</button>
                <button class="btn small ghost danger" disabled={busy} onclick={()=>revokeLink(l)}>{tr("Turn off")}</button></span></li>
          {/each}
        </ul>
      {/if}
    </section>

    <section class="panel block">
      <div class="block-head"><h2>{tr("Players")}</h2><button class="btn primary" disabled={busy} onclick={invitePlayer}>{tr("Invite a player")}</button></div>
      {#if invite}
        <div class="invite">
          <p class="muted">{tr("Send this to the player privately. It is shown once.")}</p>
          <textarea readonly rows="7" onfocus={e=>e.currentTarget.select()}>{inviteText}</textarea>
          <div class="row"><button class="btn" onclick={()=>copy(inviteText,tr('Invitation'))}>{copied==='Invitation'?tr('Copied'):tr('Copy invitation')}</button>
            <button class="btn ghost" onclick={()=>copy(invite.joinUrl,tr('Link'))}>{copied==='Link'?tr('Copied'):tr('Copy link only')}</button></div>
        </div>
      {/if}
      <ul class="members">
        {#each members as m (m.id)}
          <li><span class="avatar">{(m.displayName??'?').slice(0,1)}</span>
            <span class="who"><b>{m.status==='pending'?tr('Invited player'):m.displayName}</b>
              <small>{m.status==='pending'?tr('Invitation not used yet'):'@'+m.username}</small></span>
            <span class="chip plain">{m.role==='gm'?'GM':tr('Player')}</span>
            {#if m.id!==ctx.me.id}
              {#if confirming?.id===m.id}
                <span class="confirm">
                  <span class="small">{m.status==='pending'?tr('Cancel this invitation?'):tr('Remove from this campaign? Their account and characters stay.')}</span>
                  <button class="btn small" onclick={()=>confirming=null}>{tr("Keep")}</button>
                  <button class="btn small danger" disabled={busy} onclick={()=>removeMember(m)}>
                    {m.status==='pending'?tr('Cancel invite'):tr('Remove')}</button>
                </span>
              {:else}
                <button class="btn small ghost" onclick={()=>confirming={id:m.id}}>{m.status==='pending'?tr('Cancel invite'):tr('Remove')}</button>
              {/if}
            {/if}</li>
        {/each}
      </ul>
      <div class="add field"><label for="existing">{tr("Add someone who already has an account")}</label>
        <PeoplePicker id="existing" search={findPeople} onPick={addExisting} exclude={members.map(m=>m.id)}/></div>
      <p class="muted small">{tr("Coming next: players sign in straight from Foundry, so invitations won't be needed.")}</p>
    </section>

    <section class="panel block">
      <div class="block-head"><h2>{tr("Compendiums")}</h2></div>
      <p class="muted">{tr("Browse everything this campaign synced.")}</p>
      {#if sharing}
        <label class="share-toggle"><input type="checkbox" checked={sharing.enabled} disabled={busy} onchange={e=>setSharing(e.currentTarget.checked)}/>
          <span><b>{tr("Share these compendiums with every account on this server")}</b>
            <small class="muted">{tr("This campaign’s players can always use its systems and modules in their personal characters (My characters). Tick this to let everyone else here use them too. Nothing is copied; turning it off keeps what other players’ characters already picked.{0}", sharing.personalCharacters?' '+tr(sharing.personalCharacters===1?'{0} personal character uses this world.':'{0} personal characters use this world.',sharing.personalCharacters):'')}</small></span></label>
      {/if}
      {#if packList?.length}
        <details class="sub packs-pick" open={packsChanged||packList.some(p=>p.hidden)}>
          <summary>{tr("Available on the website ({0} of {1} packs)", packList.length-shownHidden.size, packList.length)}</summary>
          <p class="muted small">{tr("Untick packs players shouldn’t pick from here, even though PF2e Leveler offers them (animal companion ancestries, NPC options…). Hidden packs stay synced, so ticking them again needs no Sync Now. Characters that already picked something from a hidden pack keep it.")}</p>
          {#each packGroups as [name,list] (name)}
            {@const on=list.filter(p=>!shownHidden.has(p.pack)).length}
            <fieldset class="pack-group">
              <legend><label><input type="checkbox" checked={on===list.length} indeterminate={on>0&&on<list.length}
                onchange={e=>toggleGroup(list,e.currentTarget.checked)}/> <b>{name}</b></label>
                <small class="muted">{tr("{0} of {1}", on, list.length)}</small></legend>
              {#each list as p (p.pack)}
                <label class="pack" class:off={shownHidden.has(p.pack)}><input type="checkbox" checked={!shownHidden.has(p.pack)}
                  onchange={e=>togglePack(p.pack,e.currentTarget.checked)}/>
                  <span class="num">{p.pack.slice(name.length+1)}</span><small class="muted">{contents(p)}</small></label>
              {/each}
            </fieldset>
          {/each}
          <div class="row start"><button class="btn" disabled={busy||!packsChanged} onclick={savePacks}>{tr("Save compendium choices")}</button>
            {#if packsChanged}<button class="link" onclick={()=>hidden=null}>{tr("Undo changes")}</button>{/if}</div>
        </details>
      {/if}
      <div class="row start"><a class="btn" href={campaignPath(campaignId,'/feats')}>{tr("Feat browser")}</a>
        <a class="btn ghost" href={campaignPath(campaignId,'/ruleset')}>{tr("Detailed sync report")}</a></div>
    </section>
  {/if}
</main>
<style>
  .settings{max-width:860px;display:grid;gap:18px}
  .back{color:var(--muted);text-decoration:none;font-weight:700}
  h1{font-size:2rem;font-weight:800}
  .block{padding:20px;display:grid;gap:16px}
  .block-head{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
  h2{font-size:1.2rem;font-weight:800}
  .state{display:flex;gap:6px;align-items:center;color:var(--muted);font-weight:700}
  .facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:0}
  .facts div{background:var(--panel-2);border-radius:8px;padding:10px 12px}
  dt{color:var(--muted);font-size:.8rem}dd{margin:2px 0 0;font-weight:700}
  .sub{display:grid;gap:8px}
  .pack-group{border:1px solid var(--line);border-radius:var(--radius);padding:8px 12px 10px;margin:0;display:grid;gap:4px}
  .pack-group legend{display:flex;gap:10px;align-items:center;padding:0 4px}
  .pack-group legend label{display:flex;gap:6px;align-items:center}
  .pack{display:grid;grid-template-columns:auto minmax(0,1fr);gap:0 8px;align-items:baseline;font-size:.88rem;padding:2px 0}
  .pack small{grid-column:2}
  .pack.off span{color:var(--muted);text-decoration:line-through}
  summary{cursor:pointer;font-weight:700}
  .link-form .row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
  .link-form input[type=number]{width:6em}
  .links{list-style:none;margin:0;padding:0;display:grid;gap:10px}
  .links li{display:grid;gap:4px;border-top:1px solid var(--line);padding-top:10px}
  .links code{overflow-wrap:anywhere;font-size:.85rem}
  .links .row{display:flex;gap:8px}
  .origins{list-style:none;margin:6px 0 0;padding:0;display:grid;gap:4px}
  .origins li{display:flex;gap:10px;align-items:baseline;flex-wrap:wrap;font-size:.9rem}
  .origins .num{overflow-wrap:anywhere}
  .packs{columns:2;margin:6px 0 0;padding-left:1.1rem;font-size:.85rem;color:var(--text-2)}
  .share-toggle{display:flex;gap:10px;align-items:flex-start}
  .share-toggle span{display:grid;gap:2px}
  .danger-zone{border-top:1px solid var(--line);padding-top:14px;display:grid;gap:10px}
  .row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end}
  .row.start{justify-content:flex-start}
  .row input{flex:1;min-width:0}
  .invite{display:grid;gap:8px}
  textarea{width:100%;resize:vertical;font:500 .85rem var(--mono)}
  .members{list-style:none;margin:0;padding:0;display:grid;gap:6px}
  .members li{display:flex;flex-wrap:wrap;align-items:center;gap:12px;padding:8px 10px;border-radius:8px;background:var(--panel-2)}
  .confirm{display:flex;gap:6px;align-items:center;flex-wrap:wrap;flex-basis:100%;justify-content:flex-end}
  .avatar{width:30px;height:30px;border-radius:50%;display:grid;place-items:center;background:var(--panel-3);font:700 12px var(--display)}
  .who{display:grid;flex:1;min-width:0}
  .who small,.small{color:var(--muted);font-size:.85rem}
  .add .field{font-weight:700}
</style>
