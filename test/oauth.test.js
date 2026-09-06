import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Client, StreamableHTTPClientTransport, auth } from '@modelcontextprotocol/client';
import { createAccess } from '../src/access.js';
import { createService } from '../src/server.js';
import { matchesCallback } from '../src/oauth.js';

const admin = 'oauth-test-admin-credential-at-least-32-characters';
const random = () => randomBytes(32).toString('base64url');
const challenge = value => createHash('sha256').update(value).digest('base64url');
const jsonPost = (url, data, token) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(data) });
const formPost = (url, data, headers = {}) => fetch(url, { method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...headers }, body: new URLSearchParams(data) });
const cookies = response => response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
async function directory() { await mkdir('data', { recursive: true }); return mkdtemp(resolve('data/oauth-test-')); }
async function setup(t, options = {}) {
  const path = join(await directory(), 'access.sqlite');
  const service = await createService({ baseUrl: 'http://127.0.0.1:0', protectApp: true, adminToken: admin, accessDb: path, ...options });
  const origin = await service.listen(0); t.after(() => service.close());
  const invite = await jsonPost(origin + '/api/admin/invitations', { name: 'OAuth tester' }, admin).then(r => r.json());
  return { service, origin, invite, path };
}
async function consent(url, code) {
  const response = await fetch(url); assert.equal(response.status, 200);
  const html = await response.text();
  const id = /name="request" value="([^"]+)"/.exec(html)[1];
  const origin = new URL(url).origin;
  return formPost(origin + '/oauth/authorize', { request: id, decision: 'allow', code }, { Origin: origin, Cookie: cookies(response) });
}
async function registered(origin, overrides = {}) {
  const response = await jsonPost(origin + '/oauth/register', { client_name: 'Test client', redirect_uris: ['http://127.0.0.1/callback'], token_endpoint_auth_method: 'none', ...overrides });
  assert.equal(response.status, 201);
  return response.json();
}
function authUrl(origin, clientId, extra = {}) {
  const verifier = random(), data = { response_type: 'code', client_id: clientId, redirect_uri: 'http://127.0.0.1:54321/callback', code_challenge: challenge(verifier), code_challenge_method: 'S256', resource: origin + '/mcp', scope: 'review offline_access', state: random(), ...extra };
  return { verifier, data, url: origin + '/oauth/authorize?' + new URLSearchParams(data) };
}

test('OAuth discovery and the real SDK complete DCR, PKCE, MCP, refresh and revocation', async t => {
  const { origin, invite, path } = await setup(t);
  const unauth = await jsonPost(origin + '/mcp', {});
  assert.equal(unauth.status, 401); assert.match(unauth.headers.get('www-authenticate'), /resource_metadata=.*oauth-protected-resource\/mcp/);
  const resource = await fetch(origin + '/.well-known/oauth-protected-resource/mcp').then(r => r.json());
  assert.equal(resource.resource, origin + '/mcp');
  let info, tokens, verifier, authorization, discovery;
  const provider = {
    get redirectUrl() { return 'http://127.0.0.1:54321/callback'; },
    get clientMetadata() { return { client_name: 'SDK interoperability test', redirect_uris: [this.redirectUrl], token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'] }; },
    clientInformation: () => info, saveClientInformation: value => { info = value; },
    tokens: () => tokens, saveTokens: value => { tokens = value; },
    redirectToAuthorization: url => { authorization = url; },
    saveCodeVerifier: value => { verifier = value; }, codeVerifier: () => verifier,
    state: () => 'sdk-state',
    saveDiscoveryState: value => { discovery = value; }, discoveryState: () => discovery,
  };
  assert.equal(await auth(provider, { serverUrl: origin + '/mcp' }), 'REDIRECT');
  const approved = await consent(authorization, invite.code);
  assert.equal(approved.status, 303);
  const returned = new URL(approved.headers.get('location'));
  assert.equal(returned.searchParams.get('state'), 'sdk-state'); assert.equal(returned.searchParams.get('iss'), origin);
  assert.equal(await auth(provider, { serverUrl: origin + '/mcp', authorizationCode: returned.searchParams.get('code'), iss: returned.searchParams.get('iss') }), 'AUTHORIZED');
  assert.ok(tokens.refresh_token); assert.equal(tokens.expires_in, 3600);
  const client = new Client({ name: 'oauth-sdk-test', version: '1' });
  t.after(() => client.close());
  await client.connect(new StreamableHTTPClientTransport(new URL(origin + '/mcp'), { authProvider: provider }));
  const instructions = await client.callTool({ name: 'get_review_instructions', arguments: {} });
  assert.match(instructions.content[0].text, /Aim for 8-20 comments/);
  const oldTokens = tokens;
  const refresh = await formPost(origin + '/oauth/token', { grant_type: 'refresh_token', refresh_token: tokens.refresh_token, client_id: info.client_id, resource: origin + '/mcp' });
  assert.equal(refresh.status, 200); tokens = await refresh.json();
  assert.notEqual(tokens.refresh_token, oldTokens.refresh_token);
  const retry = await formPost(origin + '/oauth/token', { grant_type: 'refresh_token', refresh_token: oldTokens.refresh_token, client_id: info.client_id });
  const retried = await retry.json();
  assert.equal(retried.access_token, tokens.access_token); assert.equal(retried.refresh_token, tokens.refresh_token);
  assert.ok(retried.expires_in >= 3598 && retried.expires_in <= 3600);
  const summary = await fetch(origin + '/api/admin/summary', { headers: { Authorization: 'Bearer ' + admin } }).then(r => r.json());
  assert.equal(summary.keys.length, 1); assert.equal(summary.events[0].operation, 'get_review_instructions');
  const disk = await readFile(path);
  for (const value of [tokens.access_token, tokens.refresh_token, oldTokens.access_token, oldTokens.refresh_token, verifier, returned.searchParams.get('code')]) assert.equal(disk.includes(Buffer.from(value)), false);
  await jsonPost(origin + '/api/admin/revoke-key', { id: summary.keys[0].id }, admin);
  assert.equal((await jsonPost(origin + '/mcp', {}, tokens.access_token)).status, 401);
  const revoked = await formPost(origin + '/oauth/token', { grant_type: 'refresh_token', refresh_token: tokens.refresh_token, client_id: info.client_id });
  assert.equal(revoked.status, 400); assert.equal((await revoked.json()).error, 'invalid_grant');
});

test('OAuth rejects callback tampering, missing PKCE, wrong audience, duplicate parameters and cross-site consent', async t => {
  const { origin, invite } = await setup(t);
  const client = await registered(origin);
  for (const extra of [{ redirect_uri: 'https://attacker.example/callback' }, { code_challenge_method: 'plain' }, { code_challenge: '' }, { resource: 'https://other.example/mcp' }, { scope: 'admin' }]) {
    const response = await fetch(authUrl(origin, client.client_id, extra).url, { redirect: 'manual' });
    assert.equal(response.status, 400); assert.equal(response.headers.get('location'), null);
  }
  const request = authUrl(origin, client.client_id);
  assert.equal((await fetch(request.url + '&client_id=other')).status, 400);
  const page = await fetch(request.url), html = await page.text();
  const id = /name="request" value="([^"]+)"/.exec(html)[1], cookie = cookies(page);
  const data = { request: id, decision: 'allow', code: invite.code };
  assert.equal((await formPost(origin + '/oauth/authorize', data, { Origin: 'https://evil.example', Cookie: cookie })).status, 403);
  assert.equal((await formPost(origin + '/oauth/authorize', data, { Origin: origin })).status, 400);
  const wrong = await formPost(origin + '/oauth/authorize', { ...data, code: 'WRONG123' }, { Origin: origin, Cookie: cookie });
  assert.equal(wrong.status, 400); assert.match(await wrong.text(), /Invitation code is invalid/);
  const allowed = await formPost(origin + '/oauth/authorize', data, { Origin: origin, Cookie: cookie });
  const returned = new URL(allowed.headers.get('location'));
  const exchange = { grant_type: 'authorization_code', code: returned.searchParams.get('code'), code_verifier: request.verifier, client_id: client.client_id, redirect_uri: request.data.redirect_uri, resource: origin + '/mcp' };
  for (const extra of [{ client_id: 'wrong' }, { redirect_uri: 'http://127.0.0.1:54322/callback' }, { code_verifier: random() }, { resource: 'https://evil.example/mcp' }]) {
    const response = await formPost(origin + '/oauth/token', { ...exchange, ...extra });
    assert.equal((await response.json()).error, 'invalid_grant');
  }
  const success = await formPost(origin + '/oauth/token', exchange); assert.equal(success.status, 200);
  const token = (await success.json()).access_token;
  const replay = await formPost(origin + '/oauth/token', exchange); assert.equal((await replay.json()).error, 'invalid_grant');
  assert.equal((await jsonPost(origin + '/mcp', {}, token)).status, 401);
});

test('CIMD validates official metadata, blocks arbitrary fetches and renders client text safely', async t => {
  const fetched = [];
  const clientId = 'https://claude.ai/oauth/client-metadata';
  const { origin, invite } = await setup(t, { oauthFetch: async (url, options) => {
    fetched.push(url); assert.equal(options.redirect, 'error');
    return new Response(JSON.stringify({ client_id: url.endsWith('mismatch') ? clientId : url, client_name: '<script>bad</script>', redirect_uris: ['https://claude.ai/api/mcp/auth_callback'], token_endpoint_auth_method: 'none' }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=60' } });
  } });
  const request = authUrl(origin, clientId, { redirect_uri: 'https://claude.ai/api/mcp/auth_callback' });
  const page = await fetch(request.url), html = await page.text();
  assert.equal(page.status, 200); assert.match(html, /&lt;script&gt;/); assert.doesNotMatch(html, /<script>bad/);
  const approved = await consent(request.url, invite.code); assert.equal(approved.status, 303);
  assert.equal(fetched.length, 1);
  for (const id of ['https://127.0.0.1/oauth/client', 'https://169.254.169.254/oauth/client', 'https://claude.ai.evil.example/oauth/client', 'https://claude.ai:8443/oauth/client', 'https://user@claude.ai/oauth/client', 'https://claude.ai/oauth/client?redirect=evil']) {
    assert.equal((await fetch(authUrl(origin, id).url)).status, 400);
  }
  assert.equal(fetched.length, 1);
  assert.equal((await fetch(authUrl(origin, clientId + '-mismatch').url)).status, 400);
});

test('Callbacks permit variable loopback ports only; registration rejects unsafe metadata', async t => {
  assert.equal(matchesCallback('http://127.0.0.1:8765/callback', ['http://127.0.0.1/callback']), true);
  assert.equal(matchesCallback('http://localhost:8765/callback', ['http://localhost/callback']), true);
  assert.equal(matchesCallback('https://example.com:8443/callback', ['https://example.com/callback']), false);
  assert.equal(matchesCallback('http://localhost:8765/other', ['http://localhost/callback']), false);
  const { origin } = await setup(t);
  for (const uri of ['javascript:alert(1)', 'http://evil.example/callback', 'https://example.com/callback#fragment', 'https://user:password@example.com/callback']) {
    assert.equal((await jsonPost(origin + '/oauth/register', { client_name: 'Bad', redirect_uris: [uri] })).status, 400);
  }
  const preflight = await fetch(origin + '/oauth/token', { method: 'OPTIONS', headers: { Origin: 'https://claude.ai' } });
  assert.equal(preflight.status, 204); assert.equal(preflight.headers.get('access-control-allow-origin'), '*');
});

test('OAuth access expires and refresh persists across restarts; replay detection and invitation revocation hold', async () => {
  const path = join(await directory(), 'access.sqlite');
  let time = new Date('2026-09-06T00:00:00Z');
  let access = createAccess({ path, now: () => time });
  const invite = access.createInvitation('Persistent OAuth');
  const identity = access.authenticate(access.redeem(invite.code).token, 'browser');
  const verifier = random(), request = { client_id: 'client', redirect_uri: 'http://localhost:1234/callback', resource: 'https://review.example/mcp', scope: 'review', code_challenge: challenge(verifier) };
  const id = access.oauth.request(request, 'browser');
  const { code } = access.oauth.approve(id, 'browser', identity);
  const tokens = access.oauth.exchange({ ...request, code, code_verifier: verifier });
  assert.equal(access.authenticate(tokens.access_token, 'agent', request.resource).id, invite.id);
  assert.throws(() => access.authenticate(tokens.access_token, 'agent', 'https://different.example/mcp'), /invalid/);
  access.reserveConversion(access.authenticate(tokens.access_token, 'agent', request.resource))(true);
  access.close(); time = new Date('2027-09-06T00:00:00Z');
  access = createAccess({ path, now: () => time });
  try {
    assert.throws(() => access.authenticate(tokens.access_token, 'agent', request.resource), /invalid/);
    const next = access.oauth.refresh({ refresh_token: tokens.refresh_token, client_id: 'client' });
    assert.equal(access.authenticate(next.access_token, 'agent', request.resource).id, invite.id);
    time = new Date(time.getTime() + 31000);
    assert.throws(() => access.oauth.refresh({ refresh_token: tokens.refresh_token, client_id: 'client' }), /no longer valid/);
    assert.throws(() => access.authenticate(next.access_token, 'agent', request.resource), /invalid/);
    const second = access.oauth.request(request, 'browser');
    const approved = access.oauth.approve(second, 'browser', identity);
    access.revokeInvitation(invite.id);
    assert.throws(() => access.oauth.exchange({ ...request, code: approved.code, code_verifier: verifier }), /no longer valid/);
  } finally { access.close(); }
});

test('Authorization requests and codes expire, cancellation consumes the request, and refresh retry survives restart', async () => {
  const path = join(await directory(), 'access.sqlite');
  let time = new Date('2026-09-06T00:00:00Z');
  let access = createAccess({ path, now: () => time });
  const invitation = access.createInvitation('Expiry test');
  const identity = access.authenticate(access.redeem(invitation.code).token, 'browser');
  const verifier = random(), request = { client_id: 'client', redirect_uri: 'http://localhost/callback', resource: 'https://review.example/mcp', scope: 'review', code_challenge: challenge(verifier) };
  const cancelled = access.oauth.request(request, 'browser'); access.oauth.cancelRequest(cancelled, 'browser');
  assert.throws(() => access.oauth.approve(cancelled, 'browser', identity), /connection again/);
  const expired = access.oauth.request(request, 'browser');
  time = new Date(time.getTime() + 600000);
  assert.throws(() => access.oauth.approve(expired, 'browser', identity), /connection again/);
  const { code } = access.oauth.approve(access.oauth.request(request, 'browser'), 'browser', identity);
  time = new Date(time.getTime() + 300000);
  assert.throws(() => access.oauth.exchange({ ...request, code, code_verifier: verifier }), /no longer valid/);
  const approved = access.oauth.approve(access.oauth.request(request, 'browser'), 'browser', identity);
  const original = access.oauth.exchange({ ...request, code: approved.code, code_verifier: verifier });
  const pair = access.oauth.refresh({ client_id: 'client', refresh_token: original.refresh_token });
  access.close(); access = createAccess({ path, now: () => time });
  try {
    assert.deepEqual(access.oauth.refresh({ client_id: 'client', refresh_token: original.refresh_token }), pair);
    access.oauth.revoke(pair.refresh_token, 'wrong-client');
    assert.equal(access.authenticate(pair.access_token, 'agent', request.resource).id, invitation.id);
    access.oauth.revoke(pair.refresh_token, 'client');
    assert.throws(() => access.authenticate(pair.access_token, 'agent', request.resource), /invalid/);
    assert.throws(() => access.oauth.refresh({ client_id: 'client', refresh_token: pair.refresh_token }), /no longer valid/);
  } finally { access.close(); }
});
