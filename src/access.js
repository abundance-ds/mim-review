import { DatabaseSync } from 'node:sqlite';
import { createOAuthStore } from './oauth-store.js';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';

const secret = () => randomBytes(32).toString('base64url');
const hash = value => createHash('sha256').update(value).digest('hex');
const derive = (token, purpose) => createHmac('sha256', token).update(`mim-review:${purpose}:v1`).digest('base64url');
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
export const equalSecret = (a, b) => !!a && !!b && timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());
export const bearer = req => /^Bearer ([A-Za-z0-9_.~+\/-]+={0,2})$/i.exec(req.headers.authorization || '')?.[1] || '';
const operations = new Set(['convert', 'create_text_document', 'read_document', 'read_figure', 'delete_document', 'validate_comments', 'export_review', 'get_review_instructions', 'prepare_document', 'get_upload_status', 'prepare_export', 'list_guidance', 'read_guidance', 'search_references']);
const outcomes = new Set(['success', 'error', 'limited', 'cancelled']);
const csvCell = value => '"' + String(value ?? '').replace(/^[=+@\-\t\r\n]/, "'$&").replaceAll('"', '""') + '"';

// This module accepts access metadata only. Never pass request bodies or parser errors here.
export function createAccess({ path, dailyLimit = 50, now = () => new Date() }) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path);
  if (path !== ':memory:') chmodSync(path, 0o600);
  db.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS invitations (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, code_hash TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL, revoked INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS credentials (
      id TEXT PRIMARY KEY, invitation_id TEXT NOT NULL REFERENCES invitations(id),
      token_hash TEXT NOT NULL UNIQUE, kind TEXT NOT NULL, created_at TEXT NOT NULL,
      expires_at TEXT, revoked INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS daily_usage (
      invitation_id TEXT NOT NULL REFERENCES invitations(id), day TEXT NOT NULL, count INTEGER NOT NULL,
      PRIMARY KEY(invitation_id, day));
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY, time TEXT NOT NULL, invitation_id TEXT,
      operation TEXT NOT NULL, outcome TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS events_time ON events(time);
    CREATE INDEX IF NOT EXISTS events_invitation ON events(invitation_id);
  `);
  if (!db.prepare('PRAGMA table_info(invitations)').all().some(column => column.name === 'code')) {
    db.exec('ALTER TABLE invitations ADD COLUMN code TEXT');
  }
  // Old handoffs were automatically revoked when read. Restore those links once,
  // before pruning expired rows; invitation and agent-key revocations stay intact.
  db.exec("UPDATE credentials SET kind='setup', revoked=0, expires_at=NULL WHERE kind='handoff'");
  const iso = () => now().toISOString();
  const reservations = new Map(); // The deployment runs one Node service process.
  const transaction = fn => {
    db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); db.exec('COMMIT'); return result; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  };
  const oauth = createOAuthStore(db, { now, transaction });
  const credential = (invitationId, kind, lifetime, token = secret()) => {
    const existing = db.prepare('SELECT id,invitation_id,kind,revoked FROM credentials WHERE token_hash=?').get(hash(token));
    if (existing) {
      if (existing.revoked || existing.invitation_id !== invitationId || existing.kind !== kind) throw fail('Access has been revoked.', 401);
      return { id: existing.id, token };
    }
    const id = randomBytes(12).toString('hex');
    db.prepare('INSERT INTO credentials(id,invitation_id,token_hash,kind,created_at,expires_at) VALUES(?,?,?,?,?,?)')
      .run(id, invitationId, hash(token), kind, iso(), lifetime ? new Date(now().getTime() + lifetime).toISOString() : null);
    return { id, token };
  };
  const authenticate = (token, kind = 'agent', resource) => {
    if (typeof token !== 'string' || token.length > 200 || !token) throw fail('An invitation is required. Open the homepage to enter your code.', 401);
    const row = db.prepare(`SELECT c.id AS credential_id, i.id, i.name FROM credentials c JOIN invitations i ON i.id=c.invitation_id
      WHERE c.token_hash=? AND c.kind=? AND c.revoked=0 AND i.revoked=0 AND (c.expires_at IS NULL OR c.expires_at>?)`).get(hash(token), kind, iso());
    if (!row && kind === 'agent' && resource) { const identity = oauth.authenticate(token, resource); if (identity) return identity; }
    if (!row) throw fail('Access is invalid or expired. Open the homepage to enter your invitation code.', 401);
    return row;
  };
  const record = (identity, operation, outcome) => {
    if (!operations.has(operation) || !outcomes.has(outcome)) return;
    db.prepare('INSERT INTO events(time,invitation_id,operation,outcome) VALUES(?,?,?,?)').run(iso(), identity?.id || null, operation, outcome);
  };
  function prune() {
    oauth.prune();
    const cutoff = new Date(now().getTime() - 90 * 86400000).toISOString();
    db.prepare('DELETE FROM events WHERE time<?').run(cutoff);
    db.prepare('DELETE FROM daily_usage WHERE day<?').run(cutoff.slice(0, 10));
    db.prepare('DELETE FROM credentials WHERE expires_at IS NOT NULL AND expires_at<?').run(iso());
  }
  prune();
  return {
    dailyLimit, authenticate, record, prune, oauth,
    isActive(identity) {
      if (!identity) return true;
      const invitation = db.prepare('SELECT id FROM invitations WHERE id=? AND revoked=0').get(identity.id);
      if (!invitation) return false;
      return !!db.prepare("SELECT id FROM credentials WHERE id=? AND invitation_id=? AND kind='agent' AND revoked=0 AND (expires_at IS NULL OR expires_at>?)").get(identity.credential_id, identity.id, iso())
        || oauth.isActive(identity.credential_id, identity.id);
    },
    createInvitation(name) {
      if (typeof name !== 'string' || !name.trim() || name.length > 100 || /[\x00-\x1f\x7f]/.test(name)) throw fail('Enter a name of 1–100 characters.');
      const id = randomBytes(12).toString('hex'), alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      let code;
      do { code = Array.from(randomBytes(8), byte => alphabet[byte & 31]).join(''); }
      while (db.prepare('SELECT id FROM invitations WHERE code_hash=?').get(hash(code)));
      db.prepare('INSERT INTO invitations(id,name,code_hash,created_at,code) VALUES(?,?,?,?,?)').run(id, name.trim(), hash(code), iso(), code);
      return { id, name: name.trim(), code };
    },
    showInvitation(id) {
      const invitation = db.prepare('SELECT id,name,code FROM invitations WHERE id=? AND revoked=0').get(id);
      if (!invitation) throw fail('Invitation not found.', 404);
      return invitation;
    },
    redeem(code) {
      if (typeof code !== 'string' || code.length > 200) throw fail('Invitation code is invalid.', 401);
      const trimmed = code.trim();
      // New codes ignore case; keep previously issued long codes valid.
      const normalized = /^[A-HJ-NP-Z2-9]{8}$/i.test(trimmed) ? trimmed.toUpperCase() : trimmed;
      const invitation = db.prepare('SELECT id FROM invitations WHERE code_hash=? AND revoked=0').get(hash(normalized));
      if (!invitation) throw fail('Invitation code is invalid.', 401);
      const issued = credential(invitation.id, 'browser', 30 * 86400000);
      db.prepare('UPDATE invitations SET code=? WHERE id=? AND code IS NULL').run(normalized, invitation.id);
      return issued;
    },
    handoff(browserToken) {
      const identity = authenticate(browserToken, 'browser');
      return credential(identity.id, 'setup', null, derive(browserToken, 'setup')).token;
    },
    claim(token) {
      return transaction(() => {
        const identity = authenticate(token, 'setup');
        const issued = credential(identity.id, 'agent', null, derive(token, 'agent'));
        return issued.token;
      });
    },
    revokeInvitation(id) {
      const result = db.prepare('UPDATE invitations SET revoked=1 WHERE id=?').run(id);
      if (!result.changes) throw fail('Invitation not found.', 404);
    },
    revokeKey(id) {
      const result = db.prepare('UPDATE credentials SET revoked=1 WHERE id=?').run(id);
      if (!result.changes && !oauth.revokeKey(id)) throw fail('Key not found.', 404);
    },
    reserveConversion(identity) {
      const day = iso().slice(0, 10), key = `${identity.id}:${day}`;
      const used = db.prepare('SELECT count FROM daily_usage WHERE invitation_id=? AND day=?').get(identity.id, day)?.count || 0;
      const pending = reservations.get(key) || 0;
      if (used + pending >= dailyLimit) throw fail(`Daily limit reached (${dailyLimit} conversions). Try again after 00:00 UTC.`, 429);
      reservations.set(key, pending + 1);
      let settled = false;
      return success => {
        if (settled) return;
        settled = true;
        const remaining = reservations.get(key) - 1;
        if (remaining) reservations.set(key, remaining); else reservations.delete(key);
        if (success) db.prepare('INSERT INTO daily_usage VALUES(?,?,1) ON CONFLICT(invitation_id,day) DO UPDATE SET count=count+1').run(identity.id, day);
      };
    },
    snapshot() {
      prune();
      const day = iso().slice(0, 10);
      const users = db.prepare(`SELECT i.id,i.name,i.created_at,i.revoked,
        COALESCE(d.count,0) AS conversions_today,
        (SELECT MAX(e.time) FROM events e WHERE e.invitation_id=i.id) AS last_used,
        (SELECT COUNT(*) FROM events e WHERE e.invitation_id=i.id) AS calls,
        (SELECT COUNT(*) FROM events e WHERE e.invitation_id=i.id AND e.outcome='error') AS errors
        FROM invitations i LEFT JOIN daily_usage d ON d.invitation_id=i.id AND d.day=? ORDER BY i.created_at DESC`).all(day);
      const keys = db.prepare("SELECT id,invitation_id,created_at,revoked FROM credentials WHERE kind='agent' ORDER BY created_at DESC").all();
      const events = db.prepare(`SELECT e.time,COALESCE(i.name,'Anonymous') AS who,e.operation,e.outcome FROM events e
        LEFT JOIN invitations i ON i.id=e.invitation_id ORDER BY e.id DESC LIMIT 100`).all();
      const totals = db.prepare(`SELECT COUNT(*) AS calls,COALESCE(SUM(outcome='error'),0) AS errors,
        COALESCE(SUM(operation='convert' AND outcome='success'),0) AS conversions FROM events WHERE time>=?`).get(day);
      return { users, keys: [...keys, ...oauth.keys()], events, totals, daily_limit: dailyLimit, retention_days: 90, day };
    },
    csv() {
      prune();
      const rows = db.prepare(`SELECT e.time,COALESCE(i.name,'Anonymous') AS who,e.operation,e.outcome FROM events e
        LEFT JOIN invitations i ON i.id=e.invitation_id ORDER BY e.id`).all();
      return 'when,who,what,result\r\n' + rows.map(row => [row.time, row.who, row.operation, row.outcome].map(csvCell).join(',')).join('\r\n');
    },
    close() { db.close(); },
  };
}
