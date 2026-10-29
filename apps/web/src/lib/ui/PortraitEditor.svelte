<script>
  import {tr} from '../i18n/index.js';
  /**
   * Choose a character picture: pick a file, drag to position it, zoom, save. The square crop is
   * scaled to 320×320 and compressed (WebP, or JPEG where the browser can't make WebP) here, so
   * only a small image is uploaded. onSave(dataUrl) and onRemove() return promises.
   */
  let {current=null,onSave,onRemove,onClose}=$props();
  const FRAME=260,OUT=320,MAX_BYTES=190*1024;
  let image=$state(null);
  let natural=$state({w:0,h:0});
  let zoom=$state(1);
  let offset=$state({x:0,y:0});
  let busy=$state(false);
  let error=$state('');
  let fileInput;
  let drag=null;
  const base=$derived(natural.w?Math.max(FRAME/natural.w,FRAME/natural.h):1);
  const scale=$derived(base*zoom);
  // Keep the picture covering the frame.
  const clamp=(o,s=scale)=>({x:Math.min(0,Math.max(FRAME-natural.w*s,o.x)),y:Math.min(0,Math.max(FRAME-natural.h*s,o.y))});
  function load(file){
    error='';
    if(!file)return;
    if(!file.type.startsWith('image/')){error=tr('Choose an image file.');return;}
    const url=URL.createObjectURL(file);
    const img=new Image();
    img.onload=()=>{
      natural={w:img.naturalWidth,h:img.naturalHeight};
      image=img;zoom=1;
      const s=Math.max(FRAME/img.naturalWidth,FRAME/img.naturalHeight);
      offset={x:(FRAME-img.naturalWidth*s)/2,y:(FRAME-img.naturalHeight*s)/2};
    };
    img.onerror=()=>{error=tr('That image couldn’t be read. Try a PNG, JPEG or WebP.');URL.revokeObjectURL(url);};
    img.src=url;
  }
  function setZoom(next){
    next=Math.min(4,Math.max(1,next));
    // Zoom around the frame's centre.
    const cx=(FRAME/2-offset.x)/scale,cy=(FRAME/2-offset.y)/scale;
    const s=base*next;
    zoom=next;
    offset=clamp({x:FRAME/2-cx*s,y:FRAME/2-cy*s},s);
  }
  function down(e){
    if(!image)return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag={x:e.clientX,y:e.clientY,start:{...offset}};
  }
  function move(e){
    if(!drag)return;
    offset=clamp({x:drag.start.x+e.clientX-drag.x,y:drag.start.y+e.clientY-drag.y});
  }
  function key(e){
    const step=e.shiftKey?20:5;
    const d={ArrowLeft:[step,0],ArrowRight:[-step,0],ArrowUp:[0,step],ArrowDown:[0,-step]}[e.key];
    if(d){e.preventDefault();offset=clamp({x:offset.x+d[0],y:offset.y+d[1]});}
    else if(e.key==='+'||e.key==='=')setZoom(zoom+.1);
    else if(e.key==='-')setZoom(zoom-.1);
  }
  function encode(){
    const canvas=document.createElement('canvas');
    canvas.width=canvas.height=OUT;
    const c=canvas.getContext('2d');
    c.imageSmoothingQuality='high';
    c.drawImage(image,-offset.x/scale,-offset.y/scale,FRAME/scale,FRAME/scale,0,0,OUT,OUT);
    for(const quality of [.86,.75,.6,.45]){
      let url=canvas.toDataURL('image/webp',quality);
      if(!url.startsWith('data:image/webp'))url=canvas.toDataURL('image/jpeg',quality);
      if(url.length*.75<=MAX_BYTES)return url;
    }
    throw Error(tr('That picture is too detailed to compress. Try another.'));
  }
  async function save(){
    busy=true;error='';
    try{await onSave(encode());onClose();}
    catch(e){error=e.message;}
    finally{busy=false;}
  }
  async function remove(){
    busy=true;error='';
    try{await onRemove();onClose();}
    catch(e){error=e.message;}
    finally{busy=false;}
  }
</script>
<svelte:window onkeydown={e=>{if(e.key==='Escape')onClose();}}/>
<div class="scrim" role="presentation" onclick={onClose}></div>
<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="portrait-title">
  <h2 id="portrait-title">{tr("Character picture")}</h2>
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <div class="frame" class:empty={!image} style:--frame={FRAME+'px'} role={image?'application':undefined}
    aria-label={image?tr('Drag or use the arrow keys to position the picture'):undefined} tabindex={image?0:undefined}
    onpointerdown={down} onpointermove={move} onpointerup={()=>drag=null} onpointercancel={()=>drag=null}
    onwheel={e=>{if(image){e.preventDefault();setZoom(zoom-Math.sign(e.deltaY)*.1);}}} onkeydown={key}
    ondragover={e=>e.preventDefault()} ondrop={e=>{e.preventDefault();load(e.dataTransfer?.files?.[0]);}}>
    {#if image}
      <img src={image.src} alt="" draggable="false" style:width={natural.w*scale+'px'} style:height={natural.h*scale+'px'}
        style:transform={`translate(${offset.x}px,${offset.y}px)`}/>
    {:else if current}
      <img class="current" src={current} alt={tr("Current picture")}/>
    {:else}
      <button class="pick" onclick={()=>fileInput.click()}>{tr("Choose a picture")}<small>{tr("or drop one here")}</small></button>
    {/if}
  </div>
  {#if image}
    <label class="zoom">{tr("Zoom")} <input type="range" min="1" max="4" step="0.01" value={zoom} oninput={e=>setZoom(Number(e.currentTarget.value))}/></label>
    <p class="muted small">{tr("Drag to move the picture inside the square.")}</p>
  {/if}
  <input bind:this={fileInput} class="sr" type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
    onchange={e=>{load(e.currentTarget.files?.[0]);e.currentTarget.value='';}}/>
  {#if error}<p class="notice bad">{error}</p>{/if}
  <div class="actions">
    {#if current&&!image}<button class="link danger" disabled={busy} onclick={remove}>{tr("Remove picture")}</button>{/if}
    <span class="grow"></span>
    {#if image||current}<button class="btn small ghost" disabled={busy} onclick={()=>fileInput.click()}>{image?tr('Choose another'):tr('Change')}</button>{/if}
    <button class="btn small ghost" disabled={busy} onclick={onClose}>{tr("Cancel")}</button>
    {#if image}<button class="btn small" disabled={busy} onclick={save}>{busy?tr('Saving…'):tr('Save picture')}</button>{/if}
  </div>
</div>
<style>
  .scrim{position:fixed;inset:0;background:var(--overlay);z-index:80}
  .dialog{position:fixed;z-index:81;left:50%;top:50%;transform:translate(-50%,-50%);width:min(340px,calc(100vw - 32px));
    background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow);
    padding:18px;display:grid;gap:12px;justify-items:center}
  h2{font:800 1.1rem var(--display);margin:0;justify-self:start}
  .frame{position:relative;width:var(--frame);height:var(--frame);max-width:100%;overflow:hidden;border-radius:12px;
    background:var(--panel-2);touch-action:none;cursor:grab;outline-offset:3px}
  .frame:active{cursor:grabbing}
  .frame.empty{cursor:default;border:2px dashed var(--line-strong)}
  .frame img{position:absolute;left:0;top:0;max-width:none;user-select:none;pointer-events:none;transform-origin:0 0}
  .frame img.current{position:static;width:100%;height:100%;object-fit:cover}
  .pick{width:100%;height:100%;display:grid;place-content:center;gap:4px;background:none;border:0;color:var(--text);font-weight:700}
  .pick small{color:var(--muted);font-weight:500}
  .zoom{display:flex;gap:10px;align-items:center;width:100%;font-size:.85rem}
  .zoom input{flex:1}
  .small{font-size:.8rem;margin:0}
  .actions{display:flex;gap:8px;align-items:center;width:100%;flex-wrap:wrap}
  .grow{flex:1}
  .sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
</style>
