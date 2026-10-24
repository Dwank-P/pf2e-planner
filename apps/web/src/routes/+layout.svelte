<script>
  import {onMount} from 'svelte';
  import '../app.css';
  let {children}=$props();
  onMount(()=>{
    try {
      const saved=localStorage.getItem('pf2e-planner-theme')||'moonstone';
      const allowed=['moonstone','parchment','verdant','amethyst'];
      document.documentElement.dataset.theme=allowed.includes(saved)?saved:'moonstone';
    }catch{}
  });
</script>
{@render children()}
