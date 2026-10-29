<script>
  /**
   * Type a name or username, pick a person from the suggestions.
   * search(q) → Promise<[{id, displayName, username}]>; exclude: ids not to suggest.
   */
  let {search,onPick,exclude=[],placeholder='Name or username…',label='Find a person',id='people'}=$props();
  let query=$state('');
  let found=$state([]);
  let error=$state('');
  let active=$state(-1);
  let timer;
  function lookup(){
    clearTimeout(timer);
    const q=query.trim();
    error='';
    if(q.length<2){found=[];return;}
    timer=setTimeout(async()=>{
      try{found=(await search(q)).filter(p=>!exclude.includes(p.id)).slice(0,8);active=found.length?0:-1;}
      catch(e){error=e.message;found=[];}
    },200);
  }
  function pick(person){onPick(person);found=[];query='';active=-1;}
  function key(event){
    if(!found.length)return;
    if(event.key==='ArrowDown'){event.preventDefault();active=(active+1)%found.length;}
    else if(event.key==='ArrowUp'){event.preventDefault();active=(active-1+found.length)%found.length;}
    else if(event.key==='Enter'&&active>=0){event.preventDefault();pick(found[active]);}
    else if(event.key==='Escape')found=[];
  }
</script>
<div class="picker">
  <input {id} type="search" {placeholder} aria-label={label} autocomplete="off" bind:value={query} oninput={lookup} onkeydown={key}
    role="combobox" aria-expanded={found.length>0} aria-controls={id+'-list'}/>
  {#if found.length}
    <ul class="found" id={id+'-list'} role="listbox">
      {#each found as p,i (p.id)}
        <li role="option" aria-selected={i===active}><button type="button" class:on={i===active} onclick={()=>pick(p)}>
          <b>{p.displayName}</b> <small>{p.username?'@'+p.username:'(invited)'}</small></button></li>
      {/each}
    </ul>
  {/if}
  {#if error}<p class="notice bad">{error}</p>{/if}
</div>
<style>
  .picker{position:relative}
  .picker input{width:100%}
  .found{position:absolute;left:0;right:0;top:calc(100% + 4px);list-style:none;margin:0;padding:4px;background:var(--panel);
    border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow);z-index:5}
  .found button{width:100%;text-align:left;background:none;border:0;padding:6px 8px;border-radius:6px;color:var(--text)}
  .found button:hover,.found button.on{background:var(--panel-2)}
  .found small{color:var(--muted)}
</style>
