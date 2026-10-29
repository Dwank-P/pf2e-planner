/**
 * The stat block shown above an item's description: what armor, shields, weapons and other gear
 * do, from the synced item data (PF2e metadata.rules; D&D metadata.armor / metadata.weapon).
 * Returns [[label, value], …]; empty for items without stats.
 */
import {tr,labels} from '../i18n/index.js';
import {priceGp,formatPrice} from './equipment.js';

const signed=n=>(Number(n)>=0?'+':'')+Number(n);
const title=s=>tr(String(s??'').replace(/[-_]/g,' ').replace(/\b\w/g,c=>c.toUpperCase()));
const STRIKING=labels(['','Striking','Greater Striking','Major Striking']);
const RESILIENT=labels(['','Resilient','Greater Resilient','Major Resilient']);
const grade=v=>typeof v==='number'?v:{striking:1,greaterStriking:2,majorStriking:3,resilient:1,greaterResilient:2,majorResilient:3}[v]??0;
function bulk(rules){
  const v=rules.bulk?.value??rules.bulk;
  if(v===undefined||v===null||typeof v==='object')return null;
  return Number(v)===0?'—':Number(v)<1?'L':String(v);
}
function runes(r={}){
  const parts=[r.potency?tr('+{0} potency',r.potency):'',STRIKING[grade(r.striking)]||'',RESILIENT[grade(r.resilient)]||''].filter(Boolean);
  return parts.length?parts.join(', '):null;
}
const DND_WEAPON=labels({simpleM:'Simple melee',simpleR:'Simple ranged',martialM:'Martial melee',martialR:'Martial ranged',natural:'Natural',improv:'Improvised'});

export function itemStats(item){
  if(!item)return [];
  const m=item.metadata??{},r=m.rules??{};
  const out=[];
  const add=(label,value)=>{if(value!==null&&value!==undefined&&value!==''&&value!=='0')out.push([tr(label),String(value)]);};
  if(m.armor){// D&D 5e armor and shields
    const a=m.armor;
    if(a.type==='shield')add('AC',signed(a.value+(a.magicalBonus||0)));
    else{
      add('Armor',title(a.type));
      add('AC',a.value+(a.magicalBonus||0)+(a.type==='heavy'?'':a.type==='medium'?' '+tr('+ Dex (max {0})',a.dex??2):' '+(a.dex!=null?tr('+ Dex (max {0})',a.dex):tr('+ Dex'))));
    }
  }else if(m.weapon){// D&D 5e weapons
    const w=m.weapon;
    add('Weapon',DND_WEAPON[w.classification]??title(w.classification));
    if(w.denomination)add('Damage',`${w.number??1}d${w.denomination}${w.types?.[0]?' '+w.types[0]:''}`);
    if(w.magicalBonus)add('Magic bonus',signed(w.magicalBonus));
  }else if(item.type==='armor'){
    add('Category',title(r.category));
    add('AC bonus',r.acBonus!=null?signed(r.acBonus):null);
    add('Dex cap',r.dexCap!=null?signed(r.dexCap):null);
    add('Strength',r.strength?signed(r.strength):null);
    add('Check penalty',r.checkPenalty?String(r.checkPenalty):null);
    add('Speed penalty',r.speedPenalty?tr('{0} ft.',r.speedPenalty):null);
    add('Group',r.group?title(r.group):null);
    add('Runes',runes(r.runes));
  }else if(item.type==='shield'){
    add('AC bonus',r.acBonus!=null?signed(r.acBonus)+' (raised)':null);
    add('Hardness',r.hardness??null);
    const hp=r.hp;
    if(hp&&typeof hp==='object')add('HP (BT)',`${hp.max??hp.value??'—'}${hp.brokenThreshold?' ('+hp.brokenThreshold+')':''}`);
    else add('HP',hp??null);
  }else if(item.type==='weapon'){
    add('Category',title(r.category));
    if(r.damage?.die)add('Damage',`${r.damage.dice??1}${r.damage.die}${r.damage.damageType?' '+r.damage.damageType:''}`);
    add('Range',Number(r.range)>0?tr('{0} ft.',r.range):null);
    add('Group',r.group?title(r.group):null);
    add('Runes',runes(r.runes));
  }
  // Every physical item: price, bulk and how it's held or worn.
  const gp=priceGp(item);
  if(gp!==null&&gp!==undefined&&out.length+(gp?1:0)>0)add('Price',formatPrice(gp));
  const b=bulk(r);
  if(b&&out.length)add('Bulk',b);
  const usage=r.usage?.value??(typeof r.usage==='string'?r.usage:null);
  if(usage&&out.length)add('Usage',title(usage));
  return out;
}
