import { randomBytes } from 'node:crypto';
import { ServiceError } from './service-error.js';

// Capability metadata only: no file bytes, names, comments, or rendered output.
export function createTransfers({ now = Date.now, ttlMs = 30 * 60 * 1000, maxEntries = 1024, maxPerOwner = 128, active = () => true } = {}) {
  const entries = new Map();
  const unavailable = () => new ServiceError('transfer_unavailable', 'This transfer link is unavailable or expired.', 'Call prepare_document or prepare_export again for a new link.', 404);
  const prune = () => { for (const [id, entry] of entries) if (entry.expires <= now()) entries.delete(id); };
  return {
    issue(purpose, identity, documentId = null) {
      prune();
      if ([...entries.values()].filter(entry => (entry.identity?.id || null) === (identity?.id || null)).length >= maxPerOwner) throw new ServiceError('transfer_capacity', 'Too many pending transfers for this invitation.', 'Use an existing transfer link or retry in a few minutes.', 429);
      if (entries.size >= maxEntries) throw new ServiceError('transfer_capacity', 'Transfer capacity is temporarily full.', 'Retry in a few minutes.', 503);
      const id = randomBytes(32).toString('base64url');
      entries.set(id, { purpose, identity: identity ? { id: identity.id, credential_id: identity.credential_id } : null, documentId, expires: now() + ttlMs, busy: false });
      return { id, expires_at: new Date(now() + ttlMs).toISOString() };
    },
    get(id, purpose, owner) {
      prune(); const entry = entries.get(id);
      if (!entry || entry.purpose !== purpose || !active(entry.identity) || (owner !== undefined && (entry.identity?.id || null) !== owner)) throw unavailable();
      return entry;
    },
    prune, clear() { entries.clear(); },
  };
}
