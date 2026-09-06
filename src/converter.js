import { Worker } from 'node:worker_threads';
let active = 0;

async function runIsolated(workerData, signal) {
  if (signal?.aborted) throw new Error('Request cancelled.');
  if (active >= 2) throw Object.assign(new Error('Two requests are already processing. Please retry in a moment.'), { status: 503 });
  active++;
  try {
    return await new Promise((resolve, reject) => {
      const worker = new Worker(new URL('./convert-worker.js', import.meta.url), { workerData, stdout: true, stderr: true, resourceLimits: { maxOldGenerationSizeMb: 256 } });
      // Parsers can emit diagnostics containing source text. Never forward them to logs.
      worker.stdout.resume();
      worker.stderr.resume();
      let settled = false;
      const finish = async (error, document) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
        await worker.terminate().catch(() => {});
        error ? reject(error) : resolve(document);
      };
      const abort = () => { void finish(new Error('Request cancelled.')); };
      const timer = setTimeout(() => { void finish(new Error('Processing exceeded 45 seconds. Try a smaller document.')); }, 45_000);
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) abort();
      worker.once('message', value => finish(value.error ? new Error(value.error) : null, value.document));
      worker.once('error', () => finish(new Error('Processing failed. The document may be malformed or too complex.')));
      worker.once('exit', code => { if (!settled) finish(new Error(`Conversion stopped unexpectedly (${code}).`)); });
    });
  } finally { active--; }
}

export const convertIsolated = (buffer, filename, signal) => runIsolated({ operation: 'convert', buffer, filename }, signal);
export const reviewIsolated = (input, operation = 'render', signal) => runIsolated({ operation, input }, signal);
