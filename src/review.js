import { parseHTML } from 'linkedom';
import { cleanHtml } from './html.js';
import { readerHtml, readerPolicy } from './reader/template.js';
import { manuscriptMarkdown } from './artifacts.js';

const blocks = new Set(['P', 'DIV', 'SECTION', 'ARTICLE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'UL', 'OL', 'TR', 'TD', 'TH', 'BLOCKQUOTE', 'PRE', 'BR']);

function textMap(html) {
  const { document } = parseHTML(`<html><body>${cleanHtml(html)}</body></html>`);
  const chunks = [], runs = [];
  let offset = 0;
  const append = text => { chunks.push(text); offset += text.length; };
  const visit = node => {
    if (node.nodeType === 3) { runs.push({ node, start: offset, end: offset + node.textContent.length }); append(node.textContent); return; }
    if (blocks.has(node.nodeName)) append('\n');
    for (const child of node.childNodes) visit(child);
    if (blocks.has(node.nodeName)) append('\n');
  };
  visit(document.body);
  const raw = chunks.join(''), chars = [], starts = [], ends = [];
  for (let i = 0; i < raw.length; i++) {
    const char = /\s/.test(raw[i]) ? ' ' : raw[i];
    if (char === ' ' && chars.at(-1) === ' ') { ends[ends.length - 1] = i + 1; continue; }
    chars.push(char); starts.push(i); ends.push(i + 1);
  }
  return { document, runs, text: chars.join(''), starts, ends };
}

export function validateComments(html, comments) {
  const map = textMap(html), valid = [], invalid = [];
  const seen = new Set();
  comments.forEach((comment, index) => {
    const quote = comment.text_snippet.replace(/\s+/g, ' ').trim();
    if (!quote) { invalid.push({ index, reason: 'The quote is empty.' }); return; }
    const matches = [];
    for (let from = 0; from <= map.text.length;) {
      const at = map.text.indexOf(quote, from);
      if (at < 0) break;
      matches.push(at); from = at + 1;
      if (matches.length >= (comment.occurrence || 2)) break;
    }
    if (!matches.length) { invalid.push({ index, text_snippet: comment.text_snippet, reason: 'Quote not found in the converted document. Copy the exact visible wording, without Markdown markers.' }); return; }
    if (matches.length > 1 && !comment.occurrence) { invalid.push({ index, text_snippet: comment.text_snippet, reason: 'Quote occurs more than once. Use a longer quote or specify occurrence (1-based).' }); return; }
    const start = matches[(comment.occurrence || 1) - 1];
    if (start === undefined) { invalid.push({ index, reason: 'The requested quote occurrence does not exist.' }); return; }
    const key = `${start}:${quote}:${comment.content.trim()}`;
    if (seen.has(key)) { invalid.push({ index, reason: 'Duplicate comment. Merge duplicate findings before exporting.' }); return; }
    seen.add(key);
    valid.push({ ...comment, number: index + 1, id: `comment-${index + 1}`, start: map.starts[start], end: map.ends[start + quote.length - 1] });
  });
  return { map, valid, invalid };
}

function annotate({ document, runs }, comments) {
  const anchored = new Set();
  for (const { node, start, end } of runs) {
    const touching = comments.filter(comment => comment.start < end && comment.end > start);
    if (!touching.length) continue;
    // An annotation link cannot be nested inside an original manuscript link.
    for (let parent = node.parentNode; parent && parent !== document.body; parent = parent.parentNode) {
      if (parent.nodeName === 'A') {
        const span = document.createElement('span');
        span.append(...parent.childNodes);
        parent.replaceWith(span);
        break;
      }
    }
    const bounds = [...new Set([0, end - start, ...touching.flatMap(c => [Math.max(0, c.start - start), Math.min(end - start, c.end - start)])])].sort((a, b) => a - b);
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < bounds.length - 1; i++) {
      const a = bounds[i], b = bounds[i + 1];
      const active = touching.filter(c => c.start < start + b && c.end > start + a);
      const text = document.createTextNode(node.textContent.slice(a, b));
      if (!active.length) { fragment.append(text); continue; }
      const mark = document.createElement('mark');
      mark.className = active.some(c => c.severity === 'major') ? 'major' : active[0].severity;
      mark.setAttribute('data-comments', active.map(c => c.id).join(' '));
      mark.setAttribute('title', active.map(c => `Comment ${c.number} (${c.severity})`).join(', '));
      mark.append(text);
      fragment.append(mark);
      for (const comment of active) {
        if (anchored.has(comment.id)) continue;
        anchored.add(comment.id);
        const link = document.createElement('a');
        link.id = `anchor-${comment.number}`;
        link.href = `#${comment.id}`;
        link.className = 'comment-number';
        link.setAttribute('aria-label', `Read comment ${comment.number}`);
        link.textContent = `[${comment.number}]`;
        fragment.append(link);
      }
    }
    node.replaceWith(fragment);
  }
  return document.body.innerHTML;
}

export function renderReview(document, review) {
  const result = validateComments(document.html, review.comments);
  if (result.invalid.length) return { invalid: result.invalid };
  const comments = result.valid;
  const html = annotate(result.map, comments);
  const limitations = [...new Set([...document.warnings, ...review.limitations])];
  for (const [role, status] of Object.entries(review.coverage)) if (status !== 'complete') limitations.push(`${role} review: ${status}.`);
  const reportMarkdown = `# Peer review: ${document.filename}\n\n${review.summary}\n\n${limitations.length ? `## Scope and limitations\n\n${limitations.map(x => `- ${x}`).join('\n')}\n\n` : ''}## Comments\n\n${comments.map(c => `### ${c.number}. ${c.severity} — ${c.reviewer}\n\n> ${c.text_snippet.replace(/\n/g, '\n> ')}\n\n${c.content}`).join('\n\n')}\n`;
  const manuscript = manuscriptMarkdown(document);
  const markdown = `${reportMarkdown}\n---\n\n## Manuscript (converted)\n\n${manuscript}\n`;
  const output = readerHtml({ document: { ...document, markdown: manuscript }, review, html, comments, limitations, reportMarkdown, markdown });
  return { html: output, markdown, reportMarkdown, contentSecurityPolicy: readerPolicy, comments: comments.map(({ start, end, ...c }) => c), limitations, invalid: [] };
}
