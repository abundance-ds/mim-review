import { createHash, createHmac, randomBytes } from 'node:crypto';

const hash = value => createHash('sha256').update(value).digest('hex');
const secret = () => randomBytes(32).toString('base64url');
export const oauthError = (error, description, status = 400) => Object.assign(new Error(description), { oauth: error, status });
const invalidGrant = () => oauthError('invalid_grant', 'This authorization is no longer valid. Connect again.');
export const ACCESS_SECONDS = 3600;

// OAuth metadata only. No manuscript content or raw credentials enter this store.
export function createOAuthStore(db, { now = () => new Date(), transaction }) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS oauth_settings (name TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS oauth_clients (id TEXT PRIMARY KEY, metadata TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS oauth_requests (id_hash TEXT PRIMARY KEY, browser_hash TEXT NOT NULL, request TEXT NOT NULL, expires_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS oauth_grants (id TEXT PRIMARY KEY, invitation_id TEXT NOT NULL REFERENCES invitations(id), client_id TEXT NOT NULL, resource TEXT NOT NULL, scope TEXT NOT NULL, created_at TEXT NOT NULL, revoked INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS oauth_codes (code_hash TEXT PRIMARY KEY, grant_id TEXT NOT NULL REFERENCES oauth_grants(id), redirect_uri TEXT NOT NULL, challenge TEXT NOT NULL, expires_at TEXT NOT NULL, used INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS oauth_tokens (token_hash TEXT PRIMARY KEY, grant_id TEXT NOT NULL REFERENCES oauth_grants(id), kind TEXT NOT NULL, expires_at TEXT, used_at TEXT);
    CREATE INDEX IF NOT EXISTS oauth_tokens_grant ON oauth_tokens(grant_id);
  `);
  // Rotation retries must be reproducible across restarts, but a previous
  // refresh token must never be sufficient to derive its successors.
  db.prepare('INSERT OR IGNORE INTO oauth_settings VALUES(?,?)').run('rotation_key', secret());
  const rotationKey = Buffer.from(db.prepare('SELECT value FROM oauth_settings WHERE name=?').get('rotation_key').value, 'base64url');
  const derive = (value, purpose) => createHmac('sha256', rotationKey).update(`mim-review:oauth:${purpose}:v1:`).update(value).digest('base64url');
  const iso = () => now().toISOString();
  const after = seconds => new Date(now().getTime() + seconds * 1000).toISOString();
  const activeGrant = id => db.prepare(`SELECT g.*, i.name FROM oauth_grants g JOIN invitations i ON i.id=g.invitation_id WHERE g.id=? AND g.revoked=0 AND i.revoked=0`).get(id);
  const issue = (grant, seed = secret()) => {
    const access = derive(seed, 'access'), refresh = derive(seed, 'refresh');
    db.prepare('INSERT INTO oauth_tokens VALUES(?,?,?,?,NULL)').run(hash(access), grant.id, 'access', after(ACCESS_SECONDS));
    db.prepare('INSERT INTO oauth_tokens VALUES(?,?,?,?,NULL)').run(hash(refresh), grant.id, 'refresh', null);
    return { access_token: access, token_type: 'Bearer', expires_in: ACCESS_SECONDS, refresh_token: refresh, scope: grant.scope };
  };
  const grantResponse = result => { if (!result) throw invalidGrant(); return result; };
  return {
    client(id) { const row = db.prepare('SELECT * FROM oauth_clients WHERE id=?').get(id); return row && { ...JSON.parse(row.metadata), updated_at: row.updated_at }; },
    saveClient(metadata) {
      const existing = db.prepare('SELECT id FROM oauth_clients WHERE id=?').get(metadata.client_id);
      if (!existing && db.prepare('SELECT COUNT(*) n FROM oauth_clients').get().n >= 10000) throw oauthError('temporarily_unavailable', 'Please retry later.', 503);
      db.prepare('INSERT INTO oauth_clients VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET metadata=excluded.metadata,updated_at=excluded.updated_at').run(metadata.client_id, JSON.stringify(metadata), iso());
      return metadata;
    },
    request(details, browser) {
      this.prune();
      if (db.prepare('SELECT COUNT(*) n FROM oauth_requests').get().n >= 10000) throw oauthError('temporarily_unavailable', 'Please retry later.', 503);
      const id = secret();
      db.prepare('INSERT INTO oauth_requests VALUES(?,?,?,?)').run(hash(id), hash(browser), JSON.stringify(details), after(600));
      return id;
    },
    readRequest(id, browser) {
      const row = db.prepare('SELECT request FROM oauth_requests WHERE id_hash=? AND browser_hash=? AND expires_at>?').get(hash(id), hash(browser), iso());
      if (!row) throw oauthError('invalid_request', 'Open the connection again in your AI app.');
      return JSON.parse(row.request);
    },
    cancelRequest(id, browser) {
      this.readRequest(id, browser);
      db.prepare('DELETE FROM oauth_requests WHERE id_hash=?').run(hash(id));
    },
    approve(id, browser, identity) {
      return transaction(() => {
        const request = this.readRequest(id, browser);
        if (!db.prepare('SELECT id FROM invitations WHERE id=? AND revoked=0').get(identity.id)) throw invalidGrant();
        const grant = { id: randomBytes(12).toString('hex'), invitation_id: identity.id, ...request };
        db.prepare('INSERT INTO oauth_grants VALUES(?,?,?,?,?,?,0)').run(grant.id, identity.id, request.client_id, request.resource, request.scope, iso());
        const code = secret();
        db.prepare('INSERT INTO oauth_codes VALUES(?,?,?,?,?,0)').run(hash(code), grant.id, request.redirect_uri, request.code_challenge, after(300));
        db.prepare('DELETE FROM oauth_requests WHERE id_hash=?').run(hash(id));
        return { code, request };
      });
    },
    exchange({ code, client_id, redirect_uri, code_verifier, resource }) {
      return grantResponse(transaction(() => {
        const row = db.prepare('SELECT * FROM oauth_codes WHERE code_hash=?').get(hash(code));
        const grant = row && activeGrant(row.grant_id);
        const challenge = createHash('sha256').update(code_verifier).digest('base64url');
        if (!row || !grant || grant.client_id !== client_id || grant.resource !== resource || row.redirect_uri !== redirect_uri || row.challenge !== challenge || row.expires_at <= iso()) return null;
        if (row.used) { db.prepare('UPDATE oauth_grants SET revoked=1 WHERE id=?').run(grant.id); return null; }
        db.prepare('UPDATE oauth_codes SET used=1 WHERE code_hash=?').run(hash(code));
        return issue(grant);
      }));
    },
    refresh({ refresh_token, client_id, resource, scope }) {
      return grantResponse(transaction(() => {
        const row = db.prepare("SELECT * FROM oauth_tokens WHERE token_hash=? AND kind='refresh'").get(hash(refresh_token));
        const grant = row && activeGrant(row.grant_id);
        if (!row || !grant || grant.client_id !== client_id || (resource && grant.resource !== resource) || (scope && scope !== grant.scope)) return null;
        if (row.used_at) {
          // A lost response or concurrent client request can retry the same refresh
          // for 30 seconds. Derivation reproduces the pair without storing secrets.
          if (now().getTime() - Date.parse(row.used_at) <= 30000) {
            const access = derive(refresh_token, 'access'), refresh = derive(refresh_token, 'refresh');
            const child = db.prepare('SELECT expires_at FROM oauth_tokens WHERE token_hash=?').get(hash(access));
            if (child) return { access_token: access, refresh_token: refresh, token_type: 'Bearer', expires_in: Math.max(0, Math.floor((Date.parse(child.expires_at) - now().getTime()) / 1000)), scope: grant.scope };
          }
          db.prepare('UPDATE oauth_grants SET revoked=1 WHERE id=?').run(grant.id);
          return null;
        }
        db.prepare('UPDATE oauth_tokens SET used_at=? WHERE token_hash=?').run(iso(), hash(refresh_token));
        return issue(grant, refresh_token);
      }));
    },
    authenticate(token, resource) {
      const row = db.prepare("SELECT * FROM oauth_tokens WHERE token_hash=? AND kind='access' AND expires_at>?").get(hash(token), iso());
      const grant = row && activeGrant(row.grant_id);
      return grant && grant.resource === resource ? { credential_id: grant.id, id: grant.invitation_id, name: grant.name } : null;
    },
    revoke(token, clientId) {
      const row = db.prepare('SELECT g.id,g.client_id FROM oauth_tokens t JOIN oauth_grants g ON g.id=t.grant_id WHERE t.token_hash=?').get(hash(token));
      if (row && row.client_id === clientId) db.prepare('UPDATE oauth_grants SET revoked=1 WHERE id=?').run(row.id);
    },
    revokeKey(id) { return db.prepare('UPDATE oauth_grants SET revoked=1 WHERE id=?').run(id).changes; },
    keys() { return db.prepare('SELECT id,invitation_id,created_at,revoked FROM oauth_grants ORDER BY created_at DESC').all(); },
    prune() {
      db.prepare('DELETE FROM oauth_requests WHERE expires_at<=?').run(iso());
      db.prepare('DELETE FROM oauth_codes WHERE expires_at<=?').run(iso());
      db.prepare('DELETE FROM oauth_tokens WHERE expires_at<=? OR used_at<?').run(iso(), new Date(now().getTime() - 90 * 86400000).toISOString());
    },
  };
}
