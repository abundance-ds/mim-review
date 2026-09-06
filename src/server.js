import http from 'node:http';
import { createOAuthHandler } from './oauth.js';
import { readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createAccess, bearer, equalSecret } from './access.js';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { toNodeHandler, hostHeaderValidation } from '@modelcontextprotocol/node';
import { convertIsolated, reviewIsolated } from './converter.js';
import { MAX_JSON_BYTES, exportSchema, validationSchema, parseInput } from './contracts.js';
import { MAX_FILE_BYTES, validateFilename } from './convert.js';
import { createReviewServer } from './mcp.js';
import { createDocumentStore, DOCUMENT_TTL_MS } from './document-store.js';
import { listGuidance, readGuidance } from './content.js';
import { llmsIndex, workflowDocument, agentPage, infoHtml } from './docs.js';
import { textDocument } from './convert.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.woff2': 'font/woff2', '.jpg': 'image/jpeg' };
const staticFiles = new Map([['/', 'index.html'], ['/style.css', 'style.css'], ['/app.js', 'app.js'], ['/admin', 'admin.html'], ['/admin.js', 'admin.js'], ['/fonts/InstrumentSans-Variable.woff2', 'fonts/InstrumentSans-Variable.woff2'], ['/fonts/InstrumentSans-Italic.woff2', 'fonts/InstrumentSans-Italic.woff2'], ['/media/earth.jpg', 'media/earth.jpg']]);
const failure = (message, status = 400) => Object.assign(new Error(message), { status });

async function readBody(req, max) {
  if (Number(req.headers['content-length'] || 0) > max) throw failure('Request is too large.', 413);
  const chunks = []; let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > max) throw failure('Request is too large.', 413);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export async function createService({ baseUrl = process.env.BASE_URL || 'http://localhost:3334', accessToken = process.env.PROTECT_APP === undefined ? process.env.ACCESS_TOKEN || '' : '', trustProxy = process.env.TRUST_PROXY === '1', protectApp = process.env.PROTECT_APP === 'true', adminToken = process.env.ADMIN_TOKEN || '', accessDb = process.env.ACCESS_DB || resolve(root, '.state/access.sqlite'), oauthFetch = fetch } = {}) {
  let origin = new URL(baseUrl).origin;
  if (!['http:', 'https:'].includes(new URL(baseUrl).protocol)) throw new Error('BASE_URL must be HTTP or HTTPS.');
  if (protectApp && adminToken.length < 32) throw new Error('PROTECT_APP=true requires an ADMIN_TOKEN of at least 32 characters.');
  if (adminToken && adminToken.length < 32) throw new Error('ADMIN_TOKEN must be at least 32 characters.');
  const access = protectApp || adminToken ? createAccess({ path: accessDb }) : null;
  const requiresToken = protectApp || !!accessToken;
  const context = new AsyncLocalStorage();
  const documents = createDocumentStore();
  const rates = new Map();
  const requests = new Set();
  let activeRequests = 0;
  const permittedOrigins = new Set((process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean));
  const checkHost = hostHeaderValidation([new URL(origin).hostname, 'localhost', '127.0.0.1', '[::1]']);
  const owner = () => context.getStore()?.id || null;
  const mcp = createMcpHandler(() => createReviewServer({ baseUrl: origin, requiresToken, store: documents, owner, observe: (operation, outcome) => access?.record(context.getStore(), operation, outcome) }), { legacy: 'stateless', maxSubscriptions: 8 });
  const handleMcp = toNodeHandler(mcp);
  const auth = req => {
    if (protectApp) return access.authenticate(bearer(req), 'agent', origin + '/mcp');
    if (accessToken && !equalSecret(bearer(req), accessToken)) throw failure('An access token is required for this service.', 401);
    return null;
  };
  const cookieName = new URL(origin).protocol === 'https:' ? '__Host-review_access' : 'review_access';
  const browserToken = req => (req.headers.cookie || '').split(';').map(part => part.trim()).find(part => part.startsWith(cookieName + '='))?.slice(cookieName.length + 1) || '';
  const browserAuth = req => {
    if (!protectApp) throw failure('Invitation access is not enabled.', 404);
    return access.authenticate(browserToken(req), 'browser');
  };
  const browserMutation = req => {
    if (req.headers.origin !== origin) throw failure('Use the invitation form on this website.', 403);
  };
  const setBrowserCookie = (res, token) => res.setHeader('Set-Cookie', `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${token ? 30 * 86400 : 0}${new URL(origin).protocol === 'https:' ? '; Secure' : ''}`);
  const smallJson = async req => {
    if (!req.headers['content-type']?.includes('application/json')) throw failure('Use application/json.', 415);
    let input;
    try { input = JSON.parse((await readBody(req, 4096)).toString()); }
    catch (error) { if (error.status) throw error; throw failure('Invalid JSON.'); }
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw failure('Use a JSON object.');
    return input;
  };
  function rate(req, bucket, maximum, period) {
    const peer = req.socket.remoteAddress;
    const isLoopback = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(peer);
    const ip = trustProxy && isLoopback ? String(req.headers['x-forwarded-for'] || peer).split(',').at(-1).trim() : peer;
    const key = `${bucket}:${ip}`;
    let entry = rates.get(key);
    if (!entry || entry.expires <= Date.now()) {
      if (rates.size >= 10000) throw failure('The service is busy. Please retry later.', 429);
      entry = { count: 0, expires: Date.now() + period }; rates.set(key, entry);
    }
    if (++entry.count > maximum) throw failure('Too many requests. Please retry later.', 429);
  }
  const send = (res, status, body, type = 'application/json; charset=utf-8') => {
    res.writeHead(status, { 'Content-Type': type });
    res.end(type.startsWith('application/json') ? JSON.stringify(body) : body);
  };
  const oauth = protectApp ? createOAuthHandler({ access, origin: () => origin, send, readBody, rate, browserToken, setBrowserCookie, metadataFetch: oauthFetch }) : null;
  const server = http.createServer({ requestTimeout: 60_000, headersTimeout: 15_000 }, async (req, res) => {
    const controller = new AbortController();
    const abort = () => controller.abort();
    req.once('aborted', abort);
    res.once('close', abort);
    requests.add(controller);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
    try {
      if (!checkHost(req, res)) return;
      const url = new URL(req.url, origin), path = url.pathname;
      if (oauth && await oauth(req, res, url)) return;
      if (req.headers.origin && req.headers.origin !== origin && !permittedOrigins.has(req.headers.origin)) throw failure('Origin is not allowed.', 403);
      if (path.startsWith('/api/admin/')) {
        rate(req, 'admin', 120, 60_000);
        if (!adminToken || !equalSecret(bearer(req), adminToken)) throw failure('An admin token is required.', 401);
        if (req.method === 'GET' && path === '/api/admin/summary') return send(res, 200, { ...access.snapshot(), protected: protectApp, uptime_seconds: Math.floor(process.uptime()), active_requests: activeRequests, memory_mb: Math.round(process.memoryUsage().rss / 1048576) });
        if (req.method === 'GET' && path === '/api/admin/logs.csv') {
          res.setHeader('Content-Disposition', 'attachment; filename="usage.csv"');
          return send(res, 200, access.csv(), 'text/csv; charset=utf-8');
        }
        if (req.method === 'POST') {
          const input = await smallJson(req);
          if (path === '/api/admin/invitations') {
            const invitation = access.createInvitation(input.name);
            const invitationUrl = new URL('/', origin);
            invitationUrl.searchParams.set('invite', invitation.code);
            return send(res, 201, { ...invitation, url: invitationUrl.href });
          }
          if (typeof input.id !== 'string' || !/^[a-f0-9]{24}$/.test(input.id)) throw failure('Invalid access record.');
          if (path === '/api/admin/revoke-invitation') { access.revokeInvitation(input.id); return send(res, 200, { ok: true }); }
          if (path === '/api/admin/revoke-key') { access.revokeKey(input.id); return send(res, 200, { ok: true }); }
          if (path === '/api/admin/show-invitation') {
            const invitation = access.showInvitation(input.id);
            const invitationUrl = new URL('/', origin);
            if (invitation.code) invitationUrl.searchParams.set('invite', invitation.code);
            return send(res, 200, { ...invitation, url: invitation.code ? invitationUrl.href : null });
          }
        }
        throw failure('Not found.', 404);
      }
      if (req.method === 'POST' && path.startsWith('/api/access/')) {
        rate(req, 'invitation', 20, 60_000);
        browserMutation(req);
        if (!protectApp) throw failure('Invitation access is not enabled.', 404);
        if (path === '/api/access/redeem') {
          const { code } = await smallJson(req);
          const issued = access.redeem(code);
          setBrowserCookie(res, issued.token);
          return send(res, 200, { ok: true });
        }
        const identity = browserAuth(req);
        if (path === '/api/access/handoff') return send(res, 201, { url: `${origin}/connect/${access.handoff(browserToken(req))}` });
        if (path === '/api/access/logout') { access.revokeKey(identity.credential_id); setBrowserCookie(res, ''); return send(res, 200, { ok: true }); }
        throw failure('Not found.', 404);
      }
      if (req.method === 'GET' && /^\/connect\/[A-Za-z0-9_-]{43}$/.test(path)) {
        rate(req, 'handoff', 30, 60_000);
        if (!protectApp) throw failure('Invitation access is not enabled.', 404);
        res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
        const token = access.claim(path.slice('/connect/'.length));
        const setup = `# Private connection setup\n\nThis private setup link is reusable and does not expire. Save the credential securely before continuing. Do not print it in your reply, put it in a URL, commit it, or include it in logs.\n\nMCP endpoint: ${origin}/mcp\nAuthorization header: Bearer ${token}\n\nConfigure this header in the client's private MCP settings. Use the same header for HTTP conversion, validation, and export. If you cannot configure MCP headers, use the HTTP workflow with a private credential file, or explain the client's limitation. Do not claim the connection works until you have called a tool. Never send this credential to any other origin.\n\n`;
        return send(res, 200, setup + agentPage('info', origin) + '\n\n' + workflowDocument(origin), 'text/markdown; charset=utf-8');
      }
      if (path === '/mcp') {
        rate(req, 'mcp', 180, 60_000); const identity = auth(req);
        if (req.method === 'POST') {
          if (activeRequests >= 2) throw failure('Two requests are already processing. Please retry in a moment.', 503);
          activeRequests++;
          try {
            if (!req.headers['content-type']?.includes('application/json')) throw failure('Use application/json.', 415);
            let body;
            try { body = JSON.parse((await readBody(req, MAX_JSON_BYTES)).toString()); }
            catch (error) { if (error.status) throw error; throw failure('Invalid JSON.'); }
            await context.run(identity, () => handleMcp(req, res, body));
            body = null;
          } finally { activeRequests--; }
        } else await handleMcp(req, res);
        return;
      }
      if (req.method === 'GET' && path === '/health') return send(res, 200, { status: 'ok' });
      if (req.method === 'GET' && path === '/api/config') {
        let unlocked = false;
        if (protectApp) { try { browserAuth(req); unlocked = true; } catch {} }
        return send(res, 200, { mcp_url: `${origin}/mcp`, requires_token: requiresToken, protected: protectApp, unlocked, daily_limit: protectApp ? 50 : null, max_bytes: MAX_FILE_BYTES, max_json_bytes: MAX_JSON_BYTES, document_retention_minutes: DOCUMENT_TTL_MS / 60000, hosted_reviews: false });
      }
      if (req.method === 'GET' && path === '/skill.md') {
        res.setHeader('X-Robots-Tag', 'noindex');
        return send(res, 200, workflowDocument(origin), 'text/markdown; charset=utf-8');
      }
      if (req.method === 'GET' && (path === '/info.md' || path === '/info')) {
        return send(res, 200, path === '/info.md' ? agentPage('info', origin) : infoHtml(origin), path === '/info.md' ? 'text/markdown; charset=utf-8' : 'text/html; charset=utf-8');
      }
      if (req.method === 'GET' && path === '/llms.txt') {
        res.setHeader('X-Robots-Tag', 'noindex');
        return send(res, 200, llmsIndex(origin), 'text/plain; charset=utf-8');
      }
      const docsMatch = path.match(/^\/docs\/(tools|uploads|outputs|limits|without-mcp)\.md$/);
      if (req.method === 'GET' && docsMatch) {
        res.setHeader('X-Robots-Tag', 'noindex');
        res.writeHead(308, { Location: '/skill.md' });
        return res.end();
      }
      if (req.method === 'GET' && path === '/api/guidance') return send(res, 200, listGuidance());
      if (req.method === 'GET' && path.startsWith('/guidance/')) return send(res, 200, readGuidance(decodeURIComponent(path.slice(10))).content, 'text/markdown; charset=utf-8');
      if (req.method === 'GET' && path === '/attribution') return send(res, 200, await readFile(join(root, 'ATTRIBUTION.md')), 'text/plain; charset=utf-8');
      if (req.method === 'POST' && ['/api/convert', '/api/text', '/api/validate-comments', '/api/export-review'].includes(path)) {
        rate(req, 'processing', 120, 3600_000); const identity = auth(req);
        const operation = { '/api/convert': 'convert', '/api/text': 'create_text_document', '/api/validate-comments': 'validate_comments', '/api/export-review': 'export_review' }[path];
        if (access) {
          let recorded = false;
          const record = outcome => { if (!recorded) { recorded = true; access.record(identity, operation, outcome); } };
          res.once('finish', () => record(res.statusCode === 429 || res.statusCode === 503 ? 'limited' : res.statusCode < 400 ? 'success' : 'error'));
          res.once('close', () => record('cancelled'));
        }
        if (activeRequests >= 2) throw failure('Two requests are already processing. Please retry in a moment.', 503);
        activeRequests++;
        try {
          if (path === '/api/convert') {
            const filename = validateFilename(decodeURIComponent(req.headers['x-filename'] || ''));
            let buffer = await readBody(req, MAX_FILE_BYTES);
            const settle = identity && access ? access.reserveConversion(identity) : () => {};
            let document;
            try { document = await convertIsolated(buffer, filename, controller.signal); settle(true); }
            catch (error) { settle(false); throw error; }
            buffer = null;
            const receipt = documents.put(document, identity?.id);
            const result = { ...receipt, filename: document.filename, markdown: document.markdown, warnings: document.warnings, figures: document.assets.map(({ id, mimeType }) => ({ id, mime_type: mimeType })), instruction: 'First read get_review_instructions (or /llms.txt). Read the full Markdown and relevant guidance, complete technical, editorial, and reference passes, then combine findings and send document_id with comments and summary for validation and export.' };
            return send(res, 200, result);
          }
          if (!req.headers['content-type']?.includes('application/json')) throw failure('Use application/json.', 415);
          let body;
          try { body = JSON.parse((await readBody(req, MAX_JSON_BYTES)).toString()); }
          catch (error) { if (error.status) throw error; throw failure('Invalid JSON.'); }
          if (path === '/api/text') {
            const document = textDocument(body.filename, body.text, body.format || 'markdown');
            body = null;
            const receipt = documents.put(document, identity?.id);
            return send(res, 201, { ...receipt, markdown: document.markdown, warnings: [], figures: [], instruction: 'First read get_review_instructions (or /llms.txt). Read the full Markdown and relevant guidance, complete technical, editorial, and reference passes, then combine findings and send document_id with comments and summary for validation and export.' });
          }
          if (path === '/api/validate-comments') {
            const { document_id, comments } = parseInput(validationSchema, body);
            body = null;
            return send(res, 200, await reviewIsolated({ document: documents.get(document_id, identity?.id), comments }, 'validate', controller.signal));
          }
          const { document_id, ...review } = parseInput(exportSchema, body);
          body = null;
          const document = documents.get(document_id, identity?.id);
          const rendered = await reviewIsolated({ document, ...review }, 'render', controller.signal);
          if (rendered.invalid.length) return send(res, 422, { valid: false, invalid: rendered.invalid });
          res.setHeader('Content-Disposition', 'attachment; filename="review.html"');
          res.setHeader('Content-Security-Policy', rendered.contentSecurityPolicy);
          return send(res, 200, rendered.html, 'text/html; charset=utf-8');
        } finally { activeRequests--; }
      }
      if (req.method === 'GET' && staticFiles.has(path)) {
        const file = staticFiles.get(path), extension = file.slice(file.lastIndexOf('.'));
        return send(res, 200, await readFile(join(root, 'public', file)), mime[extension]);
      }
      if (req.method === 'GET' && path === '/robots.txt') return send(res, 200, 'User-agent: *\nDisallow: /api/\n', 'text/plain');
      throw failure('Not found.', 404);
    } catch (error) {
      if (!res.destroyed && !res.headersSent) {
        if (error.status === 401) res.setHeader('WWW-Authenticate', protectApp ? `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource/mcp", scope="review"` : 'Bearer realm="AI peer review MCP"');
        if (error.status === 429 || error.status === 503) res.setHeader('Retry-After', error.message.startsWith('Daily limit') ? String(Math.ceil((Date.parse(new Date(Date.now() + 86400000).toISOString().slice(0, 10)) - Date.now()) / 1000)) : '60');
        send(res, error.status || 400, { error: error.message });
      }
      else if (!res.destroyed) res.end();
    } finally {
      requests.delete(controller);
      req.removeListener('aborted', abort);
      res.removeListener('close', abort);
    }
  });
  const cleanup = setInterval(() => {
    access?.prune();
    documents.prune();
    for (const [id, entry] of rates) if (entry.expires <= Date.now()) rates.delete(id);
  }, 60_000);
  cleanup.unref();
  return {
    server,
    documents,
    async listen(port = Number(process.env.PORT || 3334), host = process.env.HOST || '127.0.0.1') {
      await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, resolve); });
      if (new URL(origin).port === '0') origin = origin.replace(':0', `:${server.address().port}`);
      return origin;
    },
    async close() { clearInterval(cleanup); for (const controller of requests) controller.abort(); rates.clear(); documents.clear(); await mcp.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); access?.close(); },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const service = await createService();
  console.log(`AI peer review MCP listening at ${await service.listen()}`);
  for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => { void service.close().then(() => process.exit(0)); });
}
