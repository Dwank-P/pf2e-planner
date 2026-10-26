/** A JSON file download named after the character. */
export function jsonDownload(payload,name){
  const file=(String(name).replace(/[^\w .-]+/g,'').trim()||'character').slice(0,60)+'.planner.json';
  return new Response(JSON.stringify(payload,null,1),{headers:{'content-type':'application/json; charset=utf-8',
    'content-disposition':`attachment; filename="${file}"`}});
}
