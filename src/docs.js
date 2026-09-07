import { readFile } from 'node:fs/promises';
import { markdownHtml } from './html.js';
import { instructions } from './content.js';

const info = await readFile(new URL('../docs/agents/info.md', import.meta.url), 'utf8');

export function workflowDocument(origin) {
  return `# AI peer review MCP\n\nService origin: ${origin}\n\n` + instructions.replace(/^---\n[\s\S]*?\n---\n/, '').replace(/\]\(references\/guidance\/([a-z-]+)\/([^/)]+)\.md\)/g, (_, category, chapter) => `](${origin}/guidance/${category}/${chapter})`);
}

export function agentPage(name, origin) {
  return name === 'info' ? info.replaceAll('{{BASE_URL}}', origin) : workflowDocument(origin);
}

export const llmsIndex = workflowDocument;

export function infoHtml(origin) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Connect · mim-review MCP</title><link rel="stylesheet" href="/style.css"></head>
<body><div class="page"><main class="info"><article>${markdownHtml(agentPage('info', origin))}</article></main><footer><a href="/">home</a><a href="/info.md">markdown</a></footer></div></body></html>`;
}
