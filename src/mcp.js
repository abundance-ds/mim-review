import { readFileSync } from 'node:fs';
import { ServiceError, toolError } from './service-error.js';
import { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { listGuidance, readGuidance } from './content.js';
import { workflowDocument } from './docs.js';
import { reviewIsolated } from './converter.js';
import { searchReferences } from './references.js';
import { MAX_FILE_BYTES, validateFilename, textDocument } from './convert.js';
import { validationSchema, reviewShape } from './contracts.js';

const textResult = value => ({ content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) }] });
const appHtml = readFileSync(new URL('../public/mcp-app.html', import.meta.url), 'utf8');
const appUri = mode => `ui://mim-review/${mode}.html`;
const readOnly = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };

export function conversionInstructions(baseUrl, filename, requiresToken) {
  return { url: baseUrl + '/api/convert', method: 'POST', headers: { 'X-Filename': encodeURIComponent(validateFilename(filename)), Accept: 'application/json', 'Content-Type': 'application/octet-stream' }, requires_token: requiresToken, max_bytes: MAX_FILE_BYTES,
    instruction: 'Read get_review_instructions before reviewing. POST the file bytes. The response includes Markdown and a document_id valid for 30 minutes. Use that ID for validation and export.' };
}

export function createReviewServer({ baseUrl, requiresToken = false, store, transfers, identity = () => null, owner = () => null, observe = () => {} }) {
  const instructions = workflowDocument(baseUrl);
  const server = new McpServer({ name: 'mim-review', version: '0.3.0' }, { instructions: 'First call get_review_instructions. When delegation is supported, launch three parallel reviewer subagents: Technical Reviewer, Editorial Reviewer, and Reference Checker. The main agent combines their results, writes the summary itself, validates, and exports; do not launch a fourth agent. Review plain text directly. For Word/PDF, convert once and use the returned 30-minute document_id. The agent writes the review; this service validates quotes and returns standalone HTML.' });
  const register = (name, description, schema, handler, annotations = readOnly, appMode) => {
    server.registerTool(name, { description, inputSchema: schema, annotations, ...(appMode ? { _meta: { ui: { resourceUri: appUri(appMode) } } } : {}) }, async (args, extra) => {
      try {
        const result = await handler(args, extra);
        observe(name, result?.valid === false ? 'error' : 'success');
        return { ...textResult(result), ...(appMode ? { _meta: { transfer: result } } : {}) };
      }
      catch (error) { observe(name, [429, 503].includes(error.status) ? 'limited' : 'error'); return { ...textResult(toolError(error)), isError: true }; }
    });
  };
  register('get_review_instructions', 'Required before reviewing: read the full workflow, detailed reviewer roles, review-depth guidance, and merge/completeness checks.', z.object({}), () => instructions);
  register('prepare_document', 'Prepare a Word/PDF upload. File-tool agents POST to url; interactive clients show a file-picker card. If no card appears, give browser_url to the user, then call get_upload_status. No separate credentials needed.', z.object({ filename: z.string().max(240).default('manuscript.docx') }), ({ filename }) => {
    const instructions = conversionInstructions(baseUrl, filename, false);
    const ticket = transfers.issue('upload', identity());
    const url = `${baseUrl}/transfer/upload/${ticket.id}`;
    return { ...instructions, url, browser_url: url, upload_id: ticket.id, expires_at: ticket.expires_at, instruction: instructions.instruction + ' Upload using your file/HTTP tools; the URL authorizes only this upload. Do not add an Authorization header or expose the private link publicly. If you cannot upload bytes, give browser_url to the user and call get_upload_status after they upload.' };
  }, { ...readOnly, readOnlyHint: false }, 'upload');
  register('get_upload_status', 'Check whether the user uploaded their manuscript. Once ready, read_document supplies text, warnings and figures.', z.object({ upload_id: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }), ({ upload_id }) => {
    const transfer = transfers.get(upload_id, 'upload', owner());
    if (!transfer.documentId) return { status: transfer.busy ? 'processing' : 'awaiting_upload' };
    store.get(transfer.documentId, owner());
    return { status: 'ready', document_id: transfer.documentId, instruction: 'Call read_document, preserving warnings and inspecting available figures.' };
  });
  register('prepare_export', 'Get a private POST URL to save the HTML review directly to a file without sending HTML through the conversation. Does not host or retain a review.', z.object({ document_id: z.string().regex(/^[a-f0-9]{48}$/) }), ({ document_id }) => {
    store.get(document_id, owner());
    const ticket = transfers.issue('export', identity(), document_id);
    return { url: `${baseUrl}/transfer/export/${ticket.id}`, browser_url: `${baseUrl}/transfer/export/${ticket.id}`, method: 'POST', headers: { 'Content-Type': 'application/json' }, expires_at: ticket.expires_at, filename: 'review.html', instruction: 'POST your local review JSON (document_id, summary, comments, coverage, limitations). Save the HTTP response directly as review.html. No Authorization header needed. Invalid anchors return HTTP 422 JSON; correct them before retrying. No review is hosted. If your client cannot POST files and save responses, provide review.json as a downloadable attachment and browser_url. The user chooses that JSON on the browser page and downloads the HTML. If file attachments are unavailable, supply selectable review JSON for the page’s paste option; do not replace the requested HTML with Markdown.' };
  }, { ...readOnly, readOnlyHint: false });
  register('create_text_document', 'Temporarily register an existing plain-text or Markdown manuscript. Skip Word/PDF conversion.', z.object({ filename: z.string().min(1).max(240), text: z.string().min(1).max(1_000_000), format: z.enum(['markdown', 'text']).default('markdown') }), ({ filename, text, format }) => {
    const document = textDocument(filename, text, format);
    return { ...store.put(document, owner()), markdown: document.markdown, warnings: [], figures: [], instruction: 'First read get_review_instructions (or /llms.txt). Read the full Markdown and relevant guidance, complete technical, editorial, and reference passes, then combine findings and pass document_id with comments and summary to validate_comments. Follow the HTML delivery path in get_review_instructions: prepare_export for file tools, export_review for an interactive download card.' };
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
    } catch (error) { observe('read_figure', 'error'); return { ...textResult(error instanceof ServiceError ? toolError(error) : { error: 'Figure not found.', code: 'figure_unavailable', action: 'Call read_document for available figure IDs. Disclose figures you cannot inspect.' }), isError: true }; }
  });
  register('list_guidance', 'Read the guidance table of contents and select relevant chapters.', z.object({}), () => listGuidance());
  register('read_guidance', 'Read an exact guidance ID. Follow next_offset for long chapters.', z.object({ id: z.string().max(160), offset: z.number().int().min(0).default(0), limit: z.number().int().min(100).max(40000).default(20000) }), ({ id, offset, limit }) => {
    const entry = readGuidance(id);
    return { id, content: entry.content.slice(offset, offset + limit), total_characters: entry.content.length, next_offset: offset + limit < entry.content.length ? offset + limit : null };
  });
  register('search_references', 'Look up bibliography metadata in Crossref, with optional OpenAlex fallback. Returns candidates and explicit errors; the agent judges matches.', z.object({ references: z.array(z.object({ key: z.string().max(100), raw: z.string().min(1).max(2000), title: z.string().max(500).optional(), doi: z.string().max(300).optional() })).min(1).max(10) }), ({ references }, extra) => searchReferences(references, { signal: extra?.signal }), { ...readOnly, openWorldHint: true });
  register('validate_comments', 'Validate comments against a retained document.', validationSchema, ({ document_id, comments }, extra) => reviewIsolated({ document: store.get(document_id, owner()), comments }, 'validate', extra?.signal));
  server.registerTool('export_review', { description: 'Finish the review. Interactive clients show a Download HTML review card; file-tool clients should prefer prepare_export to avoid inline HTML. Invalid anchors block export.', inputSchema: z.object({ ...reviewShape, delivery: z.enum(['download', 'inline']).default('download').describe('Use download for interactive clients. Inline is only for programs that save complete raw tool responses.') }).strict(), annotations: readOnly, _meta: { ui: { resourceUri: appUri('export') } } }, async ({ document_id, delivery, ...review }, extra) => {
    try {
      const document = store.get(document_id, owner());
      if (delivery !== 'inline') {
        const checked = await reviewIsolated({ document, comments: review.comments }, 'validate', extra?.signal);
        if (!checked.valid) { observe('export_review', 'error'); return textResult(checked); }
        const ticket = transfers.issue('export', identity(), document_id);
        observe('export_review', 'success');
        return { ...textResult({ valid: true, delivery: 'download_card', browser_url: `${baseUrl}/transfer/export/${ticket.id}`, instruction: 'Use Download HTML review in the interactive card. If this client does not display a card, attach review.json containing the same review input (without delivery) and give browser_url to the user to select that JSON and download HTML. Do not claim the file has already been saved.' }), _meta: { transfer: { url: `${baseUrl}/transfer/export/${ticket.id}`, expires_at: ticket.expires_at } } };
      }
      const rendered = await reviewIsolated({ document, ...review }, 'render', extra?.signal);
      if (rendered.invalid.length) { observe('export_review', 'error'); return textResult({ valid: false, invalid: rendered.invalid }); }
      observe('export_review', 'success');
      return textResult({ valid: true, primary: { filename: 'review.html', mime_type: 'text/html', text: rendered.html }, comments: rendered.comments.length, limitations: rendered.limitations });
    } catch (error) { observe('export_review', [429, 503].includes(error.status) ? 'limited' : 'error'); return { ...textResult(toolError(error)), isError: true }; }
  });
  for (const mode of ['upload', 'export']) {
    server.registerResource(`review-${mode}`, appUri(mode), { mimeType: 'text/html;profile=mcp-app' }, uri => ({ contents: [{ uri: uri.href, mimeType: 'text/html;profile=mcp-app', text: appHtml.replace('__SERVER_ORIGIN__', baseUrl).replace('__MODE__', mode), _meta: { ui: { csp: { connectDomains: [baseUrl], resourceDomains: [] }, prefersBorder: true } } }] }));
  }
  register('delete_document', 'Delete a retained document before its 30-minute expiry.', z.object({ document_id: z.string().regex(/^[a-f0-9]{48}$/) }), ({ document_id }) => { store.delete(document_id, owner()); return { deleted: true }; }, { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false });
  server.registerResource('peer-review-workflow', 'review://instructions', { mimeType: 'text/markdown', description: 'Peer review skill and workflow' }, uri => ({ contents: [{ uri: uri.href, mimeType: 'text/markdown', text: instructions }] }));
  server.registerResource('guidance-index', 'review://guidance', { mimeType: 'application/json', description: 'Guidance table of contents' }, uri => ({ contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(listGuidance()) }] }));
  server.registerPrompt('peer-review', { description: 'Review a manuscript using conversion, guidance, validation, and export.', }, () => ({ messages: [{ role: 'user', content: { type: 'text', text: instructions } }] }));
  return server;
}
