import { getWorldMetadata } from './snapshot.mjs';
import { credentials } from './credentials.mjs';

const MODULE_ID='pf2e-planner-bridge';
function requireGM() {
  if (!game.user?.isGM || !['pf2e','sf2e'].includes(game.system?.id)) {
    throw Error('Planner synchronization requires an authorized GM in a PF2e or SF2e world.');
  }
  if (!game.modules.get('pf2e-leveler')?.active) throw Error('PF2e Leveler must be active.');
}
function normalizedUrl(value) {
  const parsed = new URL(value);
  const local = ['localhost','127.0.0.1'].includes(parsed.hostname);
  if (!(parsed.protocol === 'https:' || (local && parsed.protocol === 'http:')) ||
      parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') {
    throw Error('Use the planner HTTPS site origin, e.g. https://planner.example (localhost HTTP for local testing only).');
  }
  return parsed.origin;
}
async function post(base,path,data,bearer=null) {
  const response=await fetch(base+path,{
    method:'POST',mode:'cors',cache:'no-store',credentials:'omit',redirect:'error',
    signal: AbortSignal.timeout(30000),
    headers:{'Content-Type':'application/json',...(bearer?{Authorization:'Bearer '+bearer}:{})},
    body:JSON.stringify(data)
  });
  const body=await response.json().catch(()=>({}));
  if (!response.ok) {
    const reason=typeof body.message==='string'?body.message:typeof body.error==='string'?body.error:response.statusText;
    throw Error('Planner API '+response.status+': '+reason);
  }
  return body;
}
async function collectPreview() {
  requireGM();
  if (game.system.id!=='pf2e') throw Error('SF2e catalog preview is not supported in this first slice.');
  const classPack=game.packs.get('pf2e.classes'), featPack=game.packs.get('pf2e.feats-srd');
  if (!classPack||!featPack) throw Error('Core PF2e classes and feats compendiums must be accessible.');
  const classDocs=await classPack.getDocuments();
  const classes=classDocs.map(item=>({
    uuid:item.uuid,name:item.name,slug:item.system?.slug ?? item.slug ?? null,
    level:1,
    keyAbility:item.system?.keyAbility?.value ?? [],
    classFeatLevels:item.system?.classFeatLevels?.value ?? [],
    skillFeatLevels:item.system?.skillFeatLevels?.value ?? [],
    generalFeatLevels:item.system?.generalFeatLevels?.value ?? [],
    ancestryFeatLevels:item.system?.ancestryFeatLevels?.value ?? [],
    skillIncreaseLevels:item.system?.skillIncreaseLevels?.value ?? []
  }));
  const index=await featPack.getIndex({
    fields:['type','system.slug','system.level.value','system.traits.rarity']
  });
  const feats=[...index.values()].slice(0,1000).map(item=>({
    uuid:item.uuid,name:item.name,type:item.type ?? 'feat',
    slug:item.system?.slug ?? null,
    level:item.system?.level?.value ?? null,
    rarity:item.system?.traits?.rarity ?? null
  }));
  return {schemaVersion:1,snapshotId:crypto.randomUUID(),sourceVersions:{
    worldId:game.world.id,systemId:game.system.id,
    systemVersion:game.system.version,
    levelerVersion:game.modules.get('pf2e-leveler')?.version ?? null,
    note:'Core PF2e-only metadata preview; first 1000 feats, not a complete sync'
  },classes,feats};
}

/**
 * Verify that an HTTPS URL reaches a compatible Planner API. This does not pair
 * or consume a one-time code and never submits a secret.
 */
export async function testWebsite(url) {
  requireGM();
  const base = normalizedUrl(url);
  let response;
  try {
    response = await fetch(base + '/api/v1/bridge/status', {
      method: 'GET', mode: 'cors', cache: 'no-store',
      credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(10000)
    });
  } catch (error) {
    if (error?.name === 'TimeoutError') {
      throw Error('Website did not respond within 10 seconds. Check DNS, HTTPS and reverse proxy.');
    }
    throw Error('Cannot reach ' + base + ' from this Foundry browser. Check HTTPS certificate, network and CORS.');
  }
  if (!response.ok) {
    throw Error('Website returned HTTP ' + response.status +
      ' at /api/v1/bridge/status. Confirm both apps are updated to v0.2.2.');
  }
  let result;
  try { result = await response.json(); }
  catch { throw Error('Website response was not valid JSON. Check the proxy target.'); }
  if (result?.status !== 'ok' || result?.service !== 'pf2e-planner-web') {
    throw Error('This address did not respond as a PF2e Planner website.');
  }
  ui.notifications.info('PF2e Planner: Website reachable (v' +
    String(result.version ?? 'unknown') + ').');
  return { url: base, version: result.version ?? null };
}

export function status() {
  if (!game.user?.isGM) return { authorized:false };
  return {
    websiteUrl:game.settings.get(MODULE_ID,'websiteUrl')||null,
    integrationId:game.settings.get(MODULE_ID,'integrationId')||null,
    activeGm:game.users.activeGM?.id===game.user.id,
    levelerActive:Boolean(game.modules.get('pf2e-leveler')?.active),
    state:'Authorization stored only in local browser IndexedDB (per GM)'
  };
}
export async function pairWebsite(url,code) {
  requireGM();
  const { url: base } = await testWebsite(url);
  const data=getWorldMetadata();
  const previousUrl=game.settings.get(MODULE_ID,'websiteUrl');
  const previousId=game.settings.get(MODULE_ID,'integrationId');
  if (previousId && previousUrl!==base) {
    throw Error('This world is paired to another website. Revoke/reconcile the old pairing before switching.');
  }
  const endpoint=previousId
    ? '/api/v1/bridge/'+encodeURIComponent(previousId)+'/authorize'
    : '/api/v1/bridge/pair';
  const result=await post(base,endpoint,{
    code,worldId:data.world.id,worldTitle:data.world.title,
    systemId:data.system.id,systemVersion:data.system.version,
    levelerVersion:data.leveler.version,clientNonce:crypto.randomUUID()
  });
  // Save secret credentials only in the GM's browser profile.
  await credentials.save(base,result.integrationId,{
    accessToken:result.accessToken,accessExpiresAt:result.accessExpiresAt,
    refreshToken:result.refreshToken,refreshExpiresAt:result.refreshExpiresAt
  });
  await game.settings.set(MODULE_ID,'websiteUrl',base);
  await game.settings.set(MODULE_ID,'integrationId',result.integrationId);
  ui.notifications.info('PF2e Planner browser authorized. Starting preview sync.');
  const previewResult=await syncNow();
  return { integrationId:result.integrationId,campaignId:result.campaignId,sync:previewResult };
}

let syncing=false;
export async function syncNow() {
  requireGM();
  if (syncing) return { skipped:'already_syncing' };
  const base=game.settings.get(MODULE_ID,'websiteUrl');
  const id=game.settings.get(MODULE_ID,'integrationId');
  if (!base||!id) throw Error('Pair this Foundry world first.');
  let auth=await credentials.load(base,id);
  if (!auth) throw Error('This GM browser is not authorized. Pair it using a one-time code.');
  syncing=true;
  try {
    if (auth.accessExpiresAt < Math.floor(Date.now()/1000)+120) {
      const refreshed=await post(base,'/api/v1/bridge/'+encodeURIComponent(id)+'/refresh',
        {refreshToken:auth.refreshToken});
      auth={...auth,...refreshed};
      await credentials.save(base,id,auth);
    }
    const preview=await collectPreview();
    const result=await post(base,'/api/v1/bridge/'+encodeURIComponent(id)+'/catalog-preview',
      preview,auth.accessToken);
    ui.notifications.info('PF2e Planner preview synced: '+result.classes+' classes, '+result.feats+' feats.');
    return result;
  } finally { syncing=false; }
}

export async function openPairingDialog() {
  requireGM();
  const { PlannerConnectionMenu } = await import('./menu.mjs');
  return new PlannerConnectionMenu().render({ force: true });
}
