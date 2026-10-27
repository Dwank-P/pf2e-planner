<script>
  /** A character's picture. Editors (onEdit set) click it to change it, or the empty slot to add one. */
  let {src=null,size=56,name='',onEdit=null}=$props();
  let failed=$state(false);
  $effect(()=>{src;failed=false;});
  const initial=$derived(String(name||'?').trim().charAt(0).toUpperCase()||'?');
</script>
{#if onEdit}
  <button type="button" class="portrait edit" class:empty={!src||failed} style:--size={size+'px'} onclick={onEdit}
    title={src?'Change picture':'Add a picture'} aria-label={src?'Change picture':'Add a picture'}>
    {#if src&&!failed}<img {src} alt="" onerror={()=>failed=true}/>{:else}<span class="add">+</span>{/if}
  </button>
{:else if src&&!failed}
  <span class="portrait" style:--size={size+'px'}><img {src} alt={name?'Picture of '+name:''} onerror={()=>failed=true}/></span>
{:else if size<56}
  <span class="portrait empty initial" style:--size={size+'px'} aria-hidden="true">{initial}</span>
{/if}
<style>
  .portrait{width:var(--size);height:var(--size);flex:none;border-radius:calc(var(--size)/5);overflow:hidden;
    display:inline-grid;place-items:center;background:var(--panel-2);border:1px solid var(--line);padding:0}
  .portrait img{width:100%;height:100%;object-fit:cover;display:block}
  .edit{cursor:pointer}
  .edit:hover{border-color:var(--brass)}
  .empty{border-style:dashed;color:var(--muted)}
  .add{font:700 calc(var(--size)/2.4) var(--display);line-height:1}
  .initial{border-style:solid;font:800 calc(var(--size)/2.2) var(--display);color:var(--text-2)}
</style>
