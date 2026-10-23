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
  const child=spawn(process.execPath,['build'],{
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
    assert.match(output,/Starting web v0\\.2\\.1/,'Boot log should include package version');
    assert.match(output,/Source fingerprint: [a-f0-9]{16}/,
      'Boot log should include a source identifier');
    const health=await send('/health',undefined,'',origin,'GET');
    assert.equal(health.status,200);
    assert.equal(health.body.version,'0.2.1');
    assert.match(health.body.sourceFingerprint,/^[a-f0-9]{16}$/);
    assert.ok(health.body.builtAt);


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
      {displayName:'New Player'},ownerCookie);
    assert.equal(newPlayer.status,201,JSON.stringify(newPlayer));
    assert.ok(newPlayer.body.inviteCode && newPlayer.body.inviteCode.length>=40);

    const activation=await send('/api/v1/join/redeem',{
      code:newPlayer.body.inviteCode,username:'new-player',
      password:'very-long-test-password-123'
    });
    assert.equal(activation.status,201,JSON.stringify(activation));
    const playerCookie=activation.cookie;
    const playerMe=await send('/api/v1/me',undefined,playerCookie,origin,'GET');
    assert.equal(playerMe.status,200,JSON.stringify(playerMe));
    assert.ok(playerMe.body.campaigns.some(x=>x.id===campaignId));

    const reusedInvitation=await send('/api/v1/join/redeem',{
      code:newPlayer.body.inviteCode,username:'other',
      password:'very-long-test-password-123'
    });
    assert.equal(reusedInvitation.status,400);

    const existingSearch=await send('/api/v1/users?q=New%20Player',undefined,ownerCookie,origin,'GET');
    assert.equal(existingSearch.status,200,JSON.stringify(existingSearch));
    assert.ok(existingSearch.body.users.some(u=>u.username==='new-player'));
    const existingAdd=await send('/api/v1/campaigns/'+campaignId+'/members',
      {existingUserId:newPlayer.body.userId},ownerCookie);
    assert.equal(existingAdd.status,200);
    assert.equal(existingAdd.body.alreadyMember,true);

    const preview=await send('/api/v1/bridge/'+integrationId+'/catalog-preview',{
      schemaVersion:1,snapshotId:randomUUID(),
      sourceVersions:{systemId:'pf2e',systemVersion:'8.6.1'},
      classes:[{uuid:'Compendium.pf2e.classes.Item.Fighter',name:'Fighter',classFeatLevels:[2,4]}],
      feats:[{uuid:'Compendium.pf2e.feats-srd.Item.Demo',name:'Demonstration Feat',level:2}]
    },'',gmOrigin,'POST',paired.body.accessToken);
    assert.equal(preview.status,201,JSON.stringify(preview));

    const catalog=await send('/api/v1/campaigns/'+campaignId+'/catalog-preview',
      undefined,playerCookie,origin,'GET');
    assert.equal(catalog.status,200,JSON.stringify(catalog));
    assert.equal(catalog.body.classes.length,1);

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
