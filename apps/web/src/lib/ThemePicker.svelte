<script>
  import {onMount} from 'svelte';
  let theme=$state('moonstone');
  const themes=[
    {id:'moonstone',label:'Moonstone',swatch:'#81c2df'},
    {id:'parchment',label:'Parchment',swatch:'#f0e2c0'},
    {id:'verdant',label:'Verdant',swatch:'#9ddeaa'},
    {id:'amethyst',label:'Amethyst',swatch:'#c4a5fa'}
  ];
  function choose(id){
    theme=id;
    document.documentElement.dataset.theme=id;
    try{localStorage.setItem('pf2e-planner-theme',id);}catch{}
  }
  onMount(()=>{
    let saved='moonstone';
    try{saved=localStorage.getItem('pf2e-planner-theme')||'moonstone';}catch{}
    choose(themes.some(t=>t.id===saved)?saved:'moonstone');
  });
</script>
<div class="theme-picker" role="group" aria-label="Color theme">
  <span class="label">Theme</span>
  {#each themes as option (option.id)}
    <button type="button" class:active={theme===option.id} aria-label={option.label+' theme'}
      aria-pressed={theme===option.id} title={option.label}
      onclick={()=>choose(option.id)} style:--swatch={option.swatch}></button>
  {/each}
</div>
<style>
  .theme-picker{display:flex;align-items:center;gap:.48rem}
  .label{font-size:.76rem;font-weight:750;color:var(--muted);margin-right:.2rem}
  button{width:22px;height:22px;border-radius:50%;background:var(--swatch);
    border:3px solid var(--page-bg);box-shadow:0 0 0 1px var(--line)}
  button.active{box-shadow:0 0 0 2px var(--accent);transform:scale(1.08)}
  @media(max-width:600px){.label{display:none}}
</style>
