/** Fetch a JSON file and save it (works for same-site downloads and public exports alike). */
export async function downloadJson(url,name){
  const response=await fetch(url,{credentials:'same-origin'});
  if(!response.ok)throw Error('Export failed (HTTP '+response.status+')');
  const blob=new Blob([await response.text()],{type:'application/json'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=(String(name).replace(/[^\w .-]+/g,'').trim()||'character')+'.planner.json';
  document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
/**
 * Where a public link's export lives: "https://other.example/p/<token>" (any planner) or a bare
 * token (this one). Returns null for anything else.
 */
export function exportUrlFromLink(text){
  const value=String(text??'').trim();
  if(/^[A-Za-z0-9_-]{43}$/.test(value))return '/api/v1/public/'+value+'/export';
  try{
    const url=new URL(value);
    const match=/^\/p\/([A-Za-z0-9_-]{43})\/?$/.exec(url.pathname);
    if(!match||!/^https?:$/.test(url.protocol))return null;
    return url.origin+'/api/v1/public/'+match[1]+'/export';
  }catch{return null;}
}
