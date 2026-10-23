import sanitizeHtml from 'sanitize-html';
import { parseDocument } from 'htmlparser2';
import serialize from 'dom-serializer';

export const ITEM_UUID = /^Compendium\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.Item\.[a-zA-Z0-9_-]+$/;
const ITEM_TYPES = /^[a-zA-Z][a-zA-Z0-9-]{0,39}$/;
const safeText = value => String(value).replace(/[&<>"']/g,
  c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

const HTML_OPTIONS = {
  allowedTags: ['p','br','hr','b','strong','i','em','u','s','small','blockquote','ul','ol','li',
    'dl','dt','dd','h1','h2','h3','h4','h5','h6','table','thead','tbody','tr','td','th',
    'span','div','a','code','pre','sup','sub'],
  allowedAttributes: {
    a: ['href','title','class','data-uuid','data-pf2e-uuid','data-pf2e-action'],
    span: ['class','title','data-pf2e-kind'],
    div:['class'], td:['colspan','rowspan'],th:['colspan','rowspan']
  },
  allowedSchemes: ['https','http'],
  allowProtocolRelative: false,
  disallowedTagsMode: 'discard'
};

function splitTop(value) {
  // Options are separated by | at bracket depth zero. Nested inline damage
  // types, e.g. 2d4[slashing], must be kept in the formula.
  const parts=[]; let depth=0,previous=0;
  for(let n=0;n<value.length;n++){
    const c=value[n];if(c==='[')depth++;else if(c===']')depth=Math.max(0,depth-1);
    else if(c==='|'&&depth===0){parts.push(value.slice(previous,n));previous=n+1;}
  }
  parts.push(value.slice(previous));
  return parts;
}
function params(value) {
  const [first,...rest]=splitTop(value);
  const flags={};
  for (const part of rest) {
    const ix=part.indexOf(':');
    if(ix<0)flags[part.trim().toLowerCase()]=true;
    else flags[part.slice(0,ix).trim().toLowerCase()]=part.slice(ix+1).trim();
  }
  return {first:first?.trim()??'',flags};
}
function words(text) {
  return text.replace(/[-_]/g,' ').replace(/\b\w/g,m=>m.toUpperCase());
}
function asReference(uuid,label){
  const plain=safeText(label || uuid);
  if(ITEM_UUID.test(uuid))return '<a class="pf2e-reference" data-pf2e-uuid="'+
    safeText(uuid)+'" title="Open synchronized compendium Item">'+plain+'</a>';
  return '<span class="pf2e-unresolved" title="Unsupported or unsynchronized document reference">'+plain+'</span>';
}
function renderToken(name,contents,label) {
  const {first,flags}=params(contents);
  if(name==='UUID')return asReference(contents.trim(),label);
  if(name==='Compendium'){
    const elements=contents.trim().split('.');
    const uuid=elements.length===3
      ? 'Compendium.'+elements[0]+'.'+elements[1]+'.Item.'+elements[2]
      : contents.trim();
    return asReference(uuid,label);
  }
  if(name==='Template'){
    const unit=flags.distance ? flags.distance+'-foot ' : '';
    const name=label || (unit + words(first || 'area')).trim();
    return '<span class="pf2e-inline pf2e-template" data-pf2e-kind="template" '+
      'title="Foundry area template (display only)">'+
      '<span class="pf2e-inline-icon">▱</span> '+safeText(name)+'</span>';
  }
  if(name==='Damage'){
    // Never evaluate actor-dependent formulas on a rules-browser without an actor.
    const damageType=first.match(/\[([a-z][a-z-]*)\]/i)?.[1] || '';
    const title='Damage formula (not rolled here): '+contents;
    return '<span class="pf2e-inline pf2e-damage" data-pf2e-kind="damage" title="'+
      safeText(title)+'"><span class="pf2e-inline-icon">⚄</span> '+
      safeText(label || first.replace(/\[([a-z][a-z-]*)\]/ig,'').trim() +
        (damageType?' '+damageType+' damage':' damage'))+'</span>';
  }
  if(name==='Check'){
    const stat=words(first);
    const target=flags.against
      ? (flags.against==='kineticist'?'kineticist class DC':words(flags.against)+' DC')
      : (flags.dc?'DC '+flags.dc:'');
    const basic=flags.basic?'Basic ':'';
    const display=label || basic+stat+(first.toLowerCase().includes('flat')?' check':' save')+
      (target?' vs '+target:'');
    return '<span class="pf2e-inline pf2e-check" data-pf2e-kind="check" title="'+
      safeText('Foundry check (display only): '+contents)+'">'+
      '<span class="pf2e-inline-icon">⚀</span> '+safeText(display)+'</span>';
  }
  if(name==='Action'){
    const slug=first.trim();
    if(!/^[a-z0-9-]{1,100}$/.test(slug))return safeText(label||slug);
    return '<a class="pf2e-reference pf2e-action" data-pf2e-action="'+
      safeText(slug)+'" title="Open synchronized action if available">'+
      safeText(label||words(slug))+'</a>';
  }
  // Leave unknown Foundry enrichers unchanged, not interpreted as HTML/code.
  return safeText('@'+name+'['+contents+']'+(label?'{'+label+'}':''));
}

/** A balanced parser for nested square brackets, e.g. @Damage[2d4[slashing]]. */
function tokensToHtml(text) {
  let result='',cursor=0;
  const token=/@([A-Za-z]+)\[/g;
  let match;
  while((match=token.exec(text))){
    const [whole,name]=match;
    if(!['UUID','Compendium','Template','Damage','Check','Action'].includes(name))continue;
    const start=match.index, contentStart=start+whole.length;
    let depth=1,end=contentStart;
    for(;end<text.length;end++){
      if(text[end]==='[')depth++;
      if(text[end]===']'&&--depth===0)break;
      if(text[end]!==']'&&text[end]!=='[')continue;
      // Avoid modifying depth for any non-bracket characters.
    }
    if(depth!==0)continue;
    const body=text.slice(contentStart,end);
    let after=end+1,label='';
    if(text[after]==='{'){
      const close=text.indexOf('}',after+1);
      if(close!==-1 && close-after<240){label=text.slice(after+1,close);after=close+1;}
    }
    result+=safeText(text.slice(cursor,start))+renderToken(name,body,label);
    cursor=after;token.lastIndex=after;
  }
  return result+safeText(text.slice(cursor));
}
/**
 * Safely parse an already-sanitized HTML tree and enrich TEXT NODES only.
 * Never rewrite attributes, hrefs, tags or code blocks; sanitize again after.
 */
export function sanitizeDescription(value) {
  if(typeof value!=='string')return '';
  const html=sanitizeHtml(value.slice(0,60000),HTML_OPTIONS);
  const dom=parseDocument(html,{decodeEntities:true});
  function walk(node,insideCode=false){
    if(!node.children?.length)return;
    const code=insideCode||['code','pre','a'].includes(node.name);
    const children=[];
    for(const child of node.children){
      if(child.type==='text' && !code && child.data.includes('@')){
        const markup=tokensToHtml(child.data);
        const fragment=parseDocument(markup,{decodeEntities:true}).children;
        for(const item of fragment){item.parent=node;children.push(item);}
      }else{
        walk(child,code);children.push(child);
      }
    }
    node.children=children;
  }
  walk(dom);
  return sanitizeHtml(serialize(dom.children),HTML_OPTIONS);
}
export function verifyCatalogItem(item) {
  return Boolean(item&&typeof item==='object'&&!Array.isArray(item)&&ITEM_UUID.test(item.uuid)&&
    typeof item.name==='string'&&item.name.length>0&&item.name.length<=240&&
    ITEM_TYPES.test(item.type));
}
