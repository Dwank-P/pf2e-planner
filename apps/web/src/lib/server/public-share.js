import {createHash} from 'node:crypto';
import {db} from './db.js';
import {problem} from './api.js';
import {BUNDLE_FORMAT,bundleItem} from './bundle.js';
import {catalogFor,campaignSystem,readDocument,mergeView,toCharacter} from './characters.js';
import {readIcon} from './icons.js';
import {familyOf,personalCatalog,personalIcon,neededItems,toPersonal} from './personal.js';
import {exportPayload} from './transfer.js';

/**
 * Public view links ("/p/<token>"): read-only access to one character, personal or campaign,
 * without signing in. Only the items the build uses are served, never the rest of a catalog,
 * and another planner can fetch the build's export to copy it.
 */
const TOKEN=/^[A-Za-z0-9_-]{43}$/;
export function publicTarget(token){
  if(typeof token!=='string'||!TOKEN.test(token))problem(404,'character_not_found');
  const personal=db().prepare('SELECT * FROM personal_characters WHERE public_token=?').get(token);
  if(personal){
    const catalog=personalCatalog(personal);
    return {kind:'personal',row:personal,system:personal.system,resolve:catalog.resolve,variants:catalog.variants,
      character:()=>toPersonal(personal,{publicView:true}),
      icon:path=>personalIcon(personal,path),version:catalog.sources.size+':'+[...catalog.sources.values()].map(w=>w.sha256).join(',')};
  }
  const row=db().prepare('SELECT * FROM character_builds WHERE public_token=?').get(token);
  if(!row)problem(404,'character_not_found');
  const system=familyOf(campaignSystem(row.campaign_id));
  const catalog=catalogFor(row.campaign_id);
  const owner=db().prepare('SELECT display_name FROM users WHERE id=?').get(row.owner_user_id);
  return {kind:'campaign',row:{...row,system},system,resolve:catalog?.resolve??(()=>null),variants:catalog?.variants??{},
    character:()=>{
      const {campaignId,visibility,ownerUserId,...rest}=toCharacter(row);
      return {...rest,system,ownerName:owner?.display_name??null};
    },
    icon:path=>readIcon(row.campaign_id,path),version:catalog?String(catalog.integrationId):'none'};
}
/** The character as the public page shows it. */
export function publicCharacter(target){
  return {...target.character(),access:{edit:false,manage:false},publicView:true};
}
/** Only what the build uses (and what those items point at). */
export const publicItems=target=>neededItems(target.row,target.resolve);

export function publicBundle(target){
  const items=[...publicItems(target).values()].map(bundleItem);
  const sha256=createHash('sha256').update([target.kind,target.row.id,target.row.revision,target.version,BUNDLE_FORMAT].join('\n')).digest('hex');
  return {sha256,body:Buffer.from(JSON.stringify({sha256,variants:target.variants,sources:{systemId:target.system},items}))};
}
export function publicIcon(target,path){
  if(![...publicItems(target).values()].some(item=>item.img===path))return null;
  return target.icon(path);
}
/** The build in the portable export format, for importing into another planner. */
export function publicExport(target){
  const row=target.row;
  const stored=readDocument(row);
  const document=target.kind==='personal'||stored.doc?stored.doc:mergeView(row.campaign_id,null,stored.view);
  const variants=target.kind==='personal'?JSON.parse(row.variants_json||'{}'):target.variants;
  const needed=publicItems(target);
  return exportPayload({name:row.name,level:row.level,system:target.system,variants,
    document:{...document,planner:{...(document.planner??{}),notes:''}},resolve:uuid=>needed.get(uuid)??target.resolve(uuid)});
}
