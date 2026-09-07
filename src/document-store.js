import { randomBytes } from 'node:crypto';
import { ServiceError } from './service-error.js';

export const DOCUMENT_TTL_MS = 30 * 60 * 1000;
const MAX_STORED_BYTES = 256 * 1024 * 1024;

const failure = (message, status = 404) => new ServiceError(status === 404 ? 'document_unavailable' : 'document_too_large', message, status === 404 ? 'Reconvert the original Word/PDF with prepare_document, or register original plain text with create_text_document; then revalidate all comments. If only cached converted text remains, disclose missing figures and preserve the original extraction warnings in limitations.' : 'Use a smaller document.', status);

export function createDocumentStore({ ttlMs = DOCUMENT_TTL_MS, maxBytes = MAX_STORED_BYTES, now = () => Date.now() } = {}) {
  const entries = new Map();
  let totalBytes = 0;
  const prune = () => {
    for (const [id, entry] of entries) {
      if (entry.expiresAt > now()) continue;
      totalBytes -= entry.bytes;
      entries.delete(id);
    }
  };
  const ownerMatches = (entry, owner) => entry.owner === (owner || null);
  return {
    ttlMs,
    put(document, owner) {
      prune();
      const bytes = Buffer.byteLength(JSON.stringify(document));
      if (bytes > maxBytes) throw failure('The converted document is too large to retain.', 413);
      while (entries.size && totalBytes + bytes > maxBytes) {
        const [oldestId, oldest] = entries.entries().next().value;
        totalBytes -= oldest.bytes;
        entries.delete(oldestId);
      }
      const id = randomBytes(24).toString('hex');
      const expiresAt = now() + ttlMs;
      entries.set(id, { document, owner: owner || null, bytes, expiresAt });
      totalBytes += bytes;
      return { document_id: id, expires_at: new Date(expiresAt).toISOString() };
    },
    get(id, owner) {
      prune();
      if (!/^[a-f0-9]{48}$/.test(String(id || ''))) throw failure('Document not found or expired.');
      const entry = entries.get(id);
      if (!entry || !ownerMatches(entry, owner)) throw failure('Document not found or expired.');
      return entry.document;
    },
    delete(id, owner) {
      const document = this.get(id, owner);
      const entry = entries.get(id);
      totalBytes -= entry.bytes;
      entries.delete(id);
      return document;
    },
    prune,
    clear() { entries.clear(); totalBytes = 0; },
    stats() { prune(); return { documents: entries.size, bytes: totalBytes }; },
  };
}
