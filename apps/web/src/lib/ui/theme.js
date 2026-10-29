/** Theme preference: 'system' (follow the OS), 'dark' or 'light'. Stored per browser. */
const KEY='pf2e-planner-theme';
export function readTheme(){
  try{const value=localStorage.getItem(KEY);return value==='dark'||value==='light'?value:'system';}
  catch{return 'system';}
}
export function applyTheme(value){
  if(value==='dark'||value==='light')document.documentElement.dataset.theme=value;
  else delete document.documentElement.dataset.theme;
  try{value==='system'?localStorage.removeItem(KEY):localStorage.setItem(KEY,value);}catch{}
}
