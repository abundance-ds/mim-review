import { test } from 'node:test';
import assert from 'node:assert/strict';
import { searchReferences } from '../src/references.js';

test('Metadata candidates are returned without making verification judgments', async () => {
  const results = await searchReferences([{ key: '1', raw: 'Test reference' }], { fetcher: async () => new Response(JSON.stringify({ message: { items: [{ title: ['A paper'], DOI: '10.1/example', author: [{ given: 'A', family: 'Researcher' }], published: { 'date-parts': [[2024]] } }] } })), openalexKey: '' });
  assert.equal(results[0].results[0].title, 'A paper');
  assert.deepEqual(results[0].errors, []);
});
test('Upstream failures are explicit instead of being presented as missing references', async () => {
  const results = await searchReferences([{ key: '1', raw: 'Test reference' }], { fetcher: async () => new Response('', { status: 429 }), openalexKey: '' });
  assert.deepEqual(results[0].results, []);
  assert.match(results[0].errors[0], /429/);
});

test('Cancelling a request aborts upstream lookups without starting later batches', async () => {
  const controller = new AbortController();
  let started = 0, aborted = 0;
  const fetcher = (_, { signal }) => new Promise((resolve, reject) => {
    started++;
    signal.addEventListener('abort', () => { aborted++; reject(new Error('Aborted')); }, { once: true });
  });
  const work = searchReferences(Array.from({ length: 10 }, (_, i) => ({ key: String(i), raw: 'Synthetic reference' })), { fetcher, signal: controller.signal, openalexKey: '' });
  const rejected = assert.rejects(work, /cancelled/);
  controller.abort(); await rejected;
  assert.equal(started, 3); assert.equal(aborted, 3);
});
