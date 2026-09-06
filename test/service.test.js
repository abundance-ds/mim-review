import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createService } from '../src/server.js';
import { convertIsolated } from '../src/converter.js';
import { docxFixture } from './fixtures.js';

async function setup(t, options = {}) {
  const service = await createService({ baseUrl: 'http://127.0.0.1:0', ...options });
  const url = await service.listen(0);
  t.after(() => service.close());
  return { service, url };
}
const decode = response => { assert.equal(response.isError, undefined, JSON.stringify(response)); return JSON.parse(response.content[0].text); };
const post = (url, body, token = '') => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body) });
const reviewFor = document_id => ({ document_id, comments: [{ text_snippet: 'We recruited 24 volunteers from one university.', content: 'Explain the sample size rationale.', severity: 'minor', reviewer: 'Technical Reviewer' }], summary: '## Summary\n\nClarify the sample size rationale [1].', coverage: { technical: 'complete', editorial: 'limited', references: 'skipped' }, limitations: ['Synthetic test manuscript.'] });

test('MCP and HTTP retain converted documents briefly and return standalone HTML', async t => {
  const { url, service } = await setup(t);
  assert.ok(service.documents);
  const config = await fetch(url + '/api/config').then(r => r.json());
  assert.equal(config.document_retention_minutes, 30);
  assert.equal(config.hosted_reviews, false);
  const client = new Client({ name: 'test-agent', version: '1.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(url + '/mcp')));
  t.after(() => client.close());
  const names = (await client.listTools()).tools.map(tool => tool.name);
  assert.ok(names.includes('export_review'));
  for (const name of ['create_text_document', 'read_document', 'read_figure', 'delete_document']) assert.ok(names.includes(name));
  const skill = await client.callTool({ name: 'get_review_instructions', arguments: {} });
  assert.match(skill.content[0].text, /Launch three parallel reviewer subagents/);
  assert.match(client.getInstructions(), /First call get_review_instructions/);
  assert.match(client.getInstructions(), /three parallel reviewer subagents/);
  assert.match(client.getInstructions(), /writes the summary itself/);
  assert.match(skill.content[0].text, /Do not launch a fourth report-writing or synthesis agent/);
  assert.match(skill.content[0].text, /Be thorough but fair\. Aim for 8-20 comments\./);
  assert.match(skill.content[0].text, /single subagent.s pass is not the final three-role review/);
  assert.match(skill.content[0].text, /400-word limit applies only to the summary/);
  const guidance = decode(await client.callTool({ name: 'list_guidance', arguments: {} }));
  assert.ok(guidance.some(chapter => chapter.id === 'statistics/01-pvalues'));
  const instructions = decode(await client.callTool({ name: 'prepare_document', arguments: { filename: 'study.docx' } }));
  assert.equal(instructions.url, url + '/api/convert');
  assert.equal(instructions.method, 'POST');
  assert.match(instructions.instruction, /document_id valid for 30 minutes/);
  const response = await fetch(instructions.url, { method: instructions.method, headers: instructions.headers, body: docxFixture() });
  assert.equal(response.status, 200, await response.clone().text());
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const converted = await response.json();
  assert.match(converted.document_id, /^[a-f0-9]{48}$/);
  assert.match(converted.markdown, /24 volunteers/);
  assert.match(converted.instruction, /document_id/);
  assert.match(converted.instruction, /get_review_instructions/);
  assert.match(converted.instruction, /technical, editorial, and reference passes/);
  const read = decode(await client.callTool({ name: 'read_document', arguments: { document_id: converted.document_id } }));
  assert.match(read.markdown, /24 volunteers/);
  const request = reviewFor(converted.document_id);
  const validation = decode(await client.callTool({ name: 'validate_comments', arguments: { document_id: converted.document_id, comments: request.comments } }));
  assert.equal(validation.valid, true);
  const output = decode(await client.callTool({ name: 'export_review', arguments: request }));
  assert.equal(output.valid, true);
  assert.equal(output.primary.filename, 'review.html');
  assert.match(output.primary.text, /sample size/);
  const downloaded = await post(url + '/api/export-review', request);
  assert.equal(downloaded.status, 200, await downloaded.clone().text());
  assert.match(downloaded.headers.get('content-type'), /text\/html/);
  const html = await downloaded.text();
  assert.match(html, /id="anchor-1"/);
  assert.match(html, /id="review-data"/);
  assert.match(html, /data-comments="comment-1"/);
  assert.match(html, /data-download="json"/);
  const invalid = { ...request, comments: [{ ...request.comments[0], text_snippet: 'Invented quotation' }] };
  const rejected = await post(url + '/api/export-review', invalid);
  assert.equal(rejected.status, 422);
  assert.equal((await rejected.json()).valid, false);
  const rejectedTool = decode(await client.callTool({ name: 'export_review', arguments: invalid }));
  assert.equal(rejectedTool.valid, false);
  const again = await post(url + '/api/export-review', request);
  assert.equal(again.status, 200);
  assert.match(again.headers.get('content-security-policy'), /script-src 'sha256-/);
  assert.match(again.headers.get('content-disposition'), /attachment; filename="review.html"/);
  assert.equal(await again.text(), html);
  for (const path of ['/documents/abc/review.html', '/documents/abc/manuscript.md', '/api/uploads/abc']) assert.equal((await fetch(url + path)).status, 404);
  assert.equal((await post(url + '/api/validate-comments', { document_id: 'abc', comments: request.comments })).status, 400);
  decode(await client.callTool({ name: 'delete_document', arguments: { document_id: converted.document_id } }));
  assert.equal((await post(url + '/api/validate-comments', { document_id: request.document_id, comments: request.comments })).status, 404);
});

test('Document IDs are lost on restart and plain text has a direct path', async t => {
  const first = await setup(t);
  const response = await fetch(first.url + '/api/convert', { method: 'POST', headers: { 'X-Filename': 'study.docx', Accept: 'application/json' }, body: docxFixture() });
  assert.equal(response.status, 200);
  const converted = await response.json();
  const second = await setup(t);
  const expiredRequest = reviewFor(converted.document_id);
  assert.equal((await post(second.url + '/api/validate-comments', { document_id: converted.document_id, comments: expiredRequest.comments })).status, 404);
  const text = await post(second.url + '/api/text', { filename: 'study.md', format: 'markdown', text: '# Study\n\nWe recruited 24 volunteers from one university.' });
  assert.equal(text.status, 201);
  const registered = await text.json();
  assert.match(registered.markdown, /24 volunteers/);
  const textRequest = reviewFor(registered.document_id);
  assert.equal((await post(second.url + '/api/validate-comments', { document_id: registered.document_id, comments: textRequest.comments }).then(r => r.json())).valid, true);
});

test('Token auth protects every processing endpoint; malformed inputs reveal no content', async t => {
  const { url } = await setup(t, { accessToken: 'test-secret' });
  for (const path of ['/mcp', '/api/convert', '/api/validate-comments', '/api/export-review']) assert.equal((await fetch(url + path, { method: 'POST' })).status, 401);
  assert.equal((await fetch(url + '/api/convert', { method: 'POST', headers: { Origin: 'https://unrelated.test' }, body: 'x' })).status, 403);
  const response = await fetch(url + '/api/convert', { method: 'POST', headers: { Authorization: 'Bearer test-secret', 'X-Filename': 'x.docx', Accept: 'application/json' }, body: docxFixture() });
  assert.equal(response.status, 200);
  const converted = await response.json();
  const bad = await post(url + '/api/export-review', { ...reviewFor(converted.document_id), coverage: 'PRIVATE-SENTINEL' }, 'test-secret');
  assert.equal(bad.status, 400); assert.doesNotMatch(await bad.text(), /PRIVATE-SENTINEL/);
  assert.equal((await fetch(url + '/guidance/%2e%2e%2f%2e%2e%2f.env')).status, 400);
  assert.equal((await fetch(url + '/.env')).status, 404);
});

test('Worker cancellation and failed conversion release processing capacity', async () => {
  const first = new AbortController(), second = new AbortController();
  const p1 = convertIsolated(docxFixture(), 'study.docx', first.signal);
  const p2 = convertIsolated(docxFixture(), 'study.docx', second.signal);
  const rejected = assert.rejects(convertIsolated(docxFixture(), 'study.docx'), /already processing/);
  const cancelled1 = assert.rejects(p1, /cancelled/), cancelled2 = assert.rejects(p2, /cancelled/);
  first.abort(); second.abort();
  await Promise.all([rejected, cancelled1, cancelled2]);
  await assert.rejects(convertIsolated(Buffer.from('invalid'), 'bad.docx'), /not a valid/);
  assert.match((await convertIsolated(docxFixture(), 'study.docx')).markdown, /24 volunteers/);
});

test('Disconnected HTTP uploads release request slots and never create a document', async t => {
  const { service, url } = await setup(t);
  const clients = [], aborted = [];
  for (let i = 0; i < 2; i++) {
    const observed = new Promise(resolve => service.server.once('request', req => {
      aborted.push(new Promise(done => req.once('aborted', done)));
      resolve();
    }));
    const req = http.request(url + '/api/convert', { method: 'POST', headers: { 'X-Filename': 'study.docx', 'Content-Length': 100000 } });
    req.on('error', () => {}); req.write(Buffer.from('PK')); clients.push(req);
    await observed;
  }
  for (const req of clients) req.destroy();
  await Promise.all(aborted);
  await new Promise(resolve => setImmediate(resolve));
  const response = await fetch(url + '/api/convert', { method: 'POST', headers: { 'X-Filename': 'study.docx', Accept: 'application/json' }, body: docxFixture() });
  assert.equal(response.status, 200, await response.clone().text());
  assert.match((await response.json()).markdown, /24 volunteers/);
});

test('Legacy Streamable HTTP clients can initialize and discover tools', async t => {
  const { url } = await setup(t);
  const request = async body => {
    const response = await fetch(`${url}/mcp`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': '2025-11-25' }, body: JSON.stringify(body) });
    assert.equal(response.status, 200);
    const text = await response.text();
    return JSON.parse(text.startsWith('event:') ? text.split('\n').find(line => line.startsWith('data:')).slice(5).trim() : text);
  };
  const initialized = await request({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'legacy-test', version: '1.0.0' } } });
  assert.equal(initialized.result.serverInfo.name, 'mim-review');
  const tools = await request({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
  assert.ok(tools.result.tools.some(tool => tool.name === 'prepare_document'));
});

test('One agent document includes workflow, roles, tools, and direct guidance links', async t => {
  const { url } = await setup(t);
  const response = await fetch(`${url}/llms.txt`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/plain/);
  const index = await response.text();
  assert.match(index, /# AI peer review MCP/);
  const links = [...index.matchAll(/\]\((https?:[^)]+)\)/g)].map(match => match[1]).filter(link => link.startsWith(url));
  const guidance = await fetch(`${url}/api/guidance`).then(response => response.json());
  const chapters = guidance.filter(entry => entry.category !== 'reviewers');
  assert.equal(links.length, chapters.length);
  for (const chapter of chapters) assert.ok(links.includes(`${url}/guidance/${chapter.id}`));
  for (const role of ['Technical reviewer', 'Editorial reviewer', 'Reference checker', 'Synthesis']) assert.ok(index.includes(`## ${role}`));
  assert.match(index, /## Tools/);
  assert.match(index, /Without MCP/);
  assert.doesNotMatch(index, /\/docs\/(tools|uploads|outputs|limits|without-mcp)\.md/);
  assert.equal(await fetch(`${url}/skill.md`).then(response => response.text()), index);
  for (const name of ['tools', 'uploads', 'outputs', 'limits', 'without-mcp']) {
    const old = await fetch(`${url}/docs/${name}.md`, { redirect: 'manual' });
    assert.equal(old.status, 308);
    assert.equal(old.headers.get('location'), '/skill.md');
  }
  for (const entry of guidance.filter(entry => entry.category === 'reviewers')) {
    const role = await fetch(`${url}/guidance/${entry.id}`).then(response => response.text());
    assert.match(role, /^# /, entry.id);
    assert.ok(index.includes(role.slice(role.indexOf('\n') + 1).trim()), entry.id);
    if (['reviewers/technical', 'reviewers/editorial'].includes(entry.id)) {
      assert.match(role, /Be thorough but fair\. Aim for 8-20 comments\./);
      assert.match(role, /Focus areas:/);
    }
  }
  for (const link of links) {
    const linked = await fetch(link);
    assert.equal(linked.status, 200, link);
    if (link.includes('/docs/') || link.endsWith('/skill.md') || link.endsWith('/info.md')) {
      const text = await linked.text();
      assert.doesNotMatch(text, /\{\{BASE_URL\}\}/);
      for (const match of text.matchAll(/\]\((https?:[^)]+)\)/g)) {
        if (match[1].startsWith(url)) assert.equal((await fetch(match[1])).status, 200, match[1]);
      }
    }
  }
});

test('Setup guide uses the service origin and offers a readable HTML version', async t => {
  const { url } = await setup(t);
  const markdownResponse = await fetch(`${url}/info.md`);
  assert.equal(markdownResponse.status, 200);
  assert.match(markdownResponse.headers.get('content-type'), /text\/markdown/);
  const markdown = await markdownResponse.text();
  assert.ok(markdown.includes(`${url}/mcp`));
  assert.ok(markdown.includes(`${url}/health`));
  assert.ok(markdown.includes('https://raw.githubusercontent.com/abundance-ds/mim-review/main/skills/peer-review/SKILL.md'));
  assert.doesNotMatch(markdown, /without-mcp/);
  assert.doesNotMatch(markdown, /\{\{BASE_URL\}\}/);
  const htmlResponse = await fetch(`${url}/info`);
  assert.equal(htmlResponse.status, 200);
  assert.match(htmlResponse.headers.get('content-type'), /text\/html/);
  const html = await htmlResponse.text();
  assert.match(html, /<h1>Get started<\/h1>/);
  assert.ok(html.includes(`href="${url}/health"`));
});
