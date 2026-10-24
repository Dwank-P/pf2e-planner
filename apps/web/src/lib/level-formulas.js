/**
 * Side-effect-free arithmetic evaluator for narrowly supported level formulas.
 * It does NOT execute JavaScript, PF2e Rule Elements, dice or actor macros.
 */
export function evaluateLevelExpression(formula, level) {
  if(!Number.isInteger(level)||level<1||level>20||
    typeof formula!=='string'||formula.length>180) return null;
  const source=formula.replace(/@actor\.level|@item\.level/gi,String(level)).trim();
  const tokens=source.match(/\s*(?:\d+(?:\.\d+)?|[()+\-*/ ,]|floor|ceil|round|min|max)/g);
  if(!tokens || tokens.join('').replace(/\s/g,'')!==source.replace(/\s/g,''))return null;
  const t=tokens.map(x=>x.trim()).filter(Boolean);
  let pos=0;
  function expression(){
    let left=term();
    while(t[pos]==='+'||t[pos]==='-'){const sign=t[pos++]; const right=term();left=sign==='+'?left+right:left-right;}
    return left;
  }
  function term(){
    let left=unary();
    while(t[pos]==='*'||t[pos]==='/'){const op=t[pos++],right=unary();
      if(op==='/' && right===0)throw Error('zero_division');
      left=op==='*'?left*right:left/right;}
    return left;
  }
  function unary(){
    if(t[pos]==='+'){pos++;return unary();}
    if(t[pos]==='-'){pos++;return -unary();}
    return primary();
  }
  function primary(){
    const current=t[pos++];
    if(current==='('){const value=expression();if(t[pos++]!==')')throw Error('unbalanced');return value;}
    if(['floor','ceil','round','min','max'].includes(current)){
      if(t[pos++]!=='(')throw Error('function_argument');
      const args=[expression()];
      while(t[pos]===','){pos++;args.push(expression());}
      if(t[pos++]!==')')throw Error('unbalanced');
      if(['min','max'].includes(current))return Math[current](...args);
      if(args.length!==1)throw Error('function_arity');
      return Math[current](args[0]);
    }
    if(current && /^\d+(?:\.\d+)?$/.test(current))return Number(current);
    throw Error('invalid_token');
  }
  try { const n=expression();return pos===t.length&&Number.isFinite(n)&&Math.abs(n)<1e6?n:null; }
  catch{return null;}
}

/** Resolves a damage dice COUNT from character level, not an automatic roll. */
export function resolveDamageFormula(formula, level) {
  if(typeof formula!=='string')return null;
  const found=/^\s*(.+?)d(\d{1,3})(?:\[([a-z-]{1,40})\])?\s*$/i.exec(formula);
  if(!found)return null;
  const count=evaluateLevelExpression(found[1],level),size=Number(found[2]);
  if(count===null||!Number.isInteger(count)||count<0||count>1000||size<2||size>1000)return null;
  return {dice:count,size,type:found[3]??null,text:`${count}d${size}${found[3]?' '+found[3]:''} damage`};
}

/**
 * Received descriptions are HTML-sanitized server-side. The client only
 * changes textContent of designated damage markers, not HTML attributes.
 */
export function renderLevelDescription(html,level) {
  if(typeof html!=='string'||typeof DOMParser==='undefined')return html||'';
  const doc=new DOMParser().parseFromString('<main id="root">'+html+'</main>','text/html');
  const root=doc.querySelector('#root');
  if(!root)return html;
  for(const marker of root.querySelectorAll('[data-pf2e-kind="damage"][data-pf2e-formula]')){
    const formula=marker.getAttribute('data-pf2e-formula');
    const result=resolveDamageFormula(formula,level);
    if(result){
      marker.textContent='⚄ '+result.text;
      marker.title='At character level '+level+': '+result.text+' • original: '+formula;
    }
  }
  return root.innerHTML;
}
