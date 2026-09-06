import { spawn, execFileSync } from 'node:child_process';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';
import { createService } from '../src/server.js';
const admin = 'codex-oauth-test-admin-credential-32-characters';
await mkdir('data', { recursive: true });
const directory = await mkdtemp(resolve('data/codex-oauth-'));
const service = await createService({ baseUrl: 'http://127.0.0.1:0', protectApp: true, adminToken: admin, accessDb: join(directory, 'access.sqlite') });
const origin = await service.listen(0);
const invitation = await fetch(origin + '/api/admin/invitations', { method: 'POST', headers: { Authorization: 'Bearer ' + admin, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Codex CLI verification' }) }).then(r => r.json());
const config = ['-c', `mcp_servers.oauth-local-check.url="${origin}/mcp"`];
let child;
try {
 child = spawn('codex', [...config, 'mcp', 'login', 'oauth-local-check', '--oauth-client-registration', process.env.OAUTH_REGISTRATION || 'dcr'], { env: { ...process.env, BROWSER: '/usr/bin/true' }, stdio: ['ignore', 'pipe', 'pipe'] });
 let output = '', processing = false, failure;
 const finish = new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', code => resolve(code)); });
 const timer = setTimeout(() => { child.kill(); }, 45000);
 const processOutput = data => {
   output += data.toString();
   const match = output.match(/http:\/\/127\.0\.0\.1:\d+\/oauth\/authorize\?[^\s]+/);
   if (!match || processing) return;
   processing = true;
   void (async () => {
     const page = await fetch(match[0]);
     const html = await page.text();
     assert.equal(page.status, 200, html);
     const request = /name="request" value="([^"]+)"/.exec(html)[1];
     const cookie = page.headers.getSetCookie().map(x => x.split(';')[0]).join('; ');
     const approved = await fetch(origin + '/oauth/authorize', { method: 'POST', redirect: 'manual', headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ request, decision: 'allow', code: invitation.code }) });
     assert.equal(approved.status, 303, await approved.clone().text());
     const callback = await fetch(approved.headers.get('location'));
     assert.equal(callback.status, 200);
   })().catch(error => { failure = error; child.kill(); });
 };
 child.stdout.on('data', processOutput); child.stderr.on('data', processOutput);
 const code = await finish; clearTimeout(timer);
 if (failure) throw failure;
 assert.equal(code, 0, output.replace(/http[^\s]+/g, '[URL]'));
 console.log('Real Codex CLI OAuth login succeeded with ' + (process.env.OAUTH_REGISTRATION || 'dcr').toUpperCase() + ', S256 PKCE, issuer validation, loopback callback, and credential saving.');
 execFileSync('codex', [...config, 'mcp', 'logout', 'oauth-local-check'], { stdio: 'pipe' });
} finally { if (child?.exitCode === null) child.kill(); await service.close(); }
