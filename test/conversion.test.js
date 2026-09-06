import { test } from 'node:test';
import assert from 'node:assert/strict';
import { convert } from '../src/convert.js';
import { docxFixture, pdfFixture } from './fixtures.js';
import { validateComments } from '../src/review.js';

test('Word conversion preserves text, bold formatting, table values, and cross-run quotes', async () => {
  const document = await convert(docxFixture(), 'study.docx');
  assert.match(document.markdown, /\*\*24 volunteers\*\*/);
  assert.match(document.html, /<table>/);
  assert.match(document.markdown, /12\.5/);
  assert.match(document.markdown, /<table>/);
  assert.equal(validateComments(document.html, [{ text_snippet: 'We recruited 24 volunteers from one university.', content: 'Sample size rationale?', severity: 'minor', reviewer: 'Technical Reviewer' }]).invalid.length, 0);
});

test('PDF conversion extracts text without an AI service and identifies unreadable pages', async () => {
  const document = await convert(await pdfFixture({ sparsePage: true }), 'study.pdf');
  assert.equal(document.pageCount, 2);
  assert.match(document.markdown, /24 volunteers/);
  assert.ok(document.warnings.some(message => message.includes('pages 2')));
  assert.equal(validateComments(document.html, [{ text_snippet: 'The difference was not statistically significant (p = 0.12).', content: 'Report uncertainty.', severity: 'minor', reviewer: 'Technical Reviewer' }]).invalid.length, 0);
});

test('Rejects unreadable PDFs, invalid files, and older Word format', async () => {
  await assert.rejects(convert(await pdfFixture({ empty: true }), 'scan.pdf'), /No usable PDF text/);
  await assert.rejects(convert(Buffer.from('not a PDF'), 'bad.pdf'), /not a valid PDF/);
  await assert.rejects(convert(docxFixture(), 'old.doc'), /saved as .docx/);
  await assert.rejects(convert(Buffer.from('not a ZIP'), 'bad.docx'), /not a valid .docx/);
});
