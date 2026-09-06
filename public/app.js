const $ = id => document.getElementById(id);
const incomingUrl = new URL(location.href);
let invitationCode = incomingUrl.searchParams.get('invite');
if (incomingUrl.searchParams.has('invite')) {
  incomingUrl.searchParams.delete('invite');
  history.replaceState(null, '', incomingUrl.pathname + incomingUrl.search + incomingUrl.hash);
}
const error = message => { $('error').textContent = message; $('error').hidden = !message; };
async function jsonResponse(response) {
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'The request failed. Please try again.');
  return body;
}
const accessPost = (action, body = {}) => fetch('/api/access/' + action, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(jsonResponse);
function fitPrompt() {
  if ($('connection-fields').hidden) return;
  for (const field of [$('setup-prompt'), $('mcp-url')]) {
    field.style.height = 'auto'; field.style.height = field.scrollHeight + 'px';
  }
}
async function loadConfig() {
  const config = await jsonResponse(await fetch('/api/config'));
  const connected = !config.protected || config.unlocked;
  $('invitation-form').hidden = connected || invitationCode !== null;
  $('connection-fields').hidden = !connected;
  if (!connected) { $('setup-prompt').value = ''; $('mcp-url').value = ''; return; }
  $('mcp-url').value = config.mcp_url; $('copy-url').disabled = false;
  const link = config.protected ? (await accessPost('handoff')).url : new URL('/info.md', config.mcp_url).href;
  $('setup-prompt').value = `Connect to this MCP, confirm status using get_review_instructions, and then await my manuscript for peer review:
${link}`;
  $('copy-prompt').disabled = false; fitPrompt();
}
$('invitation-form').addEventListener('submit', async event => {
  event.preventDefault(); error('');
  const button = event.submitter; button.disabled = true;
  try {
    await accessPost('redeem', { code: $('invitation-code').value.trim() });
    $('invitation-code').value = '';
    await loadConfig(); $('setup-prompt').focus();
  } catch (cause) { error(cause.message); }
  finally { button.disabled = false; }
});
for (const [buttonId, fieldId] of [['copy-prompt', 'setup-prompt'], ['copy-url', 'mcp-url']]) {
  let feedbackTimer;
  $(buttonId).addEventListener('click', async () => {
    const field = $(fieldId), button = $(buttonId); error('');
    try {
      await navigator.clipboard.writeText(field.value);
      clearTimeout(feedbackTimer);
      button.dataset.copied = 'true'; button.title = 'Copied';
      $('copy-status').textContent = fieldId === 'setup-prompt' ? 'Setup prompt copied.' : 'MCP URL copied.';
      feedbackTimer = setTimeout(() => {
        delete button.dataset.copied; button.title = 'Copy to clipboard'; $('copy-status').textContent = '';
      }, 1800);
    } catch { field.focus(); field.select(); error('Copy the selected text manually.'); }
  });
}
new ResizeObserver(fitPrompt).observe($('connection-fields'));
async function initialize() {
  // Redeem the URL code before loading private fields to avoid issuing a link
  // for a previous invitation remembered by the browser.
  const code = invitationCode; invitationCode = null;
  if (code !== null) {
    const config = await jsonResponse(await fetch('/api/config'));
    if (config.protected) {
      try { await accessPost('redeem', { code }); }
      catch (cause) { error(cause.message); }
    }
  }
  await loadConfig();
}
initialize().catch(() => error('Could not connect to the service. Reload the page to try again.'));
