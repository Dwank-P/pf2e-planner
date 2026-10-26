import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, randomInt, randomUUID } from 'node:crypto';
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
    const raw=await response.text();
    let payload={};
    try{payload=JSON.parse(raw);}catch{if(raw)payload={text:raw.slice(0,200)};}
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
    assert.match(output,/Starting web v0\.18\.1/,'Boot log should include package version');
    assert.match(output,/Source fingerprint: [a-f0-9]{16}/,
      'Boot log should include a source identifier');
    const health=await send('/health',undefined,'',origin,'GET');
    assert.equal(health.status,200);
    assert.equal(health.body.version,'0.18.1');
    assert.match(health.body.sourceFingerprint,/^[a-f0-9]{16}$/);
    assert.ok(health.body.builtAt);


    const check=await send('/api/v1/bridge/status',undefined,'',
      'https://a-foundry-world.example','GET');
    assert.equal(check.status,200,JSON.stringify(check));
    assert.equal(check.body.service,'pf2e-planner-web');
    assert.equal(check.body.version,'0.18.1');
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
    assert.ok(newPlayer.body.joinUrl.endsWith('/join?'+newPlayer.body.inviteCode),'The invitation is a link with the code');

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



    // v0.6.1 complete staged catalog: explicit variant rules, metadata, html and links.
    const importRoute='/api/v1/bridge/'+integrationId+'/catalog-import';
    const variants={
      freeArchetype:true,dualClass:true,ancestralParagon:false,
      gradualAbilityBoosts:false,automaticBonusProgression:'noABP'
    };
    const sourceVersions={
      worldId:'test-world',systemId:'pf2e',systemVersion:'8.6.1',levelerVersion:'3.8.12'
    };
    const packs=['pf2e.classes','pf2e.feats-srd',
      'pf2e.conditionitems','pf2e.actionspf2e','battlezoo.options',
      'pf2e.ancestries','pf2e.heritages','pf2e.backgrounds','pf2e.spells'];
    const counts={'pf2e.classes':2,'pf2e.feats-srd':2,
      'pf2e.conditionitems':1,'pf2e.actionspf2e':1,'battlezoo.options':1,
      'pf2e.ancestries':1,'pf2e.heritages':3,'pf2e.backgrounds':2,'pf2e.spells':2};
    const packDigests=Object.fromEntries(packs.map((p,index)=>[
      p,{sha256:(index+1).toString(16).padStart(64,'0'),count:counts[p]}
    ]));
    const started=await send(importRoute+'/start',{
      expectedCount:15,packs,variants,sourceVersions,packDigests,reusePacks:[]
    },'',gmOrigin,'POST',paired.body.accessToken);
    assert.equal(started.status,201,JSON.stringify(started));
    const entries=[
      {uuid:'Compendium.pf2e.classes.Item.Fighter',type:'class',name:'Fighter',
        img:'systems/pf2e/icons/classes/fighter.webp',level:1,classFeatLevels:[2,4,6],description:'<p>Fighter</p>',
        levelerProgression:{
          provider:'pf2e-leveler',version:'3.12.3',slug:'fighter',
          levels:{
            2:[{type:'classFeat'},{type:'skillFeat'},{type:'archetypeFeat'},{type:'dualClassFeat'}],
            3:[{type:'skillIncrease'},{type:'generalFeat'}],
            5:[{type:'abilityBoosts',count:4}]
          },
          spellcasting:null
        }},
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
        description:'<p>A selected third-party feat.</p>'},
      {uuid:'Compendium.pf2e.ancestries.Item.Anadi',type:'ancestry',
        name:'Anadi',slug:'anadi',description:'<p>Anadi ancestry</p>'},
      {uuid:'Compendium.pf2e.heritages.Item.Adaptive',type:'heritage',
        name:'Adaptive Anadi',ancestrySlug:'anadi',
        ancestryUuid:'Compendium.pf2e.ancestries.Item.Anadi',versatile:false},
      {uuid:'Compendium.pf2e.heritages.Item.Merfolk',type:'heritage',
        name:'Abyssal Merfolk',ancestrySlug:'merfolk',
        ancestryUuid:'Compendium.pf2e.ancestries.Item.Merfolk',versatile:false},
      {uuid:'Compendium.pf2e.heritages.Item.Aiuvarin',type:'heritage',
        name:'Aiuvarin',versatile:true},
      {uuid:'Compendium.pf2e.backgrounds.Item.Strength',type:'background',
        name:'Strong Scholar',
        boostChoices:[['str','con'],['str','dex','con','int','wis','cha']],
        trainedSkills:['athletics'],grantedFeats:['Hefty Hauler']},
      {uuid:'Compendium.pf2e.backgrounds.Item.Intellect',type:'background',
        name:'Clever Scholar',
        boostChoices:[['int','wis'],['str','dex','con','int','wis','cha']],
        trainedSkills:['society'],grantedFeats:['Multilingual']},
      {uuid:'Compendium.pf2e.spells.Item.Soothe',type:'spell',name:'Soothe',level:1,
        spellRank:1,spellTraditions:['occult'],traits:[]},
      {uuid:'Compendium.pf2e.spells.Item.TelekineticProjectile',type:'spell',
        name:'Telekinetic Projectile',level:1,spellRank:1,
        spellTraditions:['occult','arcane'],traits:['cantrip']},
      {uuid:'Compendium.pf2e.classes.Item.Bard',type:'class',name:'Bard',
        keyAbility:['cha'],spellcasting:true,spellTradition:'occult',
        classFeatLevels:[2,4,6],skillFeatLevels:[2,4,6],
        savingThrows:{fortitude:1,reflex:1,will:2}}
    ];
    const batch=await send(importRoute+'/batch',{
      snapshotId:started.body.snapshotId,batchNumber:0,items:entries
    },'',gmOrigin,'POST',paired.body.accessToken);
    assert.equal(batch.status,201,JSON.stringify(batch));
    assert.equal(batch.body.staged,15);

    const published=await send(importRoute+'/commit',{
      snapshotId:started.body.snapshotId
    },'',gmOrigin,'POST',paired.body.accessToken);
    assert.equal(published.status,201,JSON.stringify(published));
    assert.equal(published.body.accepted,15);

    // Item icons: the Bridge uploads the files the world's catalog references.
    const iconRoute='/api/v1/bridge/'+integrationId+'/icons';
    const iconPath='systems/pf2e/icons/classes/fighter.webp';
    const missingIcons=await send(iconRoute+'/missing',{},'',gmOrigin,'POST',paired.body.accessToken);
    assert.equal(missingIcons.status,200,JSON.stringify(missingIcons));
    assert.deepEqual(missingIcons.body.missing,[iconPath]);
    const webp=Buffer.concat([Buffer.from('RIFF'),Buffer.alloc(4),Buffer.from('WEBPVP8 '),Buffer.alloc(8)]);
    const webpSha=createHash('sha256').update(webp).digest('hex');
    const unknownImage=await send(iconRoute+'/link',{icons:[{path:iconPath,sha256:webpSha}]},'',gmOrigin,'POST',paired.body.accessToken);
    assert.equal(unknownImage.status,200,JSON.stringify(unknownImage));
    assert.deepEqual(unknownImage.body,{linked:0,needed:[iconPath]},'New images must be uploaded');
    const iconUpload=await send(iconRoute+'/batch',{icons:[
      {path:iconPath,data:webp.toString('base64')},
      {path:'systems/pf2e/icons/not-in-catalog.webp',data:webp.toString('base64')},
    ]},'',gmOrigin,'POST',paired.body.accessToken);
    assert.equal(iconUpload.status,201,JSON.stringify(iconUpload));
    assert.equal(iconUpload.body.stored,1);
    assert.deepEqual(iconUpload.body.rejected,['systems/pf2e/icons/not-in-catalog.webp'],'Only catalog icons are stored');
    const fakeIcon=await send(iconRoute+'/batch',{icons:[{path:iconPath,data:Buffer.from('<script>').toString('base64')}]},
      '',gmOrigin,'POST',paired.body.accessToken);
    assert.equal(fakeIcon.body.stored,0,'Bytes must match the image type');
    const noneMissing=await send(iconRoute+'/missing',{},'',gmOrigin,'POST',paired.body.accessToken);
    assert.deepEqual(noneMissing.body.missing,[]);
    const knownImage=await send(iconRoute+'/link',{icons:[{path:iconPath,sha256:webpSha},
      {path:'systems/pf2e/icons/not-in-catalog.webp',sha256:webpSha}]},'',gmOrigin,'POST',paired.body.accessToken);
    assert.deepEqual(knownImage.body,{linked:1,needed:[]},'Images the site holds are linked, not re-uploaded');
    const iconResponse=await fetch(origin+'/api/v1/campaigns/'+campaignId+'/icons/'+iconPath,{headers:{cookie:playerCookie}});
    assert.equal(iconResponse.status,200);
    assert.equal(iconResponse.headers.get('content-type'),'image/webp');
    assert.match(iconResponse.headers.get('cache-control')??'',/private/);
    assert.equal(Buffer.from(await iconResponse.arrayBuffer()).compare(webp),0);
    const iconAnonymous=await fetch(origin+'/api/v1/campaigns/'+campaignId+'/icons/'+iconPath);
    assert.equal(iconAnonymous.status,401,'Icons are for campaign members');

    const fullSummary=await send('/api/v1/campaigns/'+campaignId+'/catalog-summary',
      undefined,playerCookie,origin,'GET');
    assert.equal(fullSummary.status,200,JSON.stringify(fullSummary));
    assert.equal(fullSummary.body.complete,true);
    assert.equal(fullSummary.body.variants.freeArchetype,true);
    assert.equal(fullSummary.body.variants.dualClass,true);
    assert.equal(fullSummary.body.totals.classes,2);
    assert.equal(fullSummary.body.totals.feats,3);
    assert.equal(fullSummary.body.totals.savedItems,15);
    const fighterProgression=await send('/api/v1/campaigns/'+campaignId+
      '/catalog-item?uuid='+encodeURIComponent(entries[0].uuid),
      undefined,playerCookie,origin,'GET');
    assert.equal(fighterProgression.status,200);
    assert.equal(fighterProgression.body.item.metadata.levelerProgression.provider,'pf2e-leveler');
    assert.equal(fighterProgression.body.item.metadata.levelerProgression.levels['5'][0].count,4);
    assert.ok(fullSummary.body.itemTypes.some(x=>x.type==='condition'&&x.count===1));
    assert.ok(fullSummary.body.itemTypes.some(x=>x.type==='action'&&x.count===1));
    assert.ok(fullSummary.body.packs.includes('battlezoo.options'));

    const heritages=await send('/api/v1/campaigns/'+campaignId+
      '/catalog-items?type=heritage&ancestryUuid=Compendium.pf2e.ancestries.Item.Anadi'+
      '&ancestrySlug=anadi',undefined,playerCookie,origin,'GET');
    assert.equal(heritages.status,200,JSON.stringify(heritages));
    assert.equal(heritages.body.total,2,'Anadi and versatile only, no merfolk heritage');
    assert.ok(!heritages.body.items.some(x=>x.name==='Abyssal Merfolk'));
    const incompatible=await send('/api/v1/campaigns/'+campaignId+
      '/catalog-items?type=heritage&ancestryUuid=Compendium.pf2e.ancestries.Item.Anadi'+
      '&ancestrySlug=anadi&showAll=true',undefined,playerCookie,origin,'GET');
    assert.equal(incompatible.body.total,3);
    const boosted=await send('/api/v1/campaigns/'+campaignId+
      '/catalog-items?type=background&bgBoosts=str,con',undefined,
      playerCookie,origin,'GET');
    assert.equal(boosted.status,200,JSON.stringify(boosted));
    assert.equal(boosted.body.total,1,'OR matching str or con; free boost must not qualify alone');
    const bgSkill=await send('/api/v1/campaigns/'+campaignId+
      '/catalog-items?type=background&bgSkill=society&bgFeat=multilingual',
      undefined,playerCookie,origin,'GET');
    assert.equal(bgSkill.status,200,JSON.stringify(bgSkill));
    assert.equal(bgSkill.body.total,1);
    const spells=await send('/api/v1/campaigns/'+campaignId+
      '/catalog-items?type=spell&tradition=occult&spellRank=1',
      undefined,playerCookie,origin,'GET');
    assert.equal(spells.status,200,JSON.stringify(spells));
    assert.equal(spells.body.total,1,'Cantrips should not appear in ranked spell selection');
    assert.equal(spells.body.items[0].name,'Soothe');
    const cantrips=await send('/api/v1/campaigns/'+campaignId+
      '/catalog-items?type=spell&tradition=occult&spellRank=0',
      undefined,playerCookie,origin,'GET');
    assert.equal(cantrips.status,200);
    assert.equal(cantrips.body.total,1);
    assert.equal(cantrips.body.items[0].name,'Telekinetic Projectile');

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

    // v0.4 character workshop: private saved builds and optimistic revisions.
    const charRoute='/api/v1/campaigns/'+campaignId+'/characters';
    const created=await send(charRoute,{name:'Guardian / Fighter',level:1,build:{}},playerCookie);
    assert.equal(created.status,201,JSON.stringify(created));
    const charId=created.body.character.id;
    assert.equal(created.body.character.build.modifiers.wis,0);
    const ownCharacters=await send(charRoute,undefined,playerCookie,origin,'GET');
    assert.equal(ownCharacters.status,200);
    assert.equal(ownCharacters.body.characters.length,1);
    const charDetail=charRoute+'/'+charId;
    const saved=await send(charDetail,{
      name:'Guardian / Fighter',level:10,revision:created.body.character.revision,
      build:{
        classUuid:entries[0].uuid,
        feats:{'class-2':entries[1].uuid,'archetype-4':entries[2].uuid},
        equipment:[entries[4].uuid],
        abilityBoosts:{'ancestry-boost-1':['str','dex'],
          'background-1':['str','con'],
          'class-1':['str'],'free-1':['str','dex','con','wis'],
          'level-5':['str','dex','con','wis']},
        skillIncreases:{'skill-increase-3':'athletics'},
        spells:{'rank-1':[entries[12].uuid],cantrip:[entries[13].uuid]},
        modifiers:{str:4,dex:0,con:3,int:0,wis:2,cha:0}
      }
    },playerCookie,origin,'PATCH');
    assert.equal(saved.status,200,JSON.stringify(saved));
    assert.equal(saved.body.character.level,10);
    assert.deepEqual(saved.body.character.build.abilityBoosts['level-5'],['str','dex','con','wis']);
    assert.equal(saved.body.character.build.skillIncreases['skill-increase-3'],'athletics');
    assert.equal(saved.body.character.build.spells['1:rank-1'][0],entries[12].uuid);
    assert.equal(saved.body.character.build.feats['class-2'],entries[1].uuid);
    const existing=await send(charDetail,undefined,playerCookie,origin,'GET');
    assert.equal(existing.status,200);
    assert.equal(existing.body.character.revision,2);
    const stale=await send(charDetail,{
      name:'Clobbered',level:10,revision:1,build:{}
    },playerCookie,origin,'PATCH');
    assert.equal(stale.status,409,'Concurrent edits must not be overwritten');
    const unknownSelection=await send(charDetail,{
      name:'Invalid',level:10,revision:2,
      build:{feats:{'class-2':'Compendium.pf2e.not-synced.Item.NoSuchFeat'}}
    },playerCookie,origin,'PATCH');
    assert.equal(unknownSelection.status,400,'Unimported item selections must be rejected');

    // v1: whole catalog for browser search, and whole-document saves from the wizard.
    const bundleRoute='/api/v1/campaigns/'+campaignId+'/catalog-bundle';
    const bundle=await send(bundleRoute,undefined,playerCookie,origin,'GET');
    assert.equal(bundle.status,200,JSON.stringify(bundle).slice(0,300));
    assert.ok(bundle.body.items.length>0);
    assert.equal(bundle.body.items[0].description,undefined,'Rules text is fetched per item, not in the bundle');
    const unchanged=await send(bundleRoute+'?known='+bundle.body.sha256,undefined,playerCookie,origin,'GET');
    assert.equal(unchanged.body.unchanged,true);
    const current=existing.body.character;
    const docRoute=charDetail+'/document';
    const docSaved=await send(docRoute,{name:current.name,level:current.level,revision:current.revision,
      document:{leveler:current.leveler,planner:current.planner}},playerCookie,origin,'PUT');
    assert.equal(docSaved.status,200,JSON.stringify(docSaved));
    assert.equal(docSaved.body.character.revision,current.revision+1);
    assert.equal(docSaved.body.character.leveler.plan.levels[2].classFeats[0].uuid,entries[1].uuid);
    const docUnknown=await send(docRoute,{name:current.name,level:current.level,revision:current.revision+1,
      document:{leveler:{creation:{version:1,class:{uuid:'Compendium.pf2e.not-synced.Item.Nope'}},plan:null},planner:{}}},
      playerCookie,origin,'PUT');
    assert.equal(docUnknown.status,400,'Documents may not add unsynced items');
    const docStale=await send(docRoute,{name:current.name,level:current.level,revision:current.revision,
      document:{leveler:current.leveler,planner:current.planner}},playerCookie,origin,'PUT');
    assert.equal(docStale.status,409);
    const wish={id:'w1abc',uuid:entries[1].uuid,name:'Planned item',type:'equipment',level:2,price:4.5,consumable:false,
      targetLevel:8,quantity:2,status:'wanted',notes:'For the dragon'};
    const docWish=await send(docRoute,{name:current.name,level:current.level,revision:current.revision+1,
      document:{leveler:current.leveler,planner:{...current.planner,wishlist:[wish]}}},playerCookie,origin,'PUT');
    assert.equal(docWish.status,200,JSON.stringify(docWish));
    assert.deepEqual(docWish.body.character.planner.wishlist,[wish],'The equipment plan round-trips');
    const badWish=await send(docRoute,{name:current.name,level:current.level,revision:current.revision+2,
      document:{leveler:current.leveler,planner:{wishlist:[{...wish,targetLevel:40}]}}},playerCookie,origin,'PUT');
    assert.equal(badWish.status,400,'Wishlist target levels are bounded');
    const gmCharacters=await send(charRoute,undefined,ownerCookie,origin,'GET');
    assert.equal(gmCharacters.status,200);
    assert.equal(gmCharacters.body.characters.length,1);
    const facets=await send('/api/v1/campaigns/'+campaignId+'/catalog-filters',
      undefined,playerCookie,origin,'GET');
    assert.equal(facets.status,200,JSON.stringify(facets));
    assert.ok(facets.body.types.some(x=>x.label==='feat'));
    const noHigherLevel=await send('/api/v1/campaigns/'+campaignId+
      '/catalog-items?type=feat&maxLevel=2',
      undefined,playerCookie,origin,'GET');
    assert.equal(noHigherLevel.status,200);
    assert.equal(noHigherLevel.body.total,2,'At level 2, level-4 feat is excluded');
    const deleted=await send(charDetail,{},playerCookie,origin,'DELETE');
    assert.equal(deleted.status,200);
    const afterDelete=await send(charDetail,undefined,playerCookie,origin,'GET');
    assert.equal(afterDelete.status,404);

    // Explicit import from a Foundry world actor opens a real website
    // build, and repeated imports preserve website edits by default.
    const actorRoute='/api/v1/bridge/'+integrationId+'/characters/import';
    const actorPayload={
      actorId:'ActorAlpha012345',name:'Kineticist Test',level:8,
      build:{
        classUuid:entries[0].uuid,
        feats:{'class-2':entries[1].uuid,
          'general-3':'Compendium.unselected.feats.Item.Missing'},
        equipment:[entries[4].uuid],
        abilityBoosts:{'free-1':['str','dex','con','wis']},
        creationChoices:{subclass:{name:'Test Subclass'},
          kineticGateMode:'single-gate',skills:['athletics','arcana']},
        modifiers:{str:3,dex:2,con:4,int:0,wis:1,cha:0}
      }
    };
    const imported=await send(actorRoute,actorPayload,'',gmOrigin,'POST',paired.body.accessToken);
    assert.equal(imported.status,201,JSON.stringify(imported));
    assert.equal(imported.body.skipped,1);
    assert.match(imported.body.editorPath,/^\/campaigns\/.+\/characters\/.+$/);
    const importedDetails=await send('/api/v1/campaigns/'+campaignId+
      '/characters/'+imported.body.characterId,undefined,ownerCookie,origin,'GET');
    assert.equal(importedDetails.status,200);
    assert.equal(importedDetails.body.character.name,'Kineticist Test');
    assert.equal(importedDetails.body.character.build.creationChoices.subclass.name,'Test Subclass');
    assert.deepEqual(importedDetails.body.character.build.abilityBoosts['free-1'],
      ['str','dex','con','wis']);
    assert.deepEqual(Object.keys(importedDetails.body.character.build.feats),['class-2']);
    const playerCannotRead=await send('/api/v1/campaigns/'+campaignId+
      '/characters/'+imported.body.characterId,undefined,playerCookie,origin,'GET');
    assert.equal(playerCannotRead.status,403);
    const owners=await send('/api/v1/bridge/'+integrationId+'/characters/owners',
      {},'',gmOrigin,'POST',paired.body.accessToken);
    assert.equal(owners.status,200,JSON.stringify(owners));
    assert.ok(owners.body.members.some(member=>member.id===newPlayer.body.userId));
    const playerOwned=await send(actorRoute,{...actorPayload,
      actorId:'ActorBeta0123456',name:'PC assigned to player',
      ownerUserId:newPlayer.body.userId},'',gmOrigin,'POST',paired.body.accessToken);
    assert.equal(playerOwned.status,201,JSON.stringify(playerOwned));
    const playerOwnedRead=await send('/api/v1/campaigns/'+campaignId+
      '/characters/'+playerOwned.body.characterId,undefined,playerCookie,origin,'GET');
    assert.equal(playerOwnedRead.status,200);
    // Bridge 0.15 sends the actor itself; its boosts win over stale Leveler wizard data.
    const fromActor=await send(actorRoute,{actorId:'ActorGamma012345',name:'Sheet-built Anadi',level:3,
      build:{modifiers:{str:0,dex:0,con:0,int:0,wis:0,cha:0}},
      leveler:{creation:{version:1,boosts:{free:['str','dex','con','wis']}},plan:null},
      actor:{name:'Sheet-built Anadi',level:3,class:{uuid:entries[0].uuid,name:'Fighter'},
        ancestry:{uuid:'Compendium.pf2e.ancestries.Item.Anadi',name:'Anadi'},
        heritage:{uuid:'Compendium.pf2e.heritages.Item.Adaptive',name:'Adaptive Anadi'},
        abilities:{breakdown:{ancestryFree:[],backgroundBoosts:[],classBoosts:['str'],
          mapLevelledBoosts:{1:['str','con','int','cha']}}},
        proficiencies:{athletics:2},
        feats:[[{uuid:entries[1].uuid,name:'Demonstration Feat'},null,'Class Feat',2,'Class Feat 2']],
        spellCasters:[],equipment:[]}},'',gmOrigin,'POST',paired.body.accessToken);
    assert.equal(fromActor.status,201,JSON.stringify(fromActor));
    const fromActorRead=await send('/api/v1/campaigns/'+campaignId+'/characters/'+fromActor.body.characterId,
      undefined,ownerCookie,origin,'GET');
    assert.deepEqual(fromActorRead.body.character.leveler.creation.boosts.free,['str','con','int','cha']);
    assert.equal(fromActorRead.body.character.leveler.creation.ancestry.name,'Anadi');
    assert.equal(fromActorRead.body.character.leveler.plan.levels[2].classFeats[0].uuid,entries[1].uuid);
    // Pull from Planner never steals an actor's link silently; it checks, then commits after Foundry writes.
    const delta=await send(actorRoute,{...actorPayload,actorId:'ActorDelta0123456',name:'Delta'},'',gmOrigin,'POST',paired.body.accessToken);
    assert.equal(delta.status,201,JSON.stringify(delta));
    const exportRoute='/api/v1/bridge/'+integrationId+'/characters/export';
    const linkRoute='/api/v1/bridge/'+integrationId+'/characters/list';
    const loose=await send('/api/v1/campaigns/'+campaignId+'/characters',{name:'Unlinked build',level:1,build:{}},ownerCookie);
    const looseId=loose.body.character.id;
    const taken=await send(exportRoute,{characterId:looseId,actorId:'ActorDelta0123456',link:true},'',gmOrigin,'POST',paired.body.accessToken);
    assert.equal(taken.status,409);
    assert.equal(taken.body.message,'actor_linked_to_other_character');
    const linkCheck=await send(exportRoute,{characterId:looseId,actorId:'ActorDelta0123456',link:true,relink:true,commit:false},
      '',gmOrigin,'POST',paired.body.accessToken);
    assert.equal(linkCheck.status,200);assert.equal(linkCheck.body.linked,false);
    const linksAfterCheck=(await send(linkRoute,{},'',gmOrigin,'POST',paired.body.accessToken)).body.characters;
    assert.equal(linksAfterCheck.find(c=>c.id===delta.body.characterId).linkedActorId,'ActorDelta0123456','a check changes nothing');
    const moved=await send(exportRoute,{characterId:looseId,actorId:'ActorDelta0123456',link:true,relink:true,commit:true},
      '',gmOrigin,'POST',paired.body.accessToken);
    assert.equal(moved.status,200);
    const linksAfterMove=(await send(linkRoute,{},'',gmOrigin,'POST',paired.body.accessToken)).body.characters;
    assert.equal(linksAfterMove.find(c=>c.id===looseId).linkedActorId,'ActorDelta0123456');
    assert.equal(linksAfterMove.find(c=>c.id===delta.body.characterId).linkedActorId??null,null,'the previous build is unlinked, visibly');
    assert.equal(playerOwnedRead.body.character.name,'PC assigned to player');
    const secondImport=await send(actorRoute,{...actorPayload,name:'Overwrite prohibited'},
      '',gmOrigin,'POST',paired.body.accessToken);
    assert.equal(secondImport.status,200);
    assert.equal(secondImport.body.existing,true);
    assert.equal(secondImport.body.updated,false);
    assert.equal(secondImport.body.characterId,imported.body.characterId);
    const forceUpdate=await send(actorRoute,{...actorPayload,name:'Updated from Foundry',
      overwrite:true},'',gmOrigin,'POST',paired.body.accessToken);
    assert.equal(forceUpdate.status,200);
    assert.equal(forceUpdate.body.updated,true);

    // A repeat with the same pack hashes reuses all 15 stored entries
    // without uploading even one Item or resetting characters.
    const syncStatus=await send(importRoute+'/status',{},'',gmOrigin,'POST',paired.body.accessToken);
    assert.equal(syncStatus.status,200);
    assert.equal(syncStatus.body.packDigests['pf2e.classes'].count,2);
    const reuse=await send(importRoute+'/start',{
      expectedCount:15,packs,variants:{...variants,ancestralParagon:true},
      sourceVersions,packDigests,reusePacks:packs
    },'',gmOrigin,'POST',paired.body.accessToken);
    assert.equal(reuse.status,201,JSON.stringify(reuse));
    assert.equal(reuse.body.reused,15);
    const reuseCommit=await send(importRoute+'/commit',{
      snapshotId:reuse.body.snapshotId
    },'',gmOrigin,'POST',paired.body.accessToken);
    assert.equal(reuseCommit.status,201,JSON.stringify(reuseCommit));
    assert.equal(reuseCommit.body.accepted,15);
    const stillPublished=await send('/api/v1/campaigns/'+campaignId+'/catalog-summary',
      undefined,playerCookie,origin,'GET');
    assert.equal(stillPublished.body.snapshotId,reuse.body.snapshotId);
    assert.equal(stillPublished.body.variants.ancestralParagon,true);

    // An incomplete next attempt must never erase the published snapshot.
    const attempt2=await send(importRoute+'/start',{
      expectedCount:2,packs:['pf2e.feats-srd'],variants,sourceVersions,
      packDigests:{'pf2e.feats-srd':{sha256:'f'.repeat(64),count:2}},reusePacks:[]
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
    assert.equal(afterFail.body.snapshotId,reuse.body.snapshotId);

    // v0.13: character sharing.
    const sharedChar=await send(charRoute,{name:'Shared Hero',level:1,build:{}},playerCookie);
    assert.equal(sharedChar.status,201,JSON.stringify(sharedChar));
    const sharedDetail=charRoute+'/'+sharedChar.body.character.id,sharedDoc=sharedDetail+'/document';
    const secondInvite=await send('/api/v1/campaigns/'+campaignId+'/members',{},ownerCookie);
    const secondActivation=await send('/api/v1/join/redeem',{code:secondInvite.body.inviteCode,
      username:'second-player',password:'another-long-test-password'});
    assert.equal(secondActivation.status,201,JSON.stringify(secondActivation));
    const secondCookie=secondActivation.cookie,secondId=secondInvite.body.userId;
    const hiddenList=await send(charRoute,undefined,secondCookie,origin,'GET');
    assert.equal(hiddenList.body.characters.length,0,'Private characters stay private');
    assert.equal((await send(sharedDetail,undefined,secondCookie,origin,'GET')).status,403);
    const shareRoute=sharedDetail+'/sharing';
    const viewShare=await send(shareRoute,{visibility:'campaign-view'},playerCookie,origin,'PUT');
    assert.equal(viewShare.status,200,JSON.stringify(viewShare));
    const sharedList=await send(charRoute,undefined,secondCookie,origin,'GET');
    assert.equal(sharedList.body.characters.length,1);
    assert.equal(sharedList.body.characters[0].access.edit,false);
    const viewed=await send(sharedDetail,undefined,secondCookie,origin,'GET');
    assert.equal(viewed.status,200);
    assert.equal(viewed.body.character.access.edit,false);
    assert.equal(viewed.body.character.sharing,undefined,'Viewers do not see the share list');
    const viewerSave=await send(sharedDoc,{name:viewed.body.character.name,level:viewed.body.character.level,
      revision:viewed.body.character.revision,document:{leveler:viewed.body.character.leveler,planner:viewed.body.character.planner}},
      secondCookie,origin,'PUT');
    assert.equal(viewerSave.status,403,'View-only characters cannot be saved');
    assert.equal((await send(shareRoute,{visibility:'campaign-edit'},secondCookie,origin,'PUT')).status,403);
    const shareOptions=await send(shareRoute,undefined,playerCookie,origin,'GET');
    assert.ok(shareOptions.body.members.some(m=>m.id===secondId));
    assert.equal((await send(shareRoute,{visibility:'custom',shares:[{userId:randomUUID(),access:'edit'}]},
      playerCookie,origin,'PUT')).status,400,'Only campaign members can be chosen');
    const editShare=await send(shareRoute,{visibility:'custom',shares:[{userId:secondId,access:'edit'}]},playerCookie,origin,'PUT');
    assert.equal(editShare.status,200,JSON.stringify(editShare));
    assert.deepEqual(editShare.body.sharing.shares.map(s=>[s.userId,s.access]),[[secondId,'edit']]);
    const editorSave=await send(sharedDoc,{name:viewed.body.character.name,level:viewed.body.character.level,
      revision:viewed.body.character.revision,document:{leveler:viewed.body.character.leveler,planner:viewed.body.character.planner}},
      secondCookie,origin,'PUT');
    assert.equal(editorSave.status,200,JSON.stringify(editorSave));
    await send(shareRoute,{visibility:'private'},playerCookie,origin,'PUT');
    assert.equal((await send(sharedDetail,undefined,secondCookie,origin,'GET')).status,403);

    // v0.13: one world opened from a second Foundry address.
    const otherOrigin='https://other-domain.test.invalid';
    const preflight=await fetch(origin+'/api/v1/bridge/'+integrationId+'/authorize',{method:'OPTIONS',
      headers:{origin:otherOrigin,'access-control-request-method':'POST'}});
    assert.equal(preflight.status,204);
    assert.equal(preflight.headers.get('access-control-allow-origin'),otherOrigin);
    const syncPreflight=await fetch(origin+'/api/v1/bridge/'+integrationId+'/catalog-import/status',{method:'OPTIONS',
      headers:{origin:otherOrigin,'access-control-request-method':'POST'}});
    assert.equal(syncPreflight.status,403,'Unknown addresses cannot sync before authorizing');
    const secondCode=await send('/api/v1/pairing-codes',{},ownerCookie);
    const otherAuth=await send('/api/v1/bridge/'+integrationId+'/authorize',{code:secondCode.body.code,worldId:'test-world'},
      '',otherOrigin);
    assert.equal(otherAuth.status,201,JSON.stringify(otherAuth));
    const otherStatus=await send(importRoute+'/status',{},'',otherOrigin,'POST',otherAuth.body.accessToken);
    assert.equal(otherStatus.status,200,JSON.stringify(otherStatus));
    const crossed=await send(importRoute+'/status',{},'',otherOrigin,'POST',paired.body.accessToken);
    assert.equal(crossed.status,401,'A Bridge login works only from the address it was issued to');
    const originsRoute='/api/v1/integrations/'+integrationId+'/origins';
    const origins=await send(originsRoute,undefined,ownerCookie,origin,'GET');
    assert.deepEqual(origins.body.origins.map(o=>o.origin).sort(),[gmOrigin,otherOrigin].sort());
    const dropped=await send(originsRoute,{origin:otherOrigin},ownerCookie,origin,'DELETE');
    assert.equal(dropped.status,200,JSON.stringify(dropped));
    assert.equal((await send(importRoute+'/status',{},'',otherOrigin,'POST',otherAuth.body.accessToken)).status,403);
    assert.equal((await send(originsRoute,{origin:gmOrigin},ownerCookie,origin,'DELETE')).status,409,
      'The last address stays; disconnect the world instead');

    // v0.13: profile, password change and owner-issued reset links.
    const renamed=await send('/api/v1/me',{displayName:'Second Player',username:'second.player'},secondCookie,origin,'PATCH');
    assert.equal(renamed.status,200,JSON.stringify(renamed));
    assert.equal((await send('/api/v1/me',{username:'new-player'},secondCookie,origin,'PATCH')).status,409);
    assert.equal((await send('/api/v1/me/password',{currentPassword:'wrong-password-123',newPassword:'brand-new-password-456'},
      secondCookie)).status,403);
    const changed=await send('/api/v1/me/password',{currentPassword:'another-long-test-password',newPassword:'brand-new-password-456'},
      secondCookie);
    assert.equal(changed.status,200,JSON.stringify(changed));
    assert.equal((await send('/api/v1/me',undefined,secondCookie,origin,'GET')).status,401,'Other sessions are signed out');
    assert.equal((await send('/api/v1/me',undefined,changed.cookie,origin,'GET')).status,200);
    assert.equal((await send('/api/v1/users/'+secondId+'/password-reset',{},playerCookie)).status,403);
    const resetLink=await send('/api/v1/users/'+secondId+'/password-reset',{},ownerCookie);
    assert.equal(resetLink.status,201,JSON.stringify(resetLink));
    assert.ok(resetLink.body.resetUrl.endsWith('#'+resetLink.body.code));
    const resetDone=await send('/api/v1/auth/reset',{code:resetLink.body.code,password:'reset-password-789-long'});
    assert.equal(resetDone.status,200,JSON.stringify(resetDone));
    assert.equal((await send('/api/v1/auth/reset',{code:resetLink.body.code,password:'reset-password-789-long'})).status,400);
    const relogin=await send('/api/v1/auth/login',{username:'second.player',password:'reset-password-789-long'});
    assert.equal(relogin.status,200,JSON.stringify(relogin));
    const adminUsers=await send('/api/v1/admin/users',undefined,ownerCookie,origin,'GET');
    assert.ok(adminUsers.body.users.some(u=>u.username==='second.player'));

    // v0.14: reusable group invite links.
    const linksRoute='/api/v1/campaigns/'+campaignId+'/invite-links';
    assert.equal((await send(linksRoute,{},playerCookie)).status,403,'Only GMs make invite links');
    assert.equal((await send(linksRoute,{duration:{unit:'weeks',amount:1}},ownerCookie)).status,400);
    const dayLink=await send(linksRoute,{},ownerCookie);
    assert.equal(dayLink.status,201,JSON.stringify(dayLink));
    const dayCode=dayLink.body.link.url.split('/invite/')[1];
    assert.ok(Math.abs(dayLink.body.link.expiresAt-(Date.now()/1000+86400))<120,'defaults to 24 hours');
    const foreverLink=await send(linksRoute,{duration:{unit:'never'}},ownerCookie);
    assert.equal(foreverLink.body.link.expiresAt,null);
    const yearLink=await send(linksRoute,{duration:{unit:'years',amount:2}},ownerCookie);
    assert.ok(yearLink.body.link.expiresAt>Date.now()/1000+700*86400);
    const linkInfo=await send('/api/v1/invite-links/'+dayCode,undefined,'',origin,'GET');
    assert.equal(linkInfo.status,200);
    assert.equal(linkInfo.body.campaign.title,'Test World');
    const viaLink=await send('/api/v1/invite-links/'+dayCode+'/register',{username:'group-player',password:'group-player-password'});
    assert.equal(viaLink.status,201,JSON.stringify(viaLink));
    assert.equal(viaLink.body.campaignId,campaignId);
    assert.equal((await send('/api/v1/me',undefined,viaLink.cookie,origin,'GET')).body.campaigns[0].id,campaignId);
    const viaLinkAgain=await send('/api/v1/invite-links/'+dayCode+'/register',{username:'group-player-2',password:'group-player-password'});
    assert.equal(viaLinkAgain.status,201,'One link works for many people');
    const existingJoins=await send('/api/v1/invite-links/'+dayCode+'/accept',{},playerCookie);
    assert.equal(existingJoins.body.alreadyMember,true);
    const activeLinks=await send(linksRoute,undefined,ownerCookie,origin,'GET');
    assert.equal(activeLinks.body.links.find(l=>l.id===dayLink.body.link.id).uses,2);
    assert.equal((await send(linksRoute+'/'+dayLink.body.link.id,{},ownerCookie,origin,'DELETE')).status,200);
    assert.equal((await send('/api/v1/invite-links/'+dayCode,undefined,'',origin,'GET')).status,400,'Turned-off links stop working');
    assert.equal((await send('/api/v1/invite-links/'+dayCode+'/register',{username:'too-late',password:'group-player-password'})).status,400);

    // v0.13: storage report and maintenance (server owner only).
    assert.equal((await send('/api/v1/admin/storage',undefined,playerCookie,origin,'GET')).status,403);
    const storage=await send('/api/v1/admin/storage',undefined,ownerCookie,origin,'GET');
    assert.equal(storage.status,200,JSON.stringify(storage));
    assert.ok(storage.body.files.database>0);
    assert.equal(storage.body.worlds.length,1);
    assert.equal(storage.body.worlds[0].icons,1);
    // Backups: listed, made and verified, downloadable; owner only.
    assert.equal((await send('/api/v1/admin/backups',undefined,playerCookie,origin,'GET')).status,403);
    const madeBackup=await send('/api/v1/admin/backups',{},ownerCookie);
    assert.equal(madeBackup.status,201,JSON.stringify(madeBackup));
    assert.equal(madeBackup.body.backup.verified,true);
    const backupList=await send('/api/v1/admin/backups',undefined,ownerCookie,origin,'GET');
    assert.equal(backupList.status,200);
    assert.ok(backupList.body.backups.some(b=>b.name===madeBackup.body.backup.name));
    const download=await fetch(origin+'/api/v1/admin/backups/'+madeBackup.body.backup.name,{headers:{cookie:ownerCookie}});
    assert.equal(download.status,200);
    assert.equal(Buffer.from(await download.arrayBuffer()).subarray(0,15).toString(),'SQLite format 3');
    for(const action of ['checkpoint','cleanup','optimize']){
      const done=await send('/api/v1/admin/storage',{action},ownerCookie);
      assert.equal(done.status,200,action+' '+JSON.stringify(done));
    }

    // v0.13: Pathbuilder import (pasted JSON; fetching by id needs pathbuilder2e.com).
    const pbRoute=charRoute+'/import-pathbuilder';
    assert.equal((await send(pbRoute,{pathbuilderId:'abc'},playerCookie)).status,400);
    const pbImport=await send(pbRoute,{json:{success:true,build:{name:'From Pathbuilder',class:'Fighter',level:2,
      ancestry:'Anadi',heritage:'Adaptive Anadi',background:'Nonexistent Background',
      feats:[['Demonstration Feat',null,'Class Feat',2]],proficiencies:{athletics:2},languages:[]}}},playerCookie);
    assert.equal(pbImport.status,201,JSON.stringify(pbImport));
    assert.equal(pbImport.body.character.name,'From Pathbuilder');
    assert.equal(pbImport.body.character.level,2);
    assert.ok(pbImport.body.report.missing.some(m=>m.name==='Nonexistent Background'));
    const pbCharacter=await send(charRoute+'/'+pbImport.body.character.id,undefined,playerCookie,origin,'GET');
    assert.equal(pbCharacter.body.character.leveler.creation.class.name,'Fighter');
    assert.equal(pbCharacter.body.character.leveler.plan.levels[2].classFeats[0].name,'Demonstration Feat');

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

    // Player management: cancel an unused invitation, remove a player, delete an account.
    const membersRoute='/api/v1/campaigns/'+campaignId+'/members';
    const pendingInvite=await send(membersRoute,{},ownerCookie);
    const cancel=await send(membersRoute+'/'+pendingInvite.body.userId,{},ownerCookie,origin,'DELETE');
    assert.equal(cancel.status,200,JSON.stringify(cancel));
    assert.equal(cancel.body.deletedInvitation,true);
    const playerId=newPlayer.body.userId;
    const playerCannotRemove=await send(membersRoute+'/'+playerId,{},playerCookie,origin,'DELETE');
    assert.equal(playerCannotRemove.status,403,'Players cannot remove members');
    const removed=await send(membersRoute+'/'+playerId,{},ownerCookie,origin,'DELETE');
    assert.equal(removed.status,200);
    const afterRemoval=await send(membersRoute,undefined,ownerCookie,origin,'GET');
    assert.ok(!afterRemoval.body.members.some(m=>m.id===playerId));
    const accountDeleted=await send('/api/v1/users/'+playerId,{},ownerCookie,origin,'DELETE');
    assert.equal(accountDeleted.status,200,JSON.stringify(accountDeleted));
    const goneSession=await send('/api/v1/me',undefined,playerCookie,origin,'GET');
    assert.equal(goneSession.status,401,'A deleted account is signed out everywhere');
  } finally {
    // Wait for the server to release the database; Windows refuses to delete open files.
    if(child.exitCode===null){
      const exited=new Promise(resolve=>child.once('exit',resolve));
      child.kill('SIGTERM');
      await Promise.race([exited,sleep(5000)]);
    }
    try{rmSync(temp,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
    catch(error){console.warn('Smoke cleanup left',temp,error.code);}
  }
});
