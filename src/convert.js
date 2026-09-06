import mammoth from 'mammoth';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import { unzipSync } from 'fflate';
import { cleanHtml, markdownHtml, escapeHtml } from './html.js';

export const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_TEXT_CHARS = 1_000_000;

export function validateFilename(filename) {
  const value = String(filename || '').split(/[\\/]/).pop().replace(/[\x00-\x1f\x7f]/g, '').slice(0, 200);
  if (!/\.(docx|pdf)$/i.test(value)) throw new Error('Choose a Word .docx file (preferred) or a text-based .pdf. Older .doc files must be saved as .docx first.');
  return value;
}

export function textDocument(filename, text, format = 'markdown') {
  const cleanName = String(filename || 'manuscript.md').split(/[\\/]/).pop().replace(/[\x00-\x1f\x7f]/g, '').slice(0, 200) || 'manuscript.md';
  if (!['markdown', 'text'].includes(format)) throw new Error('Choose markdown or text.');
  if (typeof text !== 'string' || !text.trim()) throw new Error('The manuscript text is empty.');
  if (text.length > MAX_TEXT_CHARS) throw new Error('The manuscript exceeds the one-million-character text limit.');
  const markdown = format === 'text' ? escapeHtml(text).replace(/([\\`*_{}\[\]()#+.!|~>\-])/g, '\\$1') : text;
  return { filename: cleanName, format, markdown, html: markdownHtml(markdown), assets: [], warnings: [], pageCount: null };
}

export async function convert(buffer, filename) {
  filename = validateFilename(filename);
  if (!buffer.length || buffer.length > MAX_FILE_BYTES) throw new Error('The file must be between 1 byte and 20 MB.');
  if (/\.pdf$/i.test(filename)) return convertPdf(buffer, filename);
  if (buffer[0] !== 0x50 || buffer[1] !== 0x4b) throw new Error('This file is not a valid .docx document.');
  let total = 0, count = 0;
  // Inspect ZIP metadata before Mammoth expands the archive.
  const xml = unzipSync(buffer, { filter: entry => {
    total += entry.originalSize;
    if (++count > 2000 || total > 64 * 1024 * 1024 || entry.originalSize > 20 * 1024 * 1024) throw new Error('The expanded Word document is too large.');
    return entry.name === 'word/document.xml';
  } });
  if (!xml['word/document.xml']) throw new Error('The archive does not contain a Word document.');
  const warnings = [];
  const documentXml = Buffer.from(xml['word/document.xml']).toString('utf8');
  if (/<(?:\w+:)?oMath\b/.test(documentXml)) warnings.push('Word equations may not survive extraction. Compare equations with the original document before reviewing them.');
  if (/<w:(?:ins|del)\b/.test(documentXml)) warnings.push('Tracked changes are present. Review the intended version in Word; extraction may flatten revisions.');
  let imageBytes = 0;
  const assets = [];
  const result = await mammoth.convertToHtml({ buffer }, { externalFileAccess: false, convertImage: mammoth.images.imgElement(async image => {
    if (!['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(image.contentType)) {
      warnings.push(`An image in ${image.contentType || 'an unknown format'} was omitted. Inspect it in Word.`);
      return { src: '', alt: '[Image omitted: inspect original]' };
    }
    const data = await image.read('base64');
    imageBytes += data.length;
    if (imageBytes > 5_000_000 || assets.length >= 30) { warnings.push('Some images were omitted because the image budget was exceeded.'); return { src: '', alt: '[Image omitted: inspect original]' }; }
    const id = `image-${assets.length + 1}`;
    assets.push({ id, mimeType: image.contentType, data });
    return { src: `data:${image.contentType};base64,${data}`, alt: id };
  }) });
  for (const message of result.messages) warnings.push(message.message);
  const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
  turndown.use(gfm);
  turndown.keep(['sup', 'sub']);
  // Keep complex tables as HTML instead of flattening merged cells into prose.
  turndown.addRule('complexTable', { filter: node => node.nodeName === 'TABLE' && (!!node.querySelector('[colspan], [rowspan]') || !node.querySelector('th')), replacement: (_, node) => `\n\n${node.outerHTML}\n\n` });
  turndown.addRule('images', { filter: 'img', replacement: (_, node) => `\n\n[Figure: ${node.getAttribute('alt') || 'inspect original'}]\n\n` });
  const html = cleanHtml(result.value);
  const markdown = turndown.turndown(html);
  if (!markdown.trim()) throw new Error('No readable text was found in this Word document.');
  if (markdown.length > MAX_TEXT_CHARS) throw new Error('The document exceeds the one-million-character text limit. Split it before uploading.');
  return { filename, format: 'docx', markdown, html, assets, warnings: [...new Set(warnings)], pageCount: null };
}

async function convertPdf(buffer, filename) {
  if (!buffer.subarray(0, 1024).includes(Buffer.from('%PDF-'))) throw new Error('This file is not a valid PDF.');
  const { PDFParse } = await import('pdf-parse');
  const parser = new PDFParse({ data: new Uint8Array(buffer), isEvalSupported: false, verbosity: 0 });
  try {
    const info = await parser.getInfo();
    if (info.total > 150) throw new Error('PDFs are limited to 150 pages. Split the document before uploading.');
    const result = await parser.getText({ pageJoiner: '', lineEnforce: true });
    const warnings = ['PDF text extraction is approximate. Columns, equations, tables, and reading order may be wrong. Figures are not extracted. Prefer the original Word file when available.'];
    const sparse = result.pages.filter(page => page.text.trim().length < 40).map(page => page.num);
    if (sparse.length) warnings.push(`Little or no text on pages ${sparse.join(', ')}. These pages may be scanned or contain figures. They have not been OCRed.`);
    if (result.pages.reduce((sum, page) => sum + page.text.trim().length, 0) < 40) throw new Error('No usable PDF text was found. This may be a scan. Upload the Word original or OCR the PDF using your own tools first.');
    // Treat extracted text literally: PDF strings must not become Markdown HTML or links.
    const literal = text => escapeHtml(text).replace(/([\\`*_{}\[\]()#+.!|~>\-])/g, '\\$1');
    const markdown = result.pages.map(page => `## Page ${page.num}\n\n${literal(page.text.trim()) || '[No extractable text on this page]'}`).join('\n\n');
    if (markdown.length > MAX_TEXT_CHARS) throw new Error('The extracted PDF text is too large. Split the document before uploading.');
    return { filename, format: 'pdf', markdown, html: markdownHtml(markdown), assets: [], warnings, pageCount: result.total };
  } finally { await parser.destroy(); }
}
