/**
 * Equipment wishlist: items a player plans to buy, with the character level they
 * want them at. Stored in the character document's planner extras (not sent to
 * Foundry); never changes the actor or spends money.
 */
const COIN_GP={pp:10,gp:1,sp:0.1,cp:0.01};
// PF2e types, then the extra D&D 5e ones (5e armor is an 'equipment' item).
const ITEM_TYPES=['weapon','armor','shield','equipment','consumable','backpack','treasure','kit','tool','loot','container'];
export const TYPE_LABELS={weapon:'Weapon',armor:'Armor',shield:'Shield',equipment:'Worn & held',
  consumable:'Consumable',backpack:'Container',treasure:'Treasure',kit:'Kit',tool:'Tool',loot:'Loot',container:'Container'};

/** Price in gp (fractional), or null when the sync carried no price (Bridge < 0.11). */
export function priceGp(item){
  const price=item?.metadata?.rules?.price??item?.metadata?.price??item?.price;
  const value=price?.value??price;
  // D&D 5e: {value: 15, denomination: 'gp'}.
  if(typeof value==='number'&&price?.denomination)return Math.round(value*(COIN_GP[price.denomination]??1)*100)/100;
  if(!value||typeof value!=='object')return typeof value==='number'?value:null;
  const total=Object.entries(value).reduce((n,[coin,amount])=>n+(COIN_GP[coin]??0)*(Number(amount)||0),0);
  const per=Number(price?.per)||1;
  return Math.round(total/per*100)/100;
}
export function formatPrice(gp){
  if(gp==null)return '—';
  if(gp===0)return '0 gp';
  if(gp>=1)return (Math.round(gp*10)/10).toLocaleString()+' gp';
  if(gp>=0.1)return Math.round(gp*10)+' sp';
  return Math.round(gp*100)+' cp';
}
export const isConsumable=item=>item?.type==='consumable'||(item?.traits??[]).includes('consumable');
export function itemOptions(catalog){
  return ITEM_TYPES.flatMap(t=>catalog.ofType(t));
}

const clone=value=>JSON.parse(JSON.stringify(value));
const newId=()=>Math.random().toString(36).slice(2,10)+Date.now().toString(36).slice(-4);
export function wishlist(planner){return Array.isArray(planner?.wishlist)?planner.wishlist:[];}
export function addWish(planner,item,targetLevel){
  const next=clone(planner??{});
  next.wishlist=[...wishlist(next),{id:newId(),uuid:item.uuid,name:item.name,type:item.type,
    level:Number.isFinite(item.level)?item.level:null,price:priceGp(item),consumable:isConsumable(item),
    targetLevel:Math.max(1,Math.min(20,Number(targetLevel)||1)),quantity:1,status:'wanted',notes:''}];
  return next;
}
export function updateWish(planner,id,change){
  const next=clone(planner??{});
  next.wishlist=wishlist(next).map(w=>w.id===id?{...w,...change}:w);
  return next;
}
/**
 * Put an item on (or take it off). Only one armor and one shield are worn at a time: equipping
 * another of the same kind takes the old one off.
 */
export function setEquipped(planner,id,on,lookup=()=>null){
  const next=clone(planner??{});
  const list=wishlist(next);
  const target=list.find(w=>w.id===id);
  if(!target)return next;
  const kind=w=>{const item=lookup(w.uuid);return item?.type==='armor'||item?.type==='shield'?item.type
    :item?.metadata?.armor?.type==='shield'?'shield5e':item?.metadata?.armor?'armor5e':null;};
  const exclusive=kind(target);
  next.wishlist=list.map(w=>w.id===id?{...w,equipped:!!on}
    :on&&exclusive&&w.equipped&&kind(w)===exclusive?{...w,equipped:false}:w);
  return next;
}
export function removeWish(planner,id){
  const next=clone(planner??{});
  next.wishlist=wishlist(next).filter(w=>w.id!==id);
  return next;
}
/** Wishlist entries grouped by target level, with totals. */
// Fundamental rune prices in gp by grade (Player Core / GM Core).
const RUNE_GP={weaponPotency:[0,35,935,8935],striking:[0,65,1065,31065],armorPotency:[0,160,1060,20560],resilient:[0,340,3440,49440]};
/** What runes planned on a PF2e weapon or armor entry cost: fundamental runes plus property runes' own prices. */
export function runeCost(w,lookup=()=>null){
  const r=w?.runes;
  if(!r)return 0;
  const armor=w.type==='armor';
  const pick=(table,n)=>table[Math.max(0,Math.min(3,Number(n)||0))];
  let gp=pick(armor?RUNE_GP.armorPotency:RUNE_GP.weaponPotency,r.potency)+(armor?pick(RUNE_GP.resilient,r.resilient):pick(RUNE_GP.striking,r.striking));
  for(const uuid of r.property??[])gp+=priceGp(lookup(uuid))??0;
  return gp;
}
/** One entry's price including planned runes (null when nothing is known). */
export function unitPrice(w,lookup){
  const runes=runeCost(w,lookup);
  return w.price==null&&!runes?null:(w.price??0)+runes;
}
export function wishesByLevel(planner,lookup=()=>null){
  const groups=new Map();
  for(const w of wishlist(planner)){
    if(!groups.has(w.targetLevel))groups.set(w.targetLevel,[]);
    groups.get(w.targetLevel).push(w);
  }
  return [...groups.entries()].sort((a,b)=>a[0]-b[0]).map(([level,items])=>({level,items,
    total:items.reduce((n,w)=>n+(unitPrice(w,lookup)??0)*(w.quantity||1),0)}));
}
