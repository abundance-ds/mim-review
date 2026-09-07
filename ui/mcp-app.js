import { App, applyHostStyleVariables, applyDocumentTheme } from '@modelcontextprotocol/ext-apps/app-with-deps';
const app = new App({ name: 'mim-review', version: '1.0.0' }, {}, { autoResize: true });
const $ = id => document.getElementById(id);
const origin = document.querySelector('meta[name=server-origin]').content;
const uploadMode = document.body.dataset.mode === 'upload';
let input, transfer, html, preparing = false, generation = 0;
const status = text => { $('status').textContent = text; };
const unpack = result => result.structuredContent || JSON.parse(result.content.find(block => block.type === 'text').text);
function safeTransfer(value, purpose) {
  const url = new URL(value);
  if (url.origin !== origin || !new RegExp(`^/transfer/${purpose}/[A-Za-z0-9_-]{43}$`).test(url.pathname)) throw new Error('The transfer link is invalid. Ask your AI to prepare it again.');
  return url.href;
}
function style(context) {
  if (context?.theme) applyDocumentTheme(context.theme);
  if (context?.styles?.variables) applyHostStyleVariables(context.styles.variables);
}
async function responseError(response) {
  const body = await response.json().catch(() => ({}));
  if (body.code === 'document_unavailable') return 'The manuscript is no longer available. Ask your AI to reconnect the original file and regenerate this download, keeping the completed review.';
  if (body.code === 'transfer_unavailable') return 'This link is no longer available. Ask your AI to prepare the transfer again.';
  return [body.error || 'Could not complete the transfer.', body.action].filter(Boolean).join(' ');
}
async function prepareHtml() {
  if (!input || !transfer || preparing || html) return;
  const attempt = generation;
  preparing = true; status('Preparing HTML review…');
  try {
    const response = await fetch(safeTransfer(transfer.url, 'export'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input), credentials: 'omit', signal: AbortSignal.timeout(60_000) });
    if (!response.ok) throw new Error(await responseError(response));
    if (!response.headers.get('content-type')?.includes('text/html')) throw new Error('The server did not return an HTML review. Ask your AI to retry export.');
    const rendered = await response.text();
    if (attempt !== generation) return;
    html = rendered;
    $('download').disabled = false; $('download').textContent = 'Download HTML review'; status('Your HTML review is ready.');
    if (!app.getHostCapabilities()?.downloadFile) { $('download').hidden = true; $('browser').hidden = false; }
  } catch (error) { if (attempt !== generation) return; status(error.message); $('download').textContent = 'Retry download'; $('download').disabled = false; $('browser').hidden = false; }
  finally { if (attempt === generation) preparing = false; }
}
app.ontoolinput = params => {
  const next = { ...params.arguments }; delete next.delivery;
  if (input && JSON.stringify(input) !== JSON.stringify(next)) {
    generation++; preparing = false; html = undefined; transfer = undefined; $('download').disabled = true; $('browser').hidden = true;
  }
  input = next;
  if (!uploadMode) void prepareHtml();
};
app.ontoolresult = result => {
  try {
    if (result.isError) { const error = unpack(result); status([error.error, error.action].filter(Boolean).join(' ')); return; }
    const value = unpack(result);
    if (value.valid === false) { status('Some comment quotes need correction. Your AI must fix them before exporting.'); return; }
    transfer = result._meta?.transfer || value;
    if (uploadMode) {
      safeTransfer(transfer.url, 'upload'); $('upload-button').disabled = false;
      status('Word preserves formatting and figures. PDF extraction is approximate.');
    } else {
      safeTransfer(transfer.url, 'export'); void prepareHtml();
    }
  } catch { status('Could not load the transfer. Ask your AI to prepare it again.'); }
};
app.onhostcontextchanged = style;
$('title').textContent = uploadMode ? 'Upload manuscript' : 'HTML review';
$('upload').hidden = !uploadMode; $('download').hidden = uploadMode;
$('upload-button').addEventListener('click', async event => {
  event.preventDefault(); const file = $('file').files[0]; if (!file || !transfer) return;
  if (file.size > 20 * 1024 * 1024) { status('Choose a file smaller than 20 MB.'); return; }
  $('upload-button').disabled = true; status('Uploading…');
  try {
    const response = await fetch(safeTransfer(transfer.url, 'upload'), { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'X-Filename': encodeURIComponent(file.name) }, body: file, credentials: 'omit', signal: AbortSignal.timeout(60_000) });
    if (!response.ok) throw new Error(await responseError(response));
    const receipt = await response.json();
    if (!/^[a-f0-9]{48}$/.test(receipt.document_id)) throw new Error('Upload receipt was invalid. Ask your AI to check upload status.');
    $('upload').hidden = true; $('upload').reset();
    status('Uploaded. Continue in the conversation.');
    try {
      const reply = await app.sendMessage({ role: 'user', content: [{ type: 'text', text: `My manuscript is uploaded as document_id ${receipt.document_id}. Read it with read_document and continue with my requested review.` }] });
      if (reply.isError) throw new Error('Message declined');
    } catch { status('Uploaded. Send “Uploaded” in the conversation to start your review.'); }
  } catch (error) { status(error.message); }
  finally { $('upload-button').disabled = false; }
});
$('download').addEventListener('click', async () => {
  if (!html) { void prepareHtml(); return; }
  if (!app.getHostCapabilities()?.downloadFile) { $('browser').hidden = false; status('Use “Download in browser” to save your review.'); return; }
  $('download').disabled = true;
  try {
    const result = await app.downloadFile({ contents: [{ type: 'resource', resource: { uri: 'file:///review.html', mimeType: 'text/html', text: html } }] });
    status(result.isError ? 'Download cancelled. You can try again.' : 'Download requested. Open review.html from your downloads.');
  } catch { status('This client could not save the file. Use “Download in browser”.'); $('browser').hidden = false; }
  finally { $('download').disabled = false; }
});
$('browser').addEventListener('click', async () => {
  try {
    // Fragment data is read by the browser only and never sent in an HTTP URL.
    const bytes = new TextEncoder().encode(JSON.stringify(input));
    if (bytes.length > 1_500_000) throw new Error('Ask your AI to provide review.json and the browser export link.');
    let binary = ''; for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
    const fragment = btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
    const result = await app.openLink({ url: safeTransfer(transfer.url, 'export') + '#review=' + fragment });
    if (result.isError) throw new Error('Opening the browser was cancelled. Try again.');
  } catch (error) { status(error.message); }
});
app.connect().then(() => style(app.getHostContext())).catch(() => status('This client could not display the controls. Ask your AI for the browser upload or export link.'));
