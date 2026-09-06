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
  const field = $('setup-prompt');
  if (!$('connection-fields').hidden) { field.style.height = 'auto'; field.style.height = field.scrollHeight + 'px'; }
}
async function loadConfig() {
  const config = await jsonResponse(await fetch('/api/config'));
  const connected = !config.protected || config.unlocked;
  $('invitation-form').hidden = connected || invitationCode !== null;
  $('connection-fields').hidden = !connected;
  if (!connected) { $('setup-prompt').value = ''; $('mcp-url').value = ''; return; }
  $('mcp-url').value = config.mcp_url; $('copy-url').disabled = false;
  const link = config.protected ? (await accessPost('handoff')).url : new URL('/info.md', config.mcp_url).href;
  $('setup-prompt').value = `Set up AI peer review using this ${config.protected ? 'private ' : ''}link:
${link}

Connect to the MCP server, call get_review_instructions, and read it in full. If setup needs my action, guide me. Confirm access only after a successful tool call, then wait for my manuscript. Use its three-reviewer workflow when delegation is available. Keep my access token private.`;
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
  $(buttonId).addEventListener('click', async () => {
    const field = $(fieldId), button = $(buttonId); error('');
    try {
      await navigator.clipboard.writeText(field.value);
      button.textContent = 'Copied'; setTimeout(() => { button.textContent = 'Copy to clipboard'; }, 1800);
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
