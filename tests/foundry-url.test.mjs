import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeWebsiteUrl } from '../apps/foundry-module/scripts/url.mjs';

test('accepts domains and defaults to https', () => {
  assert.equal(normalizeWebsiteUrl('level-plan.mydomain.com'), 'https://level-plan.mydomain.com');
  assert.equal(normalizeWebsiteUrl(' https://level-plan.mydomain.com/ '), 'https://level-plan.mydomain.com');
  assert.equal(normalizeWebsiteUrl('example.com:8443'), 'https://example.com:8443');
});
test('accepts IPv4 and bracketed IPv6', () => {
  assert.equal(normalizeWebsiteUrl('192.168.1.40'), 'https://192.168.1.40');
  assert.equal(normalizeWebsiteUrl('[::1]:3000'), 'https://[::1]:3000');
});
test('allows HTTP only for loopback testing', () => {
  assert.equal(normalizeWebsiteUrl('http://localhost:3000'), 'http://localhost:3000');
  assert.equal(normalizeWebsiteUrl('http://127.0.0.1:3000'), 'http://127.0.0.1:3000');
  assert.throws(() => normalizeWebsiteUrl('http://192.168.1.40'), /HTTPS/);
});
test('rejects malformed URLs and dangerous components', () => {
  for (const address of ['abc', 'ftp://example.com', 'https://example.com/join',
    'https://example.com?q=1', 'https://example.com/#x', 'https://user:pass@example.com',
    'foo bar.com', 'not-an-ip', 'https://bad..domain', '']) {
    assert.throws(() => normalizeWebsiteUrl(address), address);
  }
});
