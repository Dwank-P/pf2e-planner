<script>
  import {api,campaignPath} from './api.js';
  import {exportUrlFromLink} from './download.js';
  /**
   * Import a character from another planner (or this one): its public link, or an exported
   * file. importUrl: this planner's import endpoint; personal: open results in My characters.
   */
  // onImported(character): the page adds it to its list straight away.
  let {importUrl,personal=false,onCancel,onImported=()=>{}}=$props();
  let link=$state('');
  let file=$state(null);
  let busy=$state(false);
  let error=$state('');
  let result=$state(null);
  async function run(event){
    event.preventDefault();busy=true;error='';result=null;
    try{
      let data;
      if(file){
        try{data=JSON.parse(await file.text());}catch{throw Error('That file isn’t a planner export or a Leveler plan.');}
      }else{
        const url=exportUrlFromLink(link);
        if(!url)throw Error('Paste a public character link (it looks like https://planner.example/p/…).');
        let response;
        try{response=await fetch(url,{credentials:'omit',cache:'no-store'});}
        catch{throw Error('That planner couldn’t be reached from your browser. Download the character there (Export) and import the file instead.');}
        if(response.status===404)throw Error('That link doesn’t work any more — ask for a new one.');
        if(!response.ok)throw Error('That planner answered HTTP '+response.status+'.');
        data=await response.json();
      }
      result=await api(importUrl,{method:'POST',body:{export:data,fileName:file?.name??''}});
      onImported(result.character);
    }catch(e){error=e.message;}finally{busy=false;}
  }
  const href=$derived(result?personal?'/characters/'+encodeURIComponent(result.character.id)
    :campaignPath(result.character.campaignId,'/characters/'+result.character.id):'');
</script>
{#if result}
  <section class="card report" aria-live="polite">
    <b>Imported {result.character.name}</b>
    <span class="muted">{result.report.matched+result.report.renamed} picks matched{result.report.renamed?` (${result.report.renamed} by name)`:''}.</span>
    {#if result.report.missing.length}<p class="notice">Not in {personal?'your sources':'this world’s compendiums'}, so left out: {result.report.missing.join(', ')}.</p>{/if}
    {#if result.report.noClass}<p class="notice">The plan is for a {result.report.noClass}, which isn’t in {personal?'your sources':'this world’s compendiums'}: choose a class on level 1.</p>{/if}
    {#if result.report.variantDifferences.length}<p class="notice">Rules here apply: {result.report.variantDifferences.join('; ')}.</p>{/if}
    <span class="row"><button class="btn ghost" onclick={()=>{result=null;link='';file=null;}}>Import another</button>
      <a class="btn primary" href={href}>Open it</a></span>
  </section>
{:else}
  <form class="card import" onsubmit={run}>
    <label class="field" for="import-link">Public link from another planner
      <small>On the other planner: Share → Create a public link, and copy it.</small>
      <input id="import-link" type="url" placeholder="https://planner.example/p/…" bind:value={link} disabled={!!file}/></label>
    <label class="field" for="import-file">Or a file
      <small>A planner export (Files → Export for another planner), or a PF2e Leveler plan (Leveler's “Export plan”).</small>
      <input id="import-file" type="file" accept=".json,application/json" onchange={e=>file=e.currentTarget.files?.[0]??null}/></label>
    {#if error}<p class="notice bad" role="alert">{error}</p>{/if}
    <span class="row"><button type="button" class="btn ghost" onclick={onCancel}>Cancel</button>
      <button class="btn primary" disabled={busy||!(link.trim()||file)}>{busy?'Importing…':'Import'}</button></span>
  </form>
{/if}
<style>
  /* Grid cards can be narrow: keep every field (the file picker especially) inside the card. */
  .card{display:grid;gap:10px;padding:14px;border:1px solid var(--line);border-radius:var(--radius);background:var(--panel);
    min-width:0;box-sizing:border-box;overflow:hidden}
  .card :global(.field){min-width:0}
  .card input{width:100%;max-width:100%;min-width:0;box-sizing:border-box}
  .card input[type=file]{font-size:.8rem;padding:6px}
  .row{display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap}
  small{color:var(--muted);font-weight:400}
  p{margin:0}
</style>
