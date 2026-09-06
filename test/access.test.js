import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createAccess } from '../src/access.js';
import { createService } from '../src/server.js';
import { docxFixture } from './fixtures.js';

const admin = 'test-admin-token-with-at-least-32-characters';
const post = (url, body, token, extra = {}) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...extra }, body: JSON.stringify(body) });
const agentKey = (access, code) => access.claim(access.handoff(access.redeem(code).token));
async function directory() { await mkdir('data', { recursive: true }); return mkdtemp(resolve('data/access-test-')); }

test('Daily quota is shared across keys, refunds failed work, survives restart, and resets at UTC midnight', async () => {
  const path = join(await directory(), 'access.sqlite');
  let time = new Date('2026-09-06T23:59:00Z');
  let access = createAccess({ path, now: () => time });
  const invitation = access.createInvitation('Tester');
  const first = agentKey(access, invitation.code), second = agentKey(access, invitation.code);
  const one = access.authenticate(first), two = access.authenticate(second);
  const refund = access.reserveConversion(one); refund(false); refund(false);
  for (let i = 0; i < 49; i++) access.reserveConversion(i % 2 ? one : two)(true);
  const pending = access.reserveConversion(one);
  assert.throws(() => access.reserveConversion(two), /Daily limit reached/);
  pending(false); access.reserveConversion(two)(true);
  assert.equal(access.snapshot().users[0].conversions_today, 50);
  access.close(); access = createAccess({ path, now: () => time });
  assert.equal(access.showInvitation(invitation.id).code, invitation.code);
  assert.throws(() => access.reserveConversion(access.authenticate(first)), /Daily limit reached/);
  time = new Date('2026-09-07T00:00:00Z');
  access.reserveConversion(access.authenticate(second))(true);
  assert.equal(access.snapshot().users[0].conversions_today, 1);
  access.close();
  const raw = await readFile(path);
  for (const value of [first, second]) assert.equal(raw.includes(Buffer.from(value)), false);
});

test('Invitation scope, reusable setup, individual revocation and log retention', () => {
  let time = new Date('2026-09-06T00:00:00Z');
  const access = createAccess({ path: ':memory:', now: () => time });
  try {
    const invitation = access.createInvitation('=Example');
    const browser = access.redeem(invitation.code);
    assert.throws(() => access.authenticate(browser.token), /invalid or expired/);
    const handoff = access.handoff(browser.token), agent = access.claim(handoff);
    assert.equal(access.claim(handoff), agent);
    const first = access.authenticate(agent), second = agentKey(access, invitation.code);
    access.record(first, 'read_guidance', 'success');
    access.record(first, 'PRIVATE-PAPER-TEXT', 'success');
    access.record(first, 'convert', 'PRIVATE-ERROR');
    assert.match(access.csv(), /"'=Example"/);
    assert.doesNotMatch(access.csv(), /PRIVATE|Bearer/);
    access.revokeKey(first.credential_id);
    assert.throws(() => access.claim(handoff), /revoked/);
    assert.throws(() => access.authenticate(agent), /invalid or expired/);
    assert.equal(access.authenticate(second).id, invitation.id);
    access.revokeInvitation(invitation.id);
    assert.throws(() => access.showInvitation(invitation.id), /not found/);
    for (const token of [agent, second]) assert.throws(() => access.authenticate(token), /invalid or expired/);
    assert.throws(() => access.authenticate(browser.token, 'browser'), /invalid or expired/);
    assert.throws(() => access.redeem(invitation.code), /invalid/);
    time = new Date('2026-12-07T00:00:00Z');
    assert.equal(access.snapshot().events.length, 0);
  } finally { access.close(); }
});

test('Protected HTTP and MCP flow stores only access metadata and requires distinct admin credentials', async t => {
  const path = join(await directory(), 'access.sqlite');
  const service = await createService({ baseUrl: 'http://127.0.0.1:0', protectApp: true, adminToken: admin, accessDb: path });
  const url = await service.listen(0);
  t.after(() => service.close());
  const config = await fetch(url + '/api/config').then(r => r.json());
  assert.equal(config.protected, true); assert.equal(config.unlocked, false); assert.equal(config.daily_limit, 50);
  assert.equal((await fetch(url + '/')).status, 200);
  for (const endpoint of ['/mcp', '/api/convert', '/api/validate-comments', '/api/export-review']) assert.equal((await post(url + endpoint, {})).status, 401);
  assert.equal((await fetch(url + '/api/admin/summary')).status, 401);
  assert.equal((await post(url + '/mcp', {}, admin)).status, 401);
  const create = await post(url + '/api/admin/invitations', { name: 'Test person' }, admin);
  assert.equal(create.status, 201);
  const invitation = await create.json();
  assert.match(invitation.code, /^[A-HJ-NP-Z2-9]{8}$/);
  assert.equal(invitation.url, url + '/?invite=' + invitation.code);
  assert.equal((await post(url + '/api/admin/show-invitation', { id: invitation.id })).status, 401);
  const revealed = await post(url + '/api/admin/show-invitation', { id: invitation.id }, admin);
  assert.equal(revealed.status, 200);
  assert.deepEqual(await revealed.json(), invitation);
  assert.equal((await post(url + '/api/admin/issue-key', { id: invitation.id }, admin)).status, 404);
  assert.equal((await post(url + '/api/access/redeem', { code: invitation.code })).status, 403);
  assert.equal((await post(url + '/api/access/redeem', { code: 'wrong' }, '', { Origin: url })).status, 401);
  const redeemed = await post(url + '/api/access/redeem', { code: invitation.code }, '', { Origin: url });
  assert.equal(redeemed.status, 200);
  const cookie = redeemed.headers.get('set-cookie').split(';')[0];
  assert.match(redeemed.headers.get('set-cookie'), /HttpOnly; SameSite=Lax/);
  assert.equal((await fetch(url + '/api/config', { headers: { Cookie: cookie } }).then(r => r.json())).unlocked, true);
  const handoffResponse = await post(url + '/api/access/handoff', {}, '', { Origin: url, Cookie: cookie });
  const handoff = await handoffResponse.json();
  assert.equal(handoff.expires_in, undefined);
  assert.deepEqual(await post(url + '/api/access/handoff', {}, '', { Origin: url, Cookie: cookie }).then(r => r.json()), handoff);
  const setup = await fetch(handoff.url);
  assert.equal(setup.headers.get('cache-control'), 'no-store');
  assert.match(setup.headers.get('x-robots-tag'), /noindex/);
  const setupText = await setup.text(), token = /Authorization header: Bearer (\S+)/.exec(setupText)[1];
  assert.equal(new URL(handoff.url).search, '');
  assert.ok(!handoff.url.includes(token));
  assert.equal(await fetch(handoff.url).then(r => r.text()), setupText);
  assert.equal((await fetch(url + '/api/admin/summary', { headers: { Authorization: 'Bearer ' + token } })).status, 401);
  assert.equal((await post(url + '/mcp?token=' + token, {})).status, 401);
  const client = new Client({ name: 'access-test', version: '1.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(url + '/mcp'), { requestInit: { headers: { Authorization: 'Bearer ' + token } } }));
  t.after(() => client.close());
  const result = await client.callTool({ name: 'list_guidance', arguments: {} });
  assert.equal(result.isError, undefined);
  const malformed = await fetch(url + '/api/convert', { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'X-Filename': 'PRIVATE-PAPER.docx' }, body: 'PRIVATE-PAPER-CONTENT' });
  assert.equal(malformed.status, 400);
  const converted = await fetch(url + '/api/convert', { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'X-Filename': 'PRIVATE-PAPER.docx', Accept: 'application/json' }, body: docxFixture() });
  assert.equal(converted.status, 200); await converted.json();
  const bad = await post(url + '/api/export-review', { document: 'PRIVATE-MANUSCRIPT-CONTENT', comments: 'PRIVATE-COMMENTS' }, token);
  assert.equal(bad.status, 400);
  const summary = await fetch(url + '/api/admin/summary', { headers: { Authorization: 'Bearer ' + admin } }).then(r => r.json());
  assert.equal(summary.users[0].conversions_today, 1);
  assert.ok(summary.events.some(e => e.who === 'Test person' && e.operation === 'list_guidance' && e.outcome === 'success'));
  assert.ok(summary.events.some(e => e.operation === 'export_review' && e.outcome === 'error'));
  const csv = await fetch(url + '/api/admin/logs.csv', { headers: { Authorization: 'Bearer ' + admin } }).then(r => r.text());
  assert.match(csv, /^when,who,what,result/);
  assert.doesNotMatch(csv + JSON.stringify(summary), /PRIVATE|24 volunteers|Bearer|token_hash|code_hash/);
  const file = await readFile(path);
  for (const text of ['PRIVATE-PAPER', 'PRIVATE-MANUSCRIPT', 'PRIVATE-COMMENTS', '24 volunteers', token, admin]) assert.equal(file.includes(Buffer.from(text)), false, text.startsWith('PRIVATE') ? text : 'No secrets or content on disk');
  assert.equal((await post(url + '/api/admin/revoke-invitation', { id: invitation.id }, admin)).status, 200);
  assert.equal((await post(url + '/mcp', {}, token)).status, 401);
  assert.equal((await fetch(handoff.url)).status, 401);
  assert.equal((await post(url + '/api/access/handoff', {}, '', { Origin: url, Cookie: cookie })).status, 401);
});

test('Open defaults need no credentials or writable metadata directory; protected startup fails closed', async t => {
  await assert.rejects(createService({ protectApp: true, adminToken: '' }), /requires an ADMIN_TOKEN/);
  const service = await createService({ baseUrl: 'http://127.0.0.1:0', protectApp: false, accessToken: '', adminToken: '', accessDb: '/not-a-writable-directory/access.sqlite' });
  const url = await service.listen(0); t.after(() => service.close());
  const config = await fetch(url + '/api/config').then(r => r.json());
  assert.equal(config.protected, false); assert.equal(config.requires_token, false);
  assert.equal((await fetch(url + '/api/admin/summary')).status, 401);
  const client = new Client({ name: 'open-test', version: '1' });
  await client.connect(new StreamableHTTPClientTransport(new URL(url + '/mcp'))); t.after(() => client.close());
  assert.ok((await client.listTools()).tools.length > 0);
});


test('Older databases upgrade without changing codes, and invitations can be retrieved after restart', async () => {
  const path = join(await directory(), 'access.sqlite');
  const db = new DatabaseSync(path);
  db.exec('CREATE TABLE invitations (id TEXT PRIMARY KEY, name TEXT NOT NULL, code_hash TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL, revoked INTEGER NOT NULL DEFAULT 0)');
  const legacyCode = 'a123bc-d456ef-123abc-456def';
  db.prepare('INSERT INTO invitations(id,name,code_hash,created_at) VALUES(?,?,?,?)').run('legacy-invitation', 'Existing user', createHash('sha256').update(legacyCode).digest('hex'), new Date().toISOString());
  db.close();
  let access = createAccess({ path });
  const invitation = access.createInvitation('New code');
  assert.match(invitation.code, /^[A-HJ-NP-Z2-9]{8}$/);
  const session = access.redeem('  ' + invitation.code.toLowerCase() + '  ');
  assert.equal(access.authenticate(session.token, 'browser').id, invitation.id);
  assert.equal(access.showInvitation('legacy-invitation').code, null);
  assert.equal(access.authenticate(access.redeem(legacyCode).token, 'browser').id, 'legacy-invitation');
  access.close();
  access = createAccess({ path });
  try {
    assert.equal(access.showInvitation('legacy-invitation').code, legacyCode);
    assert.equal(access.showInvitation(invitation.id).code, invitation.code);
    assert.equal(access.showInvitation(invitation.id).code, invitation.code);
    assert.equal(access.snapshot().keys.length, 0);
    access.revokeInvitation(invitation.id);
    assert.throws(() => access.showInvitation(invitation.id), /not found/);
    assert.throws(() => access.redeem(invitation.code.toLowerCase()), /invalid/);
  } finally { access.close(); }
});


test('Setup links survive repeat copies, reads, browser expiry, pruning and service restarts', async () => {
  const path = join(await directory(), 'access.sqlite');
  let time = new Date('2026-09-06T00:00:00Z');
  let access = createAccess({ path, now: () => time });
  const invitation = access.createInvitation('Returning user');
  const browser = access.redeem(invitation.code);
  const link = access.handoff(browser.token), token = access.claim(link);
  for (let i = 0; i < 150; i++) {
    assert.equal(access.handoff(browser.token), link);
    assert.equal(access.claim(link), token);
  }
  assert.equal(access.snapshot().keys.length, 1);
  time = new Date('2026-10-05T23:59:59Z');
  assert.equal(access.authenticate(browser.token, 'browser').id, invitation.id);
  time = new Date('2027-10-06T00:00:00Z');
  access.prune();
  assert.throws(() => access.authenticate(browser.token, 'browser'), /invalid or expired/);
  assert.equal(access.claim(link), token);
  access.close();
  access = createAccess({ path, now: () => time });
  try {
    assert.equal(access.claim(link), token);
    assert.equal(access.authenticate(token).id, invitation.id);
    assert.equal(access.snapshot().keys.length, 1);
    access.revokeKey(access.authenticate(token).credential_id);
  } finally { access.close(); }
  access = createAccess({ path, now: () => time });
  try { assert.throws(() => access.claim(link), /revoked/); }
  finally { access.close(); }
  const raw = await readFile(path);
  for (const value of [browser.token, link, token]) assert.equal(raw.includes(Buffer.from(value)), false);
});

test('Legacy consumed and expired setup links migrate without restoring revoked invitations or agent keys', async () => {
  const path = join(await directory(), 'access.sqlite');
  let access = createAccess({ path });
  const active = access.createInvitation('Existing user');
  const blocked = access.createInvitation('Revoked user');
  const oldAgent = agentKey(access, active.code);
  access.revokeKey(access.authenticate(oldAgent).credential_id);
  access.revokeInvitation(blocked.id);
  access.close();
  const db = new DatabaseSync(path);
  for (const [id, invitation, consumed] of [['consumed', active, 1], ['unread', active, 0], ['blocked', blocked, 1]]) {
    db.prepare('INSERT INTO credentials(id,invitation_id,token_hash,kind,created_at,expires_at,revoked) VALUES(?,?,?,?,?,?,?)')
      .run(id, invitation.id, createHash('sha256').update(id).digest('hex'), 'handoff', '2026-01-01T00:00:00Z', '2026-02-01T00:00:00Z', consumed);
  }
  db.close();
  access = createAccess({ path });
  let token;
  try {
    token = access.claim('consumed');
    assert.equal(access.claim('consumed'), token);
    assert.equal(access.authenticate(token).id, active.id);
    assert.equal(access.authenticate(access.claim('unread')).id, active.id);
    assert.throws(() => access.claim('blocked'), /invalid or expired/);
    assert.throws(() => access.authenticate(oldAgent), /invalid or expired/);
    access.revokeKey(access.authenticate('unread', 'setup').credential_id);
  } finally { access.close(); }
  access = createAccess({ path });
  try {
    assert.equal(access.claim('consumed'), token);
    assert.throws(() => access.claim('unread'), /invalid or expired/);
    assert.throws(() => access.claim('blocked'), /invalid or expired/);
    assert.throws(() => access.authenticate(oldAgent), /invalid or expired/);
  } finally { access.close(); }
});
