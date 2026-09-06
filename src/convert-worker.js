import { parentPort, workerData } from 'node:worker_threads';
import { convert } from './convert.js';
import { renderReview, validateComments } from './review.js';

try {
  let document;
  if (workerData.operation === 'convert') document = await convert(Buffer.from(workerData.buffer), workerData.filename);
  else if (workerData.operation === 'validate') {
    const { valid, invalid } = validateComments(workerData.input.document.html, workerData.input.comments);
    document = { valid: !invalid.length, accepted: valid.map(({ start, end, ...comment }) => comment), invalid };
  } else {
    const { document: manuscript, ...review } = workerData.input;
    document = renderReview(manuscript, review);
  }
  parentPort.postMessage({ document });
}
catch (error) { parentPort.postMessage({ error: error.message }); }
