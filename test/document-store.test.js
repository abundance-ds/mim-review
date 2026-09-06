import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDocumentStore } from '../src/document-store.js';
import { exampleDocument } from './review-fixtures.js';

test('Temporary documents expire, are owner-scoped, and can be deleted early', () => {
  let now = 1_000;
  const store = createDocumentStore({ ttlMs: 30 * 60 * 1000, now: () => now });
  const saved = store.put(exampleDocument, 'invitation-a');
  assert.match(saved.document_id, /^[a-f0-9]{48}$/);
  assert.equal(store.get(saved.document_id, 'invitation-a'), exampleDocument);
  assert.throws(() => store.get(saved.document_id, 'invitation-b'), /not found or expired/);
  now += 30 * 60 * 1000;
  assert.throws(() => store.get(saved.document_id, 'invitation-a'), /not found or expired/);

  const next = store.put(exampleDocument, null);
  assert.equal(store.delete(next.document_id, null), exampleDocument);
  assert.throws(() => store.get(next.document_id, null), /not found or expired/);
});
