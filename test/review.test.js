import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { validateComments, renderReview } from '../src/review.js';
import { exampleDocument, exampleReview } from './review-fixtures.js';
import { cleanHtml } from '../src/html.js';
import { createHash } from 'node:crypto';
import { conversionFiles, reviewFiles, zipFiles } from '../src/artifacts.js';
import { unzipSync, strFromU8 } from 'fflate';

const comment = text_snippet => ({ text_snippet, content: 'Check the interpretation.', severity: 'major', reviewer: 'Technical Reviewer' });
test('Rejects missing/ambiguous quotes and allows a specified occurrence', () => {
  const html = '<p>Same words.</p><p>Same words.</p>';
  assert.equal(validateComments(html, [comment('Missing')]).invalid.length, 1);
  assert.match(validateComments(html, [comment('Same words.')]).invalid[0].reason, /more than once/);
  assert.equal(validateComments(html, [{ ...comment('Same words.'), occurrence: 2 }]).valid.length, 1);
  assert.equal(validateComments(html, [{ ...comment('Same words.'), occurrence: 3 }]).invalid.length, 1);
});

test('Anchors across formatted text, entities, blocks, and overlapping passages', () => {
  const html = '<p>A <strong>bold &amp; specific</strong> result.</p><p>Next sentence.</p>';
  const comments = [comment('A bold & specific result.'), { ...comment('specific result. Next sentence.'), content: 'Second issue.' }];
  const rendered = renderReview({ ...exampleDocument, html }, { ...exampleReview, comments });
  assert.deepEqual(rendered.invalid, []);
  const { document } = parseHTML(rendered.html);
  assert.ok(document.querySelector('#anchor-1'));
  assert.ok(document.querySelector('#anchor-2'));
  assert.ok(document.querySelector('strong mark'));
  assert.match(document.querySelector('.paper').textContent, /bold & specific/);
  assert.equal(document.querySelectorAll('aside .comment').length, 2);
});

test('Sanitizes manuscript and reviewer HTML, strips trackers, and preserves safe images', () => {
  const input = '<p onclick="alert(1)">text<script>alert(1)</script></p><img src="https://tracker.test/a"><img src="data:image/svg+xml;base64,PHN2Zz4="><img src="data:image/png;base64,iVBORw0KGgo=">';
  const cleaned = cleanHtml(input);
  assert.doesNotMatch(cleaned, /script|onclick|tracker|svg/);
  assert.match(cleaned, /data:image\/png/);
  const result = renderReview(exampleDocument, { ...exampleReview, summary: '<script>alert(1)</script>Summary', comments: exampleReview.comments.map(c => ({ ...c, content: '<img src=x onerror=alert(1)>Feedback' })) });
  const { document } = parseHTML(result.html);
  assert.equal(document.querySelectorAll('script').length, 2);
  assert.doesNotMatch(document.querySelector('.summary').innerHTML, /script/);
  assert.equal(document.querySelectorAll('[onerror], [onclick], img[src="x"]').length, 0);
});

test('Reader payload cannot break out of JSON; trusted script matches its CSP hash', () => {
  const result = renderReview({ ...exampleDocument, filename: '</script><script>alert(1)</script>.docx' }, { ...exampleReview, summary: 'Literal </script><img src=x onerror=alert(1)> text' });
  const { document } = parseHTML(result.html);
  assert.equal(document.querySelectorAll('script').length, 2);
  const payload = JSON.parse(document.getElementById('review-data').textContent);
  assert.equal(payload.filename, '</script><script>alert(1)</script>.docx');
  assert.deepEqual(payload.coverage, exampleReview.coverage);
  assert.equal(payload.summary, 'Literal </script><img src=x onerror=alert(1)> text');
  assert.ok(document.querySelector('[data-download="json"]'));
  const script = document.querySelector('script:not([type])').textContent;
  const digest = createHash('sha256').update(script).digest('base64');
  assert.ok(result.contentSecurityPolicy.includes("'sha256-" + digest + "'"));
  assert.ok(document.querySelector('meta[http-equiv="Content-Security-Policy"]').getAttribute('content').includes(digest));
  assert.match(result.contentSecurityPolicy, /connect-src 'none'/);
  assert.equal(document.querySelectorAll('script[src], link[rel="stylesheet"]').length, 0);
});

test('Overlapping fragments expose all memberships, with stable occurrence anchors', () => {
  const html = '<p>Repeated words.</p><p>Repeated <strong>words.</strong> Next sentence.</p>';
  const result = renderReview({ ...exampleDocument, html }, { ...exampleReview, comments: [{ ...comment('Repeated words.'), occurrence: 2 }, { ...comment('words. Next sentence.'), content: 'Overlap.' }] });
  const { document } = parseHTML(result.html);
  assert.equal(document.querySelector('.paper p:first-of-type mark'), null);
  assert.ok(document.querySelector('strong mark[data-comments="comment-1 comment-2"]'));
  assert.equal(document.querySelectorAll('#anchor-1').length, 1);
  assert.equal(document.querySelectorAll('#anchor-2').length, 1);
});

test('ZIP artifacts preserve images, warnings and review input without storage', () => {
  const asset = { id: 'image-1', mimeType: 'image/png', data: 'iVBORw0KGgo=' };
  const document = { ...exampleDocument, assets: [asset], warnings: ['Equation omitted.'], markdown: exampleDocument.markdown + '\n\n[Figure: image-1]' };
  const converted = unzipSync(zipFiles(conversionFiles(document)));
  assert.deepEqual(Buffer.from(converted['figures/image-1.png']), Buffer.from(asset.data, 'base64'));
  assert.match(strFromU8(converted['manuscript.md']), /figures\/image-1.png/);
  const result = renderReview(document, exampleReview);
  const files = unzipSync(zipFiles(reviewFiles(document, exampleReview, result)));
  assert.match(strFromU8(files['report.md']), /Equation omitted/);
  assert.doesNotMatch(strFromU8(files['report.md']), /## Manuscript \(converted\)/);
  assert.match(strFromU8(files['review.md']), /## Manuscript \(converted\)/);
  assert.deepEqual(JSON.parse(strFromU8(files['review.json'])), { document, ...exampleReview });
});

test('Partial coverage and extraction warnings survive export; no-comments review is allowed', () => {
  const result = renderReview({ ...exampleDocument, warnings: ['Equations omitted.'] }, { ...exampleReview, comments: [], coverage: { technical: 'limited', editorial: 'complete', references: 'failed' } });
  assert.match(result.html, /Equations omitted/);
  assert.match(result.markdown, /technical review: limited/);
  assert.match(result.markdown, /references review: failed/);
  assert.equal(result.comments.length, 0);
});

test('Quotes inside manuscript hyperlinks do not create nested links', () => {
  const result = renderReview({ ...exampleDocument, html: '<p>Read <a href="https://example.org">the evidence</a> carefully.</p>' }, { ...exampleReview, comments: [comment('the evidence')] });
  const { document } = parseHTML(result.html);
  assert.equal(document.querySelectorAll('a a').length, 0);
  assert.ok(document.querySelector('#anchor-1'));
});
