import sanitizeHtml from 'sanitize-html';
import { db, unix, transaction } from './db.js';
import { problem } from './api.js';

const UUID = /^Compendium\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.Item\.[A-Za-z0-9_-]+$/;
const HTML_OPTIONS = {
  allowedTags: ['p','br','hr','b','strong','i','em','u','s','small','blockquote','ul','ol','li',
    'dl','dt','dd','h1','h2','h3','h4','h5','h6','table','thead','tbody','tr','td','th',
    'span','div','a','code','pre','sup','sub'],
  allowedAttributes: { a:['href','title','class','data-uuid','data-pf2e-uuid'],
    span:['class'],div:['class'],td:['colspan','rowspan'],th:['colspan','rowspan'] },
  allowedSchemes: ['https','http'],
  allowProtocolRelative: false,
  disallowedTagsMode: 'discard'
};
function escapeText(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function makeLink(uuid,label) {
  const safe = UUID.test(uuid) ? uuid : '';
  return safe ? `<a data-pf2e-uuid="${safe}" class="pf2e-reference">${escapeText(label || uuid)}</a>`
    : escapeText(label || uuid);
}
/** Token conversion BEFORE HTML sanitization, and links contain only validated UUIDs. */
export function sanitizeDescription(value) {
  if (typeof value !== 'string') return '';
  // Don't interpolate arbitrary tokens into markup; UUID regex strictly controls destination.
  let rendered=value.slice(0,30000);
  rendered=rendered.replace(/@UUID\[(Compendium\.[^\]]{1,230})\](?:\{([^}]{0,200})\})?/g,
    (_all,uuid,label)=>makeLink(uuid,label));
  rendered=rendered.replace(/@Compendium\[([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)\](?:\{([^}]{0,200})\})?/g,
    (_all,slug,label)=>{const [scope,pack,id]=slug.split('.');return makeLink(`Compendium.${scope}.${pack}.Item.${id}`,label)});
  return sanitizeHtml(rendered, HTML_OPTIONS);
}
export function verifyEntry(entry) {
  if(!entry||typeof entry!=='object'||Array.isArray(entry)||
    !UUID.test(entry.uuid)||typeof entry.name!=='string'||
    !entry.name.trim()||entry.name.length>240||
    !['feat','class'].includes(entry.type)) problem(400,'invalid_catalog_entry');
  const system = {};
  for (const [key,value] of Object.entries(entry)) {
    if (!['uuid','name','type','description'].includes(key)) system[key]=value;
  }
  const plain = JSON.stringify(system);
  if (plain.length>6000) problem(413,'oversized_catalog_metadata');
  return {uuid:entry.uuid,name:entry.name.trim(),type:entry.type,
    level:Number.isInteger(entry.level)&&entry.level>=0&&entry.level<=25?entry.level:null,
    rarity:typeof entry.rarity==='string'?entry.rarity.slice(0,32):null,
    traits:Array.isArray(entry.traits)?entry.traits.filter(t=>typeof t==='string').slice(0,48):[],
    description:sanitizeDescription(entry.description),
    pack:entry.uuid.split('.').slice(1,3).join('.'),
    metadata:system};
}
export function readPublished(campaignId) {
  return db().prepare(`SELECT p.*,i.campaign_id FROM catalog_publications p
    JOIN integrations i ON i.id=p.integration_id
    WHERE i.campaign_id=? AND i.revoked_at IS NULL`).get(campaignId);
}
export function stats(campaignId) {
  const pub=readPublished(campaignId);
  if(!pub) return null;
  const rows=db().prepare(`SELECT type,pack,COUNT(*) AS count FROM catalog_entries
    WHERE integration_id=? AND snapshot_id=? GROUP BY type,pack ORDER BY type,pack`)
    .all(pub.integration_id,pub.snapshot_id);
  return {pub,rows};
}
