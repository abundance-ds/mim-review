import { randomBytes } from 'node:crypto';
import { escapeHtml } from './html.js';
import { oauthError } from './oauth-store.js';

const random = () => randomBytes(32).toString('base64url');
const invalid = message => oauthError('invalid_request', message);
const scopes = ['review', 'offline_access'];
const scopeValue = value => {
  const selected = [...new Set((value || 'review offline_access').split(' ').filter(Boolean))];
  if (!selected.includes('review') || selected.some(scope => !scopes.includes(scope))) throw oauthError('invalid_scope', 'Use the review scope.');
  return selected.sort().join(' ');
};
function callback(value) {
  let url;
  try { url = new URL(value); } catch { throw invalid('Invalid callback address.'); }
  if (value.length > 2048 || url.hash || url.username || url.password || !['https:', 'http:'].includes(url.protocol)) throw invalid('Invalid callback address.');
  const loopback = ['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname);
  if (url.protocol === 'http:' && !loopback) throw invalid('Callbacks must use HTTPS or a local loopback address.');
  return { url, loopback: loopback && url.protocol === 'http:' };
}
export function matchesCallback(requested, registered) {
  const target = callback(requested);
  return registered.some(value => {
    const known = callback(value);
    if (target.loopback && known.loopback) {
      target.url.port = ''; known.url.port = '';
      return target.url.href === known.url.href;
    }
    return requested === value;
  });
}
function clientMetadata(input, clientId) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw invalid('Invalid client metadata.');
  if (typeof input.client_name !== 'string' || !input.client_name.trim() || input.client_name.length > 100 || /[\x00-\x1f\x7f]/.test(input.client_name)) throw invalid('A client name is required.');
  if (!Array.isArray(input.redirect_uris) || !input.redirect_uris.length || input.redirect_uris.length > 10 || input.redirect_uris.some(uri => typeof uri !== 'string')) throw invalid('Register one to ten callback addresses.');
  input.redirect_uris.forEach(callback);
  if (input.token_endpoint_auth_method && input.token_endpoint_auth_method !== 'none') throw invalid('Use a public client with PKCE (token_endpoint_auth_method: none).');
  if (input.grant_types && (!Array.isArray(input.grant_types) || input.grant_types.some(type => !['authorization_code', 'refresh_token'].includes(type)))) throw invalid('Unsupported grant type.');
  if (input.response_types && (!Array.isArray(input.response_types) || input.response_types.some(type => type !== 'code'))) throw invalid('Use response_type code.');
  return { client_id: clientId, client_name: input.client_name.trim(), redirect_uris: input.redirect_uris, token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'] };
}
const parameters = params => {
  const result = {};
  for (const [key, value] of params) {
    if (Object.hasOwn(result, key)) throw invalid('Repeated parameters are not allowed.');
    if (value.length > 4096) throw invalid('Parameter is too long.');
    Object.defineProperty(result, key, { value, enumerable: true });
  }
  return result;
};
const needed = (data, key) => {
  if (typeof data[key] !== 'string' || !data[key] || data[key].length > 4096) throw invalid(`Missing or invalid ${key}.`);
  return data[key];
};

export function createOAuthHandler({ access, origin, send, readBody, rate, browserToken, setBrowserCookie, metadataFetch = fetch }) {
  const store = access.oauth;
  const cookieName = () => origin().startsWith('https:') ? '__Host-review_oauth' : 'review_oauth';
  const csrfCookie = req => (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith(cookieName() + '='))?.slice(cookieName().length + 1) || '';
  const metadataCache = new Map();
  const inflight = new Map();
  async function client(id) {
    if (!id.startsWith('https://')) {
      const saved = store.client(id);
      if (!saved) throw oauthError('invalid_client', 'Client is not registered.');
      return saved;
    }
    // Only official client-metadata hosts are fetched. Other clients can use
    // dynamic registration. Never fetch arbitrary client-supplied URLs or redirects.
    const url = new URL(id);
    if (!['claude.ai', 'chatgpt.com'].includes(url.hostname) || url.port || url.username || url.password || url.hash || url.search || !url.pathname.startsWith('/oauth/') || url.href !== id) throw oauthError('invalid_client', 'Use dynamic registration for this client.');
    const cached = metadataCache.get(id);
    if (cached?.expires > Date.now()) return cached.value;
    if (inflight.has(id)) return inflight.get(id);
    const pending = (async () => {
      const response = await metadataFetch(id, { redirect: 'error', signal: AbortSignal.timeout(5000), headers: { Accept: 'application/json' } });
      if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) throw oauthError('invalid_client', 'Could not verify the client. Try again.');
      let size = 0; const chunks = [];
      for await (const part of response.body) {
        size += part.length;
        if (size > 16384) throw oauthError('invalid_client', 'Client metadata is too large.');
        chunks.push(part);
      }
      const data = JSON.parse(Buffer.concat(chunks).toString());
      if (data.client_id !== id) throw oauthError('invalid_client', 'Client metadata does not match its address.');
      const value = clientMetadata(data, id);
      const cacheControl = response.headers.get('cache-control') || '';
      const seconds = /no-store|no-cache/.test(cacheControl) ? 0 : Math.min(3600, Number(/max-age=(\d+)/.exec(cacheControl)?.[1] ?? 300));
      if (metadataCache.size >= 500) metadataCache.delete(metadataCache.keys().next().value);
      metadataCache.set(id, { value, expires: Date.now() + seconds * 1000 });
      return value;
    })();
    inflight.set(id, pending);
    try { return await pending; }
    catch (error) { if (error.oauth) throw error; throw oauthError('invalid_client', 'Could not verify the client. Try again.'); }
    finally { inflight.delete(id); }
  }
  function identity(req) {
    try { return access.authenticate(browserToken(req), 'browser'); } catch { return null; }
  }
  function page(res, requestId, request, user, message = '', status = 200) {
    const target = new URL(request.redirect_uri);
    // no-referrer makes native form POSTs use Origin: null in Chromium.
    // Send only the origin (never the OAuth query) so CSRF origin checks work.
    res.setHeader('Referrer-Policy', 'strict-origin');
    // Browsers apply form-action to the final OAuth redirect as well as the POST.
    // Permit only this request's already validated callback origin.
    res.setHeader('Content-Security-Policy', `default-src 'none'; style-src 'self' 'unsafe-inline'; font-src 'self'; form-action 'self' ${target.origin}; base-uri 'none'; frame-ancestors 'none'`);
    const returnTo = target.hostname === 'localhost' || target.hostname === '127.0.0.1' || target.hostname === '[::1]' ? 'an app on this computer (' + target.origin + ')' : target.origin;
    const e = escapeHtml;
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Connect · AI peer review MCP</title><link rel="stylesheet" href="/style.css"></head><body><div class="page"><main class="authorize"><h1>Connect ${e(request.client_name)}</h1><p>Allow this app to use AI peer review MCP.</p><p class="small">Return to ${e(returnTo)}.</p><form method="post" action="/oauth/authorize"><input type="hidden" name="request" value="${e(requestId)}">${user ? `<p>Using ${e(user.name)}’s invitation.</p>` : '<label for="code">Invitation code</label><div class="endpoint"><input id="code" name="code" type="text" autocomplete="off" maxlength="200" required autofocus></div>'}${message ? `<p role="alert">${e(message)}</p>` : ''}<div class="authorization-actions"><button class="plain-button" name="decision" value="allow">Connect</button><button class="text-button" name="decision" value="deny" formnovalidate>Cancel</button></div></form></main></div></body></html>`;
    send(res, status, html, 'text/html; charset=utf-8');
  }
  const redirect = (res, request, values) => {
    const url = new URL(request.redirect_uri);
    for (const [key, value] of Object.entries(values)) url.searchParams.set(key, value);
    if (request.state !== undefined) url.searchParams.set('state', request.state);
    url.searchParams.set('iss', origin());
    res.writeHead(303, { Location: url.href }); res.end();
  };
  return async (req, res, url) => {
    const path = url.pathname;
    if (!path.startsWith('/oauth/') && !path.startsWith('/.well-known/')) return false;
    const api = path !== '/oauth/authorize';
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
    if (api) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, MCP-Protocol-Version');
      if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return true; }
    }
    try {
      rate(req, 'oauth', 120, 60000);
      const resource = origin() + '/mcp';
      if (req.method === 'GET' && ['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp'].includes(path)) {
        send(res, 200, { resource, authorization_servers: [origin()], scopes_supported: scopes, bearer_methods_supported: ['header'], resource_name: 'AI peer review MCP' }); return true;
      }
      if (req.method === 'GET' && path === '/.well-known/oauth-authorization-server') {
        send(res, 200, { issuer: origin(), authorization_endpoint: origin() + '/oauth/authorize', token_endpoint: origin() + '/oauth/token', registration_endpoint: origin() + '/oauth/register', revocation_endpoint: origin() + '/oauth/revoke', scopes_supported: scopes, response_types_supported: ['code'], grant_types_supported: ['authorization_code', 'refresh_token'], token_endpoint_auth_methods_supported: ['none'], revocation_endpoint_auth_methods_supported: ['none'], code_challenge_methods_supported: ['S256'], client_id_metadata_document_supported: true, authorization_response_iss_parameter_supported: true }); return true;
      }
      if (req.method === 'POST' && path === '/oauth/register') {
        rate(req, 'oauth-register', 20, 3600000);
        if (!req.headers['content-type']?.includes('application/json')) throw invalid('Use application/json.');
        const input = JSON.parse((await readBody(req, 16384)).toString());
        const metadata = clientMetadata(input, random());
        send(res, 201, { ...store.saveClient(metadata), client_id_issued_at: Math.floor(Date.now() / 1000) }); return true;
      }
      if (req.method === 'GET' && path === '/oauth/authorize') {
        const data = parameters(url.searchParams);
        if (data.response_type !== 'code') throw oauthError('unsupported_response_type', 'Use response_type code.');
        const metadata = await client(needed(data, 'client_id'));
        if (!matchesCallback(needed(data, 'redirect_uri'), metadata.redirect_uris)) throw invalid('Callback address is not registered.');
        if (data.resource !== resource) throw oauthError('invalid_target', 'Use this server’s MCP URL as the resource.');
        if (data.code_challenge_method !== 'S256' || !/^[A-Za-z0-9_-]{43}$/.test(data.code_challenge || '')) throw invalid('S256 PKCE is required.');
        const request = { client_id: data.client_id, client_name: metadata.client_name, redirect_uri: data.redirect_uri, resource, scope: scopeValue(data.scope), state: data.state, code_challenge: data.code_challenge };
        let browser = csrfCookie(req);
        if (!/^[A-Za-z0-9_-]{43}$/.test(browser)) {
          browser = random(); res.setHeader('Set-Cookie', `${cookieName()}=${browser}; Path=/; HttpOnly; SameSite=Lax; Max-Age=3600${origin().startsWith('https:') ? '; Secure' : ''}`);
        }
        page(res, store.request(request, browser), request, identity(req)); return true;
      }
      if (req.method === 'POST' && ['/oauth/authorize', '/oauth/token', '/oauth/revoke'].includes(path)) {
        if (!req.headers['content-type']?.includes('application/x-www-form-urlencoded')) throw invalid('Use application/x-www-form-urlencoded.');
        const data = parameters(new URLSearchParams((await readBody(req, 16384)).toString()));
        if (path === '/oauth/authorize') {
          if (req.headers.origin !== origin()) throw oauthError('access_denied', 'Submit the connection form on this site.', 403);
          rate(req, 'oauth-invitation', 20, 60000);
          const id = needed(data, 'request'), browser = csrfCookie(req), request = store.readRequest(id, browser);
          if (data.decision === 'deny') { store.cancelRequest(id, browser); redirect(res, request, { error: 'access_denied' }); return true; }
          if (data.decision !== 'allow') throw invalid('Choose Connect or Cancel.');
          let user = identity(req), session;
          if (!user) {
            try { session = access.redeem(data.code); user = access.authenticate(session.token, 'browser'); }
            catch { page(res, id, request, null, 'Invitation code is invalid.', 400); return true; }
          }
          const approved = store.approve(id, browser, user);
          if (session) setBrowserCookie(res, session.token);
          redirect(res, request, { code: approved.code }); return true;
        }
        needed(data, 'client_id');
        if (req.headers.authorization || data.client_secret) throw oauthError('invalid_client', 'Use public-client authentication with PKCE.');
        if (path === '/oauth/revoke') { store.revoke(needed(data, 'token'), data.client_id); send(res, 200, {}); return true; }
        if (data.grant_type === 'authorization_code') {
          for (const field of ['code', 'redirect_uri', 'resource', 'code_verifier']) needed(data, field);
          if (!/^[A-Za-z0-9._~-]{43,128}$/.test(data.code_verifier)) throw oauthError('invalid_grant', 'Invalid PKCE verifier.');
          send(res, 200, store.exchange(data)); return true;
        }
        if (data.grant_type === 'refresh_token') { needed(data, 'refresh_token'); send(res, 200, store.refresh({ ...data, scope: data.scope ? scopeValue(data.scope) : undefined })); return true; }
        throw oauthError('unsupported_grant_type', 'Use authorization_code or refresh_token.');
      }
      send(res, 404, { error: 'invalid_request', error_description: 'Endpoint not found.' });
    } catch (error) {
      if (error.status === 429) res.setHeader('Retry-After', '60');
      send(res, error.status || 400, { error: error.oauth || 'invalid_request', error_description: error.oauth ? error.message : error.status === 429 ? 'Please retry shortly.' : 'Invalid request.' });
    }
    return true;
  };
}
