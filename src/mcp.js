import { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { listGuidance, readGuidance } from './content.js';
import { workflowDocument } from './docs.js';
import { reviewIsolated } from './converter.js';
import { searchReferences } from './references.js';
import { MAX_FILE_BYTES, validateFilename, textDocument } from './convert.js';
import { validationSchema, reviewShape } from './contracts.js';

const textResult = value => ({ content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) }] });
const readOnly = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };

export function conversionInstructions(baseUrl, filename, requiresToken) {
  return { url: baseUrl + '/api/convert', method: 'POST', headers: { 'X-Filename': encodeURIComponent(validateFilename(filename)), Accept: 'application/json', 'Content-Type': 'application/octet-stream' }, requires_token: requiresToken, max_bytes: MAX_FILE_BYTES,
    instruction: 'Read get_review_instructions before reviewing. POST the file bytes. The response includes Markdown and a document_id valid for 30 minutes. Use that ID for validation and export.' };
}

export function createReviewServer({ baseUrl, requiresToken = false, store, owner = () => null, observe = () => {} }) {
  const instructions = workflowDocument(baseUrl);
  const server = new McpServer({ name: 'mim-review', version: '0.3.0' }, { instructions: 'First call get_review_instructions. When delegation is supported, launch three parallel reviewer subagents: Technical Reviewer, Editorial Reviewer, and Reference Checker. The main agent combines their results, writes the summary itself, validates, and exports; do not launch a fourth agent. Review plain text directly. For Word/PDF, convert once and use the returned 30-minute document_id. The agent writes the review; this service validates quotes and returns standalone HTML.' });
  const register = (name, description, schema, handler, annotations = readOnly) => {
    server.registerTool(name, { description, inputSchema: schema, annotations }, async (args, extra) => {
      try {
        const result = await handler(args, extra);
        observe(name, result?.valid === false ? 'error' : 'success');
        return textResult(result);
      }
      catch { observe(name, 'error'); return { ...textResult({ error: 'The operation failed. Check the request schema and retry.' }), isError: true }; }
    });
  };
  register('get_review_instructions', 'Required before reviewing: read the full workflow, detailed reviewer roles, review-depth guidance, and merge/completeness checks.', z.object({}), () => instructions);
  register('prepare_document', 'Get upload instructions for Word or PDF.', z.object({ filename: z.string().max(240) }), ({ filename }) => conversionInstructions(baseUrl, filename, requiresToken));
  register('create_text_document', 'Temporarily register an existing plain-text or Markdown manuscript. Skip Word/PDF conversion.', z.object({ filename: z.string().min(1).max(240), text: z.string().min(1).max(1_000_000), format: z.enum(['markdown', 'text']).default('markdown') }), ({ filename, text, format }) => {
    const document = textDocument(filename, text, format);
    return { ...store.put(document, owner()), markdown: document.markdown, warnings: [], figures: [], instruction: 'First read get_review_instructions (or /llms.txt). Read the full Markdown and relevant guidance, complete technical, editorial, and reference passes, then combine findings and pass document_id with comments and summary to validate_comments and export_review.' };
  });
  register('read_document', 'Read retained manuscript Markdown. Continue until next_offset is null.', z.object({ document_id: z.string().regex(/^[a-f0-9]{48}$/), offset: z.number().int().min(0).default(0), limit: z.number().int().min(100).max(40000).default(20000) }), ({ document_id, offset, limit }) => {
    const document = store.get(document_id, owner());
    return { document_id, filename: document.filename, markdown: document.markdown.slice(offset, offset + limit), warnings: document.warnings, figures: document.assets.map(({ id, mimeType }) => ({ id, mime_type: mimeType })), next_offset: offset + limit < document.markdown.length ? offset + limit : null };
  });
  server.registerTool('read_figure', { description: 'Read one retained Word figure.', inputSchema: z.object({ document_id: z.string().regex(/^[a-f0-9]{48}$/), figure_id: z.string().regex(/^image-[1-9]\d{0,2}$/) }), annotations: readOnly }, async ({ document_id, figure_id }) => {
    try {
      const asset = store.get(document_id, owner()).assets.find(item => item.id === figure_id);
      if (!asset) throw new Error('Figure not found.');
      observe('read_figure', 'success');
      return { content: [{ type: 'image', data: asset.data, mimeType: asset.mimeType }] };
    } catch { observe('read_figure', 'error'); return { ...textResult({ error: 'Figure not found.' }), isError: true }; }
  });
  register('list_guidance', 'Read the guidance table of contents and select relevant chapters.', z.object({}), () => listGuidance());
  register('read_guidance', 'Read an exact guidance ID. Follow next_offset for long chapters.', z.object({ id: z.string().max(160), offset: z.number().int().min(0).default(0), limit: z.number().int().min(100).max(40000).default(20000) }), ({ id, offset, limit }) => {
    const entry = readGuidance(id);
    return { id, content: entry.content.slice(offset, offset + limit), total_characters: entry.content.length, next_offset: offset + limit < entry.content.length ? offset + limit : null };
  });
  register('search_references', 'Look up bibliography metadata in Crossref, with optional OpenAlex fallback. Returns candidates and explicit errors; the agent judges matches.', z.object({ references: z.array(z.object({ key: z.string().max(100), raw: z.string().min(1).max(2000), title: z.string().max(500).optional(), doi: z.string().max(300).optional() })).min(1).max(10) }), ({ references }, extra) => searchReferences(references, { signal: extra?.signal }), { ...readOnly, openWorldHint: true });
  register('validate_comments', 'Validate comments against a retained document.', validationSchema, ({ document_id, comments }, extra) => reviewIsolated({ document: store.get(document_id, owner()), comments }, 'validate', extra?.signal));
  register('export_review', 'Return one standalone annotated HTML review.', z.object(reviewShape).strict(), async ({ document_id, ...review }, extra) => {
    const document = store.get(document_id, owner());
    const rendered = await reviewIsolated({ document, ...review }, 'render', extra?.signal);
    if (rendered.invalid.length) return { valid: false, invalid: rendered.invalid };
    return { valid: true, primary: { filename: 'review.html', mime_type: 'text/html', text: rendered.html }, comments: rendered.comments.length, limitations: rendered.limitations };
  });
  register('delete_document', 'Delete a retained document before its 30-minute expiry.', z.object({ document_id: z.string().regex(/^[a-f0-9]{48}$/) }), ({ document_id }) => { store.delete(document_id, owner()); return { deleted: true }; }, { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false });
  server.registerResource('peer-review-workflow', 'review://instructions', { mimeType: 'text/markdown', description: 'Peer review skill and workflow' }, uri => ({ contents: [{ uri: uri.href, mimeType: 'text/markdown', text: instructions }] }));
  server.registerResource('guidance-index', 'review://guidance', { mimeType: 'application/json', description: 'Guidance table of contents' }, uri => ({ contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(listGuidance()) }] }));
  server.registerPrompt('peer-review', { description: 'Review a manuscript using conversion, guidance, validation, and export.', }, () => ({ messages: [{ role: 'user', content: { type: 'text', text: instructions } }] }));
  return server;
}
