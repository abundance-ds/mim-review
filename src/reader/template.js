import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { parseHTML } from 'linkedom';
import { escapeHtml as esc, markdownHtml } from '../html.js';

const css = readFileSync(new URL('./reader.css', import.meta.url), 'utf8');
const script = readFileSync(new URL('./reader.js', import.meta.url), 'utf8');
const font = readFileSync(new URL('../../public/fonts/InstrumentSans-Variable.woff2', import.meta.url)).toString('base64');
const italicFont = readFileSync(new URL('../../public/fonts/InstrumentSans-Italic.woff2', import.meta.url)).toString('base64');
const fontLicense = readFileSync(new URL('../../public/fonts/InstrumentSans-OFL.txt', import.meta.url), 'utf8');
const hash = value => createHash('sha256').update(value).digest('base64');
const policy = `default-src 'none'; script-src 'sha256-${hash(script)}'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'`;
export const readerPolicy = `${policy}; frame-ancestors 'none'`;
export const safeJson = value => JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
const roleNames = { 'Technical Reviewer': 'Technical', 'Editorial Reviewer': 'Editorial', 'Reference Checker': 'References' };

function summaryHtml(summary, count) {
  const { document } = parseHTML(`<html><body>${markdownHtml(summary)}</body></html>`);
  const visit = node => {
    if (['A', 'CODE', 'PRE'].includes(node.nodeName)) return;
    if (node.nodeType !== 3) { for (const child of [...node.childNodes]) visit(child); return; }
    const text = node.textContent, fragment = document.createDocumentFragment();
    let from = 0;
    for (const match of text.matchAll(/\[(\d+(?:\s*[,–-]\s*\d+)*)\]/g)) {
      const numbers = [];
      for (const part of match[1].split(',')) {
        const range = part.trim().split(/[–-]/).map(Number);
        const [first, last = first] = range;
        if (first < 1 || last > count || first > last) { numbers.length = 0; break; }
        for (let number = first; number <= last; number++) numbers.push(number);
      }
      if (!numbers.length) continue;
      fragment.append(document.createTextNode(text.slice(from, match.index) + '['));
      numbers.forEach((number, index) => {
        if (index) fragment.append(document.createTextNode(', '));
        const link = document.createElement('a'); link.href = `#comment-${number}`; link.textContent = String(number); link.setAttribute('aria-label', `Read comment ${number}`); fragment.append(link);
      });
      fragment.append(document.createTextNode(']')); from = match.index + match[0].length;
    }
    if (from) { fragment.append(document.createTextNode(text.slice(from))); node.replaceWith(fragment); }
  };
  visit(document.body);
  return document.body.innerHTML;
}

export function readerHtml({ document, review, html, comments, limitations, reportMarkdown, markdown }) {
  const counts = Object.fromEntries(['major', 'minor', 'suggestion'].map(s => [s, comments.filter(c => c.severity === s).length]));
  const payload = { filename: document.filename, format: document.format, summary: review.summary, coverage: review.coverage, limitations, comments: comments.map(({ start, end, ...c }) => c), warnings: document.warnings, reportMarkdown, markdown, manuscriptMarkdown: document.markdown, assets: document.assets };
  const filterMenu = (name, label, options) => `<details class="menu filter-menu" data-filter="${name}"><summary><span class="filter-label">All ${label}</span> <span class="chevron" aria-hidden="true"></span></summary><div class="menu-panel"><div class="filter-actions"><button type="button" data-filter-action="all">Select all</button><button type="button" data-filter-action="none">Hide all</button></div><fieldset><legend class="sr-only">Show ${label}</legend>${options.map(([value, title, count]) => `<label class="filter-option"><input type="checkbox" data-filter-option="${name}" value="${esc(value)}" checked><span>${esc(title)}</span><span class="option-count">${count}</span></label>`).join('')}</fieldset></div></details>`;
  const priorityMenu = filterMenu('priority', 'priorities', [['major', 'Major', counts.major], ['minor', 'Minor', counts.minor], ['suggestion', 'Suggestions', counts.suggestion]]);
  const reviewerMenu = filterMenu('reviewer', 'reviewers', Object.entries(roleNames).map(([value, title]) => [value, title, comments.filter(c => c.reviewer === value).length]));
  const cards = comments.map(c => `<section class="comment" id="${c.id}" data-number="${c.number}" data-severity="${c.severity}" data-reviewer="${esc(c.reviewer)}" tabindex="-1" aria-label="Comment ${c.number}">
    <header><a class="comment-link" href="#anchor-${c.number}" aria-label="Go to passage for comment ${c.number}"><span class="card-number">${c.number}</span><span class="severity ${c.severity}">${esc(c.severity)}</span></a><span class="reviewer" title="${esc(c.reviewer)}">${esc(roleNames[c.reviewer] || c.reviewer)}</span><button class="close-comment enhanced-only" type="button" data-action="close" aria-label="Close comment">×</button></header>
    <blockquote>${esc(c.text_snippet)}</blockquote><div class="comment-content">${markdownHtml(c.content)}</div>
  </section>`).join('');
  const coverage = Object.entries(review.coverage).map(([role, status]) => `<span class="coverage-status ${status !== 'complete' ? 'incomplete' : ''}">${esc(role === 'references' ? 'References' : role[0].toUpperCase() + role.slice(1))}<span>${esc(status)}</span></span>`).join('');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="${esc(policy)}"><title>${esc(document.filename)} — Peer review</title><style>@font-face{font-family:'Instrument Sans';src:url(data:font/woff2;base64,${font}) format('woff2');font-weight:400 700;font-display:swap}@font-face{font-family:'Instrument Sans';src:url(data:font/woff2;base64,${italicFont}) format('woff2');font-style:italic;font-weight:400 700;font-display:swap}\n${css}</style></head>
<body><a class="skip-link" href="#manuscript">Skip to manuscript</a>
<header class="toolbar" id="toolbar"><div class="topbar"><a class="review-title" href="#overview">mim-review</a><div class="header-filters enhanced-only"><details class="menu sections-menu"><summary>Sections <span class="chevron" aria-hidden="true"></span></summary><nav class="menu-panel" id="outline" aria-label="Manuscript sections"><a href="#overview">Summary</a><a href="#comments" data-action="comment-list">Comments</a><a href="#manuscript">Manuscript</a></nav></details>${priorityMenu}${reviewerMenu}</div><nav class="top-actions enhanced-only" aria-label="Review actions"><button id="highlight-toggle" aria-pressed="true" title="Show or hide manuscript highlights">Highlights</button><details class="menu enhanced-only" id="download-menu"><summary class="download-toggle">Download <span class="chevron" aria-hidden="true"></span></summary><div class="menu-panel"><button data-download="html">Annotated HTML <span>.html</span></button><button data-download="report">Review <span>.md</span></button><button data-download="full">Review + manuscript <span>.md</span></button><button data-download="manuscript">Manuscript <span>.md</span></button><button data-download="json">Review data <span>.json</span></button>${document.assets.length ? '<button data-download="figures">Figures <span>image files</span></button>' : ''}<hr><button data-action="print">Print review / Save PDF</button><button data-action="print-manuscript">Print with manuscript</button></div></details></nav></div></header>
<main class="workspace" id="workspace"><div class="reading-column"><section id="overview" class="overview"><div class="overview-heading"><h1>Review summary</h1><span class="overview-count">${comments.length} comment${comments.length === 1 ? '' : 's'}</span></div><div class="summary">${summaryHtml(review.summary, comments.length)}</div><div class="coverage" aria-label="Review coverage">${coverage}</div><details class="limitations" ${limitations.length ? 'open' : ''}><summary>Scope and limitations${limitations.length ? ` <span>${limitations.length}</span>` : ''}</summary>${limitations.length ? `<ul>${limitations.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '<p>No additional limitations were reported.</p>'}<p>Converted reading copy. Compare uncertain extraction with the original.</p></details></section><article class="paper" id="manuscript" aria-label="Annotated manuscript"><div class="paper-label">Manuscript</div>${html}</article><footer class="reader-footer">Review generated by the author’s AI agent. Keep this file locally.</footer></div>
<aside class="comments" id="comments" aria-label="Review comments"><div class="comments-heading" id="comments-heading"><h2>Comments</h2><span id="filter-count" class="sr-only">${comments.length}</span><nav class="comment-navigation enhanced-only" id="comment-navigation" aria-label="Comment navigation"><span id="navigation-label">${comments.length} comments</span><button type="button" data-action="previous" aria-label="Previous comment">←</button><button type="button" data-action="next" aria-label="Next comment">→</button></nav></div><p id="empty-comments" ${comments.length ? 'hidden' : ''}>${comments.length ? 'No comments match these filters.' : 'No issues were identified in the completed review passes.'}</p><div class="comment-cards" id="comment-cards">${cards}</div></aside></main>
<div id="overlap-picker" class="overlap-picker" hidden role="group" aria-label="Comments on this passage"></div><p class="status enhanced-only" id="status" role="status" aria-live="polite"></p><template id="font-license">${esc(fontLicense)}</template>
<script type="application/json" id="review-data">${safeJson(payload)}</script><script>${script}</script></body></html>`;
}
