<script>
 let code='',username='',password='',confirm='',errorText='',complete=false,busy=false;
 async function redeem(event) {
  event.preventDefault(); errorText='';
  if(password!==confirm){errorText='Passwords must match.';return;}
  busy=true;
  try {
   const res=await fetch('/api/v1/join/redeem',{
    method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},
    body:JSON.stringify({code:code.trim(),username,password})
   });
   const result=await res.json().catch(()=>({}));
   if(!res.ok)throw Error(result.message||'Unable to redeem code');
   password=confirm=code='';
   complete=true;
  }catch(e){errorText=e.message;}finally{busy=false;}
 }
</script>
<svelte:head><title>Activate account — PF2e Planner</title></svelte:head>
<main>
 <h1>Activate your PF2e Planner account</h1>
 {#if complete}
  <p>Account activated. Your password is now set and you're signed in.</p>
  <a href="/">Open Planner</a>
 {:else}
  <p>Your GM will provide a one-time code. Choose a username and a password that you can use across all your campaigns.</p>
  {#if errorText}<p role="alert">{errorText}</p>{/if}
  <form onsubmit={redeem}>
   <label>One-time code <input required autocomplete="off" bind:value={code}/></label>
   <label>Choose username <input required minlength="3" maxlength="32" autocomplete="username" bind:value={username}/></label>
   <label>Password (12+ characters) <input type="password" required minlength="12" autocomplete="new-password" bind:value={password}/></label>
   <label>Confirm password <input type="password" required minlength="12" autocomplete="new-password" bind:value={confirm}/></label>
   <button disabled={busy}>Activate account</button>
  </form>
 {/if}
</main>
<style>
 :global(body){background:#101820;color:#f0f4f6;font:16px system-ui,sans-serif;}
 main{max-width:520px;margin:8vh auto;padding:2rem;background:#1d2934;border-radius:8px}
 label{display:block;margin:1rem 0;}input{display:block;box-sizing:border-box;width:100%;padding:.7rem;margin-top:.4rem;background:#09151e;color:#fff;border:1px solid #6d889b;border-radius:4px;}
 button{background:#b7d6e7;padding:.75rem;border:0;border-radius:4px;font:inherit;cursor:pointer;}
 a{color:#aadfff}
</style>
