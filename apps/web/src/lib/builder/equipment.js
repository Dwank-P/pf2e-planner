/**
 * Equipment wishlist: items a player plans to buy, with the character level they
 * want them at. Stored in the character document's planner extras (not sent to
 * Foundry); never changes the actor or spends money.
 */
const COIN_GP={pp:10,gp:1,sp:0.1,cp:0.01};
const ITEM_TYPES=['weapon','armor','shield','equipment','consumable','backpack','treasure','kit'];
export const TYPE_LABELS={weapon:'Weapon',armor:'Armor',shield:'Shield',equipment:'Worn & held',
  consumable:'Consumable',backpack:'Container',treasure:'Treasure',kit:'Kit'};

/** Price in gp (fractional), or null when the sync carried no price (Bridge < 0.11). */
export function priceGp(item){
  const price=item?.metadata?.rules?.price??item?.price;
  const value=price?.value??price;
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
export function removeWish(planner,id){
  const next=clone(planner??{});
  next.wishlist=wishlist(next).filter(w=>w.id!==id);
  return next;
}
/** Wishlist entries grouped by target level, with totals. */
export function wishesByLevel(planner){
  const groups=new Map();
  for(const w of wishlist(planner)){
    if(!groups.has(w.targetLevel))groups.set(w.targetLevel,[]);
    groups.get(w.targetLevel).push(w);
  }
  return [...groups.entries()].sort((a,b)=>a[0]-b[0]).map(([level,items])=>({level,items,
    total:items.reduce((n,w)=>n+(w.price??0)*(w.quantity||1),0)}));
}
