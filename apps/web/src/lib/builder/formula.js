/**
 * The small formulas PF2e rules use for proficiency ranks:
 *   "@actor.system.proficiencies.defenses.medium.rank"            (Warpriest's Armor)
 *   "ternary(gte(@actor.level,15),4,ternary(gte(@actor.level,7),3,2))"  (Acrobat Dedication)
 *   "match(when(gte(@actor.level, 15), 4), when(gte(@actor.level, 7), 3), 1)" (Catfolk Lore)
 * Parsed here (never eval'd). ref(path) answers "@…" references ("actor.level", "actor.system…");
 * anything it can't answer, or any unknown function, makes the result null.
 */
const FUNCTIONS={
  ternary:(c,a,b)=>c?a:b,
  gte:(a,b)=>a>=b,gt:(a,b)=>a>b,lte:(a,b)=>a<=b,lt:(a,b)=>a<b,eq:(a,b)=>a===b,ne:(a,b)=>a!==b,
  max:(...v)=>Math.max(...v),min:(...v)=>Math.min(...v),
  floor:Math.floor,ceil:Math.ceil,abs:Math.abs,
  // match(when(c,v), …, fallback): the first met "when", else the last plain value.
  when:(c,v)=>({when:!!c,value:v}),
  match:(...cases)=>{
    for(const c of cases)if(c&&typeof c==='object'&&'when' in c){if(c.when)return c.value;}else return c;
    return null;
  }
};

function tokenize(text){
  const tokens=[];
  const re=/\s*(?:(-?\d+(?:\.\d+)?)|(@[\w.-]+)|([A-Za-z_]\w*)|([(),+*\/-]))/y;
  let m,pos=0;
  while(pos<text.length){
    re.lastIndex=pos;
    m=re.exec(text);
    if(!m){if(/^\s*$/.test(text.slice(pos)))break;return null;}
    pos=re.lastIndex;
    if(m[1]!==undefined)tokens.push({num:Number(m[1])});
    else if(m[2])tokens.push({ref:m[2].slice(1)});
    else if(m[3])tokens.push({name:m[3]});
    else tokens.push({op:m[4]});
  }
  return tokens;
}

export function evaluateFormula(text,ref=()=>null){
  if(typeof text==='number')return text;
  const tokens=tokenize(String(text??''));
  if(!tokens||!tokens.length)return null;
  let i=0;
  const fail=()=>{throw Error('formula');};
  const peek=()=>tokens[i];
  // expression: term (('+'|'-') term)*; term: factor (('*'|'/') factor)*
  function expression(){
    let v=term();
    while(peek()?.op==='+'||peek()?.op==='-'){const op=tokens[i++].op;const r=term();v=op==='+'?v+r:v-r;}
    return v;
  }
  function term(){
    let v=factor();
    while(peek()?.op==='*'||peek()?.op==='/'){const op=tokens[i++].op;const r=factor();v=op==='*'?v*r:v/r;}
    return v;
  }
  function factor(){
    const t=tokens[i++];
    if(!t)fail();
    if('num' in t)return t.num;
    if('ref' in t){const v=ref(t.ref);if(v===null||v===undefined)fail();return v;}
    if(t.op==='-')return -factor();
    if(t.op==='('){const v=expression();if(tokens[i++]?.op!==')')fail();return v;}
    if(t.name){
      const fn=FUNCTIONS[t.name];
      if(!fn||tokens[i++]?.op!=='(')fail();
      const args=[];
      if(peek()?.op!==')'){args.push(expression());while(peek()?.op===','){i++;args.push(expression());}}
      if(tokens[i++]?.op!==')')fail();
      return fn(...args);
    }
    fail();
  }
  try{
    const v=expression();
    if(i!==tokens.length)return null;
    return typeof v==='number'&&Number.isFinite(v)?v:typeof v==='boolean'?Number(v):null;
  }catch{return null;}
}
