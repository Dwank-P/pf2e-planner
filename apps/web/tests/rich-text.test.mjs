import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeDescription, verifyCatalogItem } from '../src/lib/server/rich-text.js';

test('renders nested @Template, @Damage and @Check without trying to roll actor context', () => {
  const source='A blade of shearing wind races away from you in a '+
    '@Template[line|distance:60]. Each creature in the area takes '+
    '@Damage[(floor((@actor.level -1)/2) +2)d4[slashing]|options:area-damage] '+
    'damage with a @Check[reflex|against:kineticist|basic|options:area-effect] save.';
  const html=sanitizeDescription('<p>'+source+'</p>');
  assert.match(html,/60-foot Line/);
  assert.match(html,/data-pf2e-kind="template"/);
  assert.match(html,/data-pf2e-kind="damage"/);
  assert.match(html,/floor\(\(@actor\.level -1\)\/2\)/);
  assert.match(html,/slashing damage/);
  assert.match(html,/Basic Reflex save vs kineticist class DC/);
  assert.match(html,/data-pf2e-kind="check"/);
  assert.doesNotMatch(html,/@Template\[|@Damage\[|@Check\[/);
});
test('keeps compendium links and imported action slugs as typed references', () => {
  const html=sanitizeDescription('<p>See @UUID[Compendium.pf2e.conditionitems.Item.Sample]{Frightened}'+
    ', @Compendium[pf2e.actionspf2e.Sample]{Action}, and @Action[raise-a-shield].</p>');
  assert.match(html,/data-pf2e-uuid="Compendium.pf2e.conditionitems.Item.Sample"/);
  assert.match(html,/data-pf2e-uuid="Compendium.pf2e.actionspf2e.Item.Sample"/);
  assert.match(html,/data-pf2e-action="raise-a-shield"/);
});
test('does not turn codes in attributes/code blocks into HTML', () => {
  const html=sanitizeDescription('<p title="@Damage[2d4[fire]]">@Damage[2d4[fire]]</p>'+
    '<pre>@Check[reflex|basic]</pre>');
  assert.match(html,/data-pf2e-kind="damage"/);
  assert.match(html,/<pre>@Check\[reflex\|basic\]<\/pre>/);
  assert.doesNotMatch(html,/title="@Damage/);
});
test('rejects active HTML and dangerous attributes from third party descriptions', () => {
  const html=sanitizeDescription('<script>alert(1)</script>'+
    '<a href="javascript:alert(1)" onclick="alert(2)">Exploit</a>'+
    '<img src="x" onerror="alert(3)" />');
  assert.doesNotMatch(html,/<script|<img|onclick=|onerror=|javascript:/i);
});
test('accepts authorized Item document types beyond feats and classes', () => {
  for (const type of ['feat','class','action','condition','effect','spell','weapon','ancestry']) {
    assert.equal(verifyCatalogItem({uuid:'Compendium.pf2e.example.Item.Token',name:'Test',type}),true,type);
  }
  assert.equal(verifyCatalogItem({uuid:'Actor.bad',name:'Bad',type:'feat'}),false);
});

test('Foundry inline commands render as action links and display-only rolls', () => {
  const html = sanitizeDescription('<p>[[/act perform skill=acrobatics variant=dance]]{Acrobatics}, [[/act tumble-through]] and [[/r 1d6 #healing]]{1d6 healing}</p>');
  assert.match(html, /data-pf2e-action="perform"[^>]*>Perform: Acrobatics<\/a>/);
  assert.match(html, /data-pf2e-action="tumble-through"[^>]*>Tumble Through<\/a>/);
  assert.match(html, /pf2e-roll[\s\S]*1d6 healing/);
  assert.doesNotMatch(html, /\[\[/);
});
