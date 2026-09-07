const fragment = location.hash;
if (fragment) history.replaceState(null, '', location.pathname + location.search);
const form = document.getElementById('export-form'), status = document.getElementById('export-status');
const fileInput = document.getElementById('review-file'), textInput = document.getElementById('review-json');
const button = document.getElementById('download-review');
const maximumBytes = 32 * 1024 * 1024, maximumFragmentBytes = 2 * 1024 * 1024;
let downloadUrl = '', pending = false;
function clearDownload() {
  if (downloadUrl) URL.revokeObjectURL(downloadUrl);
  downloadUrl = '';
}
function changed() { clearDownload(); status.textContent = ''; }
fileInput.addEventListener('change', () => { textInput.value = ''; changed(); });
textInput.addEventListener('input', () => { fileInput.value = ''; changed(); });
addEventListener('pagehide', clearDownload);
function failureMessage(result) {
  if (result.code === 'document_unavailable') return 'The manuscript is no longer available. Return to your AI conversation to upload it again and keep the existing review.';
  if (result.code === 'transfer_unavailable') return 'This download link is no longer available. Return to your AI conversation for a new link.';
  if (result.valid === false) return 'Some comments could not be matched to the manuscript. Ask your AI to correct the review JSON, then try again.';
  return [result.error || 'The review could not be prepared.', result.action].filter(Boolean).join(' ');
}
async function prepare() {
  const file = fileInput.files[0];
  if (file?.size > maximumBytes) throw new Error('Choose review JSON smaller than 32 MB.');
  const text = file ? await file.text() : textInput.value;
  if (!text.trim()) throw new Error('Choose review.json or paste the review JSON from your AI conversation.');
  if (new Blob([text]).size > maximumBytes) throw new Error('Use review JSON smaller than 32 MB.');
  let review;
  try { review = JSON.parse(text); }
  catch { throw new Error('This is not valid review JSON. Use the review.json file supplied by your AI.'); }
  if (!review || typeof review !== 'object' || Array.isArray(review)) throw new Error('Use the review.json file supplied by your AI.');
  let response;
  try {
    response = await fetch(location.pathname, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(review), signal: AbortSignal.timeout(60_000) });
  } catch { throw new Error('Could not connect to the service. Try Download HTML again.'); }
  if (response.status !== 200 || !response.headers.get('content-type')?.toLowerCase().startsWith('text/html')) {
    let result;
    try { result = await response.json(); } catch { result = {}; }
    throw new Error(failureMessage(result));
  }
  let blob;
  try { blob = await response.blob(); }
  catch { throw new Error('The download was interrupted. Try Download HTML again.'); }
  if (!blob.size) throw new Error('The review file was empty. Try Download HTML again.');
  clearDownload(); downloadUrl = URL.createObjectURL(blob);
}
async function run(download) {
  if (pending || form.hidden) return;
  pending = true; button.disabled = true; fileInput.disabled = true; textInput.disabled = true;
  status.textContent = 'Preparing review…';
  try {
    if (!downloadUrl) await prepare();
    if (download) {
      const link = document.createElement('a'); link.href = downloadUrl; link.download = 'review.html';
      document.body.append(link); link.click(); link.remove();
      status.textContent = 'Download started. Open review.html from your downloads.';
    } else status.textContent = 'Your review is ready. Select Download HTML to save it.';
  } catch (error) { status.textContent = error.message; }
  finally { pending = false; button.disabled = false; fileInput.disabled = false; textInput.disabled = false; }
}
form.addEventListener('submit', event => { event.preventDefault(); void run(true); });
// A connector can hand review data to this page without placing it in a request URL.
if (fragment.startsWith('#review=') && !form.hidden) {
  try {
    const encoded = fragment.slice('#review='.length);
    if (fragment.length > maximumFragmentBytes || !/^[A-Za-z0-9_-]+$/.test(encoded)) throw new Error();
    const bytes = Uint8Array.from(atob(encoded.replace(/-/g, '+').replace(/_/g, '/')), char => char.charCodeAt(0));
    textInput.value = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    void run(false);
  } catch { status.textContent = 'The supplied review could not be read. Choose review.json from your AI conversation instead.'; }
}
