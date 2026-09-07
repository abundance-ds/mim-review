import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createService } from '../src/server.js';
import { createTransfers } from '../src/transfers.js';
import { docxFixture } from './fixtures.js';
const admin = 'flow-test-admin-credential-at-least-32-characters';
const decode = result => { assert.equal(result.isError, undefined, result.content?.[0]?.text); return JSON.parse(result.content[0].text); };
const post = (url, body, headers = {}) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
async function setup(t) {
  await mkdir('data', { recursive: true }); const directory = await mkdtemp(resolve('data/flow-test-'));
  const path = join(directory, 'access.sqlite');
  const service = await createService({ baseUrl: 'http://127.0.0.1:0', protectApp: true, adminToken: admin, accessDb: path });
  const origin = await service.listen(0); t.after(() => service.close());
  const adminPost = (action, body) => post(origin + '/api/admin/' + action, body, { Authorization: 'Bearer ' + admin });
  const invite = await adminPost('invitations', { name: 'Flow reviewer' }).then(r => r.json());
  const login = async code => {
    const redeemed = await post(origin + '/api/access/redeem', { code }, { Origin: origin });
    const cookie = redeemed.headers.get('set-cookie').split(';')[0];
    const handoff = await post(origin + '/api/access/handoff', {}, { Origin: origin, Cookie: cookie }).then(r => r.json());
    return { cookie, url: handoff.url };
  };
  const connection = await login(invite.code);
  const connect = async url => {
    const client = new Client({ name: 'flow-test', version: '1' });
    await client.connect(new StreamableHTTPClientTransport(new URL(url))); t.after(() => client.close()); return client;
  };
  return { service, origin, path, adminPost, invite, login, connection, connect };
}

test('Private URL works directly, transfers need no bearer token, and revoked links recover explicitly', async t => {
  const { service, origin, path, adminPost, invite, login, connection, connect } = await setup(t);
  const client = await connect(connection.url);
  assert.match((await client.callTool({ name: 'get_review_instructions', arguments: {} })).content[0].text, /three parallel reviewer/);
  const legacy = await connect(connection.url.replace('/mcp/', '/connect/'));
  assert.equal((await legacy.callTool({ name: 'get_review_instructions', arguments: {} })).isError, undefined);
  const upload = decode(await client.callTool({ name: 'prepare_document', arguments: { filename: 'private-manuscript.docx' } }));
  assert.equal(upload.requires_token, false); assert.equal(upload.headers.Authorization, undefined);
  assert.equal((await fetch(upload.browser_url)).status, 200);
  const expiredPage = await fetch(origin + '/transfer/upload/' + 'x'.repeat(43));
  assert.equal(expiredPage.status, 404); assert.match(await expiredPage.text(), /Return to your AI conversation/);
  assert.equal(decode(await client.callTool({ name: 'get_upload_status', arguments: { upload_id: upload.upload_id } })).status, 'awaiting_upload');
  const request = { method: 'POST', headers: upload.headers, body: docxFixture() };
  const converted = await fetch(upload.url, request).then(r => r.json());
  assert.ok(converted.document_id);
  assert.equal((await fetch(upload.url, request).then(r => r.json())).document_id, converted.document_id, 'Retry must not charge or convert twice');
  const receipt = decode(await client.callTool({ name: 'get_upload_status', arguments: { upload_id: upload.upload_id } }));
  assert.equal(receipt.status, 'ready'); assert.equal(receipt.document_id, converted.document_id);
  const read = decode(await client.callTool({ name: 'read_document', arguments: { document_id: converted.document_id } }));
  assert.match(read.markdown, /24 volunteers/);
  const review = { document_id: converted.document_id, summary: 'Synthetic review.', comments: [{ text_snippet: '24 volunteers', content: 'Explain the sample size rationale.', severity: 'minor', reviewer: 'Technical Reviewer' }], coverage: { technical: 'limited', editorial: 'skipped', references: 'skipped' }, limitations: ['Synthetic fixture; no substantive review performed.'] };
  assert.equal(decode(await client.callTool({ name: 'validate_comments', arguments: { document_id: review.document_id, comments: review.comments } })).valid, true);
  const download = decode(await client.callTool({ name: 'prepare_export', arguments: { document_id: review.document_id } }));
  assert.ok(JSON.stringify(download).length < 2000);
  const exportPage = await fetch(download.url); assert.equal(exportPage.status, 200);
  const emptyForm = await exportPage.text(); assert.match(emptyForm, /review-file/); assert.doesNotMatch(emptyForm, /Synthetic review|24 volunteers/); // Form only, never a hosted review.
  const wrong = await post(download.url, { ...review, document_id: '0'.repeat(48) }); assert.equal(wrong.status, 403);
  const invalid = await post(download.url, { ...review, comments: [{ ...review.comments[0], text_snippet: 'invented quote' }] }); assert.equal(invalid.status, 422);
  const exported = await post(download.url, review); assert.equal(exported.status, 200);
  const html = await exported.text(); assert.match(html, /id="anchor-1"/); assert.match(html, /Synthetic fixture/);
  const other = await adminPost('invitations', { name: 'Other reviewer' }).then(r => r.json());
  const otherClient = await connect((await login(other.code)).url);
  const blocked = await otherClient.callTool({ name: 'get_upload_status', arguments: { upload_id: upload.upload_id } });
  assert.equal(blocked.isError, true); assert.equal(JSON.parse(blocked.content[0].text).code, 'transfer_unavailable');
  const summary = await fetch(origin + '/api/admin/summary', { headers: { Authorization: 'Bearer ' + admin } }).then(r => r.json());
  assert.equal(summary.users.find(u => u.id === invite.id).conversions_today, 1);
  const key = summary.keys.find(k => k.invitation_id === invite.id);
  await adminPost('revoke-key', { id: key.id });
  assert.equal((await post(download.url, review)).status, 404, 'Connection revocation also revokes scoped transfers');
  const denied = await post(origin + '/api/access/handoff', {}, { Origin: origin, Cookie: connection.cookie });
  assert.equal(denied.status, 401); assert.match(denied.headers.get('set-cookie'), /Max-Age=0/);
  const replacement = await login(invite.code); assert.notEqual(replacement.url, connection.url);
  await connect(replacement.url);
  assert.equal((await post(connection.url, {})).status, 401, 'Explicit reconnect must not revive old key');
  service.documents.clear();
  const recoveredClient = await connect(replacement.url);
  const unavailable = await recoveredClient.callTool({ name: 'read_document', arguments: { document_id: converted.document_id } });
  const error = JSON.parse(unavailable.content[0].text);
  assert.equal(error.code, 'document_unavailable'); assert.match(error.action, /Reconvert the original/); assert.match(error.action, /warnings/);
  const bytes = await readFile(path);
  for (const text of ['private-manuscript.docx', '24 volunteers', review.summary, upload.upload_id, download.url]) assert.equal(bytes.includes(Buffer.from(text)), false, 'No content or transfer secrets in database');
});

test('Transfer expiry, ownership, purpose and capacity are bounded without retaining content', () => {
  let now = 0, active = true;
  const store = createTransfers({ now: () => now, ttlMs: 100, maxEntries: 1, active: () => active });
  const grant = store.issue('upload', { id: 'owner', credential_id: 'key', name: 'not retained' });
  assert.equal(store.get(grant.id, 'upload', 'owner').identity.name, undefined);
  assert.throws(() => store.get(grant.id, 'export'), /unavailable/);
  assert.throws(() => store.get(grant.id, 'upload', 'other'), /unavailable/);
  assert.throws(() => store.issue('upload', null), /capacity/);
  active = false; assert.throws(() => store.get(grant.id, 'upload'), /unavailable/); active = true;
  now = 100; assert.throws(() => store.get(grant.id, 'upload'), /expired/);
  store.issue('upload', null); store.clear();
  const fair = createTransfers({ maxPerOwner: 1 });
  fair.issue('upload', { id: 'a' });
  assert.throws(() => fair.issue('export', { id: 'a' }), /Too many pending/);
  fair.issue('upload', { id: 'b' });
});

test('Two slow bibliography requests do not block a third reviewer from reading instructions', async t => {
  const { connection, connect } = await setup(t);
  const client = await connect(connection.url);
  const originalFetch = globalThis.fetch;
  let started = 0, release;
  const gate = new Promise(resolve => { release = resolve; });
  globalThis.fetch = async (input, options) => {
    if (String(input).startsWith('https://api.crossref.org/')) { started++; await gate; return Response.json({ message: { items: [] } }); }
    return originalFetch(input, options);
  };
  const envelope = i => JSON.stringify({ jsonrpc: '2.0', id: i, method: 'tools/call', params: { name: 'search_references', arguments: { references: [{ key: String(i), raw: 'Synthetic reference' }] } } });
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' };
  // Valid JSON whitespace exercises the byte budget independently of tool schemas.
  const lookups = [1, 2].map(i => originalFetch(connection.url, { method: 'POST', headers, body: ' '.repeat(12 * 1024 * 1024) + envelope(i) }));
  try {
    for (let i = 0; started < 2 && i < 100; i++) await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(started, 2);
    assert.equal((await client.callTool({ name: 'get_review_instructions', arguments: {} })).isError, undefined);
    const limited = await originalFetch(connection.url, { method: 'POST', headers, body: ' '.repeat(9 * 1024 * 1024) + envelope(3) });
    assert.equal(limited.status, 503, 'Buffered request bytes stay reserved throughout slow tool execution');
    assert.match((await limited.json()).error, /capacity is busy/);
  } finally { release(); await Promise.allSettled(lookups.map(async promise => { const response = await promise; await response.text(); })); globalThis.fetch = originalFetch; }
});
