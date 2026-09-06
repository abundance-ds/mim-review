import { zipSync, strToU8 } from 'fflate';

const extensions = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' };
export const figureName = asset => `figures/${asset.id}.${extensions[asset.mimeType]}`;

export function manuscriptMarkdown(document) {
  let markdown = document.markdown;
  for (const asset of document.assets) markdown = markdown.replaceAll(`[Figure: ${asset.id}]`, `![${asset.id}](${figureName(asset)})`);
  return markdown;
}

export function conversionFiles(document) {
  return {
    'document.json': JSON.stringify(document),
    'manuscript.md': manuscriptMarkdown(document),
    'extraction-warnings.json': JSON.stringify(document.warnings, null, 2),
    ...Object.fromEntries(document.assets.map(a => [figureName(a), Buffer.from(a.data, 'base64')])),
  };
}

export function reviewFiles(document, review, rendered) {
  return {
    'review.html': rendered.html,
    'review.md': rendered.markdown,
    'report.md': rendered.reportMarkdown,
    'review.json': JSON.stringify({ document, ...review }),
    'manuscript.md': manuscriptMarkdown(document),
    ...Object.fromEntries(document.assets.map(a => [figureName(a), Buffer.from(a.data, 'base64')])),
  };
}

// Bounded request-local buffers only. No archive or intermediate file touches disk.
export function zipFiles(files) {
  return Buffer.from(zipSync(Object.fromEntries(Object.entries(files).map(([name, data]) => [name, typeof data === 'string' ? strToU8(data) : data])), { level: 4 }));
}
