import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomInt, randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';

test('production API: bootstrap → pair world → create player → sync → refresh + revoke', {timeout:45_000}, async () => {
  const temp=mkdtempSync(join(tmpdir(),'pf2e-planner-smoke-'));
  const port=randomInt(40000,58000),origin=`http://127.0.0.1:${port}`;
  const bootstrap='bootstrap-test-secret-'+('z'.repeat(48));
  const child=spawn(process.execPath,['scripts/start.mjs'],{
    cwd:new URL('../',import.meta.url),
    env:{...process.env,NODE_ENV:'production',HOST:'127.0.0.1',PORT:String(port),
      PUBLIC_ORIGIN:origin,DB_PATH:join(temp,'planner.sqlite'),BOOTSTRAP_TOKEN:bootstrap},
    stdio:['ignore','pipe','pipe']
  });
  let output='';
  child.stdout.on('data',d=>output+=String(d));
  child.stderr.on('data',d=>output+=String(d));

  async function send(path,body,cookie='',requestOrigin=origin,method='POST',bearer='') {
    const headers={origin:requestOrigin};
    if (body!==undefined) headers['content-type']='application/json';
    if (cookie) headers.cookie=cookie;
    if (bearer) headers.authorization='Bearer '+bearer;
    const response=await fetch(origin+path,{
      method,headers,...(body===undefined?{}:{body:JSON.stringify(body)})
    });
    const payload=await response.json().catch(()=>({}));
    return {status:response.status,body:payload,cookie:response.headers.get('set-cookie')?.split(';')[0]??''};
  }

  try {
    let ready=false;
    for(let i=0;i<100;i++){
      if(child.exitCode!==null) break;
      try {const r=await fetch(origin+'/health');if(r.status===200){ready=true;break;}}
      catch {}
      await sleep(100);
    }
    assert.ok(ready,'Server failed to start. '+output.slice(-1500));
    assert.match(output,/Starting web v0\.3\.1/,'Boot log should include package version');
    assert.match(output,/Source fingerprint: [a-f0-9]{16}/,
      'Boot log should include a source identifier');
    const health=await send('/health',undefined,'',origin,'GET');
    assert.equal(health.status,200);
    assert.equal(health.body.version,'0.3.1');
    assert.match(health.body.sourceFingerprint,/^[a-f0-9]{16}$/);
    assert.ok(health.body.builtAt);


    const check=await send('/api/v1/bridge/status',undefined,'',
      'https://a-foundry-world.example','GET');
    assert.equal(check.status,200,JSON.stringify(check));
    assert.equal(check.body.service,'pf2e-planner-web');
    assert.equal(check.body.version,'0.3.1');
    const corsCheck=await fetch(origin+'/api/v1/bridge/status',{
      headers:{origin:'https://a-foundry-world.example'}
    });
    assert.equal(corsCheck.headers.get('access-control-allow-origin'),
      'https://a-foundry-world.example');

    const setup=await send('/api/v1/setup',{
      bootstrapToken:bootstrap,username:'test-owner',displayName:'Test Owner',
      password:'some-long-example-password-123'
    });
    assert.equal(setup.status,201,JSON.stringify(setup));
    const ownerCookie=setup.cookie;
    assert.ok(ownerCookie.includes('planner_session'));

    const pairCode=await send('/api/v1/pairing-codes',{},ownerCookie);
    assert.equal(pairCode.status,201,JSON.stringify(pairCode));
    const gmOrigin='https://foundry.test.invalid';
    const paired=await send('/api/v1/bridge/pair',{
      code:pairCode.body.code,worldId:'test-world',worldTitle:'Test World',
      systemId:'pf2e',systemVersion:'8.6.1',levelerVersion:'3.8.12',
      clientNonce:randomUUID()
    },'',gmOrigin);
    assert.equal(paired.status,201,JSON.stringify(paired));
    const campaignId=paired.body.campaignId, integrationId=paired.body.integrationId;
    assert.ok(campaignId && integrationId && paired.body.refreshToken);

    const reusedPair=await send('/api/v1/bridge/pair',{
      code:pairCode.body.code,worldId:'other-world',worldTitle:'Other World',
      systemId:'pf2e'
    },'',gmOrigin);
    assert.equal(reusedPair.status,400);

    const newPlayer=await send('/api/v1/campaigns/'+campaignId+'/members',
      {},ownerCookie);
    assert.equal(newPlayer.status,201,JSON.stringify(newPlayer));
    assert.ok(newPlayer.body.inviteCode && newPlayer.body.inviteCode.length>=40);

    // Validation must not consume an invitation or require username/password.
    const invalidCode=await send('/api/v1/join/validate',{code:'invalid-code'});
    assert.equal(invalidCode.status,400);
    const validation=await send('/api/v1/join/validate',{code:newPlayer.body.inviteCode});
    assert.equal(validation.status,200,JSON.stringify(validation));
    const validationAgain=await send('/api/v1/join/validate',{code:newPlayer.body.inviteCode});
    assert.equal(validationAgain.status,200);

    const activation=await send('/api/v1/join/redeem',{
      code:newPlayer.body.inviteCode,username:'new-player',
      password:'very-long-test-password-123'
    });
    assert.equal(activation.status,201,JSON.stringify(activation));
    const expiredByRedemption=await send('/api/v1/join/validate',{code:newPlayer.body.inviteCode});
    assert.equal(expiredByRedemption.status,400);
    const playerCookie=activation.cookie;
    const playerMe=await send('/api/v1/me',undefined,playerCookie,origin,'GET');
    assert.equal(playerMe.status,200,JSON.stringify(playerMe));
    assert.equal(playerMe.body.user.displayName,'new-player');
    // The same cookie must work on a separate /me request, as after browser navigation.
    const playerMeAgain=await send('/api/v1/me',undefined,playerCookie,origin,'GET');
    assert.equal(playerMeAgain.status,200);
    assert.ok(playerMe.body.campaigns.some(x=>x.id===campaignId));

    const reusedInvitation=await send('/api/v1/join/redeem',{
      code:newPlayer.body.inviteCode,username:'other',
      password:'very-long-test-password-123'
    });
    assert.equal(reusedInvitation.status,400);

    const existingSearch=await send('/api/v1/users?q=new-player',undefined,ownerCookie,origin,'GET');
    assert.equal(existingSearch.status,200,JSON.stringify(existingSearch));
    assert.ok(existingSearch.body.users.some(u=>u.username==='new-player'));
    const existingAdd=await send('/api/v1/campaigns/'+campaignId+'/members',
      {existingUserId:newPlayer.body.userId},ownerCookie);
    assert.equal(existingAdd.status,200);
    assert.equal(existingAdd.body.alreadyMember,true);

    const preview=await send('/api/v1/bridge/'+integrationId+'/catalog-preview',{
      schemaVersion:1,snapshotId:randomUUID(),
      sourceVersions:{systemId:'pf2e',systemVersion:'8.6.1',levelerVersion:'3.8.12'},
      classes:[{uuid:'Compendium.pf2e.classes.Item.Fighter',name:'Fighter',classFeatLevels:[2,4]}],
      feats:[{uuid:'Compendium.pf2e.feats-srd.Item.Demo',name:'Demonstration Feat',level:2}]
    },'',gmOrigin,'POST',paired.body.accessToken);
    assert.equal(preview.status,201,JSON.stringify(preview));

    const catalog=await send('/api/v1/campaigns/'+campaignId+'/catalog-preview',
      undefined,playerCookie,origin,'GET');
    assert.equal(catalog.status,200,JSON.stringify(catalog));
    assert.equal(catalog.body.classes.length,1);

    // Server-side receipt: exact persisted counts and metadata, not bridge claims.
    const summary=await send('/api/v1/campaigns/'+campaignId+'/catalog-summary',
      undefined,playerCookie,origin,'GET');
    assert.equal(summary.status,200,JSON.stringify(summary));
    assert.equal(summary.body.synced,true);
    assert.equal(summary.body.ruleset.systemVersion,'8.6.1');
    assert.equal(summary.body.ruleset.levelerVersion,'3.8.12');
    assert.equal(summary.body.totals.classes,1);
    assert.equal(summary.body.totals.feats,1);
    assert.equal(summary.body.totals.savedItems,2);
    assert.match(summary.body.sha256,/^[0-9a-f]{64}$/);
    assert.ok(summary.body.updatedAt>0);
    assert.equal(summary.body.sources.classes[0].label,'pf2e.classes');
    assert.equal(summary.body.sources.feats[0].label,'pf2e.feats-srd');
    assert.equal('feats' in summary.body,false,
      'A player-facing summary must not dump the detailed feat catalog');

    const details=await send('/api/v1/campaigns/'+campaignId+'/catalog-details',
      undefined,ownerCookie,origin,'GET');
    assert.equal(details.status,200,JSON.stringify(details));
    assert.equal(details.body.classes[0].name,'Fighter');
    assert.deepEqual(details.body.classes[0].classFeatLevels,[2,4]);
    assert.equal(details.body.feats[0].name,'Demonstration Feat');
    assert.equal(details.body.sha256,summary.body.sha256);

    const playerDetails=await send('/api/v1/campaigns/'+campaignId+'/catalog-details',
      undefined,playerCookie,origin,'GET');
    assert.equal(playerDetails.status,403,'Only site owner and campaign GMs may inspect full receipt');



    // v0.3.1 complete staged catalog: explicit variant rules, metadata, html and links.
    const importRoute='/api/v1/bridge/'+integrationId+'/catalog-import';
    const variants={
      freeArchetype:true,dualClass:true,ancestralParagon:false,
      gradualAbilityBoosts:false,automaticBonusProgression:'noABP'
    };
    const sourceVersions={
      worldId:'test-world',systemId:'pf2e',systemVersion:'8.6.1',levelerVersion:'3.8.12'
    };
    const started=await send(importRoute+'/start',{
      expectedCount:6,packs:['pf2e.classes','pf2e.feats-srd',
        'pf2e.conditionitems','pf2e.actionspf2e','battlezoo.options'],variants,
      sourceVersions
    },'',gmOrigin,'POST',paired.body.accessToken);
    assert.equal(started.status,201,JSON.stringify(started));
    const entries=[
      {uuid:'Compendium.pf2e.classes.Item.Fighter',type:'class',name:'Fighter',
        level:1,classFeatLevels:[2,4,6],description:'<p>Fighter</p>'},
      {uuid:'Compendium.pf2e.feats-srd.Item.Demo',type:'feat',
        name:'Demonstration Feat',level:2,rarity:'common',traits:['fighter','attack'],
        featType:'class',description:
          '<p onclick="alert(1)">Select @UUID[Compendium.pf2e.feats-srd.Item.Other]{Other Feat} '+
          'and @UUID[Compendium.pf2e.conditionitems.Item.Frightened]{Frightened}. '+
          'An @Template[line|distance:60] deals '+
          '@Damage[(floor((@actor.level -1)/2) +2)d4[slashing]|options:area-damage] with '+
          '@Check[reflex|against:kineticist|basic|options:area-effect], '+
          'or @Action[raise-a-shield].</p>'+
          '<script>alert(1)</script><img src=x onerror=alert(1)>'},
      {uuid:'Compendium.pf2e.feats-srd.Item.Other',type:'feat',
        name:'Other Feat',level:4,rarity:'uncommon',traits:['fighter'],
        featType:'class',description:'<p>Other Feat</p>'},
      {uuid:'Compendium.pf2e.conditionitems.Item.Frightened',type:'condition',
        name:'Frightened',description:'<p>You are frightened.</p>'},
      {uuid:'Compendium.pf2e.actionspf2e.Item.RaiseShield',type:'action',
        name:'Raise a Shield',slug:'raise-a-shield',description:'<p>Raise your shield.</p>'},
      {uuid:'Compendium.battlezoo.options.Item.BZFeat',type:'feat',
        name:'Battlezoo Test',level:2,rarity:'uncommon',traits:['rare-example'],
        description:'<p>A selected third-party feat.</p>'}
    ];
    const batch=await send(importRoute+'/batch',{
      snapshotId:started.body.snapshotId,batchNumber:0,items:entries
    },'',gmOrigin,'POST',paired.body.accessToken);
    assert.equal(batch.status,201,JSON.stringify(batch));
    assert.equal(batch.body.staged,6);

    const published=await send(importRoute+'/commit',{
      snapshotId:started.body.snapshotId
    },'',gmOrigin,'POST',paired.body.accessToken);
    assert.equal(published.status,201,JSON.stringify(published));
    assert.equal(published.body.accepted,6);

    const fullSummary=await send('/api/v1/campaigns/'+campaignId+'/catalog-summary',
      undefined,playerCookie,origin,'GET');
    assert.equal(fullSummary.status,200,JSON.stringify(fullSummary));
    assert.equal(fullSummary.body.complete,true);
    assert.equal(fullSummary.body.variants.freeArchetype,true);
    assert.equal(fullSummary.body.variants.dualClass,true);
    assert.equal(fullSummary.body.totals.classes,1);
    assert.equal(fullSummary.body.totals.feats,3);
    assert.equal(fullSummary.body.totals.savedItems,6);
    assert.ok(fullSummary.body.itemTypes.some(x=>x.type==='condition'&&x.count===1));
    assert.ok(fullSummary.body.itemTypes.some(x=>x.type==='action'&&x.count===1));
    assert.ok(fullSummary.body.packs.includes('battlezoo.options'));

    const listing=await send('/api/v1/campaigns/'+campaignId+
      '/catalog-items?type=feat&rarity=common&level=2&trait=fighter&featType=class',
      undefined,playerCookie,origin,'GET');
    assert.equal(listing.status,200,JSON.stringify(listing));
    assert.equal(listing.body.total,1);
    assert.equal(listing.body.items[0].name,'Demonstration Feat');

    const detailsOne=await send('/api/v1/campaigns/'+campaignId+
      '/catalog-item?uuid='+encodeURIComponent(entries[1].uuid),undefined,
      playerCookie,origin,'GET');
    assert.equal(detailsOne.status,200,JSON.stringify(detailsOne));
    assert.ok(detailsOne.body.item.description.includes('data-pf2e-uuid='));
    assert.ok(!detailsOne.body.item.description.includes('<script'));
    assert.ok(!detailsOne.body.item.description.includes('onclick='));
    assert.ok(!detailsOne.body.item.description.includes('<img'));
    assert.match(detailsOne.body.item.description,/data-pf2e-kind="damage"/);
    assert.match(detailsOne.body.item.description,/data-pf2e-kind="check"/);
    assert.match(detailsOne.body.item.description,/data-pf2e-kind="template"/);
    assert.match(detailsOne.body.item.description,/data-pf2e-action="raise-a-shield"/);
    assert.match(detailsOne.body.item.description,/data-pf2e-uuid="Compendium.pf2e.conditionitems.Item.Frightened"/);
    const actionDetail=await send('/api/v1/campaigns/'+campaignId+
      '/catalog-item?slug=raise-a-shield',undefined,playerCookie,origin,'GET');
    assert.equal(actionDetail.status,200,JSON.stringify(actionDetail));
    assert.equal(actionDetail.body.item.type,'action');
    const conditionDetail=await send('/api/v1/campaigns/'+campaignId+
      '/catalog-item?uuid='+encodeURIComponent(entries[3].uuid),
      undefined,playerCookie,origin,'GET');
    assert.equal(conditionDetail.status,200,JSON.stringify(conditionDetail));
    assert.equal(conditionDetail.body.item.type,'condition');
    const otherPack=await send('/api/v1/campaigns/'+campaignId+
      '/catalog-items?type=feat&pack=battlezoo.options',undefined,playerCookie,origin,'GET');
    assert.equal(otherPack.status,200);
    assert.equal(otherPack.body.total,1);
    assert.equal(otherPack.body.items[0].name,'Battlezoo Test');

    const fullDetails=await send('/api/v1/campaigns/'+campaignId+
      '/catalog-details',undefined,ownerCookie,origin,'GET');
    assert.equal(fullDetails.status,200);
    assert.equal(fullDetails.body.classes[0].metadata.classFeatLevels[0],2);

    // An incomplete next attempt must never erase the published snapshot.
    const attempt2=await send(importRoute+'/start',{
      expectedCount:2,packs:['pf2e.feats-srd'],variants,sourceVersions
    },'',gmOrigin,'POST',paired.body.accessToken);
    assert.equal(attempt2.status,201);
    const incomplete=await send(importRoute+'/batch',{
      snapshotId:attempt2.body.snapshotId,batchNumber:0,items:[entries[1]]
    },'',gmOrigin,'POST',paired.body.accessToken);
    assert.equal(incomplete.status,201);
    const refused=await send(importRoute+'/commit',{
      snapshotId:attempt2.body.snapshotId
    },'',gmOrigin,'POST',paired.body.accessToken);
    assert.equal(refused.status,409);
    const afterFail=await send('/api/v1/campaigns/'+campaignId+'/catalog-summary',
      undefined,playerCookie,origin,'GET');
    assert.equal(afterFail.body.snapshotId,started.body.snapshotId);

    const wrongOrigin=await send('/api/v1/bridge/'+integrationId+'/refresh',
      {refreshToken:paired.body.refreshToken},'','https://untrusted.test.invalid');
    assert.equal(wrongOrigin.status,403);

    const refreshed=await send('/api/v1/bridge/'+integrationId+'/refresh',
      {refreshToken:paired.body.refreshToken},'',gmOrigin);
    assert.equal(refreshed.status,200,JSON.stringify(refreshed));
    assert.ok(refreshed.body.refreshToken && refreshed.body.refreshToken!==paired.body.refreshToken);

    const replay=await send('/api/v1/bridge/'+integrationId+'/refresh',
      {refreshToken:paired.body.refreshToken},'',gmOrigin);
    assert.equal(replay.status,401);

    const revoked=await send('/api/v1/bridge/'+integrationId+'/refresh',
      {refreshToken:refreshed.body.refreshToken},'',gmOrigin);
    assert.equal(revoked.status,401);

    const revokeSite=await send('/api/v1/integrations/'+integrationId+'/revoke',{},ownerCookie);
    assert.equal(revokeSite.status,200,JSON.stringify(revokeSite));
  } finally {
    child.kill('SIGTERM');
    rmSync(temp,{recursive:true,force:true});
  }
});
